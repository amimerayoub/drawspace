import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import { type AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { GameEngine } from '../game/engine';
import { InMemoryRoomStateStore } from '../state/roomStateStore';
import { AppwriteMatchHistoryRepository, InMemoryMatchHistoryRepository, type MatchPlayerRecord } from '../repositories/matchHistoryRepository';

class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  constructor(private readonly missing: Set<string> = new Set()) {}
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 }); const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row); }
  async getRow(_d: string, tableId: string, id: string) { const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row); }
  async updateRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated); }
  async deleteRow(_d: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_d: string, tableId: string, queries: string[] = []) {
    if (this.missing.has(tableId)) throw Object.assign(new Error('Table not found'), { code: 404 });
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute) rows = rows.filter((row) => q.values?.includes(row[q.attribute!])); if (q.method === 'limit') limit = Number(q.values?.[0]); if (q.method === 'offset') offset = Number(q.values?.[0]); }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `overview_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-overview', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_overview', frontendOrigins: [], roomStateDriver: 'memory' };
const identities = {
  'ov-admin': { userId: 'ov-admin-user', name: 'OvAdmin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'ov-user': { userId: 'ov-normal-user', name: 'OvUser', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };

function makeUsersDouble() {
  const userRows = [{ status: true }, { status: true }, { status: false }];
  return {
    list: async ({ queries = [] }: { queries?: string[] }) => {
      let rows = [...userRows];
      for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute === 'status') rows = rows.filter((row) => q.values?.includes(row.status)); }
      return { users: [], total: rows.length };
    },
  };
}

async function seedContent(tables: IsolatedTables) {
  await tables.createRow('isolated_overview', 'admin_roles', 'ov_admin_role', { userId: 'ov-admin-user', role: 'admin', isActive: true });
  await tables.createRow('isolated_overview', 'blog_posts', 'post-1', { id: 'post-1', status: 'published' });
  await tables.createRow('isolated_overview', 'blog_posts', 'post-2', { id: 'post-2', status: 'published' });
  await tables.createRow('isolated_overview', 'blog_posts', 'post-3', { id: 'post-3', status: 'draft' });
  await tables.createRow('isolated_overview', 'custom_words', 'word-1', { id: 'word-1', word: 'apple', isActive: true });
  await tables.createRow('isolated_overview', 'custom_words', 'word-2', { id: 'word-2', word: 'banana', isActive: true });
  await tables.createRow('isolated_overview', 'custom_words', 'word-3', { id: 'word-3', word: 'cherry', isActive: false });
  await tables.createRow('isolated_overview', 'moderation_reports', 'report-1', { id: 'report-1', status: 'pending' });
  await tables.createRow('isolated_overview', 'moderation_reports', 'report-2', { id: 'report-2', status: 'resolved' });
  await tables.createRow('isolated_overview', 'moderation_reports', 'report-3', { id: 'report-3', status: 'dismissed' });
  await tables.createRow('isolated_overview', 'audit_logs', 'audit-1', { id: 'audit-1', actorUsername: 'OvAdmin', action: 'blog.create', resourceId: 'post-1', status: 'success', createdAt: '2026-11-15T10:00:00.000Z' });
  await tables.createRow('isolated_overview', 'audit_logs', 'audit-2', { id: 'audit-2', actorUsername: 'OvAdmin', action: 'word.create', resourceId: 'word-1', status: 'success', createdAt: '2026-11-15T11:00:00.000Z' });
}

async function driveRoomToDrawing(game: GameEngine) {
  const settings = { name: 'Overview room', visibility: 'public' as const, maxPlayers: 4, rounds: 2, roundSeconds: 30, difficulty: 'easy' as const, wordMode: 'all' as const, customWords: [] };
  const host = { userId: 'ov-host', username: 'Host', avatarId: 'av-01' };
  const guest = { userId: 'ov-guest', username: 'Guest', avatarId: 'av-02', isGuest: true };
  const room = await game.createRoom(host, settings, 'sock-host');
  await game.join(room.code, guest, 'sock-guest');
  await game.setReady(room.code, guest.userId, true);
  const started = await game.start(room.code, host.userId);
  await game.setWordChoices(room.code, started.drawer.userId, [{ id: 'w1', word: 'apple', category: 'test' }, { id: 'w2', word: 'banana', category: 'test' }]);
  await game.chooseWord(room.code, started.drawer.userId, 'w1');
}

const matchRecord = (playerId: string): MatchPlayerRecord => ({
  id: `m1:${playerId}`, matchId: 'm1', roomId: 'r1', roomCode: 'CODE', roomName: 'Room', status: 'completed',
  startedAt: '2026-11-15T10:00:00.000Z', completedAt: '2026-11-15T10:05:00.000Z', durationSeconds: 300,
  playerId, username: playerId, avatarId: 'av-01', accountType: 'registered', score: 100, placement: playerId === 'p1' ? 1 : 2,
  isWinner: playerId === 'p1', playerCount: 2, roundsConfigured: 2, roundsCompleted: 2, configuration: '{}',
});

async function startServer(t: { after: (fn: () => Promise<void>) => void }, options: { missing?: Set<string>; matchHistory?: 'memory' | 'appwrite' } = {}) {
  const tables = new IsolatedTables(options.missing ?? new Set());
  const users = makeUsersDouble();
  const database = { tables, databaseId: 'isolated_overview', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users } as unknown as AppwriteDatabase;
  await seedContent(tables);
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  await driveRoomToDrawing(game);
  const matchHistory = options.matchHistory === 'appwrite' ? new AppwriteMatchHistoryRepository(database) : new InMemoryMatchHistoryRepository();
  if (options.matchHistory !== 'appwrite') { await matchHistory.append(matchRecord('p1')); await matchHistory.append(matchRecord('p2')); }
  const { app } = createApp({ config, database, verifyJwt, game, matchHistoryRepository: matchHistory });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return `http://127.0.0.1:${address.port}`;
}

