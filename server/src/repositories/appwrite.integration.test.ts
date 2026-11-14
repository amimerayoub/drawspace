import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client, ID, Query, TablesDB } from 'node-appwrite';
import { AppwriteMatchHistoryRepository, type MatchPlayerRecord } from './matchHistoryRepository';

const endpoint = process.env.APPWRITE_TEST_ENDPOINT;
const projectId = process.env.APPWRITE_TEST_PROJECT_ID;
const apiKey = process.env.APPWRITE_TEST_API_KEY;
const databaseId = process.env.APPWRITE_TEST_DATABASE_ID;
const configured = endpoint === 'https://fra.cloud.appwrite.io/v1'
  && Boolean(projectId)
  && databaseId === 'drawspace_db'
  && Boolean(apiKey);

async function deleteTestRow(tables: TablesDB, tableId: string, rowId: string) {
  try { await tables.deleteRow(databaseId!, tableId, rowId); }
  catch (error) { if ((error as { code?: number }).code !== 404) throw error; }
}

function makeTables() {
  if (!configured) throw new Error('Appwrite integration target is not configured.');
  const client = new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!);
  return new TablesDB(client);
}

test('Appwrite test target inspection and prefixed profile CRUD/ownership', {
  skip: !configured ? 'Set test-only APPWRITE_TEST_ENDPOINT/PROJECT_ID/DATABASE_ID/API_KEY for the authorized demo project.' : false,
  timeout: 30_000,
}, async (context) => {
  const tables = makeTables();
  const inventory = await tables.listTables(databaseId!, [Query.limit(100)]);
  assert.ok(inventory.tables.some((table) => table.$id === 'profiles'));
  const profileTable = await tables.getTable(databaseId!, 'profiles');
  const columns = await tables.listColumns(databaseId!, 'profiles', [Query.limit(100)]);
  assert.ok(columns.columns.some((column) => column.key === 'userId'));
  assert.ok(columns.columns.some((column) => column.key === 'username'));
  assert.ok(profileTable.indexes.some((index) => index.type === 'unique' && index.columns.includes('userId')));

  const token = randomBytes(10).toString('hex');
  const userId = `drawspace_test_${token}`;
  const rowId = `drawspace_test_${randomBytes(10).toString('hex')}`;
  const username = `test_${token.slice(0, 16)}`;
  const now = new Date().toISOString();
  let created = false;
  context.after(async () => { if (created) await deleteTestRow(tables, 'profiles', rowId); });

  try {
    created = true;
    await tables.createRow(databaseId!, 'profiles', rowId, {
      userId, username, normalizedUsername: username, displayName: 'DrawSpace integration test', bio: '', avatarId: 'av-01',
      accountType: 'guest', createdAt: now, updatedAt: now,
    });
    const read = await tables.getRow(databaseId!, 'profiles', rowId);
    assert.equal(read.userId, userId); assert.equal(read.username, username);
    const updated = await tables.updateRow(databaseId!, 'profiles', rowId, { displayName: 'Updated integration test', updatedAt: new Date().toISOString() });
    assert.equal(updated.displayName, 'Updated integration test');

    const ownRows = await tables.listRows(databaseId!, 'profiles', [Query.equal('userId', userId), Query.limit(10)]);
    assert.equal(ownRows.total, 1);
    const otherRows = await tables.listRows(databaseId!, 'profiles', [Query.equal('userId', `drawspace_test_${randomBytes(10).toString('hex')}`), Query.limit(10)]);
    assert.equal(otherRows.total, 0, 'a different owner filter must not expose the test profile');
    assert.equal(profileTable.rowSecurity, true);
  } finally {
    if (created) { await deleteTestRow(tables, 'profiles', rowId); created = false; }
  }
});

test('Appwrite match-history persistence is idempotent, paginated, and owner-scoped', {
  skip: !configured ? 'Set test-only APPWRITE_TEST_ENDPOINT/PROJECT_ID/DATABASE_ID/API_KEY for the authorized demo project.' : false,
  timeout: 30_000,
}, async (context) => {
  const tables = makeTables();
  let table;
  try { table = await tables.getTable(databaseId!, 'match_history'); }
  catch (error) {
    if ((error as { code?: number }).code === 404) { context.skip('The additive match_history migration has not been explicitly approved/applied.'); return; }
    throw error;
  }
  assert.equal(table.rowSecurity, true);
  assert.deepEqual(table.$permissions, [], 'match-history table must not grant direct client permissions');
  const columns = await tables.listColumns(databaseId!, 'match_history', [Query.limit(100)]);
  for (const required of ['matchId', 'playerId', 'score', 'placement', 'configuration']) assert.ok(columns.columns.some((column) => column.key === required), `missing ${required}`);

  const history = new AppwriteMatchHistoryRepository({ tables, databaseId: databaseId!, newId: () => ID.unique() } as never);
  const token = randomBytes(8).toString('hex');
  const matchId = `drawspace_test_${token}`;
  const playerId = `drawspace_test_${token}`;
  const rowId = createHash('sha256').update(`${matchId}:${playerId}`).digest('hex').slice(0, 36);
  const completedAt = new Date().toISOString();
  const record: MatchPlayerRecord = {
    id: `${matchId}:${playerId}`, matchId, roomId: randomUUID(), roomCode: 'TST234', roomName: 'DrawSpace integration test',
    status: 'completed', startedAt: completedAt, completedAt, durationSeconds: 1, playerId,
    username: `test_${token}`, avatarId: 'av-01', accountType: 'guest', score: 10, placement: 1, isWinner: true,
    playerCount: 1, roundsConfigured: 1, roundsCompleted: 1, configuration: '{"test":true}',
  };
  let created = false;
  context.after(async () => { if (created) await deleteTestRow(tables, 'match_history', rowId); });
  try {
    created = true; await history.append(record);
    await history.append({ ...record, score: 999 });
    const own = await history.listForUser(playerId, 1, 0);
    assert.equal(own.total, 1); assert.equal(own.rows[0].score, 10);
    assert.equal((await history.listForPlayer('drawspace_test_unrelated', 10, 0)).total, 0);
    const match = await history.getMatch(matchId);
    assert.equal(match.length, 1); assert.equal(match[0].accountType, 'guest');
  } finally {
    if (created) { await deleteTestRow(tables, 'match_history', rowId); created = false; }
  }
});
