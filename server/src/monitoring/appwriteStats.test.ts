import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { appwriteStatsSnapshot, recordAppwriteCall, resetAppwriteStats } from './appwriteStats';
import { createAppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';

test('stats group calls per minute by table and method, with lifetime totals', () => {
  resetAppwriteStats();
  recordAppwriteCall('custom_words', 'listRows');
  recordAppwriteCall('custom_words', 'listRows');
  recordAppwriteCall('profiles', 'getRow');
  recordAppwriteCall('account', 'get');
  const snapshot = appwriteStatsSnapshot();
  const words = snapshot.totals.find((entry) => entry.table === 'custom_words');
  assert.ok(words);
  assert.equal(words.calls, 2);
  assert.deepEqual(words.methods, { listRows: 2 });
  assert.equal(snapshot.totals.length, 3);
  assert.equal(snapshot.minutes.length, 1);
  const minute = snapshot.minutes[0];
  assert.equal(minute.tables.reduce((sum, entry) => sum + entry.calls, 0), 4);
  assert.ok(!Number.isNaN(Date.parse(minute.at)));
  resetAppwriteStats();
  assert.equal(appwriteStatsSnapshot().totals.length, 0);
  assert.equal(appwriteStatsSnapshot().minutes.length, 0);
});

test('the database wrapper counts real SDK calls without altering results', async () => {
  resetAppwriteStats();
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ total: 0, rows: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: `http://127.0.0.1:${address.port}`, appwriteProjectId: 'isolated-stats', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_stats', frontendOrigins: [], roomStateDriver: 'memory' };
  try {
    const database = createAppwriteDatabase(config);
    const result = await database.tables.listRows('isolated_stats', 'custom_words', []);
    assert.equal(result.total, 0);
    await database.tables.listRows('isolated_stats', 'custom_words', []);
    await database.tables.createRow('isolated_stats', 'profiles', 'row-1', { userId: 'u' });
    const snapshot = appwriteStatsSnapshot();
    const words = snapshot.totals.find((entry) => entry.table === 'custom_words');
    assert.ok(words);
    assert.equal(words.calls, 2);
    assert.deepEqual(words.methods, { listRows: 2 });
    const profiles = snapshot.totals.find((entry) => entry.table === 'profiles');
    assert.ok(profiles);
    assert.deepEqual(profiles.methods, { createRow: 1 });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetAppwriteStats();
  }
});