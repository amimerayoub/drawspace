import assert from 'node:assert/strict';
import test from 'node:test';
import { BlogService } from './blogService';
import { createContentDouble, testActor } from './contentTestDouble';
import { parseCsvTable } from './csv';
import {
  IMPORT_MAX_BYTES, buildBlogsExport, buildCategoriesExport, buildWordsExport, collectPages,
  detectImportFormat, parseBlogsImport, parseWordsImport,
} from './importExport';
import { WordService, normalizeWord } from './wordService';
import { HttpError } from '../middleware/errors';

const codeOf = (error: unknown) => (error as HttpError).code;

test('import format detection uses extension first and content sniffing as fallback', () => {
  assert.equal(detectImportFormat('words.JSON', ''), 'json');
  assert.equal(detectImportFormat('words.Csv', ''), 'csv');
  assert.equal(detectImportFormat(undefined, '  {"words":[]}'), 'json');
  assert.equal(detectImportFormat(undefined, 'word,category\nCat,Animals'), 'csv');
  assert.throws(() => detectImportFormat('words.txt', 'x'), (error: unknown) => codeOf(error) === 'UNSUPPORTED_EXTENSION');
});

test('word JSON parsing validates envelope, version and structure', () => {
  const envelope = JSON.stringify({ format: 'drawspace-words', version: 1, words: [{ word: 'Cat', category: 'Animals', difficulty: 'easy', active: 'true' }] });
  const parsed = parseWordsImport(envelope, 'json');
  assert.equal(parsed.inputs.length, 1);
  assert.equal(parsed.inputs[0].active, true);
  assert.equal(parseWordsImport('[{"word":"Dog","category":"Animals","difficulty":"hard"}]', 'json').inputs[0].word, 'Dog');
  assert.throws(() => parseWordsImport('{oops', 'json'), (error: unknown) => codeOf(error) === 'INVALID_JSON');
  assert.throws(() => parseWordsImport('{"format":"other","words":[]}', 'json'), (error: unknown) => codeOf(error) === 'UNSUPPORTED_FORMAT');
  assert.throws(() => parseWordsImport('{"version":2,"words":[]}', 'json'), (error: unknown) => codeOf(error) === 'UNSUPPORTED_VERSION');
  assert.throws(() => parseWordsImport('{"nope":true}', 'json'), (error: unknown) => codeOf(error) === 'INVALID_STRUCTURE');
  assert.throws(() => parseWordsImport('{"words":[42]}', 'json'), (error: unknown) => codeOf(error) === 'INVALID_STRUCTURE');
});

test('word CSV parsing maps columns, warns on unknown columns and rejects bad structure', () => {
  const parsed = parseWordsImport('word,language,category,difficulty,active,extra\nCat,en,Animals,easy,false,ignored\n', 'csv');
  assert.equal(parsed.inputs[0].language, 'en');
  assert.equal(parsed.inputs[0].active, false);
  assert.equal(parsed.warnings.length, 1);
  assert.throws(() => parseWordsImport('category,difficulty\nAnimals,easy\n', 'csv'), (error: unknown) => codeOf(error) === 'INVALID_STRUCTURE');
  assert.throws(() => parseWordsImport('word,word\nCat,Cat\n', 'csv'), (error: unknown) => codeOf(error) === 'INVALID_CSV');
  assert.throws(() => parseWordsImport('word\n"Cat\n', 'csv'), (error: unknown) => codeOf(error) === 'INVALID_CSV');
});

test('blog parsing splits semicolon tags and accepts publishedAt alias', () => {
  const parsed = parseBlogsImport(JSON.stringify({ format: 'drawspace-blogs', version: 1, blogs: [{ title: 'Titre', content: 'Contenu', tags: 'un;deux', publishedAt: '2026-11-01T00:00:00.000Z' }] }), 'json');
  assert.deepEqual(parsed.inputs[0].tags, ['un', 'deux']);
  assert.equal(parsed.inputs[0].publishAt, '2026-11-01T00:00:00.000Z');
  const csv = parseBlogsImport('title,content,tags\n"Titre, français","Ligne 1\nLigne 2",un;deux\n', 'csv');
  assert.equal(csv.inputs[0].title, 'Titre, français');
  assert.equal(csv.inputs[0].content, 'Ligne 1\nLigne 2');
  assert.throws(() => parseBlogsImport('title\nOnly title\n', 'csv'), (error: unknown) => codeOf(error) === 'INVALID_STRUCTURE');
});

