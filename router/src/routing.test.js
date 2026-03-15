import test from 'node:test';
import assert from 'node:assert/strict';
import { routingMiddleware } from './routing.js';
import { cacheKeyForRequest, clearCache, getCacheEntry } from './cache.js';

test('routingMiddleware decides local target and caches response', async () => {
  clearCache();
  const prompt = 'Short prompt';
  const req = { body: { messages: [] } };
  const res = { locals: { compressedPrompt: prompt } };
  let called = false;

  await routingMiddleware(req, res, () => {
    called = true;
  });

  assert.ok(called);
  assert.equal(res.locals.routeDecision.target, 'local');
  assert.equal(res.locals.routeResult.provider, 'local');
  assert.equal(res.locals.routeCacheHit, false);
  const cached = getCacheEntry(cacheKeyForRequest(prompt));
  assert.deepEqual(cached?.model, res.locals.routeResult.model);
});

test('routingMiddleware returns cache hit on repeated prompt', async () => {
  clearCache();
  const prompt = 'Short prompt';
  const req = { body: { messages: [] } };
  const res = { locals: { compressedPrompt: prompt } };
  let called = false;

  await routingMiddleware(req, res, () => {
    called = true;
  });

  assert.ok(res.locals.routeCacheHit === false);

  const secondRes = { locals: { compressedPrompt: prompt } };
  let secondCalled = false;
  await routingMiddleware(req, secondRes, () => {
    secondCalled = true;
  });

  assert.ok(secondCalled);
  assert.equal(secondRes.locals.routeCacheHit, true);
  assert.equal(secondRes.locals.routeResult.source, 'cache');
});
