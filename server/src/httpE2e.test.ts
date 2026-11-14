import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Server } from 'socket.io';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { createApp } from './app';
import type { AppwriteDatabase } from './database/appwrite';
import type { ServerConfig } from './config/env';
import { InMemoryMatchHistoryRepository, type MatchPlayerRecord } from './repositories/matchHistoryRepository';
import { createSocketHandlers } from './socket/handlers';

/** Isolated Appwrite TablesDB test double; every row is namespaced to this test process. */
class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 });
    const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row);
  }
  async getRow(_databaseId: string, tableId: string, id: string) {
    const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row);
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
      if (query.method === 'orderDesc' && query.attribute) rows.sort((a, b) => String(b[query.attribute!]).localeCompare(String(a[query.attribute!])));
      if (query.method === 'orderAsc' && query.attribute) rows.sort((a, b) => String(a[query.attribute!]).localeCompare(String(b[query.attribute!])));
    }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `http_e2e_${this.nextId}`; }
}

const makeRecord = (playerId: string, username: string): MatchPlayerRecord => ({
  id: `http_e2e_${playerId}`, matchId: 'http-e2e-match', roomId: 'http-e2e-room', roomCode: 'AB2345', roomName: 'E2E Room',
  status: 'completed', startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:02:00.000Z', durationSeconds: 120,
  playerId, username, avatarId: 'av-01', accountType: 'registered', score: 100, placement: playerId === 'e2e-user-a' ? 1 : 2,
  isWinner: playerId === 'e2e-user-a', playerCount: 2, roundsConfigured: 1, roundsCompleted: 1,
  configuration: JSON.stringify({ rounds: 1, roundSeconds: 80 }),
});

