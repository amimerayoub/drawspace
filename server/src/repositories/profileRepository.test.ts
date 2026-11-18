import assert from 'node:assert/strict';
import test from 'node:test';
import { ProfileRepository } from './profileRepository';
import type { AppwriteDatabase } from '../database/appwrite';

function createRowsDatabase() {
  const rows: Array<Record<string, unknown> & { $id: string }> = [];
  const state = { listCalls: 0, lastQueries: [] as string[] };
  const database = {
    databaseId: 'test-db', newId: () => 'row-1',
    accountForJwt: () => { throw new Error('not used'); },
    tables: {
      listRows: async (_db: string, _table: string, queries: unknown[]) => {
        state.listCalls += 1;
        state.lastQueries = queries.map(String);
        const query = JSON.parse(String(queries[0])) as { attribute: string; values: string[] };
        const value = query.values[0];
        const key = query.attribute;
        const found = rows.filter((row) => row[key] === value);
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

test('profile repository writes only inspected profile columns and derives account type', async () => {
  const { database, rows } = createRowsDatabase();
  const profiles = new ProfileRepository(database);
  const first = await profiles.ensure({ userId: 'server-user', username: 'Sketcher', avatarId: 'av-02', accountType: 'guest' });
  assert.equal(first.userId, 'server-user');
  assert.equal(first.normalizedUsername, 'sketcher');
  assert.equal(first.accountType, 'guest');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['$id', 'accountType', 'avatarId', 'bio', 'createdAt', 'displayName', 'normalizedUsername', 'updatedAt', 'userId', 'username'].sort());

  await profiles.update('server-user', { username: 'NewName', bio: 'hi' });
  assert.equal(rows[0].username, 'NewName');
  assert.equal(rows[0].normalizedUsername, 'newname');
  assert.equal(rows[0].userId, 'server-user');
  assert.equal('role' in rows[0], false);
});

test('profile reads are select-only, cached per user, and invalidated by writes', async () => {
  const { database, state } = createRowsDatabase();
  const profiles = new ProfileRepository(database);
  await profiles.ensure({ userId: 'cache-user', username: 'Cached', avatarId: 'av-01', accountType: 'guest' });
  assert.equal(state.listCalls, 1);
  const methods = state.lastQueries.map((encoded) => (JSON.parse(encoded) as { method: string }).method);
  assert.deepEqual(methods, ['equal', 'limit', 'select']);

  await profiles.get('cache-user');
  await profiles.get('cache-user');
  assert.equal(state.listCalls, 2, 'ensure invalidated the null read; the next two gets share one load');

  await profiles.update('cache-user', { bio: 'fresh' });
  const after = await profiles.get('cache-user');
  assert.equal(after?.bio, 'fresh');
  assert.equal(state.listCalls, 4, 'update reads fresh once, then the next get reloads once');
});
