import { config } from '../config.js';
import { errorFromResponse } from '../retry.js';

const DEFAULT_MAX_TOKENS = 4096;
const GEMINI_OPENAI_COMPAT_PATH = '/v1beta/openai/chat/completions';

function buildPayload(body, originalMessages, compressedPrompt) {
  const messages = Array.isArray(originalMessages) ? originalMessages : [];

  const processed = [...messages];
  const lastUserIdx = processed.map((m) => m.role).lastIndexOf('user');
  if (lastUserIdx >= 0) {
    processed[lastUserIdx] = { role: 'user', content: compressedPrompt };
  } else {
    processed.push({ role: 'user', content: compressedPrompt });
  }

  const streaming = body.stream !== false;
  return {
    model: config.geminiDefaultModel,
    max_tokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    stream: streaming,
    messages: processed,
    ...(streaming && { stream_options: { include_usage: true } }),
  };
}

export async function callGemini(req, locals) {
  if (!config.geminiApiKey) {
    return { ok: false, status: 500, error: 'GEMINI_API_KEY not configured' };
  }

  const payload = buildPayload(req.body, locals.originalMessages, locals.compressedPrompt);

  try {
    const response = await fetch(`${config.geminiBaseUrl}${GEMINI_OPENAI_COMPAT_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.geminiApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return errorFromResponse(response);
    return { ok: true, response };
  } catch (err) {
    return { ok: false, status: 502, error: `Gemini unreachable: ${err.message}` };
  }
}
