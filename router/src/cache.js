import { config } from './config.js';

const cache = new Map();

function now() {
  return Date.now();
}

export function cacheKeyForRequest(prompt) {
  return `prompt:${prompt}`;
}

export function setCacheEntry(key, value, ttlSeconds = config.cacheTtlSeconds) {
  const expiresAt = now() + ttlSeconds * 1000;
  cache.set(key, { value, expiresAt });
}

export function getCacheEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function clearCache() {
  cache.clear();
}
