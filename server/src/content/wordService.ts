import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { HttpError } from '../middleware/errors';
import { RowRepository, type Row } from '../repositories/rowRepository';
import { invalidateWords } from '../repositories/wordRepository';

export type WordDifficulty = 'easy' | 'medium' | 'hard';
export const WORD_DIFFICULTIES: WordDifficulty[] = ['easy', 'medium', 'hard'];
export const WORD_LANGUAGES = ['en', 'en-US', 'en-GB', 'fr', 'es', 'de', 'ar', 'pt-BR', 'ru'];
export const WORD_SORT_FIELDS = ['word', 'category', 'difficulty', 'createdAt', 'updatedAt'] as const;
export type WordSortField = typeof WORD_SORT_FIELDS[number];

export interface ContentActor { userId: string; username: string; role: string }
export interface WordInput { id?: string; word: string; category: string; difficulty: WordDifficulty; language?: string; hint?: string; active?: boolean }
export interface WordRecord { id: string; word: string; category: string; difficulty: string; language: string; hint: string; active: boolean; createdAt: string; updatedAt: string }
export interface WordListQuery { search?: string; category?: string; difficulty?: WordDifficulty; language?: string; active?: boolean; sort?: WordSortField; order?: 'asc' | 'desc'; limit?: number; cursor?: string }
export interface WordListResult { items: WordRecord[]; total: number; nextCursor: string | null }
export interface WordStats { total: number; active: number; inactive: number; byCategory: Record<string, number>; byDifficulty: Record<string, number>; byLanguage: Record<string, number> }
export interface WordCategory { id: string; name: string; slug: string; wordCount: number }
export type BulkStrategy = 'insert' | 'skip' | 'upsert';
export type ImportStrategy = BulkStrategy | 'replace';
export interface BulkWordResult { index: number; word: string; status: 'created' | 'updated' | 'skipped' | 'failed'; id?: string; error?: string }
export interface ContentImportReport { results: BulkWordResult[]; created: number; updated: number; skipped: number; failed: number; dryRun: boolean; warnings: string[] }

export function normalizeWord(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export function slugifyName(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

export function encodeCursor(offset: number): string { return Buffer.from(`offset:${offset}`, 'utf8').toString('base64url'); }
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^offset:(\d+)$/.exec(decoded);
  if (!match) throw new HttpError(400, 'Invalid pagination cursor.', 'INVALID_CURSOR');
  return Number(match[1]);
}

const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f]/;

export function validateWordInput(input: WordInput): Required<Omit<WordInput, 'id'>> & { id?: string } {
  const word = String(input.word ?? '').trim();
  if (word.length < 2 || word.length > 32) throw new HttpError(400, 'Word must be between 2 and 32 characters.', 'VALIDATION_ERROR');
  if (UNSAFE_TEXT.test(word) || normalizeWord(word) === '') throw new HttpError(400, 'Word contains invalid characters.', 'VALIDATION_ERROR');
  const category = String(input.category ?? '').trim();
  if (category.length < 1 || category.length > 32 || UNSAFE_TEXT.test(category)) throw new HttpError(400, 'Category must be 1 to 32 characters without markup.', 'VALIDATION_ERROR');
  if (!WORD_DIFFICULTIES.includes(input.difficulty)) throw new HttpError(400, 'Difficulty must be easy, medium, or hard.', 'VALIDATION_ERROR');
  const language = input.language === undefined || input.language === '' ? 'en' : String(input.language);
  if (!WORD_LANGUAGES.includes(language)) throw new HttpError(400, `Language must be one of: ${WORD_LANGUAGES.join(', ')}.`, 'VALIDATION_ERROR');
  const hint = String(input.hint ?? '').trim();
  if (hint.length > 255 || UNSAFE_TEXT.test(hint)) throw new HttpError(400, 'Hint must be at most 255 characters without markup.', 'VALIDATION_ERROR');
  return { id: input.id, word, category, difficulty: input.difficulty, language, hint, active: input.active !== false };
}

