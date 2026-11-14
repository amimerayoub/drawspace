import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryMatchHistoryRepository, type MatchPlayerRecord } from './matchHistoryRepository';

const row = (matchId: string, playerId: string, completedAt: string): MatchPlayerRecord => ({
  id: `${matchId}:${playerId}`, matchId, roomId: matchId, roomCode: 'ABC234', roomName: 'Fun', status: 'completed',
  startedAt: '2026-01-01T00:00:00.000Z', completedAt, durationSeconds: 120, playerId, username: playerId,
  avatarId: 'av-01', accountType: playerId.startsWith('guest') ? 'guest' : 'registered', score: 100, placement: 1,
  isWinner: true, playerCount: 1, roundsConfigured: 3, roundsCompleted: 3, configuration: '{}',
});

test('history writes are idempotent, owner-scoped, and paginated', async () => {
  const repository = new InMemoryMatchHistoryRepository();
  await repository.append(row('m1', 'user-1', '2026-01-01T00:00:00.000Z'));
  await repository.append({ ...row('m1', 'user-1', '2026-01-01T00:00:00.000Z'), score: 999 });
  await repository.append(row('m2', 'user-1', '2026-01-02T00:00:00.000Z'));
  await repository.append(row('m3', 'user-2', '2026-01-03T00:00:00.000Z'));
  const page = await repository.listForUser('user-1', 1, 1);
  assert.equal(page.total, 2); assert.equal(page.rows[0].matchId, 'm1'); assert.equal(page.rows[0].score, 100);
  assert.equal((await repository.listForUser('user-2', 20, 0)).rows.length, 1);
  assert.equal((await repository.getMatch('m1')).length, 1);
});
