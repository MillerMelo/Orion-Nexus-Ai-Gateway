import test from 'node:test';
import assert from 'node:assert/strict';
import { gatherPromptFromBody, normalizePhase } from './helpers.js';

test('gatherPromptFromBody uses prompt property first', () => {
  const payload = { prompt: 'Direct prompt', input: 'Fallback input', messages: [{ role: 'user', content: 'Ignored' }] };
  assert.equal(gatherPromptFromBody(payload), 'Direct prompt');
});

test('gatherPromptFromBody falls back to messages when prompt missing', () => {
  const payload = { messages: [{ role: 'user', content: 'First line' }, { role: 'assistant', content: 'Second line' }] };
  assert.equal(gatherPromptFromBody(payload), 'First line\nSecond line');
});

test('normalizePhase defaults to full and normalizes casing', () => {
  assert.equal(normalizePhase('SELECT'), 'select');
  assert.equal(normalizePhase('unknown'), 'full');
  assert.equal(normalizePhase(), 'full');
});
