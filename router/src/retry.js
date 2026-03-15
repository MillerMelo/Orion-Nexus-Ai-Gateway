import { config } from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parses the wait time from rate-limit response headers.
 *
 * OpenAI sends:
 *   Retry-After: 30                         (seconds, integer)
 *   x-ratelimit-reset-tokens: "6m0s"        (duration string)
 *   x-ratelimit-reset-requests: "1m30s"
 *
 * Anthropic sends:
 *   Retry-After: 30                         (seconds, integer)
 *   anthropic-ratelimit-tokens-reset: "2026-03-15T12:00:30Z"  (ISO timestamp)
 *
 * Returns milliseconds to wait, or null if no header found.
 */
export function parseRetryAfterMs(headers) {
  // Standard header — both OpenAI and Anthropic send this
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }

  // OpenAI: "x-ratelimit-reset-tokens: 6m0s" — use tokens reset (usually the tighter limit)
  const resetTokens = headers.get('x-ratelimit-reset-tokens');
  if (resetTokens) {
    const ms = parseDurationString(resetTokens);
    if (ms !== null) return ms;
  }

  const resetRequests = headers.get('x-ratelimit-reset-requests');
  if (resetRequests) {
    const ms = parseDurationString(resetRequests);
    if (ms !== null) return ms;
  }

  // Anthropic: ISO timestamp — "anthropic-ratelimit-tokens-reset: 2026-03-15T12:00:30Z"
  const anthropicReset = headers.get('anthropic-ratelimit-tokens-reset')
    || headers.get('anthropic-ratelimit-requests-reset');
  if (anthropicReset) {
    const resetAt = Date.parse(anthropicReset);
    if (!isNaN(resetAt)) {
      const ms = resetAt - Date.now();
      if (ms > 0) return ms;
    }
  }

  return null;
}

/**
 * Parses OpenAI duration strings like "6m0s", "30s", "1m", "2m30s".
 * Returns milliseconds or null.
 */
function parseDurationString(str) {
  const match = str.trim().match(/^(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || (!match[1] && !match[2])) return null;
  const minutes = parseInt(match[1] || '0', 10);
  const seconds = parseInt(match[2] || '0', 10);
  return (minutes * 60 + seconds) * 1000;
}

/**
 * Wraps a fetch() response that is not ok, extracting retryAfterMs automatically.
 * Providers use this instead of manually calling parseRetryAfterMs.
 *
 * Usage in any provider:
 *   if (!response.ok) return errorFromResponse(response);
 *
 * @param {Response} response
 * @returns {Promise<{ok: false, status: number, error: string, retryAfterMs: number|null}>}
 */
export async function errorFromResponse(response) {
  const retryAfterMs = response.status === 429 ? parseRetryAfterMs(response.headers) : null;
  const error = await response.text().catch(() => '');
  return { ok: false, status: response.status, error, retryAfterMs };
}

/**
 * Wraps a provider call function with automatic retry on 429 rate-limit errors.
 *
 * The wrapped function must return { ok, status, retryAfterMs?, error? }.
 * Providers expose retryAfterMs by reading response headers before consuming the body.
 *
 * @param {() => Promise<{ok: boolean, status?: number, retryAfterMs?: number}>} fn
 * @param {string} label  Provider name for log prefixes
 * @returns {Promise<{ok: boolean, status?: number, error?: string, response?: Response}>}
 */
export async function withRetry(fn, label = 'provider') {
  const maxRetries = config.rateLimitMaxRetries;
  const maxWaitMs  = config.rateLimitMaxWaitMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();

    if (result.status !== 429 || attempt >= maxRetries) {
      return result;
    }

    // Determine wait time: honour Retry-After header, fall back to exponential backoff
    const headerWaitMs = result.retryAfterMs ?? null;
    const backoffMs    = Math.min(1000 * 2 ** attempt, 30_000); // 1s, 2s, 4s … 30s
    const waitMs       = Math.min(headerWaitMs ?? backoffMs, maxWaitMs);

    console.warn(
      `[retry] ${label} rate limited (429). ` +
      `Attempt ${attempt + 1}/${maxRetries}. ` +
      `Waiting ${(waitMs / 1000).toFixed(1)}s` +
      (headerWaitMs ? ' (from Retry-After header).' : ' (exponential backoff).')
    );

    await sleep(waitMs);
  }
}
