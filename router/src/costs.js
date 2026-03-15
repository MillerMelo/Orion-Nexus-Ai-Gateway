import { config } from './config.js';

// Pricing in USD per 1M tokens
const MODEL_PRICING = {
  'claude-opus-4-6':              { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':            { input:  3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022':   { input:  3.00, output: 15.00 },
  'claude-3-5-sonnet':            { input:  3.00, output: 15.00 },
  'claude-3-5-haiku':             { input:  0.80, output:  4.00 },
  'claude-3-haiku':               { input:  0.25, output:  1.25 },
  'gpt-4o':                       { input:  2.50, output: 10.00 },
  'gpt-4o-mini':                  { input:  0.15, output:  0.60 },
  'gpt-4-turbo':                  { input: 10.00, output: 30.00 },
  'gemini-1.5-pro':               { input:  1.25, output:  5.00 },
  'gemini-1.5-flash':             { input:  0.075, output: 0.30 },
};

// Map each configured provider to its cheapest available model
const PROVIDER_CHEAPEST = {
  claude: 'claude-3-haiku',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};

const DEFAULT_PRICING = { input: 3.00, output: 15.00 };

const sessions = new Map();

function normalizeModel(model = '') {
  return model.toLowerCase().replace(/\./g, '-');
}

function getPricing(model = '') {
  const normalized = normalizeModel(model);
  if (MODEL_PRICING[normalized]) return MODEL_PRICING[normalized];
  const key = Object.keys(MODEL_PRICING).find((k) => normalized.startsWith(k));
  return key ? MODEL_PRICING[key] : DEFAULT_PRICING;
}

function usd(tokens, pricePerMillion) {
  return (tokens / 1_000_000) * pricePerMillion;
}

// Returns the cheapest model among providers that have API keys configured
export function cheapestConfiguredModel() {
  const candidates = [];

  if (config.claudeApiKey) candidates.push(PROVIDER_CHEAPEST.claude);
  if (config.openaiApiKey) candidates.push(PROVIDER_CHEAPEST.openai);
  if (config.geminiApiKey) candidates.push(PROVIDER_CHEAPEST.gemini);

  if (!candidates.length) return { model: 'gpt-4o-mini', pricing: MODEL_PRICING['gpt-4o-mini'] };

  return candidates.reduce((cheapest, model) => {
    const pricing = getPricing(model);
    return pricing.input < cheapest.pricing.input ? { model, pricing } : cheapest;
  }, { model: candidates[0], pricing: getPricing(candidates[0]) });
}

function accumulate(record, entry) {
  record.requests.push(entry);
  record.totals.originalTokens += entry.tokens.original;
  record.totals.sentTokens     += entry.tokens.sent;
  record.totals.outputTokens   += entry.tokens.output;
  record.totals.savedTokens    += entry.tokens.saved;
  record.totals.totalCost      += entry.costs.total;
  record.totals.savedCost      += entry.costs.saved;
  return entry;
}

function getOrCreateRecord(sessionId) {
  const key = sessionId || '_global';
  if (!sessions.has(key)) {
    sessions.set(key, {
      requests: [],
      totals: { originalTokens: 0, sentTokens: 0, outputTokens: 0, savedTokens: 0, totalCost: 0, savedCost: 0 },
    });
  }
  return { key, record: sessions.get(key) };
}

export function recordCost({ sessionId, model, intendedModel, originalTokens, sentTokens, outputTokens }) {
  intendedModel = intendedModel || model;
  const pricing = getPricing(model);

  const actualInputCost    = usd(sentTokens,     pricing.input);
  const originalInputCost  = usd(originalTokens, pricing.input);
  const outputCost         = usd(outputTokens,   pricing.output);
  const actualTotal        = actualInputCost + outputCost;
  const savedCost          = usd(originalTokens - sentTokens, pricing.input);

  const entry = {
    routing: 'remote',
    model:   { intended: intendedModel, actual: model },
    tokens:  { original: originalTokens, sent: sentTokens, output: outputTokens, saved: originalTokens - sentTokens },
    costs:   { input: actualInputCost, output: outputCost, total: actualTotal, saved: savedCost },
    recordedAt: new Date().toISOString(),
  };

  const { record } = getOrCreateRecord(sessionId);
  return accumulate(record, entry);
}

export function recordLocalCost({ sessionId, inputTokens, outputTokens = 0 }) {
  const { model: referenceModel, pricing } = cheapestConfiguredModel();

  // Actual cost is $0 — processed locally by Ollama
  // Saved cost = what it would have cost at the cheapest frontier model
  const estimatedInputCost  = usd(inputTokens,  pricing.input);
  const estimatedOutputCost = usd(outputTokens, pricing.output);
  const estimatedTotal      = estimatedInputCost + estimatedOutputCost;

  const entry = {
    routing: 'local',
    model:   { intended: 'local', actual: `ollama/${config.ollamaModel}`, reference: referenceModel },
    tokens:  { original: inputTokens, sent: inputTokens, output: outputTokens, saved: 0 },
    costs:   { input: 0, output: 0, total: 0, saved: estimatedTotal },
    recordedAt: new Date().toISOString(),
  };

  const { record } = getOrCreateRecord(sessionId);
  return accumulate(record, entry);
}

export function getSessionCosts(sessionId) {
  return sessions.get(sessionId ?? '_global') ?? null;
}

export function getAllCosts() {
  const result = {};
  for (const [key, value] of sessions.entries()) result[key] = value;
  return result;
}

export function clearSessionCosts(sessionId) {
  sessionId ? sessions.delete(sessionId) : sessions.clear();
}
