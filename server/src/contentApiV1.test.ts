import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from './app';
import { parseCsvTable } from './content/csv';
import type { AppwriteDatabase } from './database/appwrite';
import type { ServerConfig } from './config/env';

class IsolatedContentTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 });
    const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row);
  }
  async updateRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 });
    const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated);
  }
  async deleteRow(_databaseId: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_databaseId: string, tableId: string, queries: string[] = []) {
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) {
      const query = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] };
      if (query.method === 'equal' && query.attribute) rows = rows.filter((row) => query.values?.includes(row[query.attribute!]));
      if (query.method === 'limit') limit = Number(query.values?.[0]);
      if (query.method === 'offset') offset = Number(query.values?.[0]);
    }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listColumns(_databaseId: string, tableId: string) {
    const columns = tableId === 'custom_words'
      ? ['id', 'word', 'category', 'difficulty', 'isActive', 'language', 'hint', 'normalizedWord', 'createdAt', 'updatedAt']
      : ['id', 'slug', 'title', 'excerpt', 'content', 'categoryId', 'status', 'featuredImage', 'seoTitle', 'seoDescription', 'publishedAt', 'authorId', 'authorName', 'views', 'createdAt', 'updatedAt', 'tags'];
    return { total: columns.length, columns: columns.map((key) => ({ key })) };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `content_e2e_${this.nextId}`; }
}

