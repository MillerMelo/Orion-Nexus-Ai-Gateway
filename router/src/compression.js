import { config } from './config.js';
import { countTokens, gatherPromptFromBody, getLastUserMessage } from './helpers.js';
import { ollamaCompletion } from './ollamaClient.js';

export async function compressionMiddleware(req, res, next) {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  res.locals.originalMessages = [...messages];

  // Full conversation text — used only for token counting (cost baseline) and debug output
  const fullText = gatherPromptFromBody(req.body);
  res.locals.originalPrompt = fullText;
  res.locals.rawInputWordCount = countTokens(fullText);

  // Compression targets only the last user message
  // Multi-turn conversations are never compressed — structure must be preserved
  const lastUserText = getLastUserMessage(messages) || fullText;
  // Saved separately so the classifier always sees original text (code blocks, file paths, etc.)
  res.locals.lastUserMessage = lastUserText;
  const isMultiTurn = messages.filter((m) => m.role === 'user').length > 1;

  if (isMultiTurn) {
    res.locals.compressedPrompt = lastUserText;
    res.locals.compressorMetadata = {
      reason: 'multi_turn',
      tokenCount: countTokens(lastUserText),
    };
    return next();
  }

  const tokenCount = countTokens(lastUserText);
  if (tokenCount < config.compressorTokenThreshold) {
    res.locals.compressedPrompt = lastUserText;
    res.locals.compressorMetadata = {
      reason: 'below_threshold',
      tokenCount,
      threshold: config.compressorTokenThreshold,
    };
    return next();
  }

  try {
    const result = await ollamaCompletion({ prompt: lastUserText, maxTokens: 0 });
    res.locals.compressedPrompt = result.ok ? result.text : lastUserText;
    res.locals.compressorMetadata = {
      source: 'ollama',
      status: result.status,
      ok: result.ok,
      reason: result.ok ? 'compressed' : 'ollama_error',
      error: result.error,
      tokenCount,
      threshold: config.compressorTokenThreshold,
    };
  } catch (error) {
    res.locals.compressedPrompt = lastUserText;
    res.locals.compressorMetadata = { reason: 'compression_failed', error: String(error) };
  }

  return next();
}
