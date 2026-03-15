import test from 'node:test';
import assert from 'node:assert/strict';
import { compressionMiddleware } from './compression.js';

test('compressionMiddleware skips compression when prompt short', async () => {
  const req = { body: { prompt: 'short' } };
  const res = { locals: {} };
  let nextCalled = false;

  await compressionMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert(nextCalled, 'next() should run');
  assert.equal(res.locals.compressorMetadata.reason, 'below_threshold');
  assert.equal(res.locals.compressedPrompt, 'short');
  assert.strictEqual(req.body.prompt, 'short');
});
