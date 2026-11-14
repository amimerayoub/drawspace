import { HttpError } from '../middleware/errors';
import { CsvError, parseCsvTable, serializeCsv } from './csv';
import type { BlogInput, BlogRecord } from './blogService';
import type { WordCategory, WordInput, WordRecord } from './wordService';

export const IMPORT_MAX_BYTES = 2_000_000;
export const IMPORT_MAX_WORDS = 1000;
export const IMPORT_MAX_BLOGS = 200;
export const IMPORT_EXTENSIONS = ['.json', '.csv'];
export const WORDS_FORMAT = 'drawspace-words';
export const BLOGS_FORMAT = 'drawspace-blogs';
export const CATEGORIES_FORMAT = 'drawspace-word-categories';
export const CONTENT_SCHEMA_VERSION = 1;

export type ImportFormat = 'json' | 'csv';
export interface ExportFile { body: string; contentType: string; filename: string }

export function detectImportFormat(filename: string | undefined, text: string): ImportFormat {
  if (filename) {
    const dot = filename.lastIndexOf('.');
    const extension = dot === -1 ? '' : filename.slice(dot).toLowerCase();
    if (extension === '.json') return 'json';
    if (extension === '.csv') return 'csv';
    throw new HttpError(400, `Unsupported file extension "${extension || filename}". Allowed extensions: ${IMPORT_EXTENSIONS.join(', ')}.`, 'UNSUPPORTED_EXTENSION');
  }
  const head = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trimStart();
  return head.startsWith('{') || head.startsWith('[') ? 'json' : 'csv';
}

function assertSize(text: string): void {
  if (Buffer.byteLength(text, 'utf8') > IMPORT_MAX_BYTES) throw new HttpError(413, `Import file exceeds the ${IMPORT_MAX_BYTES / 1_000_000} MB limit.`, 'FILE_TOO_LARGE');
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; }
  catch { throw new HttpError(400, 'File is not valid JSON.', 'INVALID_JSON'); }
}

function envelopeRecords(parsed: unknown, key: 'words' | 'blogs', format: string): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === 'object') {
    const envelope = parsed as Record<string, unknown>;
    if (envelope.format !== undefined && envelope.format !== format) throw new HttpError(400, `Unexpected format identifier "${String(envelope.format)}". Expected "${format}".`, 'UNSUPPORTED_FORMAT');
    if (envelope.version !== undefined && envelope.version !== CONTENT_SCHEMA_VERSION) throw new HttpError(400, `Unsupported schema version ${String(envelope.version)}. Expected ${CONTENT_SCHEMA_VERSION}.`, 'UNSUPPORTED_VERSION');
    if (Array.isArray(envelope[key])) return envelope[key] as Record<string, unknown>[];
  }
  throw new HttpError(400, `JSON structure must be an array of records or an object with a "${key}" array.`, 'INVALID_STRUCTURE');
}

function asRecord(value: unknown, index: number): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new HttpError(400, `Record ${index + 1} is not an object.`, 'INVALID_STRUCTURE');
}

function booleanCell(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

function tagCell(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((tag) => String(tag));
  return String(value).split(';').map((tag) => tag.trim()).filter(Boolean);
}

const WORD_COLUMNS = ['word', 'language', 'category', 'difficulty', 'hint', 'active', 'id'];
const BLOG_COLUMNS = ['title', 'slug', 'excerpt', 'content', 'category', 'tags', 'status', 'cover', 'seoTitle', 'seoDescription', 'publishAt', 'id'];

function csvRecords(text: string, required: string[], known: string[], warnings: string[]): Record<string, unknown>[] {
  let table;
  try { table = parseCsvTable(text); }
  catch (error) {
    if (error instanceof CsvError) throw new HttpError(400, error.message, 'INVALID_CSV');
    throw error;
  }
  const missing = required.filter((column) => !table.headers.includes(column));
  if (missing.length > 0) throw new HttpError(400, `CSV is missing required column(s): ${missing.join(', ')}.`, 'INVALID_STRUCTURE');
  const unknown = table.headers.filter((header) => !known.includes(header));
  if (unknown.length > 0) warnings.push(`Ignoring unknown column(s): ${unknown.join(', ')}.`);
  return table.records;
}

export function parseWordsImport(text: string, format: ImportFormat): { inputs: WordInput[]; warnings: string[] } {
  assertSize(text);
  const warnings: string[] = [];
  const records = format === 'json'
    ? envelopeRecords(parseJson(text), 'words', WORDS_FORMAT)
    : csvRecords(text, ['word'], WORD_COLUMNS, warnings);
  if (records.length === 0) throw new HttpError(400, 'The import file contains no records.', 'EMPTY_IMPORT');
  if (records.length > IMPORT_MAX_WORDS) throw new HttpError(400, `An import accepts at most ${IMPORT_MAX_WORDS} words per file.`, 'IMPORT_LIMIT');
  const inputs = records.map((raw, index) => {
    const record = asRecord(raw, index);
    const input: WordInput = {
      word: String(record.word ?? ''),
      category: String(record.category ?? ''),
      difficulty: String(record.difficulty ?? '').trim().toLowerCase() as WordInput['difficulty'],
    };
    if (record.id !== undefined && record.id !== '') input.id = String(record.id);
    if (record.language !== undefined && record.language !== '') input.language = String(record.language);
    if (record.hint !== undefined) input.hint = String(record.hint);
    const active = booleanCell(record.active);
    if (active !== undefined) input.active = active;
    return input;
  });
  return { inputs, warnings };
}

export function parseBlogsImport(text: string, format: ImportFormat): { inputs: BlogInput[]; warnings: string[] } {
  assertSize(text);
  const warnings: string[] = [];
  const records = format === 'json'
    ? envelopeRecords(parseJson(text), 'blogs', BLOGS_FORMAT)
    : csvRecords(text, ['title', 'content'], BLOG_COLUMNS, warnings);
  if (records.length === 0) throw new HttpError(400, 'The import file contains no records.', 'EMPTY_IMPORT');
  if (records.length > IMPORT_MAX_BLOGS) throw new HttpError(400, `An import accepts at most ${IMPORT_MAX_BLOGS} blog posts per file.`, 'IMPORT_LIMIT');
  const inputs = records.map((raw, index) => {
    const record = asRecord(raw, index);
    const input: BlogInput = { title: String(record.title ?? ''), content: String(record.content ?? '') };
    if (record.id !== undefined && record.id !== '') input.id = String(record.id);
    if (record.slug !== undefined && record.slug !== '') input.slug = String(record.slug);
    if (record.excerpt !== undefined) input.excerpt = String(record.excerpt);
    if (record.category !== undefined && record.category !== '') input.category = String(record.category);
    const tags = tagCell(record.tags);
    if (tags !== undefined) input.tags = tags;
    if (record.status !== undefined && record.status !== '') input.status = String(record.status).trim().toLowerCase() as BlogInput['status'];
    if (record.cover !== undefined) input.cover = String(record.cover);
    if (record.seoTitle !== undefined) input.seoTitle = String(record.seoTitle);
    if (record.seoDescription !== undefined) input.seoDescription = String(record.seoDescription);
    const publishAt = record.publishAt ?? record.publishedAt;
    if (publishAt !== undefined && publishAt !== '') input.publishAt = String(publishAt);
    return input;
  });
  return { inputs, warnings };
}

export async function collectPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page += 1) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}

