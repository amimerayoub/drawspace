import assert from 'node:assert/strict';
import test from 'node:test';
import { requireAdmin } from './authorize';

function invoke(role: string | null, allowed?: Array<'superadmin' | 'admin' | 'moderator' | 'content_manager' | 'analyst'>) {
  let status = 200; let body: unknown; let passed = false; let nextError: unknown;
  const middleware = requireAdmin({ getRole: async () => role } as never, allowed);
  const request = { identity: { userId: 'user-1', name: 'Moderator', email: null, emailVerified: true, isGuest: false } } as never;
  const response = { locals: {}, status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } } as never;
  void middleware(request, response, (error?: unknown) => { if (error) nextError = error; else passed = true; });
  return { get status() { return status; }, get body() { return body; }, get passed() { return passed; }, get nextError() { return nextError; }, response };
}

test('admin authorization denies missing or disallowed table roles', async () => {
  const missing = invoke(null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(missing.status, 403);
  assert.deepEqual(missing.body, { error: 'Insufficient permissions', code: 'FORBIDDEN' });
  const disallowed = invoke('analyst', ['admin', 'superadmin']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disallowed.status, 403);
});

test('admin authorization supplies the verified table role to authorized routes', async () => {
  const allowed = invoke('moderator', ['moderator', 'admin']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(allowed.passed, true);
  assert.deepEqual((allowed.response as { locals: unknown }).locals, { admin: { userId: 'user-1', role: 'moderator' } });
});
