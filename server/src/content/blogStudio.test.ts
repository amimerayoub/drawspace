import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import type { AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { BlogService } from './blogService';
import { TemplateService } from './templateService';
import { createContentDouble, testActor } from './contentTestDouble';
import { prepareStudio, studioToObject, STUDIO_SENTINEL, STUDIO_DOC_MAX } from './studioContent';
import { sanitizeHtmlServer, sanitizeStudioHtml } from './sanitizeHtml';
import { defaultDesign, parseDoc } from '../../../src/studio/types';

const editor = { userId: 'editor-1', username: 'Editor', role: 'content_manager' };

const studioContent = (code: Record<string, unknown> = {}, blocks: unknown[] = [{ id: 'b1', type: 'paragraph', html: 'Hello <b>world</b><script>alert(1)</script>' }]) =>
  `${STUDIO_SENTINEL}\n${JSON.stringify({ version: 1, blocks, design: {}, code: { enabled: true, html: '', css: '', js: '', headerScript: '', footerScript: '', placement: 'post', height: 320, ...code } })}`;

test('prepareStudio passes legacy text through and gates studio scripts by role', () => {
  const legacy = prepareStudio('Just a plain paragraph.', 'admin');
  assert.equal(legacy.isStudio, false);
  assert.equal(legacy.serialized, 'Just a plain paragraph.');

  const asAdmin = prepareStudio(studioContent({ js: 'console.log(1)', headerScript: 'h()', footerScript: 'f()' }), 'admin');
  assert.equal(asAdmin.isStudio, true);
  const adminDoc = studioToObject(asAdmin.serialized)!;
  assert.equal((adminDoc.code as Record<string, unknown>).js, 'console.log(1)');
  assert.ok(!asAdmin.serialized.includes('<script>'), 'script tags must be stripped from block html');
  assert.ok(asAdmin.plain.includes('Hello'), 'plain text projection keeps readable content');

  const asEditor = prepareStudio(studioContent({ js: 'console.log(1)', headerScript: 'h()', footerScript: 'f()' }), 'content_manager');
  const editorDoc = studioToObject(asEditor.serialized)!;
  const editorCode = editorDoc.code as Record<string, unknown>;
  assert.equal(editorCode.js, '');
  assert.equal(editorCode.headerScript, '');
  assert.equal(editorCode.footerScript, '');

  const superadmin = prepareStudio(studioContent({ js: 'x()' }), 'superadmin');
  assert.equal((studioToObject(superadmin.serialized)!.code as Record<string, unknown>).js, 'x()');
});

test('prepareStudio rejects invalid, blockless and oversized studio payloads', () => {
  assert.throws(() => prepareStudio(`${STUDIO_SENTINEL}\n{not json`, 'admin'), /valid JSON/);
  assert.throws(() => prepareStudio(`${STUDIO_SENTINEL}\n{"design":{}}`, 'admin'), /blocks array/);
  const huge = `${STUDIO_SENTINEL}\n${JSON.stringify({ version: 1, blocks: [{ id: 'b', type: 'paragraph', html: 'x'.repeat(STUDIO_DOC_MAX) }], design: {}, code: {} })}`;
  assert.throws(() => prepareStudio(huge, 'admin'), /too large/);
  assert.equal(studioToObject('plain text'), null);
});

test('sanitizeHtmlServer strips active content and restricts embeds', () => {
  const cleaned = sanitizeHtmlServer('<p onclick="evil()">Hi</p><script>bad()</script><a href="javascript:alert(1)">x</a><img src="https://ok/x.png" onerror="bad()">', 'block');
  assert.ok(!cleaned.includes('script'));
  assert.ok(!cleaned.includes('onclick'));
  assert.ok(!cleaned.includes('onerror'));
  assert.ok(!cleaned.includes('javascript:'));
  assert.ok(cleaned.includes('<img src="https://ok/x.png"'));
  const frame = sanitizeHtmlServer('<iframe src="https://evil.example/x"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe>', 'embed');
  assert.ok(!frame.includes('evil.example'));
  assert.ok(frame.includes('youtube.com'));
  assert.ok(frame.includes('sandbox='));
});

test('sanitizeStudioHtml cleans scripts at any column nesting depth', () => {
  let level: unknown[] = [{ id: 'leaf', type: 'paragraph', html: '<script>x</script>safe' }];
  for (let i = 0; i < 30; i += 1) level = [{ id: `c${i}`, type: 'columns', count: 2, children: [level] }];
  const result = sanitizeStudioHtml({ blocks: level }) as { blocks: unknown[] };
  assert.ok(Array.isArray(result.blocks));
  const json = JSON.stringify(result);
  assert.ok(!json.includes('<script>'), 'iterative sanitizer must strip scripts even 30 columns deep');
  assert.ok(json.includes('safe'), 'readable text survives deep sanitization');
});

test('BlogService stores studio documents in studioDoc with a plain-text projection', async () => {
  const { database } = createContentDouble({ studio: true });
  const blogs = new BlogService(database);
  const record = await blogs.create({ title: 'Studio post', content: studioContent({ js: 'run()' }), status: 'draft' }, testActor);
  assert.ok(record.studioDoc.startsWith(STUDIO_SENTINEL));
  assert.ok(!record.content.startsWith(STUDIO_SENTINEL), 'content column holds plain text, not the document');
  assert.ok(record.content.includes('Hello'));
  const fetched = await blogs.get(record.id);
  assert.equal(fetched.studioDoc, record.studioDoc);

  const renamed = await blogs.update(record.id, { title: 'Renamed' }, testActor);
  assert.equal(renamed.title, 'Renamed');
  assert.ok(renamed.studioDoc.startsWith(STUDIO_SENTINEL), 'partial update preserves the studio document');

  const flattened = await blogs.update(record.id, { content: 'Now plain text.' }, testActor);
  assert.equal(flattened.studioDoc, '');
  assert.equal(flattened.content, 'Now plain text.');
});

test('BlogService strips custom JS for non-admin roles and enforces pre-migration capacity', async () => {
  const { database } = createContentDouble({ studio: true });
  const blogs = new BlogService(database);
  const record = await blogs.create({ title: 'Editor post', content: studioContent({ js: 'evil()' }) }, editor);
  const code = studioToObject(record.studioDoc)!.code as Record<string, unknown>;
  assert.equal(code.js, '');

  const legacyDouble = createContentDouble({ migrated: true });
  const legacyBlogs = new BlogService(legacyDouble.database);
  assert.equal(await legacyBlogs.studioLimit(), 10000);
  const small = await legacyBlogs.create({ title: 'Small', content: studioContent() }, testActor);
  assert.ok(small.content.startsWith(STUDIO_SENTINEL), 'pre-migration the document lives in content');
  assert.equal(small.studioDoc, '');
  const big = `${STUDIO_SENTINEL}\n${JSON.stringify({ version: 1, blocks: [{ id: 'b', type: 'paragraph', html: 'y'.repeat(11000) }], design: {}, code: {} })}`;
  await assert.rejects(() => legacyBlogs.create({ title: 'Big', content: big }, testActor));
});

test('TemplateService falls back when unavailable and gates documents when present', async () => {
  const unavailable = new TemplateService(createContentDouble({ migrated: true }).database);
  assert.equal(await unavailable.isAvailable(), false);
  assert.deepEqual(await unavailable.list(), []);
  await assert.rejects(() => unavailable.create({ name: 'X', doc: studioContent() }, testActor), /migration/);

  const { database } = createContentDouble({ studio: true });
  const templates = new TemplateService(database);
  assert.equal(await templates.isAvailable(), true);
  const created = await templates.create({ name: 'Hero layout', description: 'Big hero', doc: studioContent({ js: 'keep()' }) }, testActor);
  assert.equal(created.name, 'Hero layout');
  assert.ok(created.doc.startsWith(STUDIO_SENTINEL));
  assert.equal((studioToObject(created.doc)!.code as Record<string, unknown>).js, 'keep()');
  const asEditor = await templates.create({ name: 'Editor layout', doc: studioContent({ js: 'drop()' }) }, editor);
  assert.equal((studioToObject(asEditor.doc)!.code as Record<string, unknown>).js, '');
  await assert.rejects(() => templates.create({ name: 'hero layout', doc: studioContent() }, testActor), /already exists/);
  assert.equal((await templates.list()).length, 2);
  await templates.delete(created.id, testActor);
  assert.equal((await templates.list()).length, 1);
  await assert.rejects(() => templates.delete('missing', testActor), /not found/);
});

class StudioTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_db: string, tableId: string, id: string, data: Record<string, unknown>) {
    const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 });
    const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row);
  }
  async updateRow(_db: string, tableId: string, id: string, data: Record<string, unknown>) {
    const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 });
    const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated);
  }
  async deleteRow(_db: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_db: string, tableId: string, queries: string[] = []) {
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) {
      const query = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] };
      if (query.method === 'equal' && query.attribute) rows = rows.filter((row) => query.values?.includes(row[query.attribute!]));
      if (query.method === 'limit') limit = Number(query.values?.[0]);
      if (query.method === 'offset') offset = Number(query.values?.[0]);
    }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listColumns(_db: string, tableId: string) {
    if (tableId === 'blog_templates') return { total: 6, columns: ['id', 'name', 'description', 'doc', 'createdBy', 'createdAt'].map((key) => ({ key })) };
    const keys = ['id', 'slug', 'title', 'excerpt', 'content', 'categoryId', 'status', 'featuredImage', 'seoTitle', 'seoDescription', 'publishedAt', 'authorId', 'authorName', 'views', 'createdAt', 'updatedAt', 'tags', 'studioDoc'];
    return { total: keys.length, columns: keys.map((key) => ({ key, size: key === 'content' ? 10000 : key === 'studioDoc' ? 500000 : undefined })) };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `studio_e2e_${this.nextId}`; }
}

