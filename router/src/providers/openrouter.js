import { config } from '../config.js';
import { errorFromResponse } from '../retry.js';

const DEFAULT_MAX_TOKENS = 4096;

function buildPayload(body, originalMessages, compressedPrompt, modelId) {
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
    model: modelId,
    max_tokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    stream: streaming,
    messages: processed,
    ...(streaming && { stream_options: { include_usage: true } }),
  };
}

export async function callOpenRouter(req, locals, modelId) {
  if (!config.openrouterApiKey) {
    return { ok: false, status: 500, error: 'OPENROUTER_API_KEY not configured' };
  }

  const model = modelId ?? config.defaultRemoteModel;
  const payload = buildPayload(req.body, locals.originalMessages, locals.compressedPrompt, model);

  try {
    const response = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openrouterApiKey}`,
        'HTTP-Referer': 'https://github.com/MillerMelo/Orion-Nexus-Ai-Gateway',
        'X-Title': 'ORION AI Router',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return errorFromResponse(response);

    return { ok: true, response };
  } catch (err) {
    return { ok: false, status: 502, error: `OpenRouter unreachable: ${err.message}` };
  }
}
