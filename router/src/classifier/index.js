// Classifier orchestrator (ADR-003).
// Flow: trivial rules (< 1ms) → semantic Ollama (~400ms) → default fallback
//
// Returns shape compatible with the existing routing pipeline:
// { target, model, reason, tokenCount, source, confidence?, category? }

import { config } from '../config.js';
import { countTokens } from '../helpers.js';
import { checkTrivialRules } from './rules.js';
import { classifySemantic } from './semantic.js';

/**
 * Classifies a prompt and returns a routing decision.
 * Async because the semantic path calls Ollama.
 * @param {string} prompt
 * @returns {Promise<{ target, model, reason, tokenCount, source, confidence?, category? }>}
 */
export async function classifyTarget(prompt) {
  const text = (prompt || '').trim();
  const tokenCount = countTokens(text);

  if (tokenCount === 0) {
    return { target: 'local', model: config.ollamaModel, reason: 'empty_prompt', tokenCount, source: 'rules' };
  }

  // ── 1. Fast-path: trivial structural rules ──────────────────────────────
  const ruleMatch = checkTrivialRules(text);
  if (ruleMatch) {
    return { ...ruleMatch, tokenCount, source: 'rules' };
  }

  // ── 2. Semantic classification via Ollama ───────────────────────────────
  const semanticResult = await classifySemantic(text);
  if (semanticResult && semanticResult.confidence >= config.classifierConfidenceThreshold) {
    return { ...semanticResult, tokenCount, source: 'semantic' };
  }

  if (semanticResult && semanticResult.confidence < config.classifierConfidenceThreshold) {
    console.debug(
      `[classifier] semantic confidence too low (${semanticResult.confidence.toFixed(2)}) ` +
      `for category "${semanticResult.category}" — falling back to default`
    );
  }

  // ── 3. Default fallback ─────────────────────────────────────────────────
  if (tokenCount < config.localModelThreshold) {
    return {
      target: 'local',
      model: config.ollamaModel,
      reason: 'below_threshold',
      tokenCount,
      source: 'default',
    };
  }

  return {
    target: 'remote',
    model: config.defaultRemoteModel,
    reason: 'default_remote',
    tokenCount,
    source: 'default',
  };
}
