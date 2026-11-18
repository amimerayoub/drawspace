import assert from 'node:assert/strict';
import test from 'node:test';
import { StatisticsRepository } from './statisticsRepository';
import type { AppwriteDatabase } from '../database/appwrite';

function createRowsDatabase() {
  const rows: Array<Record<string, unknown> & { $id: string }> = [];
  const state = { listCalls: 0, lastQueries: [] as string[] };
  const database = {
    databaseId: 'test-db', newId: () => 'stat-row-1',
    accountForJwt: () => { throw new Error('not used'); },
    tables: {
      listRows: async (_db: string, _table: string, queries: unknown[]) => {
        state.listCalls += 1;
        state.lastQueries = queries.map(String);
        const query = JSON.parse(String(queries[0])) as { attribute: string; values: string[] };
        const found = rows.filter((row) => row[query.attribute] === query.values[0]);
        return { rows: found, total: found.length };
      },
      createRow: async (_db: string, _table: string, id: string, data: Record<string, unknown>) => {
        const row = { ...data, $id: id };
        rows.push(row);
        return row;
      },
      updateRow: async (_db: string, _table: string, id: string, data: Record<string, unknown>) => {
        const row = rows.find((item) => item.$id === id);
        if (!row) throw new Error('missing row');
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as AppwriteDatabase;
  return { database, rows, state };
}

test('statistics reads are select-only, cached, and reloaded after a match write', async () => {
  const { database, state } = createRowsDatabase();
  const statistics = new StatisticsRepository(database);

  const first = await statistics.get('stat-user');
  assert.equal(first.totalGames, 0);
  const methods = state.lastQueries.map((encoded) => (JSON.parse(encoded) as { method: string }).method);
  assert.deepEqual(methods, ['equal', 'limit', 'select']);
  await statistics.get('stat-user');
  assert.equal(state.listCalls, 1, 'the zero record is cached too');

  await statistics.recordMatch('stat-user', { totalGames: 1, gamesWon: 1, totalGuesses: 4, correctGuesses: 3, totalPoints: 250 });
  assert.equal(state.listCalls, 2, 'recordMatch reads fresh once');
  const after = await statistics.get('stat-user');
  assert.equal(after.totalGames, 1);
  assert.equal(after.winRate, 100);
  assert.equal(state.listCalls, 3, 'the write invalidated the cached zero record');

  await statistics.recordMatch('stat-user', { totalGames: 1, gamesWon: 0, totalGuesses: 2, correctGuesses: 1, totalPoints: 80 });
  const second = await statistics.get('stat-user');
  assert.equal(second.totalGames, 2);
  assert.equal(second.gamesWon, 1);
  assert.equal(second.winRate, 50);
  assert.equal(second.totalPoints, 330);
});