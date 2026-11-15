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
  newId() { this.nextId += 1; return `room_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-rooms', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_rooms', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'room-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'room-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'room-content': { userId: 'u-content', name: 'Content', email: 'content@example.invalid', emailVerified: true, isGuest: false },
  'room-analyst': { userId: 'u-analyst', name: 'Analyst', email: 'analyst@example.invalid', emailVerified: true, isGuest: false },
  'room-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_rooms', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: { list: async () => ({ users: [], total: 0 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } } } as unknown as AppwriteDatabase;
  for (const [userId, role] of [['u-admin', 'admin'], ['u-mod', 'moderator'], ['u-content', 'content_manager'], ['u-analyst', 'analyst']] as const) {
    await tables.createRow('isolated_rooms', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  const { app, roomAdmin } = createApp({ config, database, verifyJwt, game });
  const calls = { closed: [] as string[], kicked: [] as { code: string; userId: string; socketId: string | null; roomNull: boolean }[] };
  roomAdmin.setBroadcaster({
    roomClosed(room) { calls.closed.push(room.code); },
    playerKicked(code, userId, socketId, room) { calls.kicked.push({ code, userId, socketId, roomNull: room === null }); },
  });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables, game, calls };
}

async function makeRoom(game: GameEngine, hostId = 'p-host', guestId = 'p-guest') {
  const settings = { name: 'Test room', visibility: 'public' as const, maxPlayers: 4, rounds: 2, roundSeconds: 30, difficulty: 'easy' as const, wordMode: 'all' as const, customWords: [] };
  const room = await game.createRoom({ userId: hostId, username: 'Host', avatarId: 'av-01' }, settings, 'sock-host');
  await game.join(room.code, { userId: guestId, username: 'Guest', avatarId: 'av-02', isGuest: true }, 'sock-guest');
  return room.code;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string, body: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const auditRows = (tables: IsolatedTables) => tables.listRows('isolated_rooms', 'audit_logs').then((result) => result.rows);

test('room list and detail require the rooms.view permission', async (t) => {
  const { base, game } = await startServer(t);
  const code = await makeRoom(game);
  assert.equal((await fetch(`${base}/api/admin/rooms`)).status, 401);
  for (const token of ['room-user', 'room-content', 'room-analyst']) {
    assert.equal((await fetch(`${base}/api/admin/rooms`, { headers: auth(token) })).status, 403, token);
    assert.equal((await fetch(`${base}/api/admin/rooms/${code}`, { headers: auth(token) })).status, 403, token);
  }
  const list = await fetch(`${base}/api/admin/rooms`, { headers: auth('room-mod') });
  assert.equal(list.status, 200);
  const rooms = (await list.json()).data;
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].code, code);
  assert.equal(rooms[0].playerCount, 2);
  assert.equal(rooms[0].connectedCount, 2);
  assert.equal(rooms[0].status, 'waiting');

  const detail = await fetch(`${base}/api/admin/rooms/${code}`, { headers: auth('room-admin') });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.players.length, 2);
});

test('closing a room requires moderation.handle, ends the room, audits, and broadcasts', async (t) => {
  const { base, game, tables, calls } = await startServer(t);
  const code = await makeRoom(game);

  const forbidden = await fetch(`${base}/api/admin/rooms/${code}/close`, { method: 'POST', ...json('room-content', { confirm: true, reason: 'Content manager cannot close' }) });
  assert.equal(forbidden.status, 403);

  const invalid = await fetch(`${base}/api/admin/rooms/${code}/close`, { method: 'POST', ...json('room-admin', { confirm: true, reason: 'ab' }) });
  assert.equal(invalid.status, 400);
  const unconfirmed = await fetch(`${base}/api/admin/rooms/${code}/close`, { method: 'POST', ...json('room-admin', { confirm: false, reason: 'Valid reason' }) });
  assert.equal(unconfirmed.status, 400);

  const closed = await fetch(`${base}/api/admin/rooms/${code}/close`, { method: 'POST', ...json('room-admin', { confirm: true, reason: 'Inappropriate room name' }) });
  assert.equal(closed.status, 200);
  assert.equal((await closed.json()).data.status, 'closed');
  assert.deepEqual(calls.closed, [code]);

  const audit = await auditRows(tables);
  const row = audit.find((entry) => entry.action === 'room.close' && entry.resourceId === code);
  assert.ok(row, 'expected a room.close audit row');
  assert.equal(row.actorUserId, 'u-admin');
  assert.match(String(row.reason), /Inappropriate room name/);

  assert.equal((await fetch(`${base}/api/admin/rooms/${code}`, { headers: auth('room-admin') })).status, 404);
  const list = await fetch(`${base}/api/admin/rooms`, { headers: auth('room-admin') });
  assert.equal((await list.json()).data.length, 0);
});

test('kicking a player reassigns the host, empties the room when last, audits, and broadcasts', async (t) => {
  const { base, game, tables, calls } = await startServer(t);
  const code = await makeRoom(game);

  const forbidden = await fetch(`${base}/api/admin/rooms/${code}/kick`, { method: 'POST', ...json('room-analyst', { userId: 'p-host', reason: 'Analyst cannot kick' }) });
  assert.equal(forbidden.status, 403);

  const missing = await fetch(`${base}/api/admin/rooms/${code}/kick`, { method: 'POST', ...json('room-admin', { userId: 'nobody', reason: 'Not a member' }) });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'NOT_IN_ROOM');

  const kickedHost = await fetch(`${base}/api/admin/rooms/${code}/kick`, { method: 'POST', ...json('room-mod', { userId: 'p-host', reason: 'Removing the host' }) });
  assert.equal(kickedHost.status, 200);
  const hostBody = (await kickedHost.json()).data;
  assert.equal(hostBody.removedUserId, 'p-host');
  assert.equal(hostBody.room.hostId, 'p-guest');
  assert.equal(hostBody.room.playerCount, 1);
  assert.equal(calls.kicked[0].userId, 'p-host');
  assert.equal(calls.kicked[0].socketId, 'sock-host');
  assert.equal(calls.kicked[0].roomNull, false);

  const kickedLast = await fetch(`${base}/api/admin/rooms/${code}/kick`, { method: 'POST', ...json('room-mod', { userId: 'p-guest', reason: 'Removing the last player' }) });
  assert.equal(kickedLast.status, 200);
  assert.equal((await kickedLast.json()).data.room, null);
  assert.equal(calls.kicked[1].roomNull, true);

  const audit = await auditRows(tables);
  assert.equal(audit.filter((entry) => entry.action === 'room.kick' && entry.resourceId === code).length, 2);
});

test('unknown room codes return 404 and malformed codes return 400', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/rooms/ZZZZZZ`, { headers: auth('room-admin') })).status, 404);
  assert.equal((await fetch(`${base}/api/admin/rooms/invalid`, { headers: auth('room-admin') })).status, 400);
});

test('engine adminClose frees players and adminKick rejects closed rooms', async (t) => {
  const { game } = await startServer(t);
  const code = await makeRoom(game);
  const closed = await game.adminClose(code);
  assert.equal(closed.status, 'closed');
  assert.equal(await game.roomForUser('p-host'), null);
  await assert.rejects(() => game.adminKick(code, 'p-host'), /Room not found/);
  const replacement = await game.createRoom({ userId: 'p-host', username: 'Host', avatarId: 'av-01' }, { name: 'New room', visibility: 'public', maxPlayers: 4, rounds: 2, roundSeconds: 30, difficulty: 'easy', wordMode: 'all', customWords: [] }, 'sock-new');
  assert.notEqual(replacement.code, code);
});