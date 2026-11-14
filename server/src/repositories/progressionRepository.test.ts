import assert from 'node:assert/strict';
import test from 'node:test';
import { levelForXp } from './progressionRepository';

test('level calculation carries XP across the configured growth curve', () => {
  assert.deepEqual(levelForXp(0), { level: 1, into: 0, needed: 100 });
  assert.deepEqual(levelForXp(99), { level: 1, into: 99, needed: 100 });
  assert.deepEqual(levelForXp(100), { level: 2, into: 0, needed: 118 });
  assert.deepEqual(levelForXp(218), { level: 3, into: 0, needed: 139 });
});
