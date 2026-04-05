// Feedback middleware — captures implicit quality signals after each response (ADR-003, Capa B).
// Attaches a 'finish' listener so it never blocks the response.

import { saveDecision } from './store.js';

/**
 * Express middleware. Must be placed BEFORE proxyMiddleware so it can
 * attach the finish listener early. Reads res.locals after response is sent.
 */
export function feedbackMiddleware(req, res, next) {
  const requestStart = res.locals.routerStartTime ?? Date.now();

  res.on('finish', () => {
    try {
      const routeResult = res.locals.routeResult;
      if (!routeResult) return;

      const prompt = res.locals.lastUserMessage || res.locals.originalPrompt || '';
      if (!prompt) return;

      const latencyMs = Date.now() - requestStart;
      const modelFailed = res.statusCode >= 500;

      // shortResponse: proxy answered but output was suspiciously small
      const outputTokens = res.locals.lastOutputTokens ?? null;
      const tokenCount = routeResult.tokenCount ?? 0;
      const shortResponse = outputTokens !== null && outputTokens < 15 && tokenCount > 80;

      saveDecision({
        prompt,
        category: routeResult.category ?? routeResult.reason ?? 'unknown',
        model: routeResult.model ?? 'unknown',
        confidence: routeResult.confidence ?? null,
        source: routeResult.source ?? 'rules',
        reason: routeResult.reason ?? '',
        tokenCount,
        signals: {
          latencyMs,
          modelFailed,
          shortResponse,
          statusCode: res.statusCode,
        },
      });
    } catch (_) {
      // feedback is non-critical — never propagate errors
    }
  });

  next();
}
