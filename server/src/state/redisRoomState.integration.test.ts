import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import Redis from 'ioredis';
import { GameEngine, GameError, type RoomSettings } from '../game/engine';
import { RedisRoomStateStore, type RedisRoomClient } from './roomStateStore';

const redisUrl = process.env.REDIS_TEST_URL;
const redisHostAllowed = (url: string) => ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
const settings: RoomSettings = { name: 'Redis integration', visibility: 'private', maxPlayers: 4, rounds: 1, roundSeconds: 30, difficulty: 'mixed', wordMode: 'all', customWords: [] };

function makeStore(redis: Redis, prefix: string) {
  const client: RedisRoomClient = {
    get: (key) => redis.get(key),
    set: async (key, value, options) => 'NX' in options ? redis.set(key, value, 'PX', options.PX, 'NX') : redis.set(key, value, 'EX', options.EX),
    del: (key) => redis.del(key), sadd: (key, member) => redis.sadd(key, member),
    expire: async (key, seconds) => (await redis.expire(key, seconds)) === 1,
    smembers: (key) => redis.smembers(key), srem: (key, member) => redis.srem(key, member),
    eval: (script, options) => redis.eval(script, options.keys.length, ...options.keys, ...options.arguments),
    ping: () => redis.ping(), get isOpen() { return redis.status === 'ready'; }, quit: () => redis.quit(),
  };
  return new RedisRoomStateStore(client, prefix);
}

test('real Redis state store, locks, presence, TTL, engine concurrency, and reconnect', {
  skip: !redisUrl ? 'Set REDIS_TEST_URL to an isolated localhost Redis instance.' : false,
}, async (context) => {
  assert.ok(redisHostAllowed(redisUrl!), 'REDIS_TEST_URL must target localhost; production Redis is forbidden in tests.');
  const prefix = `drawspace:phase7:test:${randomUUID()}:`;
  const clientA = new Redis(redisUrl!, { lazyConnect: true }); const clientB = new Redis(redisUrl!, { lazyConnect: true });
  await Promise.all([clientA.connect(), clientB.connect()]);
  const storeA = makeStore(clientA, prefix); const storeB = makeStore(clientB, prefix);
  context.after(async () => {
    const keys = await clientA.keys(`${prefix}*`);
    if (keys.length) await clientA.del(...keys);
    await Promise.allSettled([clientA.quit(), clientB.quit()]);
  });

  assert.equal(await storeA.isHealthy(), true);
  await storeA.set('roundtrip', { answer: 42 }, 30);
  assert.deepEqual(await storeB.get('roundtrip'), { answer: 42 });

  await storeA.set('expires', { value: true }, 1);
  await delay(1_150);
  assert.equal(await storeB.get('expires'), null, 'expired state should be absent after Redis TTL');

  await storeA.touchPresence('room-1', 'player-1', 30, 'socket-old');
  await storeB.touchPresence('room-1', 'player-1', 30, 'socket-new');
  await storeA.removePresence('room-1', 'player-1', 'socket-old');
  assert.deepEqual(await storeB.listPresence('room-1'), ['player-1'], 'stale disconnect must not remove replacement presence');
  await storeB.removePresence('room-1', 'player-1', 'socket-new');
  assert.deepEqual(await storeA.listPresence('room-1'), []);

  await storeA.set('counter', 0, 30);
  await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? storeA : storeB).withLock('counter-lock', async () => {
    const value = await storeA.get<number>('counter') ?? 0;
    await delay(2);
    await storeA.set('counter', value + 1, 30);
  })));
  assert.equal(await storeB.get('counter'), 20, 'distributed lock should serialize concurrent writers');
  assert.equal(await clientA.exists(`${prefix}lock:counter-lock`), 0, 'lock key should be cleaned up after use');

  let now = 100_000;
  const gameA = new GameEngine(() => now, storeA); const gameB = new GameEngine(() => now, storeB);
  const host = { userId: 'host-test', username: 'Host', avatarId: 'av-01' };
  const guest = { userId: 'guest-test', username: 'Guest', avatarId: 'av-02' };
  const room = await gameA.createRoom(host, settings, 'host-socket-old');
  await gameB.join(room.code, guest, 'guest-socket');
  await storeA.touchPresence(room.id, host.userId, 30, 'host-socket-old');
  await storeB.touchPresence(room.id, host.userId, 30, 'host-socket-new');
  await storeA.removePresence(room.id, host.userId, 'host-socket-old');
  assert.ok((await storeB.listPresence(room.id)).includes(host.userId));
  await gameB.join(room.code, host, 'host-socket-new');
  const migrated = await gameA.leave(room.code, host.userId);
  assert.equal(migrated?.hostUserId, guest.userId, 'host ownership should migrate across Redis-backed engines');

  const scoredRoom = await gameA.createRoom(host, settings, 'score-host');
  await gameB.join(scoredRoom.code, guest, 'score-guest');
  await gameA.setReady(scoredRoom.code, guest.userId, true);
  const starts = await Promise.allSettled([gameA.start(scoredRoom.code, host.userId), gameB.start(scoredRoom.code, host.userId)]);
  assert.equal(starts.filter((result) => result.status === 'fulfilled').length, 1, 'only one concurrent start should win');
  const started = (starts.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof gameA.start>>>).value;
  await gameA.setWordChoices(scoredRoom.code, started.drawer.userId, [{ id: 'w1', word: 'tree', category: 'nature' }, { id: 'w2', word: 'bird', category: 'animal' }]);
  await gameB.chooseWord(scoredRoom.code, started.drawer.userId, 'w1');
  const guesser = started.drawer.userId === host.userId ? guest : host;
  const guesses = await Promise.allSettled([gameA.guess(scoredRoom.code, guesser.userId, 'tree'), gameB.guess(scoredRoom.code, guesser.userId, 'tree')]);
  assert.equal(guesses.filter((guess) => guess.status === 'fulfilled' && guess.value.correct).length, 1, 'duplicate correct guess should score once');
  assert.ok((await gameA.get(scoredRoom.code)).players.get(guesser.userId)!.score > 0);

  const expiringStore = makeStore(clientA, `${prefix}expiry:`);
  const expiringGame = new GameEngine(() => now, expiringStore, 1);
  const expiringRoom = await expiringGame.createRoom({ userId: 'expiry-host', username: 'Expiry', avatarId: 'av-01' }, settings, 'expiry-socket');
  now += 1_100;
  await assert.rejects(() => expiringGame.get(expiringRoom.code), (error: unknown) => error instanceof GameError && error.code === 'ROOM_NOT_FOUND');

  await clientB.disconnect();
  assert.equal(await storeB.isHealthy(), false, 'health must reflect Redis client disconnect');
  await clientB.connect();
  assert.equal(await storeB.isHealthy(), true, 'health should recover after client reconnect');
});