test('HTTP + Socket.IO E2E auth, profile, room lifecycle, match ownership, validation, and rate limiting', async (t) => {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_http_e2e', newId: () => tables.newId(), accountForJwt: () => { throw new Error('The test verifier is used'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'e2e-token-a': { userId: 'e2e-user-a', name: 'AliceE2E', email: null, emailVerified: false, isGuest: true },
    'e2e-token-b': { userId: 'e2e-user-b', name: 'BobE2E', email: null, emailVerified: false, isGuest: true },
    'e2e-token-admin': { userId: 'e2e-admin', name: 'AdminE2E', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  await tables.createRow('isolated_http_e2e', 'admin_roles', 'http_e2e_admin_role', { userId: 'e2e-admin', role: 'admin', isActive: true });
  const matchHistory = new InMemoryMatchHistoryRepository();
  await matchHistory.append(makeRecord('e2e-user-a', 'AliceE2E'));
  await matchHistory.append(makeRecord('e2e-user-b', 'BobE2E'));
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-http-e2e', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_http_e2e', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app, game, repositories, stateStore } = createApp({ config, database, verifyJwt, matchHistoryRepository: matchHistory });
  const httpServer = createServer(app);
  const socketServer = new Server(httpServer, { cors: { origin: [] } });
  await createSocketHandlers(socketServer, { verify: verifyJwt, game, profiles: repositories.profiles, wordsDatabase: database, gameSettings: repositories.gameSettings, stateStore });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  });

  const noAuth = await fetch(`${base}/api/auth/me`);
  assert.equal(noAuth.status, 401);
  assert.equal((await noAuth.json()).code, 'AUTH_REQUIRED');
  const invalidAuth = await fetch(`${base}/api/auth/me`, { headers: { Authorization: 'Bearer invalid' } });
  assert.equal(invalidAuth.status, 401);
  const authA = { Authorization: 'Bearer e2e-token-a', 'Content-Type': 'application/json' };
  const authB = { Authorization: 'Bearer e2e-token-b', 'Content-Type': 'application/json' };
  const adminAuth = { Authorization: 'Bearer e2e-token-admin', 'Content-Type': 'application/json' };
  const me = await fetch(`${base}/api/auth/me`, { headers: authA });
  assert.equal(me.status, 200); assert.equal((await me.json()).data.userId, 'e2e-user-a');

  const profileAResponse = await fetch(`${base}/api/profiles/me`, { headers: authA });
  assert.equal(profileAResponse.status, 200);
  const profileA = (await profileAResponse.json()).data;
  assert.equal(profileA.userId, 'e2e-user-a');
  const anonymousWrite = await fetch(`${base}/api/profiles/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bio: 'unauthorized' }) });
  assert.equal(anonymousWrite.status, 401);
  const patched = await fetch(`${base}/api/profiles/me`, { method: 'PATCH', headers: authA, body: JSON.stringify({ displayName: 'Alice E2E Updated' }) });
  assert.equal(patched.status, 200); assert.equal((await patched.json()).data.displayName, 'Alice E2E Updated');
  const publicProfile = await fetch(`${base}/api/profiles/username/AliceE2E`);
  const publicProfileData = await publicProfile.json(); assert.equal(publicProfile.status, 200); assert.equal(publicProfileData.data.displayName, 'Alice E2E Updated');
  assert.equal('userId' in publicProfileData.data, false); assert.equal('normalizedUsername' in publicProfileData.data, false);
  const malformed = await fetch(`${base}/api/profiles/me`, { method: 'PATCH', headers: authA, body: JSON.stringify({ userId: 'e2e-user-b' }) });
  assert.equal(malformed.status, 400); assert.equal((await malformed.json()).code, 'VALIDATION_ERROR');
  const profileBResponse = await fetch(`${base}/api/profiles/me`, { headers: authB });
  assert.equal((await profileBResponse.json()).data.userId, 'e2e-user-b');
  await tables.createRow('isolated_http_e2e', 'player_progression', 'http_e2e_progress_a', { userId: 'e2e-user-a', currentLevel: 5, totalXP: 400, highestLevel: 5, equippedTitleId: '' });
  await tables.createRow('isolated_http_e2e', 'player_progression', 'http_e2e_progress_b', { userId: 'e2e-user-b', currentLevel: 2, totalXP: 100, highestLevel: 2, equippedTitleId: '' });
  await tables.createRow('isolated_http_e2e', 'user_statistics', 'http_e2e_stats_a', { userId: 'e2e-user-a', gamesWon: 2 });
  await tables.createRow('isolated_http_e2e', 'user_statistics', 'http_e2e_stats_b', { userId: 'e2e-user-b', gamesWon: 1 });
  const publicLeaderboard = await fetch(`${base}/api/progression/leaderboard`);
  const publicLeaderboardRows = (await publicLeaderboard.json()).data;
  assert.equal(publicLeaderboard.status, 200); assert.equal('userId' in publicLeaderboardRows[0], false);
  assert.ok(publicLeaderboardRows.every((row: { isMe: boolean }) => row.isMe === false));
  const invalidLeaderboardAuth = await fetch(`${base}/api/progression/leaderboard`, { headers: { Authorization: 'Bearer invalid' } });
  assert.equal(invalidLeaderboardAuth.status, 401);
  const personalizedLeaderboard = await fetch(`${base}/api/progression/leaderboard`, { headers: authA });
  const personalizedRows = (await personalizedLeaderboard.json()).data;
  assert.equal(personalizedLeaderboard.status, 200);
  assert.equal(personalizedRows.find((row: { username: string }) => row.username === 'AliceE2E').isMe, true);
  assert.equal(personalizedRows.find((row: { username: string }) => row.username === 'BobE2E').isMe, false);

  const ownMatches = await fetch(`${base}/api/matches/me?limit=1&offset=0`, { headers: authA });
  const ownData = await ownMatches.json(); assert.equal(ownMatches.status, 200); assert.equal(ownData.data.length, 1); assert.equal(ownData.data[0].username, 'AliceE2E');
  assert.equal('playerId' in ownData.data[0], false);
  const otherUserMatches = await fetch(`${base}/api/matches/me`, { headers: authB });
  const otherUserData = await otherUserMatches.json(); assert.equal(otherUserMatches.status, 200); assert.deepEqual(otherUserData.data.map((row: { username: string }) => row.username), ['BobE2E']);
  const invalidPagination = await fetch(`${base}/api/matches/me?limit=999`, { headers: authA });
  assert.equal(invalidPagination.status, 400);
  const adminDenied = await fetch(`${base}/api/matches/admin`, { headers: authA });
  assert.equal(adminDenied.status, 403);
  const nonAdminWrite = await fetch(`${base}/api/admin/catalog/avatars/blocked-e2e`, { method: 'PUT', headers: authA, body: '{}' });
  assert.equal(nonAdminWrite.status, 403);
  const adminMatches = await fetch(`${base}/api/matches/admin`, { headers: adminAuth });
  assert.equal(adminMatches.status, 200); assert.equal((await adminMatches.json()).data.length, 1);
  const publicHistory = await fetch(`${base}/api/matches/player/AliceE2E`);
  assert.equal(publicHistory.status, 200); assert.equal('playerId' in (await publicHistory.json()).data[0], false);

  const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
    const socket = createSocketClient(base, { auth: { jwt: token }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
    socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
  const socketA = await connect('e2e-token-a');
  const socketB = await connect('e2e-token-b');
  const socketAdmin = await connect('e2e-token-admin');
  const created = await socketA.timeout(3000).emitWithAck('room:create', { name: 'E2E Room', visibility: 'public', maxPlayers: 2, rounds: 1, roundSeconds: 30, difficulty: 'easy', wordMode: 'all', customWords: [] });
  assert.equal(created.success, true);
  const code = (created.data as { code: string }).code;
  const joined = await socketB.timeout(3000).emitWithAck('room:join', { code });
  assert.equal(joined.success, true); assert.equal((joined.data as { reconnected: boolean }).reconnected, false);
  const invalidRoomJoin = await socketB.timeout(3000).emitWithAck('room:join', { code: 'bad-code', unexpected: true });
  assert.equal(invalidRoomJoin.success, false); assert.equal(invalidRoomJoin.code, 'VALIDATION_ERROR');
  const nonMemberAction = await socketAdmin.timeout(3000).emitWithAck('room:ready', { code, ready: true });
  assert.equal(nonMemberAction.success, false); assert.equal(nonMemberAction.code, 'NOT_IN_ROOM');
  const rooms = await fetch(`${base}/api/rooms`); const publicRooms = (await rooms.json()).data; assert.equal(rooms.status, 200);
  const listedRoom = publicRooms.find((room: { code: string }) => room.code === code);
  assert.ok(listedRoom); assert.equal('hostId' in listedRoom, false); assert.equal('userId' in listedRoom.players[0], false);

  // The API-wide limiter is intentionally exercised last because its window is process-local.
  let status = 0;
  for (let i = 0; i < 241; i += 1) status = (await fetch(`${base}/api/auth/me`)).status;
  assert.equal(status, 429);
});