export class WordService {
  private readonly words: RowRepository;
  private readonly categories: RowRepository;
  private readonly audit: RowRepository;
  private optionalColumns?: Promise<Set<string>>;
  private categoriesAvailable?: Promise<boolean>;

  constructor(private readonly database: AppwriteDatabase) {
    this.words = new RowRepository(database, 'custom_words');
    this.categories = new RowRepository(database, 'word_categories');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  private async optional(): Promise<Set<string>> {
    if (!this.optionalColumns) {
      this.optionalColumns = this.database.tables.listColumns(this.database.databaseId, 'custom_words', [])
        .then((result) => new Set(result.columns.map((column: { key: string }) => column.key)))
        .catch(() => new Set<string>());
    }
    return this.optionalColumns;
  }

  private async hasCategoryTable(): Promise<boolean> {
    if (!this.categoriesAvailable) {
      this.categoriesAvailable = this.categories.list([Query.limit(1)]).then(() => true).catch(() => false);
    }
    return this.categoriesAvailable;
  }

  private async allRows(): Promise<Row[]> {
    const rows: Row[] = [];
    for (let page = 0; page < 200; page += 1) {
      const batch = await this.words.list([Query.limit(100), Query.offset(page * 100)]);
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows;
  }

  private toRecord(row: Row): WordRecord {
    return {
      id: String(row.id ?? row.$id),
      word: String(row.word ?? ''),
      category: String(row.category ?? ''),
      difficulty: String(row.difficulty ?? 'easy'),
      language: String(row.language || 'en'),
      hint: String(row.hint || ''),
      active: row.isActive !== false,
      createdAt: String(row.createdAt || row.$createdAt || ''),
      updatedAt: String(row.updatedAt || row.$updatedAt || ''),
    };
  }

  async list(query: WordListQuery = {}): Promise<WordListResult> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const offset = decodeCursor(query.cursor);
    const search = query.search?.trim().toLowerCase();
    let items = (await this.allRows()).map((row) => this.toRecord(row));
    if (search) items = items.filter((item) => item.word.toLowerCase().includes(search) || item.category.toLowerCase().includes(search) || item.hint.toLowerCase().includes(search));
    if (query.category) items = items.filter((item) => item.category.toLowerCase() === query.category!.toLowerCase());
    if (query.difficulty) items = items.filter((item) => item.difficulty === query.difficulty);
    if (query.language) items = items.filter((item) => item.language === query.language);
    if (query.active !== undefined) items = items.filter((item) => item.active === query.active);
    const sort = query.sort ?? 'word';
    const direction = query.order === 'desc' ? -1 : 1;
    items.sort((a, b) => direction * String(a[sort]).localeCompare(String(b[sort])));
    const total = items.length;
    const page = items.slice(offset, offset + limit);
    return { items: page, total, nextCursor: offset + limit < total ? encodeCursor(offset + limit) : null };
  }

  async stats(): Promise<WordStats> {
    const items = (await this.allRows()).map((row) => this.toRecord(row));
    const byCategory: Record<string, number> = {};
    const byDifficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    const byLanguage: Record<string, number> = {};
    let active = 0;
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      byDifficulty[item.difficulty] = (byDifficulty[item.difficulty] || 0) + 1;
      byLanguage[item.language] = (byLanguage[item.language] || 0) + 1;
      if (item.active) active += 1;
    }
    return { total: items.length, active, inactive: items.length - active, byCategory, byDifficulty, byLanguage };
  }

  async get(id: string): Promise<WordRecord> {
    const row = (await this.allRows()).find((item) => String(item.id ?? item.$id) === id);
    if (!row) throw new HttpError(404, 'Word not found.', 'WORD_NOT_FOUND');
    return this.toRecord(row);
  }

