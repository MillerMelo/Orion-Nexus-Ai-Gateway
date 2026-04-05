// Semantic classifier using a local Ollama model (ADR-003, Capa A).
// Uses /api/chat with format:"json" for reliable structured output.
// Target model: qwen2.5:3b or phi3:mini — fast, small, good at classification.

import { config } from '../config.js';

// Category → OpenRouter model ID mapping
const CATEGORY_MODEL = {
  code:          'anthropic/claude-3.5-sonnet',
  code_review:   'anthropic/claude-3.5-sonnet',
  debugging:     'anthropic/claude-3.5-sonnet',
  architecture:  'anthropic/claude-3.5-sonnet',
  creative:      'anthropic/claude-3.5-sonnet',
  legal:         'google/gemini-1.5-pro',
  document:      'google/gemini-1.5-pro',
  analysis:      'google/gemini-1.5-pro',
  translation:   'google/gemini-1.5-flash',
  summarization: 'meta-llama/llama-3-70b-instruct',
  question:      'meta-llama/llama-3-8b-instruct',
  conversation:  'meta-llama/llama-3-8b-instruct',
};

const SYSTEM_PROMPT = `You are a routing classifier for an AI assistant gateway. Analyze the user message and classify it.

Available categories and their best models:
- code: writing, generating, or explaining code → anthropic/claude-3.5-sonnet
- code_review: reviewing, improving, or auditing existing code → anthropic/claude-3.5-sonnet
- debugging: finding and fixing bugs or errors → anthropic/claude-3.5-sonnet
- architecture: system design, architecture, infrastructure decisions → anthropic/claude-3.5-sonnet
- creative: creative writing, stories, brainstorming → anthropic/claude-3.5-sonnet
- legal: legal documents, contracts, compliance, regulations → google/gemini-1.5-pro
- document: analyzing or processing long documents, reports, PDFs → google/gemini-1.5-pro
- analysis: data analysis, research, structured reasoning → google/gemini-1.5-pro
- translation: translating text between languages → google/gemini-1.5-flash
- summarization: summarizing or condensing text → meta-llama/llama-3-70b-instruct
- question: simple factual or knowledge question → meta-llama/llama-3-8b-instruct
- conversation: casual chat, greetings, small talk → meta-llama/llama-3-8b-instruct

Respond ONLY with valid JSON, no explanation:
{"category": "<category>", "confidence": <0.0-1.0>, "model": "<model_id>", "reason": "<10 words max>"}`;

/**
 * Classifies a prompt using Ollama structured output.
 * Returns { target, model, reason, confidence, category } or null on failure.
 * @param {string} text
 */
export async function classifySemantic(text) {
  if (!config.ollamaUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollamaRequestTimeoutMs);

  const headers = { 'Content-Type': 'application/json' };
  if (config.ollamaApiKey) {
    headers.Authorization = `Bearer ${config.ollamaApiKey}`;
  }

  const payload = {
    model: config.classifierModel,
    stream: false,
    format: 'json',
    options: { temperature: 0.1, num_predict: 80 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 1000) }, // cap input to keep latency low
    ],
  };

  try {
    const response = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const json = await response.json();
    const raw = json?.message?.content ?? '';
    const parsed = JSON.parse(raw);

    const { category, confidence, model, reason } = parsed;
    if (!category || typeof confidence !== 'number') return null;

    const resolvedModel = model || CATEGORY_MODEL[category] || config.defaultRemoteModel;

    return {
      target: 'remote',
      model: resolvedModel,
      reason: `semantic:${category}`,
      confidence,
      category,
      semanticReason: reason ?? '',
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
