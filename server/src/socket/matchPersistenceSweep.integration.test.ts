import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from 'socket.io';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { createApp } from '../app';
import type { AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { createSocketHandlers } from './handlers';

/** Isolated TablesDB double that counts every call per table and method. */
class CountingTables {
  readonly calls = new Map<string, number>();
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  private count(method: string, tableId: string) { const key = `${method}:${tableId}`; this.calls.set(key, (this.calls.get(key) || 0) + 1); }
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  totalCalls() { return [...this.calls.values()].reduce((sum, value) => sum + value, 0); }
  async createRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    this.count('createRow', tableId);
    const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 });
    const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row);
  }
  async getRow(_databaseId: string, tableId: string, id: string) {
    this.count('getRow', tableId);
    const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row);
  }
  async updateRow(_databaseId: string, tableId: string, id: string, data: Record<string, unknown>) {
    this.count('updateRow', tableId);
    const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 });
    const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated);
  }
  async deleteRow(_databaseId: string, tableId: string, id: string) { this.count('deleteRow', tableId); this.table(tableId).delete(id); }
  async listRows(_databaseId: string, tableId: string, queries: string[] = []) {
    this.count('listRows', tableId);
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
  newId() { this.nextId += 1; return `persist_sweep_${this.nextId}`; }
}

async function waitFor(predicate: () => boolean, timeoutMs = 9000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (predicate()) return; await delay(25); }
  throw new Error('Timed out waiting for condition');
}

test('finished match persists once and the recovery sweep never re-persists it', async (t) => {
  const tables = new CountingTables();
  const database = { tables, databaseId: 'isolated_persist', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: {} } as unknown as AppwriteDatabase;
  const identities = {
    'persist-token-a': { userId: 'persist-user-a', name: 'PersistA', email: null, emailVerified: false, isGuest: true },
    'persist-token-b': { userId: 'persist-user-b', name: 'PersistB', email: null, emailVerified: false, isGuest: true },
  };
  const verifyJwt = async (jwt: string) => { const identity = identities[jwt as keyof typeof identities]; if (!identity) throw new Error('invalid test token'); return identity; };
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-persist', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_persist', frontendOrigins: [], roomStateDriver: 'memory' };
  const { app, game, repositories, stateStore } = createApp({ config, database, verifyJwt });
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

  const socketA = await connect('persist-token-a');
  const socketB = await connect('persist-token-b');
  let choicesA: Array<{ id: string; word: string }> = [];
  let choicesB: Array<{ id: string; word: string }> = [];
  let matchEnded = false;
  let turnsStarted = 0;
  socketA.on('game:word-choices', (items: Array<{ id: string; word: string }>) => { choicesA = items; });
  socketB.on('game:word-choices', (items: Array<{ id: string; word: string }>) => { choicesB = items; });
  socketA.on('game:match-end', () => { matchEnded = true; });
  socketB.on('game:round-start', () => { turnsStarted += 1; });

  const created = await socketA.timeout(3000).emitWithAck('room:create', { name: 'Persist Once', visibility: 'private', maxPlayers: 2, rounds: 1, roundSeconds: 30, difficulty: 'easy', wordMode: 'custom', customWords: ['apple', 'banana'] });
  assert.equal(created.success, true);
  const code = (created.data as { code: string }).code;
  await socketB.timeout(3000).emitWithAck('room:join', { code });
  await socketB.timeout(3000).emitWithAck('room:ready', { code, ready: true });
  await socketA.timeout(3000).emitWithAck('room:start', { code });
  // rounds multiply by player count: 1 round x 2 players = 2 turns, A then B draws.
  await waitFor(() => choicesA.length >= 2);
  await socketA.timeout(3000).emitWithAck('game:choose-word', { code, id: choicesA[0].id });
  await waitFor(() => turnsStarted >= 1);
  const guess1 = await socketB.timeout(3000).emitWithAck('game:guess', { code, text: choicesA[0].word });
  assert.equal((guess1.data as { correct: boolean }).correct, true);
  await waitFor(() => choicesB.length >= 2);
  await socketB.timeout(3000).emitWithAck('game:choose-word', { code, id: choicesB[0].id });
  await waitFor(() => turnsStarted >= 2);
  const guess2 = await socketA.timeout(3000).emitWithAck('game:guess', { code, text: choicesB[0].word });
  assert.equal((guess2.data as { correct: boolean }).correct, true);
  await waitFor(() => matchEnded);

  // Both players' history rows and XP transactions must land exactly once.
  await waitFor(() => (tables.calls.get('createRow:match_history') || 0) >= 2 && (tables.calls.get('createRow:xp_transactions') || 0) >= 2);
  await delay(300);
  const snapshot = tables.totalCalls();
  const historyCreates = tables.calls.get('createRow:match_history') || 0;
  // The sweep ticks every second; before the fix each tick re-ran persistence
  // (duplicate createRow + getRow + xp_transactions/progression reads per player).
  await delay(2600);
  assert.equal(tables.totalCalls(), snapshot, 'recovery sweep must not issue Appwrite calls for an already-persisted match');
  assert.equal(tables.calls.get('createRow:match_history'), historyCreates);
  assert.equal(tables.calls.get('getRow:match_history') || 0, 0, 'no duplicate-conflict reads after the first persist');
});