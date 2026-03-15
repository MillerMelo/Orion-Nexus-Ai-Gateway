import express from 'express';
import { config } from './config.js';
import { compressionMiddleware } from './compression.js';
import { simulationCommandMiddleware, buildSimulationPayload } from './simulation.js';
import { sessionCommandMiddleware } from './sessionCommand.js';
import { autoSessionMiddleware } from './autoSession.js';
import { costsCommandMiddleware } from './costsCommand.js';
import { countTokens, gatherPromptFromBody, normalizePhase } from './helpers.js';
import { routingMiddleware } from './routing.js';
import { contextMiddleware, contextRouteHandler, contextListHandler, contextDeleteHandler, contextSearchHandler } from './context.js';
import { summaryMiddleware } from './summary.js';
import { proxyMiddleware } from './proxy.js';
import { getAllCosts, getSessionCosts, clearSessionCosts, recordLocalCost } from './costs.js';
import { loadQuota, getQuotaSnapshot } from './quota-tracker.js';

function checkpoint(phase) {
  return (req, res, next) => {
    const now = Date.now();
    if (!res.locals.phaseTimings) res.locals.phaseTimings = {};
    const prev = res.locals._lastCheckpoint ?? res.locals.routerStartTime;
    res.locals.phaseTimings[phase] = now - prev;
    res.locals._lastCheckpoint = now;
    next();
  };
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.locals.routerStartTime = Date.now();
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: config.routerVersion,
    env: config.nodeEnv,
  });
});

app.post('/router/simulate', (req, res) => {
  const prompt = gatherPromptFromBody(req.body);
  const phase = normalizePhase(req.body?.phase || 'full');
  const context = Array.isArray(req.body?.context) ? req.body.context : [];
  const payload = buildSimulationPayload({ prompt, phase, context });
  res.json(payload);
});

function buildMetrics(req, res) {
  const originalTokens = countTokens(res.locals.originalPrompt || '');
  const compressedTokens = countTokens(res.locals.compressedPrompt || '');
  return {
    phases: res.locals.phaseTimings || {},
    tokens: {
      original: originalTokens,
      compressed: compressedTokens,
      saved: originalTokens - compressedTokens,
    },
    model: res.locals.routeResult?.model ?? null,
    provider: res.locals.routeResult?.provider ?? null,
    totalMs: Date.now() - res.locals.routerStartTime,
  };
}

function recordLocalCostIfNeeded(req, res, next) {
  if (res.locals.routeResult?.target === 'local') {
    const sessionId = String(req.headers['x-context-id'] || '').trim() || null;
    const inputTokens = res.locals.rawInputWordCount || res.locals.metrics?.tokens?.original || 0;
    recordLocalCost({ sessionId, inputTokens });
  }
  next();
}

function finalizeRouterResponse(req, res) {
  const messageCount = Array.isArray(req.body.messages) ? req.body.messages.length : 0;
  const compressed = res.locals.compressorMetadata?.reason === 'compressed';
  res.json({
    handledBy: 'router',
    routerVersion: config.routerVersion,
    routerEnv: config.nodeEnv,
    originalPrompt: res.locals.originalPrompt,
    ...(compressed && { compressedPrompt: res.locals.compressedPrompt }),
    compressorMetadata: res.locals.compressorMetadata,
    routeDecision: res.locals.routeDecision,
    routeResult: res.locals.routeResult,
    routeCacheHit: Boolean(res.locals.routeCacheHit),
    semanticSummary: res.locals.semanticSummary,
    summaryMetadata: res.locals.summaryMetadata,
    contextId: res.locals.contextId,
    messageCount,
    metrics: buildMetrics(req, res),
    timingMs: Date.now() - res.locals.routerStartTime,
  });
}

app.post(
  ['/v1/messages', '/v1/chat/completions'],
  autoSessionMiddleware,
  sessionCommandMiddleware,
  costsCommandMiddleware,
  simulationCommandMiddleware,
  checkpoint('normalize'),
  compressionMiddleware,
  checkpoint('compress'),
  summaryMiddleware,
  checkpoint('summary'),
  contextMiddleware,
  routingMiddleware,
  checkpoint('route'),
  proxyMiddleware,
  recordLocalCostIfNeeded,
  finalizeRouterResponse,
);

app.get('/router/context', contextListHandler);
app.get('/router/context/search', contextSearchHandler);
app.get('/router/context/:id', contextRouteHandler);
app.delete('/router/context/:id', contextDeleteHandler);

app.get('/router/costs', (_req, res) => res.json(getAllCosts()));

app.get('/router/costs/:sessionId', (req, res) => {
  const data = getSessionCosts(req.params.sessionId);
  if (!data) return res.status(404).json({ error: 'session not found' });
  return res.json({ sessionId: req.params.sessionId, ...data });
});

app.delete('/router/costs/:sessionId', (req, res) => {
  clearSessionCosts(req.params.sessionId);
  res.json({ cleared: req.params.sessionId });
});

app.delete('/router/costs', (_req, res) => {
  clearSessionCosts();
  res.json({ cleared: 'all' });
});

app.get('/router/quota', (_req, res) => res.json(getQuotaSnapshot()));

loadQuota().then(() => {
  app.listen(config.routerPort, () => {
    console.log(`router service listening on ${config.routerPort}`);
  });
});
