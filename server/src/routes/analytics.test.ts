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
  newId() { this.nextId += 1; return `an_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-analytics', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_analytics', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'an-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'an-analyst': { userId: 'u-analyst', name: 'Analyst', email: 'analyst@example.invalid', emailVerified: true, isGuest: false },
  'an-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'an-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const database = {
    tables, databaseId: 'isolated_analytics', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); },
    users: { list: async ({ queries }: { queries: string[] }) => ({ users: [], total: queries.some((q) => q.includes('"status"')) ? 30 : 42 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } },
  } as unknown as AppwriteDatabase;
  for (const [userId, role] of [['u-admin', 'admin'], ['u-analyst', 'analyst'], ['u-mod', 'moderator']] as const) {
    await tables.createRow('isolated_analytics', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  const { app } = createApp({ config, database, verifyJwt, game });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables };
}

const today = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function seed(tables: IsolatedTables) {
  const now = today();
  await tables.createRow('isolated_analytics', 'profiles', 'p1', { userId: 'u1', username: 'Alice', avatarId: 'av-01', accountType: 'registered', createdAt: now });
  await tables.createRow('isolated_analytics', 'profiles', 'p2', { userId: 'u2', username: 'Bob', avatarId: 'av-02', accountType: 'registered', createdAt: now });
  await tables.createRow('isolated_analytics', 'profiles', 'p3', { userId: 'u3', username: 'Cara', avatarId: 'av-03', accountType: 'guest', createdAt: now });
  await tables.createRow('isolated_analytics', 'profiles', 'p4', { userId: 'u4', username: 'Old', avatarId: 'av-04', accountType: 'guest', createdAt: daysAgo(40) });
  await tables.createRow('isolated_analytics', 'user_statistics', 's1', { userId: 'u1', correctGuesses: 10, gamesWon: 4 });
  await tables.createRow('isolated_analytics', 'user_statistics', 's2', { userId: 'u2', correctGuesses: 20, gamesWon: 1 });
  await tables.createRow('isolated_analytics', 'player_progression', 'pr1', { userId: 'u1', totalXP: 500, currentLevel: 5 });
  await tables.createRow('isolated_analytics', 'player_progression', 'pr2', { userId: 'u2', totalXP: 300, currentLevel: 3 });
  await tables.createRow('isolated_analytics', 'user_preferences', 'pref1', { userId: 'u1', language: 'en-US' });
  await tables.createRow('isolated_analytics', 'user_preferences', 'pref2', { userId: 'u2', language: 'en-US' });
  await tables.createRow('isolated_analytics', 'user_preferences', 'pref3', { userId: 'u3', language: 'ar' });
  await tables.createRow('isolated_analytics', 'xp_transactions', 'x1', { userId: 'u1', amount: 100, createdAt: now });
  await tables.createRow('isolated_analytics', 'xp_transactions', 'x2', { userId: 'u2', amount: 50, createdAt: now });
  await tables.createRow('isolated_analytics', 'match_history', 'm1', { matchId: 'm1', completedAt: now });
  await tables.createRow('isolated_analytics', 'match_history', 'm2', { matchId: 'm2', completedAt: now });
}

test('analytics requires the analytics.view permission', async (t) => {
  const { base, tables } = await startServer(t);
  await seed(tables);
  assert.equal((await fetch(`${base}/api/admin/analytics`)).status, 401);
  for (const token of ['an-user', 'an-mod']) assert.equal((await fetch(`${base}/api/admin/analytics`, { headers: auth(token) })).status, 403, token);
  for (const token of ['an-analyst', 'an-admin']) assert.equal((await fetch(`${base}/api/admin/analytics`, { headers: auth(token) })).status, 200, token);
});

test('analytics aggregates real production data', async (t) => {
  const { base, tables } = await startServer(t);
  await seed(tables);
  const body = await (await fetch(`${base}/api/admin/analytics`, { headers: auth('an-admin') })).json() as { data: import('../repositories/analyticsRepository').PlatformAnalytics };
  const data = body.data;
  assert.equal(data.range.days, 14);
  assert.equal(data.series.labels.length, 14);
  assert.equal(data.totals.users, 42);
  assert.equal(data.totals.activeUsers, 30);
  assert.equal(data.totals.matches, 2);
  assert.equal(data.totals.wordsGuessed, 30);
  assert.equal(data.totals.xpAwarded, 150);
  assert.equal(data.matchesAvailable, true);
  const last = data.series.labels.length - 1;
  assert.equal(data.series.signups[last], 3, 'old signup excluded from the window');
  assert.equal(data.series.signups.reduce((a, b) => a + b, 0), 3);
  assert.equal(data.series.matches[last], 2);
  assert.equal(data.series.xp[last], 150);
  assert.deepEqual(data.accountTypes, { registered: 2, guest: 2 });
  assert.deepEqual(data.locales, [{ locale: 'en-US', count: 2 }, { locale: 'ar', count: 1 }]);
  assert.equal(data.topPlayers[0].userId, 'u1');
  assert.equal(data.topPlayers[0].username, 'Alice');
  assert.equal(data.topPlayers[0].xp, 500);
  assert.equal(data.topPlayers[0].wins, 4);
  assert.equal(data.topPlayers.length, 2);
});

test('analytics degrades gracefully when match_history is missing', async (t) => {
  const { base, tables } = await startServer(t);
  await seed(tables);
  tables.missing.add('match_history');
  const body = await (await fetch(`${base}/api/admin/analytics`, { headers: auth('an-analyst') })).json() as { data: import('../repositories/analyticsRepository').PlatformAnalytics };
  const data = body.data;
  assert.equal(data.matchesAvailable, false);
  assert.equal(data.totals.matches, null);
  assert.equal(data.series.matches.reduce((a, b) => a + b, 0), 0);
  assert.equal(data.totals.wordsGuessed, 30, 'other aggregates still computed');
});

test('analytics validates and honors the range parameter', async (t) => {
  const { base, tables } = await startServer(t);
  await seed(tables);
  assert.equal((await fetch(`${base}/api/admin/analytics?days=3`, { headers: auth('an-admin') })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/analytics?days=200`, { headers: auth('an-admin') })).status, 400);
  const body = await (await fetch(`${base}/api/admin/analytics?days=30`, { headers: auth('an-admin') })).json() as { data: import('../repositories/analyticsRepository').PlatformAnalytics };
  assert.equal(body.data.range.days, 30);
  assert.equal(body.data.series.labels.length, 30);
  assert.equal(body.data.series.signups.reduce((a, b) => a + b, 0), 3);
});