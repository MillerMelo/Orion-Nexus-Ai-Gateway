import { config } from './config.js';
import { countTokens, gatherPromptFromBody, getLastUserMessage } from './helpers.js';
import { ollamaCompletion } from './ollamaClient.js';

function buildSummaryWindow(text, maxTokens) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxTokens) return text;
  const headSize = Math.floor(maxTokens * 0.7);
  const tailSize = maxTokens - headSize;
  const head = words.slice(0, headSize).join(' ');
  const tail = words.slice(-tailSize).join(' ');
  return `${head}\n[...]\n${tail}`;
}

function buildSummaryInstruction(text) {
  const window = buildSummaryWindow(text, config.summaryInputMaxTokens);
  return (
    'Resume el siguiente texto en no más de tres frases y subraya las acciones clave. ' +
    'Usa un tono claro y directo, sin repetir palabras enteras del original.\n\n' +
    'Texto:\n' +
    window
  );
}

export async function summaryMiddleware(req, res, next) {
  // Summarize only the last user message — this is what gets stored as cross-session memory.
  // Full conversation history is managed by the client (OpenCode); the summary captures intent.
  const messages = res.locals.originalMessages || [];
  const prompt = getLastUserMessage(messages) || res.locals.compressedPrompt || gatherPromptFromBody(req.body);
  if (!prompt || countTokens(prompt) < config.summaryTokenThreshold) {
    res.locals.semanticSummary = prompt || null;
    res.locals.summaryMetadata = { provider: 'ollama', ok: false, reason: 'below_threshold' };
    return next();
  }
  try {
    const instruction = buildSummaryInstruction(prompt);
    const result = await ollamaCompletion({ prompt: instruction, maxTokens: config.summaryOutputMaxTokens });
    res.locals.semanticSummary = result.text;
    res.locals.summaryMetadata = {
      provider: 'ollama',
      status: result.status,
      ok: result.ok,
      error: result.error,
    };
  } catch (error) {
    res.locals.semanticSummary = prompt;
    res.locals.summaryMetadata = {
      provider: 'ollama',
      ok: false,
      error: String(error),
    };
  }
  return next();
}