test('studio HTTP API: config, role-gated persistence, templates and public sync', async (t) => {
  const tables = new StudioTables();
  const database = { tables, databaseId: 'isolated_studio', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'studio-admin': { userId: 'studio-admin', name: 'StudioAdmin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
    'studio-editor': { userId: 'studio-editor', name: 'StudioEditor', email: 'editor@example.invalid', emailVerified: true, isGuest: false },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  await tables.createRow('isolated_studio', 'admin_roles', 'role_admin', { userId: 'studio-admin', role: 'admin', isActive: true });
  await tables.createRow('isolated_studio', 'admin_roles', 'role_editor', { userId: 'studio-editor', role: 'content_manager', isActive: true });
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-studio', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_studio', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app } = createApp({ config, database, verifyJwt });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  const adminHeaders = { Authorization: 'Bearer studio-admin', 'Content-Type': 'application/json' };
  const editorHeaders = { Authorization: 'Bearer studio-editor', 'Content-Type': 'application/json' };
  const json = async (response: Response) => response.json() as Promise<Record<string, never>>;

  const adminConfig = (await json(await fetch(`${base}/api/v1/admin/blog-studio/config`, { headers: adminHeaders }))).data as unknown as { contentLimit: number; studioLimit: number; canUseCustomJs: boolean; templatesAvailable: boolean };
  assert.equal(adminConfig.studioLimit, 500000);
  assert.equal(adminConfig.canUseCustomJs, true);
  assert.equal(adminConfig.templatesAvailable, true);
  const editorConfig = (await json(await fetch(`${base}/api/v1/admin/blog-studio/config`, { headers: editorHeaders }))).data as unknown as { canUseCustomJs: boolean };
  assert.equal(editorConfig.canUseCustomJs, false);

  const created = await fetch(`${base}/api/v1/admin/blogs`, { method: 'POST', headers: editorHeaders, body: JSON.stringify({ title: 'Editor studio', content: studioContent({ js: 'evil()' }), status: 'published' }) });
  assert.equal(created.status, 201);
  const post = (await json(created)).data as unknown as { id: string; slug: string; studioDoc: string; content: string };
  assert.ok(post.studioDoc.startsWith(STUDIO_SENTINEL));
  assert.equal((studioToObject(post.studioDoc)!.code as Record<string, unknown>).js, '', 'editor JS must be stripped server-side');

  const publicArticle = (await json(await fetch(`${base}/api/v1/blogs/${post.slug}`))).data as unknown as { studioDoc: string };
  assert.ok(publicArticle.studioDoc.startsWith(STUDIO_SENTINEL), 'public article exposes the studio document');

  const templateBody = { name: 'Cinematic', description: 'Dark hero', doc: JSON.parse(studioContent({ js: 'adminOnly()' }).slice(STUDIO_SENTINEL.length)) };
  const templateCreate = await fetch(`${base}/api/v1/admin/blog-templates`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(templateBody) });
  assert.equal(templateCreate.status, 201);
  const template = (await json(templateCreate)).data as unknown as { id: string; doc: { code: { js: string } } };
  assert.equal(template.doc.code.js, 'adminOnly()');
  const templateList = (await json(await fetch(`${base}/api/v1/admin/blog-templates`, { headers: adminHeaders }))).data as unknown as { id: string }[];
  assert.equal(templateList.length, 1);
  const templateDelete = await fetch(`${base}/api/v1/admin/blog-templates/${template.id}`, { method: 'DELETE', headers: adminHeaders, body: JSON.stringify({ confirm: true }) });
  assert.equal(templateDelete.status, 200);
  assert.equal(((await json(await fetch(`${base}/api/v1/admin/blog-templates`, { headers: adminHeaders }))).data as unknown as []).length, 0);
});

