import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createApp } from '../app';
import type { AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { BlogService } from '../content/blogService';
import { WordService } from '../content/wordService';
import { McpKeyService, generateMcpKey, hashKey } from './keyService';
import { buildMcpServer, MCP_TOOL_NAMES } from './tools';
import { ALL_MCP_SCOPES, READ_ONLY_MCP_SCOPES } from './scopes';

class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  readonly missing = new Set<string>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  private guard(tableId: string) { if (this.missing.has(tableId)) throw Object.assign(new Error('table not found'), { code: 404 }); }
  async createRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    this.guard(tableId);
    const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 });
    const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row);
  }
  async updateRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    this.guard(tableId);
    const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 });
    const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated);
  }
  async deleteRow(_databaseId: string, tableId: string, id: string) { this.guard(tableId); this.table(tableId).delete(id); }
  async listRows(_databaseId: string, tableId: string, queries: string[] = []) {
    this.guard(tableId);
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
  newId() { this.nextId += 1; return `mcp_e2e_${this.nextId}`; }
  raw(tableId: string) { return [...this.table(tableId).values()]; }
}

const makeDatabase = (tables: IsolatedTables): AppwriteDatabase => ({
  tables, databaseId: 'isolated_mcp', newId: () => tables.newId(),
  accountForJwt: () => { throw new Error('test verifier'); }, users: {},
} as unknown as AppwriteDatabase);

const actor = { userId: 'key-admin', username: 'KeyAdmin', role: 'superadmin' };

interface ToolResult { isError?: boolean; structuredContent?: { success: boolean; message: string; data?: Record<string, unknown>; code?: string }; content: { type: string; text: string }[] }
async function connectClient(words: WordService, blogs: BlogService, scopes: string[]) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer(words, blogs, { id: 'test-key', name: 'Test Key', scopes: scopes as never, source: 'table' });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
  await client.callTool({ name, arguments: args }) as ToolResult;

