import { config } from '../config.js';
import { errorFromResponse } from '../retry.js';

const DEFAULT_MAX_TOKENS = 4096;

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
    model: config.groqDefaultModel,
    max_tokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    stream: streaming,
    messages: processed,
    ...(streaming && { stream_options: { include_usage: true } }),
  };
}

export async function callGroq(req, locals) {
  if (!config.groqApiKey) {
    return { ok: false, status: 500, error: 'GROQ_API_KEY not configured' };
  }

  const payload = buildPayload(req.body, locals.originalMessages, locals.compressedPrompt);

  try {
    const response = await fetch(`${config.groqBaseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return errorFromResponse(response);
    return { ok: true, response };
  } catch (err) {
    return { ok: false, status: 502, error: `Groq unreachable: ${err.message}` };
  }
}