test('content API v1 enforces auth, confirmations, draft privacy, duplicates and pagination', async (t) => {
  const tables = new IsolatedContentTables();
  const database = { tables, databaseId: 'isolated_content', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'content-token-admin': { userId: 'content-admin', name: 'ContentAdmin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
    'content-token-user': { userId: 'content-user', name: 'RegularUser', email: null, emailVerified: false, isGuest: true },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  await tables.createRow('isolated_content', 'admin_roles', 'content_admin_role', { userId: 'content-admin', role: 'content_manager', isActive: true });
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-content', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_content', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app } = createApp({ config, database, verifyJwt });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  const adminHeaders = { Authorization: 'Bearer content-token-admin', 'Content-Type': 'application/json' };
  const userHeaders = { Authorization: 'Bearer content-token-user', 'Content-Type': 'application/json' };
  const json = async (response: Response) => response.json() as Promise<Record<string, never>>;

  const unauthenticated = await fetch(`${base}/api/v1/admin/words`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthenticated.status, 401);
  const forbidden = await fetch(`${base}/api/v1/admin/words`, { headers: userHeaders });
  assert.equal(forbidden.status, 403);

  const wordCreate = await fetch(`${base}/api/v1/admin/words`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ word: 'Otter', category: 'Animals', difficulty: 'easy', hint: 'River swimmer' }) });
  assert.equal(wordCreate.status, 201);
  const word = (await json(wordCreate)).data as unknown as { id: string; hint: string };
  assert.equal(word.hint, 'River swimmer');
  const duplicate = await fetch(`${base}/api/v1/admin/words`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ word: 'OTTER', category: 'Animals', difficulty: 'medium' }) });
  assert.equal(duplicate.status, 409);
  assert.equal((await json(duplicate)).code, 'WORD_DUPLICATE');
  const invalidWord = await fetch(`${base}/api/v1/admin/words`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ word: '<script>', category: 'Animals', difficulty: 'easy' }) });
  assert.equal(invalidWord.status, 400);
  const inactiveWord = await fetch(`${base}/api/v1/admin/words`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ word: 'Secret', category: 'Animals', difficulty: 'hard', active: false }) });
  assert.equal(inactiveWord.status, 201);

  const publicWords = await fetch(`${base}/api/v1/words`);
  assert.equal(publicWords.status, 404);
  const publicCategories = await fetch(`${base}/api/v1/words/categories`);
  assert.equal(publicCategories.status, 404);

  const wordDeleteNoConfirm = await fetch(`${base}/api/v1/admin/words/${word.id}`, { method: 'DELETE', headers: adminHeaders, body: JSON.stringify({}) });
  assert.equal(wordDeleteNoConfirm.status, 400);
  const wordDelete = await fetch(`${base}/api/v1/admin/words/${word.id}`, { method: 'DELETE', headers: adminHeaders, body: JSON.stringify({ confirm: true }) });
  assert.equal(wordDelete.status, 200);

  const bulk = await fetch(`${base}/api/v1/admin/words/bulk`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ words: [{ word: 'Cat', category: 'Animals', difficulty: 'easy' }, { word: 'cat', category: 'Animals', difficulty: 'easy' }, { word: 'Dog', category: 'Animals', difficulty: 'medium' }], strategy: 'skip' }) });
  assert.equal(bulk.status, 200);
  const bulkData = (await json(bulk)).data as unknown as { created: number; skipped: number };
  assert.equal(bulkData.created, 2);
  assert.equal(bulkData.skipped, 1);

  const blogCreate = await fetch(`${base}/api/v1/admin/blogs`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ title: 'Draw Space Guide', content: 'First paragraph.\n\nSecond paragraph.', category: 'Guides', tags: ['tips'] }) });
  assert.equal(blogCreate.status, 201);
  const blog = (await json(blogCreate)).data as unknown as { id: string; slug: string; status: string; tags: string[] };
  assert.equal(blog.status, 'draft');
  assert.equal(blog.slug, 'draw-space-guide');
  assert.deepEqual(blog.tags, ['tips']);

  const publicDraftList = await fetch(`${base}/api/v1/blogs`);
  assert.deepEqual(((await json(publicDraftList)).data as unknown as unknown[]).length, 0);
  const publicDraftDetail = await fetch(`${base}/api/v1/blogs/${blog.slug}`);
  assert.equal(publicDraftDetail.status, 404);
  const publicPhase8Draft = await fetch(`${base}/api/v1/public/blogs/${blog.slug}`);
  assert.equal(publicPhase8Draft.status, 404);

  const publishNoConfirm = await fetch(`${base}/api/v1/admin/blogs/${blog.id}/publish`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
  assert.equal(publishNoConfirm.status, 400);
  const publish = await fetch(`${base}/api/v1/admin/blogs/${blog.id}/publish`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ confirm: true }) });
  assert.equal(publish.status, 200);
  assert.equal(((await json(publish)).data as unknown as { status: string }).status, 'published');

  const publicList = await fetch(`${base}/api/v1/public/blogs?limit=10`);
  assert.equal(publicList.status, 200);
  const publicBody = await json(publicList);
  assert.equal(publicBody.success, true);
  assert.equal((publicBody.data as unknown as unknown[]).length, 1);
  assert.ok(publicBody.pagination);
  const publicDetail = await fetch(`${base}/api/v1/blogs/${blog.slug}`);
  assert.equal(publicDetail.status, 200);
  const detailBody = await json(publicDetail);
  assert.equal((detailBody.data as unknown as { views: number }).views, 1);
  assert.ok(Array.isArray(detailBody.related));

  const archive = await fetch(`${base}/api/v1/admin/blogs/${blog.id}/archive`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ confirm: true }) });
  assert.equal(archive.status, 200);
  const archivedPublic = await fetch(`${base}/api/v1/public/blogs`);
  assert.deepEqual(((await json(archivedPublic)).data as unknown as unknown[]).length, 0);

  for (let index = 0; index < 3; index += 1) {
    const response = await fetch(`${base}/api/v1/admin/words`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ word: `Pagination ${index}`, category: 'General', difficulty: 'easy' }) });
    assert.equal(response.status, 201);
  }
  const pageOne = await fetch(`${base}/api/v1/admin/words?limit=2&sort=word&order=asc`, { headers: adminHeaders });
  const pageOneBody = await json(pageOne);
  const pageOneItems = pageOneBody.data as unknown as { word: string }[];
  assert.equal(pageOneItems.length, 2);
  const cursor = (pageOneBody.pagination as unknown as { nextCursor: string }).nextCursor;
  assert.ok(cursor);
  const pageTwo = await fetch(`${base}/api/v1/admin/words?limit=2&sort=word&order=asc&cursor=${cursor}`, { headers: adminHeaders });
  const pageTwoItems = ((await json(pageTwo)).data as unknown as { word: string }[]);
  assert.equal(pageTwoItems.length, 2);
  assert.ok(!pageOneItems.some((item) => pageTwoItems.some((other) => other.word === item.word)));
  const badLimit = await fetch(`${base}/api/v1/admin/words?limit=999`, { headers: adminHeaders });
  assert.equal(badLimit.status, 400);

  const stats = await fetch(`${base}/api/v1/admin/words/stats`, { headers: adminHeaders });
  assert.equal(stats.status, 200);
  const blogStats = await fetch(`${base}/api/v1/admin/blogs/stats`, { headers: adminHeaders });
  assert.equal(blogStats.status, 200);
  assert.equal(((await json(blogStats)).data as unknown as { archived: number }).archived, 1);
});

