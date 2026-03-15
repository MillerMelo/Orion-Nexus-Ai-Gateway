import { config } from '../config.js';

// Ollama exposes an OpenAI-compatible endpoint — we reuse the same format
const DEFAULT_MAX_TOKENS = 2048;

function buildPayload(body, originalMessages, compressedPrompt) {
  const messages = Array.isArray(originalMessages) ? originalMessages : [];

  const processed = [...messages];
  const lastUserIdx = processed.map((m) => m.role).lastIndexOf('user');
  if (lastUserIdx >= 0) {
    processed[lastUserIdx] = { role: 'user', content: compressedPrompt };
  } else {
    processed.push({ role: 'user', content: compressedPrompt });
  }

  return {
    model: config.ollamaModel,
    max_tokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    stream: body.stream !== false,
    messages: processed,
    ...(body.stream !== false && { stream_options: { include_usage: true } }),
  };
}

export async function callOllama(req, locals) {
  if (!config.ollamaUrl) {
    return { ok: false, status: 500, error: 'OLLAMA_URL not configured' };
  }

  const payload = buildPayload(req.body, locals.originalMessages, locals.compressedPrompt);
  const headers = { 'Content-Type': 'application/json' };
  if (config.ollamaApiKey) {
    headers.Authorization = `Bearer ${config.ollamaApiKey}`;
  }

  try {
    const response = await fetch(`${config.ollamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      return { ok: false, status: response.status, error };
    }

    return { ok: true, response };
  } catch (err) {
    return { ok: false, status: 502, error: `Ollama unreachable: ${err.message}` };
  }
}