function stamp(): string { return new Date().toISOString().slice(0, 10); }

function csvFile(headers: string[], rows: string[][], filename: string): ExportFile {
  return { body: String.fromCharCode(0xfeff) + serializeCsv([headers, ...rows]), contentType: 'text/csv; charset=utf-8', filename };
}

function jsonFile(payload: Record<string, unknown>, filename: string): ExportFile {
  return { body: JSON.stringify(payload, null, 2), contentType: 'application/json; charset=utf-8', filename };
}

export function buildWordsExport(records: WordRecord[], categories: WordCategory[], format: ImportFormat, scope: string, filters: Record<string, unknown> = {}): ExportFile {
  const filename = `drawspace-words-${stamp()}.${format}`;
  if (format === 'csv') {
    return csvFile(
      ['word', 'language', 'category', 'difficulty', 'hint', 'active'],
      records.map((record) => [record.word, record.language, record.category, record.difficulty, record.hint, record.active ? 'true' : 'false']),
      filename,
    );
  }
  return jsonFile({
    format: WORDS_FORMAT,
    version: CONTENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    filters,
    counts: { words: records.length, categories: categories.length },
    words: records.map(({ id, word, category, difficulty, language, hint, active, createdAt, updatedAt }) => ({ id, word, category, difficulty, language, hint, active, createdAt, updatedAt })),
    categories: categories.map(({ name, slug, wordCount }) => ({ name, slug, wordCount })),
  }, filename);
}

export function buildBlogsExport(records: BlogRecord[], format: ImportFormat, scope: string, filters: Record<string, unknown> = {}): ExportFile {
  const filename = `drawspace-blogs-${stamp()}.${format}`;
  if (format === 'csv') {
    return csvFile(
      ['title', 'slug', 'excerpt', 'content', 'category', 'tags', 'status', 'cover', 'seoTitle', 'seoDescription', 'publishAt'],
      records.map((record) => [record.title, record.slug, record.excerpt, record.content, record.category, record.tags.join(';'), record.status, record.cover, record.seoTitle, record.seoDescription, record.publishedAt]),
      filename,
    );
  }
  return jsonFile({
    format: BLOGS_FORMAT,
    version: CONTENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    filters,
    counts: { blogs: records.length },
    blogs: records.map(({ id, slug, title, excerpt, content, category, tags, status, cover, author, seoTitle, seoDescription, publishedAt, createdAt, updatedAt, views }) => ({ id, slug, title, excerpt, content, category, tags, status, cover, author, seoTitle, seoDescription, publishedAt, createdAt, updatedAt, views })),
  }, filename);
}

export function buildCategoriesExport(categories: WordCategory[], format: ImportFormat): ExportFile {
  const filename = `drawspace-word-categories-${stamp()}.${format}`;
  if (format === 'csv') {
    return csvFile(['name', 'slug', 'wordCount'], categories.map((category) => [category.name, category.slug, String(category.wordCount)]), filename);
  }
  return jsonFile({
    format: CATEGORIES_FORMAT,
    version: CONTENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { categories: categories.length },
    categories: categories.map(({ name, slug, wordCount }) => ({ name, slug, wordCount })),
  }, filename);
}