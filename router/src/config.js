import dotenv from 'dotenv';

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  routerPort: toNumber(process.env.ROUTER_PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  ollamaUrl: process.env.OLLAMA_URL?.replace(/\/+$/, ''),
  ollamaApiKey: process.env.OLLAMA_API_KEY,
  ollamaModel: process.env.OLLAMA_MODEL || 'mistral',
  compressorTokenThreshold: toNumber(process.env.COMPRESSOR_TOKEN_THRESHOLD, 3000),
  summaryTokenThreshold: toNumber(process.env.SUMMARY_TOKEN_THRESHOLD, 100),
  summaryInputMaxTokens: toNumber(process.env.SUMMARY_INPUT_MAX_TOKENS, 300),
  summaryOutputMaxTokens: toNumber(process.env.SUMMARY_OUTPUT_MAX_TOKENS, 150),
  simulationCommandFlag: process.env.SIMULATION_COMMAND_FLAG || '/simulate',
  sessionCommandFlag: process.env.SESSION_COMMAND_FLAG || '/session',
  ollamaRequestTimeoutMs: toNumber(process.env.OLLAMA_REQUEST_TIMEOUT_MS, 120000),
  claudeApiKey: process.env.CLAUDE_API_KEY,
  claudeBaseUrl: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  openaiDefaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
  geminiApiKey: process.env.GEMINI_API_KEY,
  defaultRemoteModel: process.env.DEFAULT_REMOTE_MODEL || 'claude-3.5-sonnet',
  cacheTtlSeconds: toNumber(process.env.CACHE_TTL_SECONDS, 120),
  localModelThreshold: toNumber(process.env.LOCAL_MODEL_THRESHOLD, 800),
  contextHistoryLimit: toNumber(process.env.CONTEXT_HISTORY_LIMIT, 6),
  logLevel: process.env.LOG_LEVEL || 'info',
  rateLimitMaxRetries: toNumber(process.env.RATE_LIMIT_MAX_RETRIES, 3),
  rateLimitMaxWaitMs: toNumber(process.env.RATE_LIMIT_MAX_WAIT_MS, 60000),
  routerVersion: '0.1.0',
};
