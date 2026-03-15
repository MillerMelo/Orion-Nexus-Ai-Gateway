import { config } from '../config.js';
import { errorFromResponse } from '../retry.js';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

function buildPayload(body, originalMessages, compressedPrompt) {
  const messages = Array.isArray(originalMessages) ? originalMessages : [];
  const systemEntry = messages.find((m) => m.role === 'system');
  // Prefer body.system (Claude API format used by OpenCode) over system found inside messages
  const systemContent = body.system || systemEntry?.content;
  const conversationMsgs = messages.filter((m) => m.role !== 'system');

  const processed = [...conversationMsgs];
  const lastUserIdx = processed.map((m) => m.role).lastIndexOf('user');
  if (lastUserIdx >= 0) {
    processed[lastUserIdx] = { role: 'user', content: compressedPrompt };
  } else {
    processed.push({ role: 'user', content: compressedPrompt });
  }

  return {
    model: body.model || config.defaultRemoteModel,
    max_tokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    stream: body.stream !== false,
    messages: processed,
    ...(systemContent && { system: systemContent }),
  };
}

export async function callClaude(req, locals) {
  if (!config.claudeApiKey) {
    return { ok: false, status: 500, error: 'CLAUDE_API_KEY not configured' };
  }

  const payload = buildPayload(req.body, locals.originalMessages, locals.compressedPrompt);

  try {
    const response = await fetch(`${config.claudeBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.claudeApiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return errorFromResponse(response);

    return { ok: true, response };
  } catch (err) {
    return { ok: false, status: 502, error: `Claude unreachable: ${err.message}` };
  }
}
