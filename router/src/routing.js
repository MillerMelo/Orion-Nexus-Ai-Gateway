import { classifyTarget } from './classifier.js';
import { cacheKeyForRequest, getCacheEntry, setCacheEntry } from './cache.js';
import { hasQuota } from './quota-tracker.js';

const QUOTA_GUARDED_PROVIDERS = new Set(['gemini', 'groq']);

export async function routingMiddleware(req, res, next) {
  // Classify on the original last user message so code blocks / file paths survive compression
  const prompt = res.locals.lastUserMessage || res.locals.compressedPrompt || '';
  const decision = classifyTarget(prompt);
  res.locals.routeDecision = decision;

  const key = cacheKeyForRequest(prompt);
  const cached = getCacheEntry(key);

  if (cached) {
    // Skip cache if the cached provider has since exhausted its quota
    const cachedProvider = cached.provider;
    const quotaStillValid = !QUOTA_GUARDED_PROVIDERS.has(cachedProvider) || hasQuota(cachedProvider);

    if (quotaStillValid) {
      res.locals.routeCacheHit = true;
      res.locals.routeResult = { ...cached, source: 'cache' };
      return next();
    }

    console.warn(`[routing] cache hit for ${cachedProvider} but quota exhausted — re-classifying`);
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
