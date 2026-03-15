import { config } from './config.js';

const PATH = '/api/generate';

export async function ollamaCompletion({ prompt, model = config.ollamaModel, maxTokens = 0 }) {
  if (!config.ollamaUrl) {
    return { text: prompt, status: 0, ok: false, error: 'missing ollama url' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollamaRequestTimeoutMs);
  const headers = { 'Content-Type': 'application/json' };
  if (config.ollamaApiKey) {
    headers.Authorization = `Bearer ${config.ollamaApiKey}`;
  }
  const payload = {
    model,
    prompt,
    stream: false,
    options: {
      num_predict: maxTokens || 80,
      temperature: 0.2,
    },
  };
  try {
    const response = await fetch(`${config.ollamaUrl}${PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await response.json();
    const text = typeof json?.response === 'string' ? json.response.trim() : '';
    return {
      text: text || prompt,
      status: response.status,
      ok: response.ok && !!text,
    };
  } catch (error) {
    return { text: prompt, status: 0, ok: false, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
