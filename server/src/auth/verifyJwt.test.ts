import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppwriteDatabase } from '../database/appwrite';
import { createJwtVerifier } from './verifyJwt';

const makeJwt = (subject: string, expSeconds?: number) => {
  const payload: Record<string, unknown> = { sub: subject };
  if (expSeconds !== undefined) payload.exp = expSeconds;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
};

const future = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeDatabase(options: { failFirst?: boolean } = {}) {
  const state = { calls: 0, failNext: options.failFirst === true };
  const database = {
    accountForJwt(jwt: string) {
      return {
        async get() {
          state.calls += 1;
          if (state.failNext) { state.failNext = false; throw Object.assign(new Error('invalid token'), { code: 401 }); }
          const subject = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).sub as string;
          return { $id: subject, name: 'Player ' + subject, email: subject.includes('guest') ? '' : subject + '@example.invalid', emailVerification: true };
        },
      };
    },
  } as unknown as AppwriteDatabase;
  return { database, state };
}

test('jwt verifier caches identity per token hash and reuses it', async () => {
  const { database, state } = fakeDatabase();
  const verify = createJwtVerifier(database);
  const jwt = makeJwt('user-1', future(3600));
  const first = await verify(jwt);
  await verify(jwt);
  await verify(jwt);
  assert.equal(state.calls, 1);
  assert.equal(first.userId, 'user-1');
  assert.equal(first.isGuest, false);
  assert.equal(first.emailVerified, true);
  const guest = await verify(makeJwt('guest-1', future(3600)));
  assert.equal(guest.isGuest, true);
  assert.equal(guest.email, null);
  assert.equal(state.calls, 2);
});

test('jwt verifier shares one in-flight verification per token', async () => {
  const { database, state } = fakeDatabase();
  const verify = createJwtVerifier(database);
  const jwt = makeJwt('user-2', future(3600));
  const results = await Promise.all([verify(jwt), verify(jwt), verify(jwt), verify(jwt), verify(jwt)]);
  assert.equal(state.calls, 1);
  assert.ok(results.every((identity) => identity.userId === 'user-2'));
});

test('jwt verifier rejects expired tokens locally without calling Appwrite', async () => {
  const { database, state } = fakeDatabase();
  const verify = createJwtVerifier(database);
  await assert.rejects(() => verify(makeJwt('user-3', future(-10))));
  assert.equal(state.calls, 0);
});

test('jwt verifier cache respects the token exp and the max cache window', async () => {
  const { database, state } = fakeDatabase();
  const capped = createJwtVerifier(database, { maxCacheMs: 30 });
  const jwt = makeJwt('user-4', future(3600));
  await capped(jwt);
  await sleep(40);
  await capped(jwt);
  assert.equal(state.calls, 2);

  const shortLived = makeJwt('user-5', future(1));
  await capped(shortLived);
  await sleep(1100);
  await assert.rejects(() => capped(shortLived), /Token expired/);
  assert.equal(state.calls, 3);
});

test('jwt verifier does not cache failed verifications', async () => {
  const { database, state } = fakeDatabase({ failFirst: true });
  const verify = createJwtVerifier(database);
  const jwt = makeJwt('user-6', future(3600));
  await assert.rejects(() => verify(jwt));
  const identity = await verify(jwt);
  assert.equal(identity.userId, 'user-6');
  assert.equal(state.calls, 2);
});

test('jwt verifier evicts oldest entries beyond the entry cap', async () => {
  const { database, state } = fakeDatabase();
  const verify = createJwtVerifier(database, { maxEntries: 2 });
  const a = makeJwt('user-a', future(3600));
  const b = makeJwt('user-b', future(3600));
  const c = makeJwt('user-c', future(3600));
  await verify(a);
  await verify(b);
  await verify(c);
  assert.equal(state.calls, 3);
  await verify(b);
  assert.equal(state.calls, 3);
  await verify(a);
  assert.equal(state.calls, 4);
});

test('jwt verifier handles tokens without an exp claim', async () => {
  const { database, state } = fakeDatabase();
  const verify = createJwtVerifier(database);
  const jwt = makeJwt('user-7');
  await verify(jwt);
  await verify(jwt);
  assert.equal(state.calls, 1);
});