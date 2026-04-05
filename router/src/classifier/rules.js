// Fast-path regex rules for structurally unambiguous cases.
// These run before the semantic classifier to avoid Ollama latency
// on requests where the intent is deterministic from syntax alone.
//
// Rules are evaluated in order; first match wins.
// Return shape: { target, model, reason } or null if no match.

import { config } from '../config.js';

const TRIVIAL_RULES = [
  // Tool calls — structural format, must go to Claude (native tool-use)
  {
    name: 'contains_tool_result',
    test: (text) => /tool_result|tool_use|<tool_call>|"role"\s*:\s*"tool"/i.test(text),
    result: { target: 'remote', model: 'anthropic/claude-3.5-sonnet' },
  },
  // Urgent/emergency — always highest-capability model, never delayed
  {
    name: 'contains_priority',
    test: (text) => /\b(urgent[e]?|emergencia|prioridad|critical|crítico)\b/i.test(text),
    result: { target: 'remote', model: 'anthropic/claude-3.5-sonnet' },
  },
  // Code blocks — structural triple-backtick, code reasoning required
  {
    name: 'contains_code',
    test: (text) => /```[\s\S]*?```/.test(text),
    result: { target: 'remote', model: 'anthropic/claude-3.5-sonnet' },
  },
  // File paths — tool-use context, file-system-aware model needed
  {
    name: 'contains_file_path',
    test: (text) => /(?:^|\s)(\/[\w./-]+\.\w+|[\w-]+\/[\w./-]+\.\w+)/m.test(text),
    result: { target: 'remote', model: 'anthropic/claude-3.5-sonnet' },
  },
  // Agentic system prompts — delegate to default remote
  {
    name: 'contains_system_prompt',
    test: (text) => /^You are\b|^You have access\b/m.test(text),
    result: { target: 'remote', model: config.defaultRemoteModel },
  },
];

/**
 * Checks trivial rules. Returns { target, model, reason } or null.
 * @param {string} text
 */
export function checkTrivialRules(text) {
  for (const rule of TRIVIAL_RULES) {
    if (rule.test(text)) {
      return { ...rule.result, reason: rule.name };
    }
  }
  return null;
}
