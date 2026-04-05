import { callOpenRouter } from './providers/openrouter.js';
import { callOllama } from './providers/ollama.js';
import { pipeResponseAndCapture } from './providers/stream.js';
import { recordCost, recordLocalCost } from './costs.js';
import { withRetry } from './retry.js';
import { config } from './config.js';

async function handleLocal(req, res, sessionId) {
  const result = await callOllama(req, res.locals);

  if (!result.ok) {
    return res.status(result.status ?? 502).json({ error: result.error, provider: 'ollama' });
  }

  const streaming    = req.body.stream !== false;
  const usage        = await pipeResponseAndCapture(result.response, res, streaming);
  const inputTokens  = usage.inputTokens  || res.locals.rawInputWordCount || 0;
  const outputTokens = usage.outputTokens || 0;

  res.locals.lastOutputTokens = outputTokens;
  recordLocalCost({ sessionId, inputTokens, outputTokens });

  console.info(
    `[cost] session=${sessionId ?? '_global'} provider=ollama model=${config.ollamaModel} ` +
    `in=${inputTokens} out=${outputTokens} cost=$0`
  );
}

async function handleRemote(req, res, sessionId) {
  const { routeResult, metrics } = res.locals;
  const modelId = routeResult.model ?? config.defaultRemoteModel;

  const result = await withRetry(() => callOpenRouter(req, res.locals, modelId), 'openrouter');

  if (!result.ok) {
    return res.status(result.status ?? 502).json({
      error: result.error,
      provider: 'openrouter',
      model: modelId,
    });
  }

  const streaming    = req.body.stream !== false;
  const usage        = await pipeResponseAndCapture(result.response, res, streaming);

  const sentTokens       = usage.inputTokens  || metrics?.tokens?.compressed || 0;
  const rawWordsOriginal = res.locals.rawInputWordCount || 1;
  const rawWordsSent     = metrics?.tokens?.compressed  || rawWordsOriginal;
  const originalTokens   = Math.round(sentTokens * (rawWordsOriginal / rawWordsSent));

  res.locals.lastOutputTokens = usage.outputTokens || 0;

  recordCost({
    sessionId,
    model: modelId,
    intendedModel: modelId,
    originalTokens,
    sentTokens,
    outputTokens: usage.outputTokens,
  });

  console.info(
    `[cost] session=${sessionId ?? '_global'} provider=openrouter ` +
    `model=${modelId} source=${routeResult.source ?? '?'} ` +
    `in=${sentTokens}/${originalTokens} out=${usage.outputTokens}`
  );
}

export async function proxyMiddleware(req, res, next) {
  if (req.headers['x-router-debug'] === 'true') return next();

  const { routeResult } = res.locals;
  const sessionId = String(req.headers['x-context-id'] || '').trim() || null;

  if (routeResult?.target === 'local')  return handleLocal(req, res, sessionId);
  if (routeResult?.target === 'remote') return handleRemote(req, res, sessionId);

  next();
}
