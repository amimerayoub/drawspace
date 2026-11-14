import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchPersistenceService } from './matchPersistenceService';
import { InMemoryMatchHistoryRepository, type MatchHistoryRepository } from '../repositories/matchHistoryRepository';
import type { Room } from '../game/engine';

const room = {
  id: 'match-1', code: 'ABC234', name: 'Quick room', status: 'finished', startedAt: Date.now() - 120_000, turnsCompleted: 4,
  settings: { rounds: 2, roundSeconds: 60, difficulty: 'mixed', wordMode: 'all', maxPlayers: 8, visibility: 'public' },
  players: new Map([
    ['guest-account-id', { userId: 'guest-account-id', isGuest: true, username: 'Guest', avatarId: 'av-01', score: 100, correctGuesses: 2, totalGuesses: 4, joinedAt: 1 }],
    ['registered-account-id', { userId: 'registered-account-id', isGuest: false, username: 'Member', avatarId: 'av-02', score: 80, correctGuesses: 1, totalGuesses: 4, joinedAt: 2 }],
  ]),
} as unknown as Room;

test('completion persists guest and registered results with server-calculated placements', async () => {
  const history = new InMemoryMatchHistoryRepository(); const calls: string[] = [];
  const progression = { recordMatch: async (id: string, player: { userId: string }) => { calls.push(`${id}:${player.userId}`); return { duplicate: false, xp: 0 }; } };
  const service = new MatchPersistenceService(history, progression as never);
  await service.persist(room); await service.persist(room);
  const records = await history.getMatch('match-1');
  assert.equal(records.length, 2); assert.equal(records[0].accountType, 'guest'); assert.equal(records[0].placement, 1); assert.equal(records[0].isWinner, true);
  assert.equal(records[1].accountType, 'registered'); assert.equal(records[1].placement, 2); assert.equal(records[1].score, 80);
  assert.equal(calls.length, 4); // progression owns its own transaction-level idempotency
});

test('a database failure rejects completion persistence so the worker can retry safely', async () => {
  const history = new InMemoryMatchHistoryRepository(); let failures = 1;
  const adapter: MatchHistoryRepository = {
    append: async (record) => { if (failures-- > 0) throw new Error('database unavailable'); await history.append(record); },
    listForUser: (...args) => history.listForUser(...args), listForPlayer: (...args) => history.listForPlayer(...args),
    getMatch: (...args) => history.getMatch(...args), listAll: (...args) => history.listAll(...args),
  };
  const service = new MatchPersistenceService(adapter, { recordMatch: async () => ({ duplicate: false, xp: 0 }) } as never);
  await assert.rejects(service.persist(room), /database unavailable/);
  await service.persist(room);
  assert.equal((await history.getMatch('match-1')).length, 2);
});
