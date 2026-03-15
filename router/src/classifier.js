import { config } from './config.js';
import { countTokens } from './helpers.js';
import { hasQuota } from './quota-tracker.js';

// Capability matrix: ordered rules mapping prompt signals to best provider.
// Rules marked quotaGuarded skip to the next rule if that provider's daily quota is exhausted.
const rules = [
  // Urgent / high-stakes — always Claude (paid, never quota-skipped)
  {
    name: 'contains_priority',
    test: (text) => /urgent|emergencia|prioridad/i.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  // Legal / compliance — Gemini (strong at document reasoning)
  {
    name: 'contains_policy',
    test: (text) => /legal|contrato|cumplimiento/i.test(text),
    result: { target: 'remote', provider: 'gemini', model: 'gemini-1.5-pro', quotaGuarded: true },
  },
  // Code blocks — Claude (best multi-file code reasoning)
  {
    name: 'contains_code',
    test: (text) => /```[\s\S]*?```/.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  // File paths — Claude (file-system-aware tool use)
  {
    name: 'contains_file_path',
    test: (text) => /(?:^|\s)(\/[\w./-]+\.\w+|[\w-]+\/[\w./-]+\.\w+)/m.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  // Tool calls — Claude (native tool-use format)
  {
    name: 'contains_tool_result',
    test: (text) => /tool_result|tool_use|<tool_call>|"role"\s*:\s*"tool"/i.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  // Agentic system prompts — default remote
  {
    name: 'contains_system_prompt',
    test: (text) => /^You are\b|^You have access\b/m.test(text),
    result: { target: 'remote', provider: 'default', model: config.defaultRemoteModel },
  },
  // Translation — Gemini Flash (strong multilingual coverage)
  {
    name: 'contains_translation',
    test: (text) => /\btraduc|\btranslate|\btraduction|\bübersetz/i.test(text),
    result: { target: 'remote', provider: 'gemini', model: 'gemini-1.5-flash', quotaGuarded: true },
  },
  // Summarization — Groq Llama3 70B (fast inference, strong at compression tasks)
  {
    name: 'contains_summarize',
    test: (text) => /\b(summarize|summarise|resumen|zusammenfass)/i.test(text),
    result: { target: 'remote', provider: 'groq', model: 'llama3-70b-8192', quotaGuarded: true },
  },
  // Simple questions — Groq Llama3 8B (fastest, free, good for Q&A)
  {
    name: 'contains_question',
    test: (text) => /\?\s*$/.test(text),
    result: { target: 'remote', provider: 'groq', model: 'llama3-8b-8192', quotaGuarded: true },
  },
];

export function classifyTarget(prompt) {
  const text = (prompt || '').trim();
  const tokenCount = countTokens(text);
  if (tokenCount === 0) {
    return { target: 'local', reason: 'empty_prompt' };
  }

  for (const rule of rules) {
    if (!rule.test(text)) continue;

    const { quotaGuarded, ...result } = rule.result;

    // If this provider is quota-guarded and exhausted, skip to next matching rule.
    if (quotaGuarded && !hasQuota(result.provider)) {
      console.warn(`[classifier] quota exhausted for ${result.provider} — skipping rule ${rule.name}`);
      continue;
    }

    return { ...result, reason: rule.name, tokenCount };
  }

  if (tokenCount < config.localModelThreshold) {
    return { target: 'local', model: 'local-short-model', reason: 'below_threshold', tokenCount };
  }

  return {
    target: 'remote',
    provider: 'default',
    model: config.defaultRemoteModel,
    reason: 'default_remote',
    tokenCount,
  };
}
