import test from 'node:test';
import assert from 'node:assert/strict';
import { contextMiddleware } from './context.js';
import { clearContext, contextKey, getContextEntries } from './contextStore.js';

test('contextMiddleware stores summary when header provided', async () => {
  clearContext();
  const id = 'session-1';
  const req = {
    headers: {
      'x-context-id': id,
    },
    body: {},
  };
  const res = { locals: { compressedPrompt: 'Hola mundo' } };
  let called = false;
  await contextMiddleware(req, res, () => {
    called = true;
  });
  assert.ok(called);
  assert.equal(res.locals.contextId, id);
  assert.ok(res.locals.contextSummary);
  const entries = getContextEntries(contextKey(id));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].prompt, 'Hola mundo');
});
