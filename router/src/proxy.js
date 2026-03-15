import { callClaude } from './providers/claude.js';
import { callOpenAI } from './providers/openai.js';
import { callOllama } from './providers/ollama.js';
import { callGemini } from './providers/gemini.js';
import { callGroq } from './providers/groq.js';
import { pipeResponseAndCapture } from './providers/stream.js';
import { recordCost, recordLocalCost } from './costs.js';
import { recordUsage } from './quota-tracker.js';
import { withRetry } from './retry.js';
import { config } from './config.js';

const PROVIDER_DEFAULT_MODEL = {
  claude: config.defaultRemoteModel,
  openai: config.openaiDefaultModel,
  ollama: config.ollamaModel,
  gemini: config.geminiDefaultModel,
  groq:   config.groqDefaultModel,
};

const PRIMARY = {
  claude: callClaude,
  openai: callOpenAI,
  gemini: callGemini,
  groq:   callGroq,
};

// Ordered fallback list per provider. First call that succeeds wins.
const FALLBACK_CHAIN = {
  claude:  [callGroq, callOpenAI],
  openai:  [],
  gemini:  [callGroq, callOpenAI],
  groq:    [callGemini, callOpenAI],
  default: [callGroq, callGemini, callOpenAI],
};

const PROVIDER_NAME_MAP = new Map([
  [callClaude, 'claude'],
  [callOpenAI, 'openai'],
  [callGemini, 'gemini'],
  [callGroq,   'groq'],
]);

const QUOTA_TRACKED = new Set(['gemini', 'groq']);

function getProviderName(fn) {
  return PROVIDER_NAME_MAP.get(fn) ?? 'unknown';
}

async function handleLocal(req, res, sessionId) {
  const result = await callOllama(req, res.locals);

  if (!result.ok) {
    return res.status(result.status ?? 502).json({ error: result.error, provider: 'ollama' });
  }

  const streaming    = req.body.stream !== false;
  const usage        = await pipeResponseAndCapture(result.response, res, streaming);
  const inputTokens  = usage.inputTokens  || res.locals.rawInputWordCount || 0;
  const outputTokens = usage.outputTokens || 0;

  recordLocalCost({ sessionId, inputTokens, outputTokens });

  console.info(
    `[cost] session=${sessionId ?? '_global'} provider=ollama model=${config.ollamaModel} ` +
    `in=${inputTokens} out=${outputTokens} cost=$0`
  );
}

async function handleRemote(req, res, sessionId) {
  const { routeResult, metrics } = res.locals;
  const providerName = routeResult.provider ?? 'default';
  const primaryCall  = PRIMARY[providerName] ?? callClaude;
  const fallbackList = FALLBACK_CHAIN[providerName] ?? FALLBACK_CHAIN.default;

  let result      = await withRetry(() => primaryCall(req, res.locals), providerName);
  let usedProvider = providerName;

  if (!result.ok) {
    const primaryError = result.error;
    console.warn(`[proxy] ${providerName} failed (${result.status}): ${primaryError}`);

    for (const fallbackCall of fallbackList) {
      const fallbackName = getProviderName(fallbackCall);
      console.warn(`[proxy] falling back to ${fallbackName}`);
      result = await withRetry(() => fallbackCall(req, res.locals), fallbackName);
      if (result.ok) {
        usedProvider = fallbackName;
        break;
      }
      console.warn(`[proxy] ${fallbackName} also failed (${result.status}): ${result.error}`);
    }

    if (!result.ok) {
      return res.status(result.status ?? 502).json({
        error: result.error,
        primaryError,
        provider: providerName,
        fallback: fallbackList.length > 0,
      });
    }
  }

  const streaming     = req.body.stream !== false;
  const intendedModel = routeResult.model ?? config.defaultRemoteModel;
  const actualModel   = PROVIDER_DEFAULT_MODEL[usedProvider] ?? intendedModel;

  const usage = await pipeResponseAndCapture(result.response, res, streaming);

  if (QUOTA_TRACKED.has(usedProvider)) {
    recordUsage(usedProvider, usage.inputTokens || 0, usage.outputTokens || 0);
  }

  const sentTokens       = usage.inputTokens || metrics?.tokens?.compressed || 0;
  const rawWordsOriginal = res.locals.rawInputWordCount || 1;
  const rawWordsSent     = metrics?.tokens?.compressed  || rawWordsOriginal;
  const originalTokens   = Math.round(sentTokens * (rawWordsOriginal / rawWordsSent));

  recordCost({ sessionId, model: actualModel, intendedModel, originalTokens, sentTokens, outputTokens: usage.outputTokens });

  console.info(
    `[cost] session=${sessionId ?? '_global'} provider=${usedProvider} ` +
    `model=${actualModel}${actualModel !== intendedModel ? ` (fallback from ${intendedModel})` : ''} ` +
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