  async create(input: WordInput, actor: ContentActor): Promise<WordRecord> {
    const clean = validateWordInput(input);
    const rows = await this.allRows();
    const normalized = normalizeWord(clean.word);
    if (rows.some((row) => normalizeWord(String(row.word ?? '')) === normalized)) throw new HttpError(409, 'This word already exists.', 'WORD_DUPLICATE');
    await this.ensureCategory(clean.category);
    const row = await this.insertWord(clean);
    invalidateWords();
    await this.writeAudit(actor, 'word.create', 'custom_word', clean.id || String(row.id), clean.word);
    return this.toRecord(row);
  }

  async update(id: string, patch: Partial<WordInput>, actor: ContentActor): Promise<WordRecord> {
    const rows = await this.allRows();
    const existing = rows.find((row) => String(row.id ?? row.$id) === id);
    if (!existing) throw new HttpError(404, 'Word not found.', 'WORD_NOT_FOUND');
    const current = this.toRecord(existing);
    const clean = validateWordInput({ word: patch.word ?? current.word, category: patch.category ?? current.category, difficulty: (patch.difficulty ?? current.difficulty) as WordDifficulty, language: patch.language ?? current.language, hint: patch.hint ?? current.hint, active: patch.active ?? current.active });
    const normalized = normalizeWord(clean.word);
    if (rows.some((row) => row.$id !== existing.$id && normalizeWord(String(row.word ?? '')) === normalized)) throw new HttpError(409, 'This word already exists.', 'WORD_DUPLICATE');
    if (clean.category !== current.category) await this.ensureCategory(clean.category);
    const optional = await this.optional();
    const now = new Date().toISOString();
    const data: Record<string, unknown> = { word: clean.word, category: clean.category, difficulty: clean.difficulty, isActive: clean.active };
    if (optional.has('language')) data.language = clean.language;
    if (optional.has('hint')) data.hint = clean.hint;
    if (optional.has('normalizedWord')) data.normalizedWord = normalized;
    if (optional.has('updatedAt')) data.updatedAt = now;
    const row = await this.words.patch(existing.$id, data);
    invalidateWords();
    await this.writeAudit(actor, 'word.update', 'custom_word', id, clean.word);
    return this.toRecord(row);
  }

  async delete(id: string, actor: ContentActor): Promise<void> {
    const rows = await this.allRows();
    const existing = rows.find((row) => String(row.id ?? row.$id) === id);
    if (!existing) throw new HttpError(404, 'Word not found.', 'WORD_NOT_FOUND');
    await this.words.delete(existing.$id);
    invalidateWords();
    await this.writeAudit(actor, 'word.delete', 'custom_word', id, String(existing.word ?? ''));
  }

  async bulkCreate(inputs: WordInput[], strategy: BulkStrategy, actor: ContentActor): Promise<{ results: BulkWordResult[]; created: number; updated: number; skipped: number; failed: number }> {
    if (inputs.length === 0) throw new HttpError(400, 'No words provided.', 'VALIDATION_ERROR');
    if (inputs.length > 500) throw new HttpError(400, 'A bulk operation accepts at most 500 words.', 'BULK_LIMIT');
    const report = await this.applyBulk(inputs, strategy, actor, false, 'word.bulk_create');
    return { results: report.results, created: report.created, updated: report.updated, skipped: report.skipped, failed: report.failed };
  }

  async importWords(inputs: WordInput[], strategy: ImportStrategy, actor: ContentActor, options: { dryRun?: boolean; confirm?: boolean } = {}): Promise<ContentImportReport> {
    if (inputs.length === 0) throw new HttpError(400, 'The import file contains no records.', 'EMPTY_IMPORT');
    if (inputs.length > 1000) throw new HttpError(400, 'An import accepts at most 1000 words per file.', 'IMPORT_LIMIT');
    const dryRun = options.dryRun === true;
    if (strategy === 'replace' && !dryRun && options.confirm !== true) throw new HttpError(400, 'Replacing existing words requires explicit confirmation.', 'CONFIRM_REQUIRED');
    return this.applyBulk(inputs, strategy, actor, dryRun, 'word.import');
  }

