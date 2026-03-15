import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.js';
import { summaryMiddleware } from './summary.js';

test('summaryMiddleware sends structured instruction and stores result', async () => {
  const prompt = 'Texto para resumir';
  const req = { body: { messages: [{ role: 'user', content: prompt }] } };
  const res = { locals: { compressedPrompt: prompt } };
  const originalFetch = globalThis.fetch;
  const originalUrl = config.ollamaUrl;
  config.ollamaUrl = 'http://ollama.local';
  let bodyPayload = null;
  globalThis.fetch = async (_, init) => {
    bodyPayload = JSON.parse(init.body);
    return {
      status: 200,
      ok: true,
      json: async () => ({ output: ['Resumen generado'] }),
    };
  };
  try {
    await summaryMiddleware(req, res, () => {});
    assert.equal(res.locals.semanticSummary, 'Resumen generado');
    assert.equal(res.locals.summaryMetadata.ok, true);
    assert.ok(bodyPayload.prompt.startsWith('Resume el siguiente texto'));
    assert.ok(bodyPayload.prompt.includes('Texto:'));
  } finally {
    globalThis.fetch = originalFetch;
    config.ollamaUrl = originalUrl;
  }
});
