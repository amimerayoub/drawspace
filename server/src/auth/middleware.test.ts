import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { identityFrom, requireAuth, type AuthenticatedRequest } from './middleware';
import type { AuthenticatedIdentity } from '../types/identity';

const identity: AuthenticatedIdentity = { userId: 'verified-account', name: 'Verified', email: null, emailVerified: false, isGuest: true };

function responseCapture() {
  const output: { status: number; body?: unknown } = { status: 200 };
  const response = {
    status(code: number) { output.status = code; return this; },
    json(body: unknown) { output.body = body; return this; },
  } as unknown as Response;
  return { output, response };
}

async function run(auth: string | undefined, verifier = async (jwt: string) => {
  assert.equal(jwt, 'valid-token'); return identity;
}) {
  const request = { get: (name: string) => name.toLowerCase() === 'authorization' ? auth : undefined } as Request;
  const { output, response } = responseCapture();
  let nextCalled = false;
  const next: NextFunction = () => { nextCalled = true; };
  await requireAuth(verifier)(request, response, next);
  return { request, output, nextCalled };
}

test('auth middleware rejects missing, malformed, and invalid JWTs', async () => {
  const missing = await run(undefined);
  assert.equal(missing.output.status, 401);
  assert.equal(missing.nextCalled, false);
  assert.equal((missing.output.body as { code: string }).code, 'AUTH_REQUIRED');

  const malformed = await run('Basic valid-token');
  assert.equal(malformed.output.status, 401);

  const expired = await run('Bearer expired', async () => { throw new Error('private verifier detail'); });
  assert.equal(expired.output.status, 401);
  assert.deepEqual(expired.output.body, { error: 'Invalid or expired session', code: 'AUTH_INVALID' });
});

test('identity comes only from the JWT verifier, not userId or role request fields', async () => {
  const result = await run('Bearer valid-token');
  assert.equal(result.nextCalled, true);
  const verified = identityFrom(result.request as AuthenticatedRequest);
  assert.equal(verified.userId, 'verified-account');
  assert.equal(verified.isGuest, true);
  assert.equal((result.request as Request & { userId?: string }).userId, undefined);
});
