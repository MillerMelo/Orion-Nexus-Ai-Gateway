// Decision store — persists routing decisions and quality signals (ADR-003, Capa B).
// Uses a JSON ring buffer (max N entries). SQLite migration planned for Phase 1.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';

let _cache = null; // in-memory list, loaded lazily
let _dirty = false;
let _flushTimer = null;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashPrompt(text) {
  // Simple non-cryptographic fingerprint for grouping similar prompts
  let h = 0;
  for (let i = 0; i < Math.min(text.length, 200); i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function load() {
  if (_cache !== null) return;
  try {
    const raw = await readFile(config.decisionStorePath, 'utf8');
    _cache = JSON.parse(raw);
    if (!Array.isArray(_cache)) _cache = [];
  } catch {
    _cache = [];
  }
}

async function flush() {
  if (!_dirty || _cache === null) return;
  try {
    await mkdir(dirname(config.decisionStorePath), { recursive: true });
    await writeFile(config.decisionStorePath, JSON.stringify(_cache, null, 2), 'utf8');
    _dirty = false;
  } catch (err) {
    console.warn('[classifier/store] flush failed:', err.message);
  }
}

function schedulFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    await flush();
  }, 2000); // debounce: write at most once every 2s
}

/**
 * Persists a new routing decision. Non-blocking — errors are swallowed.
 * @param {{ prompt, category, model, confidence, source, reason, tokenCount, signals }} decision
 * @returns {string} generated decision ID
 */
export async function saveDecision({ prompt = '', category, model, confidence, source, reason, tokenCount, signals = {} }) {
  try {
    await load();

    const id = generateId();
    const entry = {
      id,
      timestamp: Date.now(),
      promptHash: hashPrompt(prompt),
      category: category ?? 'unknown',
      model: model ?? 'unknown',
      confidence: confidence ?? null,
      source: source ?? 'rules',
      reason: reason ?? '',
      tokenCount: tokenCount ?? 0,
      signals,
    };

    _cache.push(entry);

    // Ring buffer: drop oldest entries beyond limit
    if (_cache.length > config.decisionStoreMaxEntries) {
      _cache.splice(0, _cache.length - config.decisionStoreMaxEntries);
    }

    _dirty = true;
    schedulFlush();

    return id;
  } catch (err) {
    console.warn('[classifier/store] saveDecision failed:', err.message);
    return null;
  }
}

/**
 * Returns all stored decisions. Used by GET /router/classifier/decisions.
 */
export async function getDecisions() {
  await load();
  return [...(_cache ?? [])];
}
