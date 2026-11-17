import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slidingWindow } from './rateLimits';

test('sliding window enforces the limit inside the window and recovers after it', () => {
  const window = slidingWindow(3, 1_000);
  assert.equal(window.allow('ip', 0), true);
  assert.equal(window.allow('ip', 100), true);
  assert.equal(window.allow('ip', 200), true);
  assert.equal(window.allow('ip', 300), false);
  assert.equal(window.allow('ip', 999), false);
  assert.equal(window.allow('ip', 1_000), true);
  assert.equal(window.allow('ip', 1_100), true);
  assert.equal(window.allow('ip', 1_200), true);
  assert.equal(window.allow('ip', 1_250), false);
});

test('sliding window keys are independent', () => {
  const window = slidingWindow(1, 1_000);
  assert.equal(window.allow('a', 0), true);
  assert.equal(window.allow('a', 1), false);
  assert.equal(window.allow('b', 1), true);
});