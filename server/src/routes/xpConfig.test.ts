import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import { type AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { ProgressionRepository, levelForXp } from '../repositories/progressionRepository';
import { XP_DEFAULTS } from '../repositories/xpConfigRepository';

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
  newId() { this.nextId += 1; return `xp_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-xp', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_xp', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'xp-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'xp-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'xp-content': { userId: 'u-content', name: 'Content', email: 'content@example.invalid', emailVerified: true, isGuest: false },
  'xp-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

function makeDatabase(tables: IsolatedTables) {
  return { tables, databaseId: 'isolated_xp', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: { list: async () => ({ users: [], total: 0 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } } } as unknown as AppwriteDatabase;
}

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const database = makeDatabase(tables);
  for (const [userId, role] of [['u-admin', 'admin'], ['u-mod', 'moderator'], ['u-content', 'content_manager']] as const) {
    await tables.createRow('isolated_xp', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  const { app } = createApp({ config, database, verifyJwt });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables, database };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string, body: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const rows = (tables: IsolatedTables, table: string) => tables.listRows('isolated_xp', table).then((result) => result.rows);

test('XP config endpoints require config.xp and return defaults before migration', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/xp-config`)).status, 401);
  for (const token of ['xp-user', 'xp-mod', 'xp-content']) {
    assert.equal((await fetch(`${base}/api/admin/xp-config`, { headers: auth(token) })).status, 403, token);
  }
  const response = await fetch(`${base}/api/admin/xp-config`, { headers: auth('xp-admin') });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, XP_DEFAULTS);
});

test('updating XP config validates, persists, and audits', async (t) => {
  const { base, tables } = await startServer(t);
  const invalid = await fetch(`${base}/api/admin/xp-config`, { method: 'PUT', ...json('xp-admin', { ...XP_DEFAULTS, levelGrowth: 5 }) });
  assert.equal(invalid.status, 400);

  const next = { correctGuessXp: 20, winBonusXp: 50, challengeMultiplier: 2, levelBase: 120, levelGrowth: 1.25 };
  const updated = await fetch(`${base}/api/admin/xp-config`, { method: 'PUT', ...json('xp-admin', next) });
  assert.equal(updated.status, 200);
  assert.deepEqual((await updated.json()).data, next);

  const reread = await fetch(`${base}/api/admin/xp-config`, { headers: auth('xp-admin') });
  assert.deepEqual((await reread.json()).data, next);

  const audit = await rows(tables, 'audit_logs');
  const row = audit.find((entry) => entry.action === 'config.xp');
  assert.ok(row, 'expected a config.xp audit row');
  assert.equal(row.actorUserId, 'u-admin');
  assert.equal((await rows(tables, 'xp_config')).length, 1);
});

test('levelForXp honors a custom curve', () => {
  assert.equal(levelForXp(150).level, 2);
  assert.equal(levelForXp(150, 50, 1.5).level, 3);
  assert.equal(levelForXp(0, 50, 1.5).level, 1);
});

test('match XP and level use the stored configuration', async (t) => {
  const tables = new IsolatedTables();
  const database = makeDatabase(tables);
  await tables.createRow('isolated_xp', 'xp_config', 'singleton', { correctGuessXp: 100, winBonusXp: 0, challengeMultiplier: 1, levelBase: 50, levelGrowth: 1.5 });
  const progression = new ProgressionRepository(database);
  const result = await progression.recordMatch('match-1', { userId: 'p1', score: 500, wins: 0, correctGuesses: 3, totalGuesses: 5, place: 2 });
  assert.equal(result.duplicate, false);
  assert.equal(result.xp, 300);
  const transactions = await rows(tables, 'xp_transactions');
  assert.equal(transactions[0].amount, 300);
  const progressionRows = await rows(tables, 'player_progression');
  assert.equal(progressionRows[0].totalXP, 300);
  assert.equal(progressionRows[0].currentLevel, 4);
});

test('match XP falls back to defaults when no config row exists', async (t) => {
  const tables = new IsolatedTables();
  const progression = new ProgressionRepository(makeDatabase(tables));
  const result = await progression.recordMatch('match-2', { userId: 'p1', score: 200, wins: 1, correctGuesses: 2, totalGuesses: 4, place: 1 });
  assert.equal(result.xp, 60);
});

test('challenge claims apply the configured multiplier', async (t) => {
  const tables = new IsolatedTables();
  const database = makeDatabase(tables);
  await tables.createRow('isolated_xp', 'xp_config', 'singleton', { ...XP_DEFAULTS, challengeMultiplier: 2 });
  await tables.createRow('isolated_xp', 'challenges', 'c1', { challengeId: 'c1', name: 'Guess ten', rewardXP: 100, period: 'all-time', targetValue: 1, isActive: true, type: 'guess', startsAt: '', endsAt: '' });
  await tables.createRow('isolated_xp', 'user_challenges', 'uc1', { userId: 'p1', challengeId: 'c1', periodKey: 'all-time', progress: 1, claimed: false });
  const progression = new ProgressionRepository(database);
  const result = await progression.claimChallenge('p1', 'c1');
  assert.equal(result.xp, 200);
  const transactions = await rows(tables, 'xp_transactions');
  assert.equal(transactions[0].amount, 200);
});