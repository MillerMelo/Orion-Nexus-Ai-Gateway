import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTarget } from './classifier/index.js';

test('classifyTarget selects local model for short prompts', async () => {
  const decision = await classifyTarget('Short text');
  assert.equal(decision.target, 'local');
  assert.equal(decision.reason, 'below_threshold');
});

test('classifyTarget picks remote provider when keywords match', async () => {
  const decision = await classifyTarget('Requiere atención urgente del equipo legal');
  assert.equal(decision.target, 'remote');
  assert.ok(decision.model);
  assert.equal(decision.reason, 'contains_priority');
});
