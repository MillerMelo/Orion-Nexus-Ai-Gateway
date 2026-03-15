import { config } from './config.js';
import {
  PHASES,
  buildPromptSummary,
  countTokens,
  gatherPromptFromBody,
  normalizePhase,
} from './helpers.js';

const PHASE_PATTERN = /phase\s*=\s*(\w+)/i;

function parsePhaseFromText(text) {
  const match = PHASE_PATTERN.exec(text || '');
  if (match) {
    return normalizePhase(match[1]);
  }
  return 'full';
}

function timelineForPhase(phase) {
  const canonical = phase === 'full' ? PHASES[PHASES.length - 1] : phase;
  const phaseIndex = PHASES.indexOf(canonical);
  return PHASES.map((name, index) => ({
    name,
    status: phaseIndex < 0 ? 'pending' : index <= phaseIndex ? 'simulated' : 'pending',
  }));
}

function shouldSimulate(text) {
  const flag = config.simulationCommandFlag?.trim().toLowerCase();
  if (!flag) return false;
  if (!text) return false;
  return text.toLowerCase().includes(flag);
}

function phaseFromHeader(req) {
  const phaseValue = req.headers?.['x-router-phase'];
  if (!phaseValue) return null;
  const normalized = String(phaseValue || '').trim();
  if (!normalized) return null;
  return normalizePhase(normalized);
}

export function detectSimulationCommand(req) {
  const prompt = gatherPromptFromBody(req.body);
  const headerPhase = phaseFromHeader(req);
  if (headerPhase) {
    return {
      prompt,
      phase: headerPhase,
      triggeredBy: 'x-router-phase',
    };
  }
  if (!shouldSimulate(prompt)) return null;
  const phase = parsePhaseFromText(prompt);
  return {
    prompt,
    phase,
    triggeredBy: config.simulationCommandFlag,
  };
}

export function buildSimulationPayload({ prompt, phase = 'full', context = [], triggeredBy } = {}) {
  const normalizedPrompt = prompt || '';
  const timeline = timelineForPhase(phase);
  return {
    simulation: {
      triggeredBy: triggeredBy || config.simulationCommandFlag,
      phase,
      timeline,
      promptSummary: buildPromptSummary(normalizedPrompt),
      tokenCount: countTokens(normalizedPrompt),
      context: Array.isArray(context) ? context : [context].filter(Boolean),
      routerVersion: config.routerVersion,
      metadata: {
        flag: triggeredBy || config.simulationCommandFlag,
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

export function simulationCommandMiddleware(req, res, next) {
  const detection = detectSimulationCommand(req);
  if (!detection) return next();
  const payload = buildSimulationPayload({
    prompt: detection.prompt,
    phase: detection.phase,
    triggeredBy: detection.triggeredBy,
  });
  return res.json(payload);
}