test('content API v1 import and export enforce limits, strategies, confirmations and unicode fidelity', async (t) => {
  const tables = new IsolatedContentTables();
  const database = { tables, databaseId: 'isolated_transfer', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'transfer-token-admin': { userId: 'transfer-admin', name: 'TransferAdmin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
    'transfer-token-user': { userId: 'transfer-user', name: 'RegularUser', email: null, emailVerified: false, isGuest: true },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  await tables.createRow('isolated_transfer', 'admin_roles', 'transfer_admin_role', { userId: 'transfer-admin', role: 'content_manager', isActive: true });
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-transfer', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_transfer', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app } = createApp({ config, database, verifyJwt });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  const adminHeaders = { Authorization: 'Bearer transfer-token-admin', 'Content-Type': 'application/json' };
  const userHeaders = { Authorization: 'Bearer transfer-token-user', 'Content-Type': 'application/json' };
  const json = async (response: Response) => response.json() as Promise<Record<string, never>>;
  const importWords = (body: Record<string, unknown>, headers: Record<string, string> = adminHeaders) => fetch(`${base}/api/v1/admin/import/words`, { method: 'POST', headers, body: JSON.stringify(body) });

  const wordsPayload = JSON.stringify({ format: 'drawspace-words', version: 1, words: [
    { word: 'قطة', language: 'ar', category: 'حيوانات', difficulty: 'easy', hint: 'حيوان أليف' },
    { word: 'éléphant', language: 'fr', category: 'Animaux', difficulty: 'medium' },
  ] });
  assert.equal((await importWords({ content: wordsPayload, filename: 'words.json', dryRun: true }, { 'Content-Type': 'application/json' })).status, 401);
  assert.equal((await importWords({ content: wordsPayload, filename: 'words.json', dryRun: true }, userHeaders)).status, 403);

  const preview = await importWords({ content: wordsPayload, filename: 'words.json', dryRun: true });
  assert.equal(preview.status, 200);
  const previewBody = (await json(preview)).data as unknown as { dryRun: boolean; created: number; format: string };
  assert.equal(previewBody.dryRun, true);
  assert.equal(previewBody.created, 2);
  assert.equal(previewBody.format, 'json');
  const emptyBank = await fetch(`${base}/api/v1/admin/words`, { headers: adminHeaders });
  assert.equal(((await json(emptyBank)).pagination as unknown as { total: number }).total, 0);

  const applied = await importWords({ content: wordsPayload, filename: 'words.json', strategy: 'insert' });
  assert.equal(applied.status, 200);
  assert.equal(((await json(applied)).data as unknown as { created: number }).created, 2);
  const skipped = await importWords({ content: wordsPayload, filename: 'words.json', strategy: 'skip' });
  assert.equal(((await json(skipped)).data as unknown as { skipped: number }).skipped, 2);
  const insertDup = await importWords({ content: wordsPayload, filename: 'words.json', strategy: 'insert' });
  assert.equal(((await json(insertDup)).data as unknown as { failed: number }).failed, 2);
  const replaceGate = await importWords({ content: wordsPayload, filename: 'words.json', strategy: 'replace' });
  assert.equal(replaceGate.status, 400);
  assert.equal((await json(replaceGate)).code, 'CONFIRM_REQUIRED');
  const replaced = await importWords({ content: wordsPayload, filename: 'words.json', strategy: 'replace', confirm: true });
  assert.equal(((await json(replaced)).data as unknown as { updated: number }).updated, 2);

  const csvImport = await importWords({ content: 'word,category,difficulty,active\nBison,Animals,medium,true\n', filename: 'words.csv' });
  assert.equal(csvImport.status, 200);
  assert.equal(((await json(csvImport)).data as unknown as { created: number; format: string }).format, 'csv');
  assert.equal((await importWords({ content: 'word\n"Cat\n', filename: 'bad.csv' })).status, 400);
  assert.equal((await importWords({ content: '{oops', filename: 'bad.json' })).status, 400);
  assert.equal((await importWords({ content: 'word,category\nCat,Animals\n', filename: 'bad.txt' })).status, 400);
  const tooMany = JSON.stringify({ words: Array.from({ length: 1001 }, (_, index) => ({ word: `word${index}`, category: 'General', difficulty: 'easy' })) });
  const limitResponse = await importWords({ content: tooMany, filename: 'many.json' });
  assert.equal(limitResponse.status, 400);
  assert.equal((await json(limitResponse)).code, 'IMPORT_LIMIT');

  const wordExportJson = await fetch(`${base}/api/v1/admin/export/words?format=json`, { headers: adminHeaders });
  assert.equal(wordExportJson.status, 200);
  assert.match(wordExportJson.headers.get('content-disposition') || '', /^attachment; filename="drawspace-words-\d{4}-\d{2}-\d{2}\.json"$/);
  const wordEnvelope = JSON.parse(await wordExportJson.text()) as { format: string; version: number; words: { word: string; hint: string }[]; categories: unknown[] };
  assert.equal(wordEnvelope.format, 'drawspace-words');
  assert.equal(wordEnvelope.version, 1);
  assert.ok(wordEnvelope.words.some((word) => word.word === 'قطة' && word.hint === 'حيوان أليف'));
  assert.ok(Array.isArray(wordEnvelope.categories));
  const wordExportCsv = await fetch(`${base}/api/v1/admin/export/words?format=csv`, { headers: adminHeaders });
  const csvBytes = Buffer.from(await wordExportCsv.arrayBuffer());
  assert.deepEqual([csvBytes[0], csvBytes[1], csvBytes[2]], [0xef, 0xbb, 0xbf]);
  const csvText = csvBytes.toString('utf8');
  assert.ok(csvText.includes('قطة'));
  const filteredExport = await fetch(`${base}/api/v1/admin/export/words?format=json&difficulty=medium`, { headers: adminHeaders });
  const filteredEnvelope = JSON.parse(await filteredExport.text()) as { words: { difficulty: string }[] };
  assert.ok(filteredEnvelope.words.every((word) => word.difficulty === 'medium'));
  assert.equal((await fetch(`${base}/api/v1/admin/export/words`, { headers: userHeaders })).status, 403);

  const blogsPayload = JSON.stringify({ format: 'drawspace-blogs', version: 1, blogs: [
    { title: 'Café français', content: 'Ligne "un", deux\nLigne trois', tags: ['café'] },
    { title: 'مقال عربي', slug: 'maqal-arabi', content: 'محتوى عربي كامل' },
  ] });
  const blogPreview = await fetch(`${base}/api/v1/admin/import/blogs`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ content: blogsPayload, filename: 'blogs.json', dryRun: true }) });
  assert.equal(blogPreview.status, 200);
  assert.equal(((await json(blogPreview)).data as unknown as { created: number }).created, 2);
  const blogImport = await fetch(`${base}/api/v1/admin/import/blogs`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ content: blogsPayload, filename: 'blogs.json', strategy: 'insert' }) });
  assert.equal(blogImport.status, 200);
  const publicDrafts = await fetch(`${base}/api/v1/public/blogs`);
  assert.equal(((await json(publicDrafts)).data as unknown as unknown[]).length, 0);
  const blogReplaceGate = await fetch(`${base}/api/v1/admin/import/blogs`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ content: blogsPayload, filename: 'blogs.json', strategy: 'replace' }) });
  assert.equal(blogReplaceGate.status, 400);

  const blogExportCsv = await fetch(`${base}/api/v1/admin/export/blogs?format=csv&scope=draft`, { headers: adminHeaders });
  assert.equal(blogExportCsv.status, 200);
  assert.match(blogExportCsv.headers.get('content-disposition') || '', /^attachment; filename="drawspace-blogs-\d{4}-\d{2}-\d{2}\.csv"$/);
  const blogTable = parseCsvTable(await blogExportCsv.text());
  assert.equal(blogTable.records.length, 2);
  const frenchRow = blogTable.records.find((row) => row.slug === 'cafe-francais')!;
  assert.equal(frenchRow.content, 'Ligne "un", deux\nLigne trois');
  const blogExportJson = await fetch(`${base}/api/v1/admin/export/blogs?format=json&scope=published`, { headers: adminHeaders });
  assert.equal((JSON.parse(await blogExportJson.text()) as { blogs: unknown[] }).blogs.length, 0);
  const selectedExport = await fetch(`${base}/api/v1/admin/export/blogs?format=json&scope=selected`, { headers: adminHeaders });
  assert.equal(selectedExport.status, 400);
  const categoryExport = await fetch(`${base}/api/v1/admin/export/categories?format=json`, { headers: adminHeaders });
  assert.equal(categoryExport.status, 200);
  assert.equal((JSON.parse(await categoryExport.text()) as { format: string }).format, 'drawspace-word-categories');
});