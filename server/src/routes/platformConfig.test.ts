import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import type { AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { InMemoryMatchHistoryRepository } from '../repositories/matchHistoryRepository';

class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 }); const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row); }
  async getRow(_d: string, tableId: string, id: string) { const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row); }
  async updateRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated); }
  async deleteRow(_d: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_d: string, tableId: string, queries: string[] = []) {
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute) rows = rows.filter((row) => q.values?.includes(row[q.attribute!])); if (q.method === 'limit') limit = Number(q.values?.[0]); if (q.method === 'offset') offset = Number(q.values?.[0]); }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `platform_config_${this.nextId}`; }
}

test('public platform config is public-safe, reflects admin updates, and invalidates cache', async (t) => {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_config', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'cfg-admin': { userId: 'cfg-admin-user', name: 'CfgAdmin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
    'cfg-user': { userId: 'cfg-normal-user', name: 'CfgUser', email: null, emailVerified: false, isGuest: true },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  await tables.createRow('isolated_config', 'admin_roles', 'cfg_admin_role', { userId: 'cfg-admin-user', role: 'admin', isActive: true });
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-config', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_config', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app } = createApp({ config, database, verifyJwt, matchHistoryRepository: new InMemoryMatchHistoryRepository() });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });

  // Public (unauthenticated) read returns safe defaults and never leaks internal fields.
  const initial = await fetch(`${base}/api/platform/config`);
  assert.equal(initial.status, 200);
  const initialData = (await initial.json()).data;
  assert.equal(initialData.siteName, 'DrawSpace');
  assert.equal(initialData.registrationOpen, true);
  assert.equal(initialData.maintenance, false);
  assert.equal('updatedBy' in initialData, false);
  assert.equal('maxRoomCapacity' in initialData, false);
  assert.equal('passwordHash' in initialData, false);

  // Non-admins cannot change platform settings.
  const denied = await fetch(`${base}/api/admin/content/settings`, { method: 'PUT', headers: { Authorization: 'Bearer cfg-user', 'Content-Type': 'application/json' }, body: JSON.stringify({ siteName: 'Hacked', tagline: '', contactEmail: 'a@b.co', defaultLocale: 'en', maintenance: false, registrationOpen: true, guestPlay: true }) });
  assert.equal(denied.status, 403);

  // Admin update is persisted and immediately visible through the public endpoint (cache invalidated).
  const updated = await fetch(`${base}/api/admin/content/settings`, { method: 'PUT', headers: { Authorization: 'Bearer cfg-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ siteName: 'My DrawSpace', tagline: 'Draw and guess', contactEmail: 'support@example.invalid', defaultLocale: 'en', maintenance: true, registrationOpen: false, guestPlay: true }) });
  assert.equal(updated.status, 200);
  const after = await fetch(`${base}/api/platform/config`);
  const afterData = (await after.json()).data;
  assert.equal(afterData.siteName, 'My DrawSpace');
  assert.equal(afterData.tagline, 'Draw and guess');
  assert.equal(afterData.maintenance, true);
  assert.equal(afterData.registrationOpen, false);
  assert.equal(afterData.contactEmail, 'support@example.invalid');
});

test('public GETs are shared-cacheable, personalized reads are not, and CORS preflight is cached', async (t) => {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_cache', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: {} } as unknown as AppwriteDatabase;
  const verifyJwt = async () => { throw new Error('invalid test token'); };
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-cache', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_cache', frontendOrigins: ['https://drawspace.cloud'], roomStateDriver: 'memory' };
  const { app } = createApp({ config, database, verifyJwt, matchHistoryRepository: new InMemoryMatchHistoryRepository() });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });

  const publicRead = await fetch(`${base}/api/platform/config`);
  assert.equal(publicRead.headers.get('cache-control'), 'public, max-age=30, stale-while-revalidate=60');
  const achievements = await fetch(`${base}/api/progression/achievements`);
  assert.equal(achievements.headers.get('cache-control'), 'public, max-age=30, stale-while-revalidate=60');
  const leaderboard = await fetch(`${base}/api/progression/leaderboard`);
  assert.equal(leaderboard.headers.get('cache-control'), 'private, max-age=30, stale-while-revalidate=60');
  const me = await fetch(`${base}/api/progression/me`);
  assert.equal(me.status, 401);
  assert.equal(me.headers.get('cache-control'), 'no-store');

  const preflight = await fetch(`${base}/api/progression/leaderboard`, { method: 'OPTIONS', headers: { Origin: 'https://drawspace.cloud', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://drawspace.cloud');
  assert.equal(preflight.headers.get('access-control-max-age'), '86400');
  const denied = await fetch(`${base}/api/progression/leaderboard`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});