test('MCP key service generates, hashes, scopes, revokes, rotates and falls back before migration', async () => {
  const tables = new IsolatedTables();
  const service = new McpKeyService(makeDatabase(tables), 'bootstrap-key-0123456789abcdef');

  const generated = generateMcpKey();
  assert.ok(generated.key.startsWith('ds_mcp_'));
  assert.equal(generated.keyHash, hashKey(generated.key));
  assert.notEqual(generateMcpKey().key, generated.key);

  const bootstrap = await service.authenticate('bootstrap-key-0123456789abcdef');
  assert.equal(bootstrap?.source, 'env');
  assert.deepEqual(bootstrap?.scopes, ALL_MCP_SCOPES);
  assert.equal(await service.authenticate('wrong-key'), null);

  const created = await service.create({ name: 'Reader', scopes: ['words:read', 'blogs:read', 'words:read'] }, actor);
  assert.deepEqual(created.view.scopes, ['words:read', 'blogs:read']);
  assert.ok(!('keyHash' in created.view));
  const stored = tables.raw('mcp_api_keys')[0];
  assert.equal(stored.keyHash, hashKey(created.key));
  assert.equal(stored.key, undefined);

  const context = await service.authenticate(created.key);
  assert.equal(context?.source, 'table');
  assert.deepEqual(context?.scopes, ['words:read', 'blogs:read']);

  const limited = new McpKeyService(makeDatabase(tables), undefined, ['words:read']);
  assert.equal(await limited.authenticate('bootstrap-key-0123456789abcdef'), null);

  await service.revoke(created.view.id, actor);
  assert.equal(await service.authenticate(created.key), null);

  const rotated = await service.rotate(created.view.id, actor).catch(() => null);
  assert.equal(rotated, null);

  const active = await service.create({ name: 'Rotate me', scopes: ['analytics:read'], expiresInDays: 30 }, actor);
  const rotation = await service.rotate(active.view.id, actor);
  assert.equal(await service.authenticate(active.key), null);
  assert.deepEqual((await service.authenticate(rotation.key))?.scopes, ['analytics:read']);

  const expiring = await service.create({ name: 'Expiring', scopes: ['words:read'] }, actor);
  await tables.updateRow('isolated_mcp', 'mcp_api_keys', expiring.view.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(await service.authenticate(expiring.key), null);

  const status = await service.status();
  assert.equal(status.tableAvailable, true);
  assert.equal(status.bootstrapConfigured, true);

  const noTable = new IsolatedTables();
  noTable.missing.add('mcp_api_keys');
  const preMigration = new McpKeyService(makeDatabase(noTable), 'bootstrap-key-0123456789abcdef');
  assert.equal((await preMigration.authenticate('bootstrap-key-0123456789abcdef'))?.source, 'env');
  await assert.rejects(() => preMigration.create({ name: 'X', scopes: ['words:read'] }, actor), /mcp_api_keys/);
  assert.equal((await preMigration.status()).tableAvailable, false);
});

test('MCP tools enforce scopes, default to draft, gate destructive actions and return real data', async () => {
  const tables = new IsolatedTables();
  const database = makeDatabase(tables);
  const words = new WordService(database);
  const blogs = new BlogService(database);

  const { client, server } = await connectClient(words, blogs, ALL_MCP_SCOPES);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, MCP_TOOL_NAMES.length);
  for (const name of MCP_TOOL_NAMES) assert.ok(listed.tools.some((tool) => tool.name === name), `missing tool ${name}`);

  const created = await call(client, 'drawspace_create_blog', { title: 'Hello MCP', content: 'Article body.' });
  assert.notEqual(created.isError, true);
  assert.equal(created.structuredContent?.success, true);
  const blog = created.structuredContent?.data as { id: string; status: string; slug: string };
  assert.equal(blog.status, 'draft');
  assert.ok(blog.id);

  const blogList = await call(client, 'drawspace_list_blogs', { status: 'draft' });
  assert.equal(blogList.structuredContent?.success, true);
  assert.ok((blogList.structuredContent?.data as { blogs: unknown[] }).blogs.length >= 1);
  const blogGet = await call(client, 'drawspace_get_blog', { slug: blog.slug });
  assert.equal((blogGet.structuredContent?.data as { id: string }).id, blog.id);

  const noConfirm = await call(client, 'drawspace_delete_blog', { id: blog.id });
  assert.equal(noConfirm.isError, true);
  assert.equal(noConfirm.structuredContent?.code, 'CONFIRM_REQUIRED');

  const published = await call(client, 'drawspace_publish_blog', { id: blog.id, confirm: true });
  assert.equal(published.structuredContent?.success, true);
  assert.equal((published.structuredContent?.data as { status: string }).status, 'published');

  const word = await call(client, 'drawspace_add_word', { word: 'Otter', category: 'Animals', difficulty: 'easy' });
  const wordId = (word.structuredContent?.data as { id: string }).id;
  const wordList = await call(client, 'drawspace_list_words', { category: 'Animals' });
  assert.equal((wordList.structuredContent?.data as { words: unknown[] }).words.length, 1);

  const summary = await call(client, 'drawspace_get_content_summary');
  const summaryData = summary.structuredContent?.data as { words: { total: number }; blogs: { total: number } };
  assert.equal(summaryData.words.total, 1);
  assert.equal(summaryData.blogs.total, 1);

  const exportWords = await call(client, 'drawspace_export_words', { format: 'json' });
  const exportData = exportWords.structuredContent?.data as { content: string; filename: string };
  assert.match(exportData.filename, /^drawspace-words-\d{4}-\d{2}-\d{2}\.json$/);
  assert.ok(exportData.content.includes('Otter'));

  const deleted = await call(client, 'drawspace_delete_word', { id: wordId, confirm: true });
  assert.equal(deleted.structuredContent?.success, true);

  const readOnly = await connectClient(words, blogs, READ_ONLY_MCP_SCOPES);
  const forbidden = await call(readOnly.client, 'drawspace_add_word', { word: 'Nope', category: 'Animals', difficulty: 'easy' });
  assert.equal(forbidden.isError, true);
  assert.equal(forbidden.structuredContent?.code, 'FORBIDDEN');
  const allowedRead = await call(readOnly.client, 'drawspace_get_word_stats');
  assert.equal(allowedRead.structuredContent?.success, true);
  const publishForbidden = await call(readOnly.client, 'drawspace_create_blog', { title: 'Draft only', content: 'Body', status: 'published' });
  assert.equal(publishForbidden.structuredContent?.code, 'FORBIDDEN');
  const deleteForbidden = await call(readOnly.client, 'drawspace_delete_blog', { id: blog.id, confirm: true });
  assert.equal(deleteForbidden.isError, true);
  assert.equal(deleteForbidden.structuredContent?.code, 'FORBIDDEN');

  const auditRows = tables.raw('audit_logs');
  assert.ok(auditRows.some((row) => row.actorRole === 'mcp' && row.action === 'blog.create'), 'MCP blog creation must be audited');

  await client.close(); await server.close();
  await readOnly.client.close(); await readOnly.server.close();
});

