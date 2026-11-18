import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogRepository } from './catalogRepository';
import { ProgressionRepository } from './progressionRepository';
import type { AppwriteDatabase } from '../database/appwrite';

class CountingTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  readonly listCalls = new Map<string, number>();
  readonly lastQueries = new Map<string, string[]>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 }); const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row); }
  async updateRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); const row = rows.get(id); if (!row) throw new Error('missing'); const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated); }
  async deleteRow(_d: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_d: string, tableId: string, queries: string[] = []) {
    this.listCalls.set(tableId, (this.listCalls.get(tableId) ?? 0) + 1);
    this.lastQueries.set(tableId, queries);
    let rows = [...this.table(tableId).values()]; let limit = 25;
    for (const encoded of queries) {
      const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] };
      if (q.method === 'equal' && q.attribute) rows = rows.filter((row) => q.values?.includes(row[q.attribute!]));
      if (q.method === 'limit') limit = Number(q.values?.[0]);
    }
    return { rows: structuredClone(rows.slice(0, limit)), total: rows.length };
  }
  newId() { this.nextId += 1; return `prog_${this.nextId}`; }
}

function makeDatabase(tables: CountingTables) {
  return { tables, databaseId: 'isolated_progression_cache', newId: () => tables.newId(), accountForJwt: () => { throw new Error('not used'); } } as unknown as AppwriteDatabase;
}

const actor = { userId: 'catalog-admin', username: 'Admin', role: 'admin' };

test('dashboard is cached per user; catalog and per-user tables load once', async () => {
  const tables = new CountingTables();
  const progression = new ProgressionRepository(makeDatabase(tables));
  await tables.createRow('db', 'achievements', 'a1', { achievementId: 'a1', name: 'First win', conditionType: 'wins', conditionValue: 1, rewardXP: 50, isActive: true });
  await tables.createRow('db', 'player_progression', 'pp1', { userId: 'dash-user', totalXP: 120, currentLevel: 2, highestLevel: 2, equippedTitleId: '' });

  const first = await progression.dashboard('dash-user');
  assert.equal(first.progression.totalXP, 120);
  assert.equal(first.achievements.length, 1);
  const callsAfterFirst = new Map(tables.listCalls);
  assert.ok((callsAfterFirst.get('achievements') ?? 0) >= 1);

  const second = await progression.dashboard('dash-user');
  assert.deepEqual(second, first);
  assert.deepEqual(tables.listCalls, callsAfterFirst, 'a repeat dashboard within the TTL reads nothing');
});

test('recordMatch invalidates the dashboard and skips unchanged challenge progress', async () => {
  const tables = new CountingTables();
  const progression = new ProgressionRepository(makeDatabase(tables));
  await tables.createRow('db', 'challenges', 'c-win', { challengeId: 'c-win', name: 'Win five', period: 'all-time', targetValue: 5, rewardXP: 100, isActive: true, type: 'win', startsAt: '', endsAt: '' });
  await tables.createRow('db', 'challenges', 'c-guess', { challengeId: 'c-guess', name: 'Guess ten', period: 'all-time', targetValue: 10, rewardXP: 100, isActive: true, type: 'guess', startsAt: '', endsAt: '' });

  await progression.dashboard('match-user');
  await progression.recordMatch('m1', { userId: 'match-user', score: 100, wins: 0, correctGuesses: 3, totalGuesses: 5, place: 2 });
  const dash = await progression.dashboard('match-user');
  assert.equal(dash.statistics.totalGames, 1);
  assert.equal(dash.progression.totalXP, 45);
  const challengeRows = (await tables.listRows('db', 'user_challenges')).rows;
  assert.equal(challengeRows.length, 1, 'the zero-increment win challenge writes nothing');
  assert.equal(challengeRows[0].challengeId, 'c-guess');
  assert.equal(challengeRows[0].progress, 3);

  await progression.recordMatch('m2', { userId: 'match-user', score: 100, wins: 0, correctGuesses: 3, totalGuesses: 5, place: 2 });
  const again = (await tables.listRows('db', 'user_challenges')).rows;
  assert.equal(again.length, 1);
  assert.equal(again[0].progress, 6);
});

test('admin catalog edits invalidate cached dashboards', async () => {
  const tables = new CountingTables();
  const database = makeDatabase(tables);
  const progression = new ProgressionRepository(database);
  const catalog = new CatalogRepository(database);
  const before = await progression.dashboard('catalog-user');
  assert.equal(before.achievements.length, 0);
  await catalog.save('achievements', 'a-new', { name: 'New', conditionType: 'wins', conditionValue: 1, rewardXP: 10, isActive: true }, actor);
  const after = await progression.dashboard('catalog-user');
  assert.equal(after.achievements.length, 1);
  assert.equal(after.achievements[0].id, 'a-new');
});

test('leaderboard compute is cached, select-only, and invalidated by title edits', async () => {
  const tables = new CountingTables();
  const database = makeDatabase(tables);
  const progression = new ProgressionRepository(database);
  const catalog = new CatalogRepository(database);
  await tables.createRow('db', 'player_progression', 'lb-p1', { userId: 'lb-user', totalXP: 300, currentLevel: 3, highestLevel: 3, equippedTitleId: 't1' });
  await tables.createRow('db', 'profiles', 'lb-pr1', { userId: 'lb-user', username: 'LBUser', displayName: 'LB User', avatarId: 'av-02', bio: 'x'.repeat(500) });
  await tables.createRow('db', 'user_statistics', 'lb-s1', { userId: 'lb-user', gamesWon: 4, totalGames: 9 });
  await tables.createRow('db', 'titles', 'lb-t1', { titleId: 't1', name: 'Champion', description: 'Top', iconAsset: '', isActive: true });

  const first = await progression.leaderboard();
  assert.equal(first.length, 1);
  assert.equal(first[0].username, 'LBUser');
  assert.equal(first[0].titleName, 'Champion');
  assert.equal(first[0].wins, 4);
  const callsAfterFirst = new Map(tables.listCalls);
  for (const table of ['player_progression', 'profiles', 'user_statistics', 'titles']) {
    assert.equal(callsAfterFirst.get(table), 1, `${table} scanned once`);
    const methods = (tables.lastQueries.get(table) ?? []).map((encoded) => (JSON.parse(encoded) as { method: string }).method);
    assert.ok(methods.includes('select'), `${table} scan is select-only`);
  }

  const second = await progression.leaderboard();
  assert.deepEqual(second, first);
  assert.deepEqual(tables.listCalls, callsAfterFirst, 'a repeat leaderboard within the TTL reads nothing');

  await catalog.save('titles', 't1', { name: 'Grand Champion', description: 'Top', iconAsset: '', isActive: true }, actor);
  const third = await progression.leaderboard();
  assert.equal(third[0].titleName, 'Grand Champion');
});