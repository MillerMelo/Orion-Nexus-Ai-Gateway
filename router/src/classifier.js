import { config } from './config.js';
import { countTokens } from './helpers.js';

const rules = [
  {
    name: 'contains_priority',
    test: (text) => /urgent|emergencia|prioridad/i.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  {
    name: 'contains_policy',
    test: (text) => /legal|contrato|cumplimiento/i.test(text),
    result: { target: 'remote', provider: 'gemini', model: 'gemini-1.5-pro' },
  },
  {
    name: 'contains_code',
    test: (text) => /```[\s\S]*?```/.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  {
    name: 'contains_file_path',
    test: (text) => /(?:^|\s)(\/[\w./-]+\.\w+|[\w-]+\/[\w./-]+\.\w+)/m.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  {
    name: 'contains_tool_result',
    test: (text) => /tool_result|tool_use|<tool_call>|"role"\s*:\s*"tool"/i.test(text),
    result: { target: 'remote', provider: 'claude', model: 'claude-3.5-sonnet' },
  },
  {
    name: 'contains_system_prompt',
    test: (text) => /^You are\b|^You have access\b/m.test(text),
    result: { target: 'remote', provider: 'default', model: config.defaultRemoteModel },
  },
];

export function classifyTarget(prompt) {
  const text = (prompt || '').trim();
  const tokenCount = countTokens(text);
  if (tokenCount === 0) {
    return { target: 'local', reason: 'empty_prompt' };
  }

  for (const rule of rules) {
    if (rule.test(text)) {
      return { ...rule.result, reason: rule.name, tokenCount };
    }
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
