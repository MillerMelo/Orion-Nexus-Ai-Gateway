export const PHASES = ['normalize', 'compress', 'select', 'route'];

export function gatherPromptFromBody(body = {}) {
  if (!body) return '';
  if (typeof body.prompt === 'string' && body.prompt.trim()) {
    return body.prompt.trim();
  }
  if (typeof body.input === 'string' && body.input.trim()) {
    return body.input.trim();
  }
  const parts = [];
  // Claude API: system is a separate top-level field
  if (typeof body.system === 'string' && body.system.trim()) {
    parts.push(body.system.trim());
  }
  if (Array.isArray(body.messages) && body.messages.length) {
    parts.push(
      ...body.messages.map((msg) => extractMessageContent(msg)).filter(Boolean)
    );
  }
  return parts.join('\n').trim();
}

function extractMessageContent(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((chunk) => (typeof chunk === 'string' ? chunk : chunk.text || ''))
      .join('');
  }
  return '';
}

export function buildPromptSummary(text, maxLength = 320) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
}

export function countTokens(text = '') {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length)
    .length;
}

// Returns the content of the last user message in a messages array
export function getLastUserMessage(messages = []) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return extractMessageContent(messages[i]);
  }
  return '';
}

export function replaceBodyWithCompressed(body, compressed) {
  if (!body) return;
  if (typeof body.prompt === 'string') body.prompt = compressed;
  if (typeof body.input === 'string') body.input = compressed;
  // Do NOT flatten body.messages — providers reconstruct from res.locals.originalMessages
}

export function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizePhase(phase = 'full') {
  const lower = String(phase || 'full').toLowerCase();
  if (lower === 'full') return 'full';
  if (PHASES.includes(lower)) return lower;
  return 'full';
}