test('MCP HTTP endpoint authenticates, the admin key API is scoped, and keys are shown once', async (t) => {
  const tables = new IsolatedTables();
  const database = makeDatabase(tables);
  const identities = {
    'mcp-token-admin': { userId: 'mcp-admin', name: 'McpAdmin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
    'mcp-token-editor': { userId: 'mcp-editor', name: 'McpEditor', email: null, emailVerified: false, isGuest: true },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  await tables.createRow('isolated_mcp', 'admin_roles', 'role_admin', { userId: 'mcp-admin', role: 'superadmin', isActive: true });
  await tables.createRow('isolated_mcp', 'admin_roles', 'role_editor', { userId: 'mcp-editor', role: 'content_manager', isActive: true });
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-mcp', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_mcp', frontendOrigins: [], roomStateDriver: 'memory', mcpApiKey: 'bootstrap-key-0123456789abcdef' };
  const { app } = createApp({ config, database, verifyJwt });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });

  const noKey = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noKey.status, 401);
  const badKey = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-key' }, body: '{}' });
  assert.equal(badKey.status, 401);
  const wrongMethod = await fetch(`${base}/mcp`, { headers: { Authorization: 'Bearer bootstrap-key-0123456789abcdef' } });
  assert.equal(wrongMethod.status, 405);

  const initialize = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer bootstrap-key-0123456789abcdef' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } }),
  });
  assert.equal(initialize.status, 200);
  const initializeBody = await initialize.json() as { result: { serverInfo: { name: string } } };
  assert.equal(initializeBody.result.serverInfo.name, 'drawspace-mcp');

  const adminHeaders = { Authorization: 'Bearer mcp-token-admin', 'Content-Type': 'application/json' };
  const editorHeaders = { Authorization: 'Bearer mcp-token-editor', 'Content-Type': 'application/json' };

  const unauthenticated = await fetch(`${base}/api/v1/admin/mcp/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthenticated.status, 401);
  const forbidden = await fetch(`${base}/api/v1/admin/mcp/keys`, { headers: editorHeaders });
  assert.equal(forbidden.status, 403);

  const status = await fetch(`${base}/api/v1/admin/mcp/status`, { headers: adminHeaders });
  assert.equal(status.status, 200);
  const statusBody = await status.json() as { data: { tools: string[]; tableAvailable: boolean } };
  assert.equal(statusBody.data.tools.length, MCP_TOOL_NAMES.length);
  assert.equal(statusBody.data.tableAvailable, true);

  const created = await fetch(`${base}/api/v1/admin/mcp/keys`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'CI reader', scopes: ['words:read', 'blogs:read'] }) });
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { key: string; data: { id: string; keyPrefix: string; scopes: string[]; keyHash?: string } };
  assert.ok(createdBody.key.startsWith('ds_mcp_'));
  assert.equal(createdBody.data.keyHash, undefined);
  assert.deepEqual(createdBody.data.scopes, ['words:read', 'blogs:read']);

  const invalidScope = await fetch(`${base}/api/v1/admin/mcp/keys`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'Bad', scopes: ['words:admin'] }) });
  assert.equal(invalidScope.status, 400);

  const list = await fetch(`${base}/api/v1/admin/mcp/keys`, { headers: adminHeaders });
  const listBody = await list.json() as { data: { keyHash?: string; key?: string }[] };
  assert.ok(listBody.data.every((key) => key.keyHash === undefined && key.key === undefined));

  const revokeNoConfirm = await fetch(`${base}/api/v1/admin/mcp/keys/${createdBody.data.id}/revoke`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
  assert.equal(revokeNoConfirm.status, 400);
  const revoke = await fetch(`${base}/api/v1/admin/mcp/keys/${createdBody.data.id}/revoke`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ confirm: true }) });
  assert.equal(revoke.status, 200);

  const usedKey = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createdBody.key}` }, body: '{}' });
  assert.equal(usedKey.status, 401);

  const audit = await fetch(`${base}/api/v1/admin/mcp/audit`, { headers: adminHeaders });
  assert.equal(audit.status, 200);
  const auditBody = await audit.json() as { data: { action: string }[] };
  assert.ok(auditBody.data.some((entry) => entry.action === 'mcp_key.create'));
});