test('import limits reject oversized files and too many records', () => {
  assert.throws(() => parseWordsImport('x'.repeat(IMPORT_MAX_BYTES + 1), 'csv'), (error: unknown) => codeOf(error) === 'FILE_TOO_LARGE');
  const manyWords = JSON.stringify({ words: Array.from({ length: 1001 }, (_, index) => ({ word: `word${index}`, category: 'General', difficulty: 'easy' })) });
  assert.throws(() => parseWordsImport(manyWords, 'json'), (error: unknown) => codeOf(error) === 'IMPORT_LIMIT');
  const manyBlogs = JSON.stringify({ blogs: Array.from({ length: 201 }, (_, index) => ({ title: `Post ${index}`, content: 'Body' })) });
  assert.throws(() => parseBlogsImport(manyBlogs, 'json'), (error: unknown) => codeOf(error) === 'IMPORT_LIMIT');
  assert.throws(() => parseWordsImport('{"words":[]}', 'json'), (error: unknown) => codeOf(error) === 'EMPTY_IMPORT');
});

test('word import dry run reports without writing and replace requires confirmation', async () => {
  const { database, rows } = createContentDouble({ migrated: true, withWordCategories: true });
  const words = new WordService(database);
  await words.create({ word: 'Otter', category: 'Animals', difficulty: 'easy' }, testActor);
  const inputs = parseWordsImport(JSON.stringify({ words: [{ word: 'OTTER', category: 'Animals', difficulty: 'hard' }, { word: 'Bison', category: 'Animals', difficulty: 'medium' }, { word: 'x', category: 'Animals', difficulty: 'easy' }] }), 'json').inputs;

  const preview = await words.importWords(inputs, 'upsert', testActor, { dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.updated, 1);
  assert.equal(preview.created, 1);
  assert.equal(preview.failed, 1);
  assert.equal(rows.get('custom_words')!.size, 1);
  assert.equal(rows.get('audit_logs')!.size, 1);

  await assert.rejects(() => words.importWords(inputs, 'replace', testActor), (error: unknown) => codeOf(error) === 'CONFIRM_REQUIRED');
  const replaced = await words.importWords(inputs, 'replace', testActor, { confirm: true });
  assert.equal(replaced.updated, 1);
  assert.equal(replaced.skipped, 1);
  assert.equal(replaced.failed, 1);
  assert.equal(replaced.warnings.length, 1);
  assert.equal(rows.get('custom_words')!.size, 1);
  assert.equal((await words.get((await words.list({})).items[0].id)).difficulty, 'hard');

  const applied = await words.importWords(inputs, 'skip', testActor);
  assert.equal(applied.skipped, 1);
  assert.equal(applied.created, 1);
  assert.equal(applied.failed, 1);
  assert.equal(rows.get('custom_words')!.size, 2);
});

test('unicode words and hints survive import, storage and CSV export round trips', async () => {
  const { database } = createContentDouble({ migrated: true, withWordCategories: true });
  const words = new WordService(database);
  const payload = JSON.stringify({ format: 'drawspace-words', version: 1, words: [
    { word: 'قطة', language: 'ar', category: 'حيوانات', difficulty: 'easy', hint: 'حيوان أليف' },
    { word: 'éléphant', language: 'fr', category: 'Animaux', difficulty: 'medium', hint: 'Grand mammère' },
  ] });
  const report = await words.importWords(parseWordsImport(payload, 'json').inputs, 'insert', testActor);
  assert.equal(report.created, 2);
  assert.equal(report.failed, 0);
  const records = (await words.list({ limit: 100 })).items;
  const arabic = records.find((record) => record.language === 'ar')!;
  assert.equal(arabic.word, 'قطة');
  assert.equal(arabic.hint, 'حيوان أليف');
  assert.equal(normalizeWord('قطة'), 'قطة');

  const csv = buildWordsExport(records, await words.listCategories(), 'csv', 'all');
  assert.match(csv.filename, /^drawspace-words-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(csv.body.charCodeAt(0), 0xfeff);
  const table = parseCsvTable(csv.body);
  const arabicRow = table.records.find((row) => row.language === 'ar')!;
  assert.equal(arabicRow.word, 'قطة');
  assert.equal(arabicRow.hint, 'حيوان أليف');
  const json = buildWordsExport(records, await words.listCategories(), 'json', 'all');
  const envelope = JSON.parse(json.body) as { format: string; version: number; words: { word: string }[]; categories: unknown[] };
  assert.equal(envelope.format, 'drawspace-words');
  assert.equal(envelope.version, 1);
  assert.ok(envelope.words.some((word) => word.word === 'éléphant'));
  assert.ok(Array.isArray(envelope.categories));
});

test('formula injection is neutralized in word CSV exports', async () => {
  const { database } = createContentDouble({ migrated: true });
  const words = new WordService(database);
  await words.create({ word: 'safe', category: 'General', difficulty: 'easy', hint: '=HYPERLINK("http://evil")' }, testActor);
  const csv = buildWordsExport((await words.list({})).items, [], 'csv', 'all');
  const row = parseCsvTable(csv.body).records[0];
  assert.equal(row.hint, '\'=HYPERLINK("http://evil")');
});

test('blog import previews, upserts, gates replace and warns about immediate publishing', async () => {
  const { database, rows } = createContentDouble({ migrated: true });
  const blogs = new BlogService(database);
  const inputs = parseBlogsImport(JSON.stringify({ blogs: [
    { title: 'Premier article', content: 'Bonjour, le monde.\nDeuxième ligne.' },
    { title: 'Second', slug: 'second', content: 'Body', status: 'published' },
  ] }), 'json').inputs;
  const preview = await blogs.importBlogs(inputs, 'insert', testActor, { dryRun: true });
  assert.equal(preview.created, 2);
  assert.equal(preview.warnings.length, 1);
  assert.equal(rows.get('blog_posts')?.size ?? 0, 0);

  const applied = await blogs.importBlogs(inputs, 'insert', testActor);
  assert.equal(applied.created, 2);
  const again = await blogs.importBlogs(inputs, 'insert', testActor);
  assert.equal(again.failed, 2);
  const skipped = await blogs.importBlogs(inputs, 'skip', testActor);
  assert.equal(skipped.skipped, 2);
  const upserted = await blogs.importBlogs([{ title: 'Premier article modifié', slug: 'premier-article', content: 'Nouveau contenu' }], 'upsert', testActor);
  assert.equal(upserted.updated, 1);
  await assert.rejects(() => blogs.importBlogs(inputs, 'replace', testActor), (error: unknown) => codeOf(error) === 'CONFIRM_REQUIRED');
  const replaced = await blogs.importBlogs([{ title: 'Remplacé', slug: 'second', content: 'Remplacé' }], 'replace', testActor, { confirm: true });
  assert.equal(replaced.updated, 1);
  const posts = (await blogs.list({ limit: 100 })).items;
  assert.equal(posts.find((post) => post.slug === 'premier-article')!.title, 'Premier article modifié');
  assert.equal(posts.find((post) => post.slug === 'second')!.title, 'Remplacé');
  assert.equal(posts.find((post) => post.slug === 'premier-article')!.status, 'draft');
});

test('blog exports preserve unicode, quoting and metadata without private user ids', async () => {
  const { database } = createContentDouble({ migrated: true });
  const blogs = new BlogService(database);
  await blogs.create({ title: 'Café français', content: 'Ligne "un", deux\nLigne trois', tags: ['café', 'été'], status: 'published' }, testActor);
  await blogs.create({ title: 'مقال عربي', slug: 'maqal-arabi', content: 'محتوى عربي كامل', status: 'draft' }, testActor);
  const records = (await blogs.list({ limit: 100 })).items;

  const csv = buildBlogsExport(records, 'csv', 'all');
  assert.match(csv.filename, /^drawspace-blogs-\d{4}-\d{2}-\d{2}\.csv$/);
  const table = parseCsvTable(csv.body);
  const french = table.records.find((row) => row.slug === 'cafe-francais')!;
  assert.equal(french.content, 'Ligne "un", deux\nLigne trois');
  assert.equal(french.tags, 'café;été');
  const arabic = table.records.find((row) => row.title === 'مقال عربي')!;
  assert.equal(arabic.content, 'محتوى عربي كامل');

  const json = buildBlogsExport(records, 'json', 'all');
  const envelope = JSON.parse(json.body) as { format: string; version: number; exportedAt: string; blogs: Record<string, unknown>[] };
  assert.equal(envelope.format, 'drawspace-blogs');
  assert.equal(envelope.version, 1);
  assert.ok(envelope.exportedAt);
  for (const post of envelope.blogs) assert.equal('authorId' in post, false);

  const categories = buildCategoriesExport([{ id: 'x', name: 'Animals', slug: 'animals', wordCount: 3 }], 'json');
  assert.equal((JSON.parse(categories.body) as { format: string }).format, 'drawspace-word-categories');
});

test('collectPages follows cursors until exhausted', async () => {
  const items = Array.from({ length: 250 }, (_, index) => index);
  const collected = await collectPages(async (cursor) => {
    const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8').replace('offset:', '')) : 0;
    const page = items.slice(offset, offset + 100);
    const next = offset + 100 < items.length ? Buffer.from(`offset:${offset + 100}`, 'utf8').toString('base64url') : null;
    return { items: page, nextCursor: next };
  });
  assert.equal(collected.length, 250);
});