  private async applyBulk(inputs: WordInput[], strategy: ImportStrategy, actor: ContentActor, dryRun: boolean, auditAction: string): Promise<ContentImportReport> {
    const rows = await this.allRows();
    const byNormalized = new Map(rows.map((row) => [normalizeWord(String(row.word ?? '')), row]));
    const results: BulkWordResult[] = [];
    const warnings: string[] = [];
    let created = 0; let updated = 0; let skipped = 0; let failed = 0;
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      try {
        const clean = validateWordInput(input);
        const normalized = normalizeWord(clean.word);
        const existing = byNormalized.get(normalized);
        if (existing) {
          if (strategy === 'skip') { results.push({ index, word: clean.word, status: 'skipped', id: String(existing.id ?? existing.$id) }); skipped += 1; continue; }
          if (strategy === 'insert') { results.push({ index, word: clean.word, status: 'failed', error: 'This word already exists.' }); failed += 1; continue; }
          if (!dryRun) {
            const optional = await this.optional();
            const data: Record<string, unknown> = { word: clean.word, category: clean.category, difficulty: clean.difficulty, isActive: clean.active };
            if (optional.has('language')) data.language = clean.language;
            if (optional.has('hint')) data.hint = clean.hint;
            if (optional.has('normalizedWord')) data.normalizedWord = normalized;
            if (optional.has('updatedAt')) data.updatedAt = new Date().toISOString();
            await this.words.patch(existing.$id, data);
          }
          results.push({ index, word: clean.word, status: 'updated', id: String(existing.id ?? existing.$id) }); updated += 1; continue;
        }
        if (strategy === 'replace') {
          warnings.push(`Record ${index + 1}: no existing word matches "${clean.word}". Replace only updates existing records.`);
          results.push({ index, word: clean.word, status: 'skipped' }); skipped += 1; continue;
        }
        if (dryRun) {
          byNormalized.set(normalized, { $id: '', id: '', word: clean.word } as Row);
          results.push({ index, word: clean.word, status: 'created' }); created += 1; continue;
        }
        await this.ensureCategory(clean.category);
        const row = await this.insertWord(clean);
        byNormalized.set(normalized, row);
        results.push({ index, word: clean.word, status: 'created', id: String(row.id ?? row.$id) }); created += 1;
      } catch (error) {
        results.push({ index, word: String(input.word ?? ''), status: 'failed', error: error instanceof Error ? error.message : 'Import failed.' }); failed += 1;
      }
    }
    if (!dryRun && (created > 0 || updated > 0)) invalidateWords();
    if (!dryRun) await this.writeAudit(actor, auditAction, 'custom_word', `bulk:${results.length}`, `${strategy}: +${created} ~${updated} skip ${skipped} fail ${failed}`);
    return { results, created, updated, skipped, failed, dryRun, warnings };
  }

  async setActive(ids: string[], active: boolean, actor: ContentActor): Promise<{ updated: string[]; notFound: string[] }> {
    if (ids.length === 0 || ids.length > 500) throw new HttpError(400, 'Select between 1 and 500 words.', 'BULK_LIMIT');
    const rows = await this.allRows();
    const updated: string[] = []; const notFound: string[] = [];
    for (const id of ids) {
      const row = rows.find((item) => String(item.id ?? item.$id) === id);
      if (!row) { notFound.push(id); continue; }
      await this.words.patch(row.$id, { isActive: active });
      updated.push(id);
    }
    if (updated.length > 0) invalidateWords();
    await this.writeAudit(actor, active ? 'word.bulk_activate' : 'word.bulk_deactivate', 'custom_word', `bulk:${updated.length}`, `${updated.length} words`);
    return { updated, notFound };
  }

  async deleteMany(ids: string[], actor: ContentActor): Promise<{ deleted: string[]; notFound: string[] }> {
    if (ids.length === 0 || ids.length > 500) throw new HttpError(400, 'Select between 1 and 500 words.', 'BULK_LIMIT');
    const rows = await this.allRows();
    const deleted: string[] = []; const notFound: string[] = [];
    for (const id of ids) {
      const row = rows.find((item) => String(item.id ?? item.$id) === id);
      if (!row) { notFound.push(id); continue; }
      await this.words.delete(row.$id);
      deleted.push(id);
    }
    if (deleted.length > 0) invalidateWords();
    await this.writeAudit(actor, 'word.bulk_delete', 'custom_word', `bulk:${deleted.length}`, `${deleted.length} words`);
    return { deleted, notFound };
  }

  async listCategories(activeOnly = false): Promise<WordCategory[]> {
    const rows = (await this.allRows()).filter((row) => !activeOnly || row.isActive !== false);
    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = String(row.category ?? '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    if (await this.hasCategoryTable()) {
      const stored = await this.categories.list([Query.limit(200)]);
      const merged = new Map<string, WordCategory>();
      for (const row of stored) merged.set(String(row.name), { id: String(row.id ?? row.$id), name: String(row.name), slug: String(row.slug), wordCount: counts.get(String(row.name)) || 0 });
      for (const [name, count] of counts) if (!merged.has(name)) merged.set(name, { id: slugifyName(name), name, slug: slugifyName(name), wordCount: count });
      return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...counts.entries()].map(([name, count]) => ({ id: slugifyName(name), name, slug: slugifyName(name), wordCount: count })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCategory(name: string, actor: ContentActor): Promise<WordCategory> {
    const clean = String(name ?? '').trim();
    if (clean.length < 1 || clean.length > 32 || UNSAFE_TEXT.test(clean)) throw new HttpError(400, 'Category must be 1 to 32 characters without markup.', 'VALIDATION_ERROR');
    if (!(await this.hasCategoryTable())) throw new HttpError(409, 'Category storage requires the word_categories collection. Apply the content migration first.', 'MIGRATION_REQUIRED');
    const slug = slugifyName(clean);
    const stored = await this.categories.list([Query.limit(200)]);
    if (stored.some((row) => String(row.slug) === slug || String(row.name).toLowerCase() === clean.toLowerCase())) throw new HttpError(409, 'This category already exists.', 'CATEGORY_DUPLICATE');
    const row = await this.categories.insert({ id: randomUUID().replaceAll('-', ''), name: clean, slug, description: '', isActive: true });
    await this.writeAudit(actor, 'word_category.create', 'word_category', String(row.id), clean);
    return { id: String(row.id), name: clean, slug, wordCount: 0 };
  }

  async renameCategory(id: string, name: string, actor: ContentActor): Promise<WordCategory> {
    const clean = String(name ?? '').trim();
    if (clean.length < 1 || clean.length > 32 || UNSAFE_TEXT.test(clean)) throw new HttpError(400, 'Category must be 1 to 32 characters without markup.', 'VALIDATION_ERROR');
    const rows = await this.allRows();
    const stored = (await this.hasCategoryTable()) ? await this.categories.list([Query.limit(200)]) : [];
    const target = stored.find((row) => String(row.id ?? row.$id) === id || String(row.slug) === id);
    const oldName = target ? String(target.name) : rows.map((row) => String(row.category ?? '')).find((category) => slugifyName(category) === id);
    if (!oldName) throw new HttpError(404, 'Category not found.', 'CATEGORY_NOT_FOUND');
    if (oldName.toLowerCase() !== clean.toLowerCase()) {
      const duplicate = stored.some((row) => row.$id !== target?.$id && String(row.name).toLowerCase() === clean.toLowerCase()) || rows.some((row) => String(row.category ?? '').toLowerCase() === clean.toLowerCase());
      if (duplicate) throw new HttpError(409, 'This category already exists.', 'CATEGORY_DUPLICATE');
    }
    let wordCount = 0;
    for (const row of rows) {
      if (String(row.category ?? '') === oldName) { await this.words.patch(row.$id, { category: clean }); wordCount += 1; }
    }
    if (target) await this.categories.patch(target.$id, { name: clean, slug: slugifyName(clean) });
    if (wordCount > 0) invalidateWords();
    await this.writeAudit(actor, 'word_category.rename', 'word_category', id, `${oldName} -> ${clean} (${wordCount} words)`);
    return { id: target ? String(target.id) : slugifyName(clean), name: clean, slug: slugifyName(clean), wordCount };
  }

  async deleteCategory(id: string, reassignTo: string | undefined, actor: ContentActor): Promise<{ deleted: boolean; reassigned: number }> {
    const rows = await this.allRows();
    const stored = (await this.hasCategoryTable()) ? await this.categories.list([Query.limit(200)]) : [];
    const target = stored.find((row) => String(row.id ?? row.$id) === id || String(row.slug) === id);
    const oldName = target ? String(target.name) : rows.map((row) => String(row.category ?? '')).find((category) => slugifyName(category) === id);
    if (!oldName) throw new HttpError(404, 'Category not found.', 'CATEGORY_NOT_FOUND');
    const affected = rows.filter((row) => String(row.category ?? '') === oldName);
    if (affected.length > 0) {
      const replacement = String(reassignTo ?? '').trim();
      if (!replacement) throw new HttpError(409, `Category is used by ${affected.length} words. Provide reassignTo to move them first.`, 'CATEGORY_IN_USE');
      if (replacement.toLowerCase() === oldName.toLowerCase()) throw new HttpError(400, 'Reassignment target must differ from the deleted category.', 'VALIDATION_ERROR');
      if (replacement.length > 32 || UNSAFE_TEXT.test(replacement)) throw new HttpError(400, 'Invalid reassignment category.', 'VALIDATION_ERROR');
      await this.ensureCategory(replacement);
      for (const row of affected) await this.words.patch(row.$id, { category: replacement });
    }
    if (target) await this.categories.delete(target.$id);
    if (affected.length > 0) invalidateWords();
    await this.writeAudit(actor, 'word_category.delete', 'word_category', id, `${oldName}: ${affected.length} words reassigned`);
    return { deleted: true, reassigned: affected.length };
  }

  private async insertWord(clean: Required<Omit<WordInput, 'id'>> & { id?: string }): Promise<Row> {
    const optional = await this.optional();
    const now = new Date().toISOString();
    const data: Record<string, unknown> = { id: clean.id || randomUUID().replaceAll('-', '').slice(0, 32), word: clean.word, category: clean.category, difficulty: clean.difficulty, isActive: clean.active };
    if (optional.has('language')) data.language = clean.language;
    if (optional.has('hint')) data.hint = clean.hint;
    if (optional.has('normalizedWord')) data.normalizedWord = normalizeWord(clean.word);
    if (optional.has('createdAt')) data.createdAt = now;
    if (optional.has('updatedAt')) data.updatedAt = now;
    return this.words.insert(data);
  }

  private async ensureCategory(name: string): Promise<void> {
    if (!(await this.hasCategoryTable())) return;
    const slug = slugifyName(name);
    const stored = await this.categories.list([Query.limit(200)]);
    if (stored.some((row) => String(row.slug) === slug || String(row.name).toLowerCase() === name.toLowerCase())) return;
    await this.categories.insert({ id: randomUUID().replaceAll('-', ''), name, slug, description: '', isActive: true });
  }

  private async writeAudit(actor: ContentActor, action: string, resourceType: string, resourceId: string, reason: string): Promise<void> {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}