import { classifyTarget } from './classifier.js';
import { cacheKeyForRequest, getCacheEntry, setCacheEntry } from './cache.js';

export async function routingMiddleware(req, res, next) {
  // Classify on the original last user message so code blocks / file paths survive compression
  const prompt = res.locals.lastUserMessage || res.locals.compressedPrompt || '';
  const decision = classifyTarget(prompt);
  res.locals.routeDecision = decision;

  const key = cacheKeyForRequest(prompt);
  const cached = getCacheEntry(key);

  if (cached) {
    res.locals.routeCacheHit = true;
    res.locals.routeResult = { ...cached, source: 'cache' };
    return next();
  }

  const result = {
    provider: decision.provider || (decision.target === 'local' ? 'local' : 'remote'),
    model: decision.model,
    reason: decision.reason,
    target: decision.target,
  };
  res.locals.routeResult = result;
  res.locals.routeCacheHit = false;
  setCacheEntry(key, result);
  next();
}
