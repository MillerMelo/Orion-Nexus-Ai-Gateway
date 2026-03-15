import { join, basename } from 'path';

// Patterns OpenCode uses to embed the project working directory in system prompts
const PATTERNS = [
  /<working-directory>\s*([^\s<]+)\s*<\/working-directory>/i,
  /working[_\s-]dir(?:ectory)?[:\s]+([^\n<"]+)/i,
  /cwd[:\s]+([^\n<"]+)/i,
  /current[_\s-]dir(?:ectory)?[:\s]+([^\n<"]+)/i,
  // absolute path anywhere in system text (last resort)
  /\b(\/(?:home|opt|srv|var|usr|root)\/[^\s<"']+)/,
];

function extractWorkingDir(text) {
  if (!text) return null;
  for (const pattern of PATTERNS) {
    const m = pattern.exec(text);
    if (m && m[1]) {
      const dir = m[1].trim();
      // Return basename as a clean session ID (e.g. "AI_Router")
      return basename(dir) || null;
    }
  }
  return null;
}

function gatherSystemText(body) {
  if (!body) return '';

  // Claude API format: body.system is a string or content block array
  if (typeof body.system === 'string') return body.system;
  if (Array.isArray(body.system)) {
    return body.system.map((b) => (typeof b === 'string' ? b : b.text || '')).join('\n');
  }

  // system message inside messages array
  if (Array.isArray(body.messages)) {
    const sys = body.messages.find((m) => m.role === 'system');
    if (sys) {
      if (typeof sys.content === 'string') return sys.content;
      if (Array.isArray(sys.content)) {
        return sys.content.map((b) => (typeof b === 'string' ? b : b.text || '')).join('\n');
      }
    }
  }

  return '';
}

/**
 * If x-context-id is absent, try to derive a session ID from the system prompt.
 * OpenCode embeds the working directory (project path) in its system prompt —
 * we extract the basename and use it as the session key.
 */
export function autoSessionMiddleware(req, res, next) {
  const existing = String(req.headers?.['x-context-id'] || '').trim();
  if (existing) return next(); // already set by client

  const systemText = gatherSystemText(req.body);
  const derived = extractWorkingDir(systemText);

  if (derived) {
    req.headers['x-context-id'] = derived;
    res.locals.autoSessionDerived = derived;
    console.info(`[session] auto-derived session id: "${derived}"`);
  }

  return next();
}
