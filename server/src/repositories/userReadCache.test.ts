import assert from 'node:assert/strict';
import test from 'node:test';
import { UserReadCache, invalidateCatalogCaches, invalidateUserCache } from './userReadCache';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('read caches per key until the TTL expires', async () => {
  const cache = new UserReadCache(40);
  let calls = 0;
  const loader = async () => { calls += 1; return calls; };
  assert.equal(await cache.read('profiles:ttl-user', loader), 1);
  assert.equal(await cache.read('profiles:ttl-user', loader), 1);
  await tick(60);
  assert.equal(await cache.read('profiles:ttl-user', loader), 2);
});

test('concurrent reads share one in-flight load', async () => {
  const cache = new UserReadCache();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const loader = async () => { calls += 1; await gate; return 'v'; };
  const a = cache.read('profiles:flight-user', loader);
  const b = cache.read('profiles:flight-user', loader);
  release();
  assert.deepEqual(await Promise.all([a, b]), ['v', 'v']);
  assert.equal(calls, 1);
});

test('invalidateUser clears every table key for that user only', async () => {
  const cache = new UserReadCache();
  let calls = 0;
  const loader = async () => { calls += 1; return calls; };
  await cache.read('profiles:inv-user', loader);
  await cache.read('user_statistics:inv-user', loader);
  await cache.read('dashboard:inv-user', loader);
  await cache.read('profiles:other-user', loader);
  assert.equal(calls, 4);
  cache.invalidateUser('inv-user');
  await cache.read('profiles:inv-user', loader);
  await cache.read('user_statistics:inv-user', loader);
  await cache.read('dashboard:inv-user', loader);
  await cache.read('profiles:other-user', loader);
  assert.equal(calls, 7);
});

test('a write mid-load forces a reload instead of caching stale data', async () => {
  const cache = new UserReadCache();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const loader = async () => { calls += 1; if (calls === 1) await gate; return calls; };
  const pending = cache.read('profiles:race-user', loader);
  cache.invalidateUser('race-user');
  release();
  assert.equal(await pending, 2);
  assert.equal(calls, 2);
  assert.equal(await cache.read('profiles:race-user', loader), 2);
  assert.equal(calls, 2);
});

test('invalidateUserCache reaches every live cache instance', async () => {
  const a = new UserReadCache();
  const b = new UserReadCache();
  let callsA = 0;
  let callsB = 0;
  const loaderA = async () => { callsA += 1; return callsA; };
  const loaderB = async () => { callsB += 1; return callsB; };
  await a.read('profiles:shared-user', loaderA);
  await b.read('profiles:shared-user', loaderB);
  invalidateUserCache('shared-user');
  await a.read('profiles:shared-user', loaderA);
  await b.read('profiles:shared-user', loaderB);
  assert.equal(callsA, 2);
  assert.equal(callsB, 2);
});

test('catalog invalidation also expires dashboards but not statistics', async () => {
  const cache = new UserReadCache();
  let catalogCalls = 0;
  let dashCalls = 0;
  let statCalls = 0;
  const catalog = async () => { catalogCalls += 1; return catalogCalls; };
  const dash = async () => { dashCalls += 1; return dashCalls; };
  const stat = async () => { statCalls += 1; return statCalls; };
  await cache.readCatalog('achievements', catalog);
  await cache.read('dashboard:cat-user', dash);
  await cache.read('user_statistics:cat-user', stat);
  invalidateCatalogCaches();
  await cache.readCatalog('achievements', catalog);
  await cache.read('dashboard:cat-user', dash);
  await cache.read('user_statistics:cat-user', stat);
  assert.equal(catalogCalls, 2);
  assert.equal(dashCalls, 2);
  assert.equal(statCalls, 1);
});

test('eviction drops expired entries first, then oldest', async () => {
  const cache = new UserReadCache(25, 2);
  await cache.read('profiles:ev-a', async () => 1);
  await tick(40);
  await cache.read('profiles:ev-b', async () => 2);
  await cache.read('profiles:ev-c', async () => 3);
  let reloads = 0;
  await cache.read('profiles:ev-b', async () => { reloads += 1; return 0; });
  assert.equal(reloads, 0, 'expired ev-a should be evicted before live ev-b');

  const oldest = new UserReadCache(60_000, 2);
  await oldest.read('profiles:old-a', async () => 1);
  await oldest.read('profiles:old-b', async () => 2);
  await oldest.read('profiles:old-c', async () => 3);
  let oldReloads = 0;
  await oldest.read('profiles:old-a', async () => { oldReloads += 1; return 0; });
  await oldest.read('profiles:old-c', async () => { oldReloads += 1; return 0; });
  assert.equal(oldReloads, 1, 'only the oldest entry ev-a should have been evicted');
});

test('failed loads are not cached', async () => {
  const cache = new UserReadCache();
  let calls = 0;
  const loader = async () => { calls += 1; if (calls === 1) throw new Error('boom'); return 'ok'; };
  await assert.rejects(cache.read('profiles:fail-user', loader), /boom/);
  assert.equal(await cache.read('profiles:fail-user', loader), 'ok');
  assert.equal(calls, 2);
});