test('parseDoc deep-merges partial design so the renderer never reads undefined fields', () => {
  const base = defaultDesign();
  const partial = `${STUDIO_SENTINEL}\n${JSON.stringify({
    version: 1,
    blocks: [{ id: 'h', type: 'heading', level: 1, text: 'Title', align: 'start' }],
    design: { typography: { fontFamily: 'Georgia' }, layout: { contentWidth: 900 }, colors: { accent: '#ff0000' } },
    code: {},
  })}`;
  const doc = parseDoc(partial);
  assert.ok(doc, 'partial-design studio doc must parse');
  assert.equal(doc!.design.typography.fontFamily, 'Georgia', 'provided values win');
  assert.equal(doc!.design.typography.headingFamily, base.typography.headingFamily, 'missing headingFamily falls back to default (regression: renderer .replace crash)');
  assert.equal(typeof doc!.design.typography.headingFamily, 'string');
  assert.equal(doc!.design.layout.contentWidth, 900);
  assert.equal(doc!.design.layout.sectionSpacing, base.layout.sectionSpacing, 'missing sectionSpacing falls back to default');
  assert.equal(doc!.design.colors.accent, '#ff0000');
  assert.equal(doc!.design.colors.borderColor, base.colors.borderColor);

  const emptyDesign = parseDoc(`${STUDIO_SENTINEL}\n${JSON.stringify({ version: 1, blocks: [], design: {}, code: {} })}`);
  assert.ok(emptyDesign);
  assert.equal(emptyDesign!.design.typography.headingFamily, base.typography.headingFamily);
  assert.equal(emptyDesign!.design.layout.shadow, base.layout.shadow);

  assert.equal(parseDoc('Just legacy plain text.'), null, 'legacy posts are not studio docs');
});