import { classifyTarget } from './classifier/index.js';
import { cacheKeyForRequest, getCacheEntry, setCacheEntry } from './cache.js';

export async function routingMiddleware(req, res, next) {
  // Classify on the original last user message so code blocks / file paths survive compression
  const prompt = res.locals.lastUserMessage || res.locals.compressedPrompt || '';

  const key = cacheKeyForRequest(prompt);
  const cached = getCacheEntry(key);

  if (cached) {
    res.locals.routeCacheHit = true;
    res.locals.routeResult = { ...cached, source: 'cache' };
    return next();
  }

  const decision = await classifyTarget(prompt);
  res.locals.routeDecision = decision;

  const result = {
    target:      decision.target,
    model:       decision.model,
    reason:      decision.reason,
    source:      decision.source,
    confidence:  decision.confidence ?? null,
    category:    decision.category   ?? null,
    tokenCount:  decision.tokenCount ?? 0,
  };

  res.locals.routeResult   = result;
  res.locals.routeCacheHit = false;
  setCacheEntry(key, result);
  next();
}
