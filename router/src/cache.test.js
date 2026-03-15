import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheKeyForRequest, clearCache, getCacheEntry, setCacheEntry } from './cache.js';

test('setCacheEntry and getCacheEntry store and retrieve values', () => {
  clearCache();
  const key = cacheKeyForRequest('hello');
  setCacheEntry(key, { provider: 'remote' }, 10);
  const stored = getCacheEntry(key);
  assert.deepEqual(stored, { provider: 'remote' });
});

test('expired cache entries are removed', () => {
  clearCache();
  const key = cacheKeyForRequest('bye');
  setCacheEntry(key, { provider: 'remote' }, -1);
  const stored = getCacheEntry(key);
  assert.equal(stored, null);
});
