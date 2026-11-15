import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from 'socket.io';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { createApp } from '../app';
import type { AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { InMemoryMatchHistoryRepository } from '../repositories/matchHistoryRepository';
import { createSocketHandlers } from './handlers';

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
    }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `canvas_reset_${this.nextId}`; }
}

const TRACKED = ['room:update', 'game:round-start', 'game:round-end', 'game:stroke', 'game:drawing-state', 'game:word-choices', 'game:your-word', 'game:match-end'] as const;
type EventLog = Record<string, any[]>;
function track(socket: Socket): EventLog {
  const log: EventLog = {};
  for (const event of TRACKED) { log[event] = []; socket.on(event, (payload: unknown) => log[event].push(payload)); }
  return log;
}
async function waitFor(log: EventLog, event: string, predicate: (payload: any) => boolean, timeoutMs = 9000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = (log[event] || []).find(predicate);
    if (found) return found;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${event}`);
}
const stroke = (id: string) => ({ id, tool: 'pen' as const, color: '#1b1b1f', size: 6, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }] });

test('multiplayer canvas resets across rounds for every client, rejects stale strokes, and re-syncs on reconnect', async (t) => {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_canvas', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'canvas-token-a': { userId: 'canvas-user-a', name: 'DrawerA', email: null, emailVerified: false, isGuest: true },
    'canvas-token-b': { userId: 'canvas-user-b', name: 'DrawerB', email: null, emailVerified: false, isGuest: true },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-canvas', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_canvas', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app, game, repositories, stateStore } = createApp({ config, database, verifyJwt, matchHistoryRepository: new InMemoryMatchHistoryRepository() });
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
  const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
    const socket = createSocketClient(base, { auth: { jwt: token }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
    socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });

  const socketA = await connect('canvas-token-a');
  const socketB = await connect('canvas-token-b');
  const logA = track(socketA);
  const logB = track(socketB);

  // Round 1: A draws, B guesses. Custom words keep word selection deterministic without Appwrite.
  const created = await socketA.timeout(3000).emitWithAck('room:create', { name: 'Canvas Reset', visibility: 'private', maxPlayers: 2, rounds: 2, roundSeconds: 30, difficulty: 'easy', wordMode: 'custom', customWords: ['apple', 'banana'] });
  assert.equal(created.success, true);
  const code = (created.data as { code: string }).code;
  const joined = await socketB.timeout(3000).emitWithAck('room:join', { code });
  assert.equal(joined.success, true);
  await socketB.timeout(3000).emitWithAck('room:ready', { code, ready: true });
  await socketA.timeout(3000).emitWithAck('room:start', { code });

  const choicesA = await waitFor(logA, 'game:word-choices', (items) => Array.isArray(items) && items.length >= 2);
  const firstWord = choicesA[0].word;
  await socketA.timeout(3000).emitWithAck('game:choose-word', { code, id: choicesA[0].id });
  const startA1 = await waitFor(logA, 'game:round-start', (item) => item.turnId === 1);
  const startB1 = await waitFor(logB, 'game:round-start', (item) => item.turnId === 1);
  assert.equal(startA1.drawerUserId, 'canvas-user-a');
  assert.equal(startB1.turnId, 1);

  // 1. Both clients see the same drawing.
  const stroke1 = stroke('11111111-1111-4111-8111-111111111111');
  await socketA.timeout(3000).emitWithAck('game:stroke', { code, stroke: stroke1, turnId: 1 });
  const seenA = await waitFor(logA, 'game:stroke', (item) => item.turnId === 1);
  const seenB = await waitFor(logB, 'game:stroke', (item) => item.turnId === 1);
  assert.equal(seenA.stroke.id, stroke1.id);
  assert.equal(seenB.stroke.id, stroke1.id);
  assert.equal((await game.get(code)).strokes.length, 1);

  // 2 + 3. Round ends (B guesses correctly) and both clients clear the canvas.
  const guess = await socketB.timeout(3000).emitWithAck('game:guess', { code, text: firstWord });
  assert.equal(guess.success, true);
  assert.equal((guess.data as { correct: boolean }).correct, true);
  await waitFor(logA, 'game:round-end', (item) => item.turnId === 1);
  await waitFor(logB, 'game:round-end', (item) => item.turnId === 1);
  const endUpdateA = await waitFor(logA, 'room:update', (item) => item.status === 'round_end' && item.turnId === 1);
  const endUpdateB = await waitFor(logB, 'room:update', (item) => item.status === 'round_end' && item.turnId === 1);
  assert.equal(endUpdateA.strokes.length, 0);
  assert.equal(endUpdateB.strokes.length, 0);
  assert.equal((await game.get(code)).strokes.length, 0);

  // 4 + 5. Next round starts and both clients see an empty canvas (server buffer stays clear through choosing).
  const choosingB = await waitFor(logB, 'game:word-choices', (items) => Array.isArray(items) && items.length >= 2);
  const choosingUpdateA = await waitFor(logA, 'room:update', (item) => item.status === 'choosing');
  assert.equal(choosingUpdateA.strokes.length, 0);
  await socketB.timeout(3000).emitWithAck('game:choose-word', { code, id: choosingB[0].id });
  const startA2 = await waitFor(logA, 'game:round-start', (item) => item.turnId === 2);
  const startB2 = await waitFor(logB, 'game:round-start', (item) => item.turnId === 2);
  assert.equal(startA2.drawerUserId, 'canvas-user-b');
  assert.equal(startB2.turnId, 2);
  const drawUpdateA = await waitFor(logA, 'room:update', (item) => item.status === 'drawing' && item.turnId === 2);
  const drawUpdateB = await waitFor(logB, 'room:update', (item) => item.status === 'drawing' && item.turnId === 2);
  assert.equal(drawUpdateA.strokes.length, 0);
  assert.equal(drawUpdateB.strokes.length, 0);

  // 6. New drawing works in the new round.
  const stroke2 = stroke('22222222-2222-4222-8222-222222222222');
  await socketB.timeout(3000).emitWithAck('game:stroke', { code, stroke: stroke2, turnId: 2 });
  const newA = await waitFor(logA, 'game:stroke', (item) => item.turnId === 2);
  const newB = await waitFor(logB, 'game:stroke', (item) => item.turnId === 2);
  assert.equal(newA.stroke.id, stroke2.id);
  assert.equal(newB.stroke.id, stroke2.id);

  // 7. A delayed old-round drawing event is rejected (current drawer sends a stale turnId).
  const stale = await socketB.timeout(3000).emitWithAck('game:stroke', { code, stroke: stroke('33333333-3333-4333-8333-333333333333'), turnId: 1 });
  assert.equal(stale.success, false);
  assert.equal(stale.code, 'STALE_TURN');
  assert.equal((await game.get(code)).strokes.length, 1);

  // 8. Duplicate clear events are safe and idempotent.
  await socketB.timeout(3000).emitWithAck('game:clear', { code });
  await socketB.timeout(3000).emitWithAck('game:clear', { code });
  const clearsA = await waitFor(logA, 'game:drawing-state', (item) => item.turnId === 2 && item.strokes.length === 0);
  assert.equal(clearsA.strokes.length, 0);
  assert.equal((await game.get(code)).strokes.length, 0);

  // 9. A reconnecting client receives the correct current-round state, not previous-round strokes.
  await socketB.timeout(3000).emitWithAck('game:stroke', { code, stroke: stroke2, turnId: 2 });
  socketA.disconnect();
  const socketA2 = await connect('canvas-token-a');
  const logA2 = track(socketA2);
  const rejoin = await socketA2.timeout(3000).emitWithAck('room:join', { code });
  assert.equal(rejoin.success, true);
  assert.equal((rejoin.data as { reconnected: boolean }).reconnected, true);
  const reSyncStart = await waitFor(logA2, 'game:round-start', (item) => item.turnId === 2);
  assert.equal(reSyncStart.drawerUserId, 'canvas-user-b');
  const reSyncState = await waitFor(logA2, 'game:drawing-state', (item) => item.turnId === 2);
  assert.equal(reSyncState.strokes.length, 1);
  assert.equal(reSyncState.strokes[0].id, stroke2.id);
});