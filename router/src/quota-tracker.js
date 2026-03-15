import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let state = { date: currentUtcDate(), providers: {} };
let writeTimer = null;

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function maybeRollover() {
  const today = currentUtcDate();
  if (state.date !== today) {
    state = { date: today, providers: {} };
  }
}

function ensureProvider(name) {
  if (!state.providers[name]) {
    state.providers[name] = { tokensUsed: 0, requestCount: 0 };
  }
}

function getLimitForProvider(name) {
  if (name === 'groq')   return config.groqDailyTokenLimit   || Infinity;
  if (name === 'gemini') return config.geminiDailyTokenLimit || Infinity;
  return Infinity;
}

// Returns true if provider has quota remaining. Synchronous — safe to call in hot path.
export function hasQuota(providerName) {
  maybeRollover();
  const limit = getLimitForProvider(providerName);
  if (!limit || limit === Infinity) return true;
  ensureProvider(providerName);
  return state.providers[providerName].tokensUsed < limit;
}

// Records tokens consumed after a provider call. Fire-and-forget disk write.
export function recordUsage(providerName, inputTokens, outputTokens) {
  maybeRollover();
  ensureProvider(providerName);
  state.providers[providerName].tokensUsed  += (inputTokens + outputTokens);
  state.providers[providerName].requestCount += 1;
  schedulePersist();
}

function schedulePersist() {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    await persistToDisk();
  }, 500);
}

async function persistToDisk() {
  try {
    const dir = path.dirname(path.resolve(config.quotaTrackerPath));
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      path.resolve(config.quotaTrackerPath),
      JSON.stringify(state, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn(`[quota] failed to persist state: ${err.message}`);
  }
}

// Load persisted state from disk. Call once at startup.
export async function loadQuota() {
  try {
    const dir = path.dirname(path.resolve(config.quotaTrackerPath));
    await fs.promises.mkdir(dir, { recursive: true });
    const raw = await fs.promises.readFile(path.resolve(config.quotaTrackerPath), 'utf8');
    const loaded = JSON.parse(raw);
    if (loaded.date === currentUtcDate()) {
      state = loaded;
      console.info(`[quota] loaded — date=${state.date} providers=${Object.keys(state.providers).join(',') || 'none'}`);
    } else {
      state = { date: currentUtcDate(), providers: {} };
      console.info('[quota] stale data from previous day — counters reset');
      await persistToDisk();
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[quota] load error (starting fresh): ${err.message}`);
    }
  }
}

// Returns a deep-cloned snapshot of current state (for /router/quota endpoint).
export function getQuotaSnapshot() {
  maybeRollover();
  const snap = JSON.parse(JSON.stringify(state));
  // Annotate with limits for convenience
  for (const name of Object.keys(snap.providers)) {
    snap.providers[name].limit = getLimitForProvider(name);
    snap.providers[name].remaining = Math.max(
      0,
      getLimitForProvider(name) - snap.providers[name].tokensUsed
    );
  }
  return snap;
}

// Force flush in-memory state to disk. Used in tests and graceful shutdown.
export async function flushQuota() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  await persistToDisk();
}
