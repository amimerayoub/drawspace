import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import { type AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { GameEngine } from '../game/engine';
import { InMemoryRoomStateStore } from '../state/roomStateStore';

class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  readonly missing = new Set<string>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 }); const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row); }
  async getRow(_d: string, tableId: string, id: string) { const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row); }
  async updateRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated); }
  async deleteRow(_d: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_d: string, tableId: string, queries: string[] = []) {
    if (this.missing.has(tableId)) throw Object.assign(new Error('missing'), { code: 404 });
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute) rows = rows.filter((row) => q.values?.includes(row[q.attribute!])); if (q.method === 'limit') limit = Number(q.values?.[0]); if (q.method === 'offset') offset = Number(q.values?.[0]); }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `seo_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-seo', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_seo', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'seo-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'seo-content': { userId: 'u-content', name: 'Content', email: 'content@example.invalid', emailVerified: true, isGuest: false },
  'seo-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'seo-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_seo', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: { list: async () => ({ users: [], total: 0 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } } } as unknown as AppwriteDatabase;
  for (const [userId, role] of [['u-admin', 'admin'], ['u-content', 'content_manager'], ['u-mod', 'moderator']] as const) {
    await tables.createRow('isolated_seo', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  const { app } = createApp({ config, database, verifyJwt, game });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string, body: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const auditRows = (tables: IsolatedTables) => tables.listRows('isolated_seo', 'audit_logs').then((result) => result.rows);
const seoRecord = { route: '/play', title: 'Play DrawSpace', description: 'Draw and guess with friends.', canonical: '', ogTitle: '', ogDescription: '', robots: 'index', structuredData: '' };

test('SEO management requires the content.seo permission', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/seo`)).status, 401);
  for (const token of ['seo-user', 'seo-mod', 'seo-content']) assert.equal((await fetch(`${base}/api/admin/seo`, { headers: auth(token) })).status, 403, token);
  assert.equal((await fetch(`${base}/api/admin/seo`, { headers: auth('seo-admin') })).status, 200);
});

test('SEO records upsert by route, audit, and delete', async (t) => {
  const { base, tables } = await startServer(t);
  const created = await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', seoRecord) });
  assert.equal(created.status, 200);
  let list = await (await fetch(`${base}/api/admin/seo`, { headers: auth('seo-admin') })).json() as { data: Array<{ route: string; title: string }> };
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].title, 'Play DrawSpace');

  const updated = await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', { ...seoRecord, title: 'Play now' }) });
  assert.equal(updated.status, 200);
  list = await (await fetch(`${base}/api/admin/seo`, { headers: auth('seo-admin') })).json() as { data: Array<{ route: string; title: string }> };
  assert.equal(list.data.length, 1, 'upsert does not duplicate');
  assert.equal(list.data[0].title, 'Play now');

  const audits = await auditRows(tables);
  assert.ok(audits.some((row) => row.action === 'seo.create' && row.resourceId === '/play'));
  assert.ok(audits.some((row) => row.action === 'seo.update' && row.resourceId === '/play'));

  assert.equal((await fetch(`${base}/api/admin/seo?route=%2Fplay`, { method: 'DELETE', headers: auth('seo-admin') })).status, 200);
  list = await (await fetch(`${base}/api/admin/seo`, { headers: auth('seo-admin') })).json() as { data: Array<{ route: string; title: string }> };
  assert.equal(list.data.length, 0);
  assert.equal((await fetch(`${base}/api/admin/seo?route=%2Fplay`, { method: 'DELETE', headers: auth('seo-admin') })).status, 404);
});

test('SEO validation rejects bad routes and structured data', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', { ...seoRecord, route: 'play' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', { ...seoRecord, title: '' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', { ...seoRecord, structuredData: '{not json' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', { ...seoRecord, structuredData: '{"@type":"WebSite"}' }) })).status, 200);
});

test('redirect rules enforce unique source paths and audit', async (t) => {
  const { base, tables } = await startServer(t);
  const created = await fetch(`${base}/api/admin/seo/redirects`, { method: 'PUT', ...json('seo-admin', { from: '/old', to: '/play', code: 301 }) });
  assert.equal(created.status, 200);
  const rule = (await created.json() as { data: { id: string; hits: number } }).data;
  assert.ok(rule.id);
  assert.equal(rule.hits, 0);

  const duplicate = await fetch(`${base}/api/admin/seo/redirects`, { method: 'PUT', ...json('seo-admin', { from: '/old', to: '/other', code: 302 }) });
  assert.equal(duplicate.status, 409);

  const list = await (await fetch(`${base}/api/admin/seo/redirects`, { headers: auth('seo-admin') })).json() as { data: Array<{ id: string; from: string }> };
  assert.equal(list.data.length, 1);
  assert.equal((await fetch(`${base}/api/admin/seo/redirects/${rule.id}`, { method: 'DELETE', headers: auth('seo-admin') })).status, 200);
  const audits = await auditRows(tables);
  assert.ok(audits.some((row) => row.action === 'redirect.create'));
  assert.ok(audits.some((row) => row.action === 'redirect.delete'));
});

test('public crawler files and redirects reflect stored records', async (t) => {
  const { base } = await startServer(t);
  await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', seoRecord) });
  await fetch(`${base}/api/admin/seo`, { method: 'PUT', ...json('seo-admin', { ...seoRecord, route: '/admin', robots: 'noindex' }) });
  await fetch(`${base}/api/admin/seo/redirects`, { method: 'PUT', ...json('seo-admin', { from: '/old', to: '/play', code: 301 }) });

  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: .*\/sitemap\.xml/);

  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemap, /<urlset/);
  assert.match(sitemap, /<loc>.*\/play<\/loc>/);
  assert.doesNotMatch(sitemap, /\/admin/);

  const redirects = await (await fetch(`${base}/api/redirects`)).json() as { data: Array<{ from: string; to: string }> };
  assert.equal(redirects.data.length, 1);
  assert.equal(redirects.data[0].from, '/old');
});

test('SEO degrades gracefully when its tables are missing', async (t) => {
  const { base, tables } = await startServer(t);
  tables.missing.add('seo_records');
  tables.missing.add('redirect_rules');
  const seo = await (await fetch(`${base}/api/admin/seo`, { headers: auth('seo-admin') })).json() as { data: unknown[] };
  assert.deepEqual(seo.data, []);
  const redirects = await (await fetch(`${base}/api/admin/seo/redirects`, { headers: auth('seo-admin') })).json() as { data: unknown[] };
  assert.deepEqual(redirects.data, []);
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /Allow: \//);
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemap, /<urlset/);
});