test('overview requires authentication and an active staff role', async (t) => {
  const base = await startServer(t);
  const anonymous = await fetch(`${base}/api/admin/overview`);
  assert.equal(anonymous.status, 401);
  const nonAdmin = await fetch(`${base}/api/admin/overview`, { headers: { Authorization: 'Bearer ov-user' } });
  assert.equal(nonAdmin.status, 403);
});

test('overview aggregates real counts from the database, game server, and match history', async (t) => {
  const base = await startServer(t);
  const response = await fetch(`${base}/api/admin/overview`, { headers: { Authorization: 'Bearer ov-admin' } });
  assert.equal(response.status, 200);
  const data = (await response.json()).data;

  assert.deepEqual(data.users, { total: 3, active: 2 });
  assert.deepEqual(data.blog, { total: 3, published: 2, drafts: 1 });
  assert.deepEqual(data.words, { total: 3, active: 2 });
  assert.deepEqual(data.reports, { total: 3, open: 1, resolved: 1, dismissed: 1 });
  assert.equal(data.matches.total, 2);
  assert.equal(data.rooms.total, 1);
  assert.equal(data.rooms.playing, 1);
  assert.equal(data.rooms.waiting, 0);
  assert.equal(data.rooms.players, 2);
  assert.equal(data.recentActivity.length, 2);
  assert.equal(data.recentActivity[0].action, 'word.create');
  assert.ok(data.recentActivity[0].at >= data.recentActivity[1].at);
  assert.equal(typeof data.generatedAt, 'string');
});

test('overview degrades to null for a missing match_history table without failing other metrics', async (t) => {
  const base = await startServer(t, { missing: new Set(['match_history']), matchHistory: 'appwrite' });
  const response = await fetch(`${base}/api/admin/overview`, { headers: { Authorization: 'Bearer ov-admin' } });
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.equal(data.matches.total, null);
  assert.equal(data.users.total, 3);
  assert.equal(data.blog.total, 3);
  assert.equal(data.words.total, 3);
  assert.equal(data.reports.open, 1);
  assert.equal(data.rooms.playing, 1);
});