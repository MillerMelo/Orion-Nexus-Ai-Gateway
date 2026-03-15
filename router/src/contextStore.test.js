import test from 'node:test';
import assert from 'node:assert/strict';
import { addContextEntry, clearContext, contextKey, getContextEntries } from './contextStore.js';

test('context entries accumulate and respect limit', () => {
  clearContext();
  const key = contextKey('test');
  for (let i = 0; i < 8; i += 1) {
    addContextEntry(key, { prompt: `P${i}`, summary: `S${i}` });
  }
  const entries = getContextEntries(key);
  assert.ok(entries.length <= 6);
  assert.equal(entries[entries.length - 1].prompt, 'P7');
});
