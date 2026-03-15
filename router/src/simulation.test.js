import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimulationPayload, detectSimulationCommand } from './simulation.js';

test('buildSimulationPayload marks timeline up to selected phase as simulated', () => {
  const payload = buildSimulationPayload({ prompt: '/simulate phase=select prueba', phase: 'select', context: ['ctx'] });
  const timeline = payload.simulation.timeline;

  const selectEntry = timeline.find((entry) => entry.name === 'select');
  const routeEntry = timeline.find((entry) => entry.name === 'route');

  assert.equal(selectEntry?.status, 'simulated');
  assert.equal(routeEntry?.status, 'pending');
  assert.equal(payload.simulation.tokenCount, 3);
  assert.deepEqual(payload.simulation.context, ['ctx']);
});

test('detectSimulationCommand returns null when flag missing', () => {
  const req = { body: { messages: [{ role: 'user', content: 'Hello' }] } };
  assert.equal(detectSimulationCommand(req), null);
});

test('detectSimulationCommand returns data when flag present', () => {
  const req = { body: { messages: [{ role: 'user', content: '/simulate phase=compress text' }] } };
  const detection = detectSimulationCommand(req);
  assert.equal(detection?.phase, 'compress');
});

test('detectSimulationCommand respects x-router-phase header when flag missing', () => {
  const req = {
    body: { messages: [{ role: 'user', content: 'fallback' }] },
    headers: { 'x-router-phase': 'route' },
  };
  const detection = detectSimulationCommand(req);
  assert.equal(detection?.phase, 'route');
  assert.equal(detection?.triggeredBy, 'x-router-phase');
});
