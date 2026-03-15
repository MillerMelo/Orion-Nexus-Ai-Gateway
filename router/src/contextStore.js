import { config } from './config.js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// In-memory cache — always the source of truth during runtime
// Format: Map<key, { title: string|null, entries: Entry[] }>
const store = new Map();

const SESSIONS_DIR = process.env.CONTEXT_SESSIONS_DIR || '/data/sessions';

function ensureDir() {
  try { mkdirSync(SESSIONS_DIR, { recursive: true }); } catch { /* exists or no permission */ }
}

function sessionPath(key) {
  return join(SESSIONS_DIR, `${key.replace(':', '_')}.json`);
}

// ── Migration: old format was a plain Entry[] array ───────────────────────────

function normalizeRecord(raw) {
  if (Array.isArray(raw)) return { title: null, entries: raw };
  if (raw && Array.isArray(raw.entries)) return raw;
  return { title: null, entries: [] };
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

function persist(key, record) {
  try {
    ensureDir();
    writeFileSync(sessionPath(key), JSON.stringify(record, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

function loadFromDisk(key) {
  try {
    return normalizeRecord(JSON.parse(readFileSync(sessionPath(key), 'utf8')));
  } catch { return null; }
}

function loadAll() {
  try {
    ensureDir();
    const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(SESSIONS_DIR, file), 'utf8'));
        const key = file.replace('.json', '').replace('_', ':');
        store.set(key, normalizeRecord(raw));
      } catch { /* skip corrupt */ }
    }
    if (files.length) {
      console.info(`[context] loaded ${files.length} persisted session(s) from ${SESSIONS_DIR}`);
    }
  } catch { /* memory-only mode */ }
}

loadAll();

// ── Internal helpers ──────────────────────────────────────────────────────────

function getRecord(key) {
  if (store.has(key)) return store.get(key);
  const fromDisk = loadFromDisk(key);
  if (fromDisk) { store.set(key, fromDisk); return fromDisk; }
  return null;
}

function getOrCreate(key) {
  return getRecord(key) || { title: null, entries: [] };
}

// ── Auto-title generation (fire-and-forget via Ollama) ────────────────────────

async function generateTitle(key, semanticSummary) {
  try {
    const { ollamaCompletion } = await import('./ollamaClient.js');
    const prompt =
      'Genera un título de 4 a 6 palabras que describa esta tarea de programación. ' +
      'Responde SOLO el título, sin comillas, sin puntuación final, sin explicaciones.\n\n' +
      `Tarea: ${semanticSummary}`;
    const result = await ollamaCompletion({ prompt, maxTokens: 20 });
    if (!result.ok) return;
    const title = result.text.replace(/^["']|["']$/g, '').trim();
    if (!title) return;
    const record = getOrCreate(key);
    record.title = title;
    store.set(key, record);
    persist(key, record);
    console.info(`[context] auto-title for ${key}: "${title}"`);
  } catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function contextKey(id) {
  return `ctx:${id}`;
}

export function addContextEntry(key, { semanticSummary, tokenCount }) {
  const record = getOrCreate(key);
  const isFirst = record.entries.length === 0;

  record.entries.push({ semanticSummary, tokenCount, recordedAt: new Date().toISOString() });
  const maxLen = config.contextHistoryLimit || 10;
  if (record.entries.length > maxLen) record.entries.splice(0, record.entries.length - maxLen);

  store.set(key, record);
  persist(key, record);

  // Generate a human-readable title from the first turn (async, non-blocking)
  if (isFirst && semanticSummary) generateTitle(key, semanticSummary);
}

export function getContextEntries(key) {
  return getRecord(key)?.entries ?? [];
}

export function getSessionTitle(key) {
  return getRecord(key)?.title ?? null;
}

export function setSessionTitle(key, title) {
  const record = getOrCreate(key);
  record.title = title;
  store.set(key, record);
  persist(key, record);
}

export function listSessions() {
  const result = [];
  for (const [key, record] of store.entries()) {
    const id = key.replace(/^ctx:/, '');
    const last = record.entries[record.entries.length - 1];
    result.push({
      id,
      title: record.title ?? id,
      turns: record.entries.length,
      lastActivity: last?.recordedAt ?? null,
      preview: last?.semanticSummary?.slice(0, 120) ?? '',
    });
  }
  return result.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
}

export function searchSessions(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const results = [];
  for (const [key, record] of store.entries()) {
    const id = key.replace(/^ctx:/, '');
    const titleMatch = (record.title ?? '').toLowerCase().includes(q);
    const matchingEntries = record.entries.filter((e) =>
      e.semanticSummary?.toLowerCase().includes(q)
    );
    if (titleMatch || matchingEntries.length) {
      const last = record.entries[record.entries.length - 1];
      results.push({
        id,
        title: record.title ?? id,
        turns: record.entries.length,
        lastActivity: last?.recordedAt ?? null,
        matches: matchingEntries.length + (titleMatch ? 1 : 0),
        matchingTurns: matchingEntries.map((e) => e.semanticSummary?.slice(0, 120)),
      });
    }
  }
  return results.sort((a, b) => b.matches - a.matches);
}

export function buildContextHeader(entries) {
  if (!entries.length) return null;
  const lines = entries.map((e, i) => `[Turn ${i + 1}]: ${e.semanticSummary}`);
  return `Previous context (summarized):\n${lines.join('\n')}`;
}

export function clearContext(key) {
  if (key) {
    store.delete(key);
    try { unlinkSync(sessionPath(key)); } catch { /* already gone */ }
  } else {
    store.clear();
    try {
      const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
      for (const f of files) unlinkSync(join(SESSIONS_DIR, f));
    } catch { /* best effort */ }
  }
}
