import { countTokens } from './helpers.js';
import { addContextEntry, buildContextHeader, clearContext, contextKey, getContextEntries, listSessions, searchSessions } from './contextStore.js';

const CONTEXT_HEADER = 'x-context-id';

// Injects the context header into the system message of originalMessages.
// Modifies the array in place so providers (claude.js, openai.js) pick it up automatically.
function injectIntoSystem(originalMessages, body, header) {
  const sysIdx = originalMessages.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    originalMessages[sysIdx] = {
      ...originalMessages[sysIdx],
      content: `${header}\n\n${originalMessages[sysIdx].content}`,
    };
  } else {
    originalMessages.unshift({ role: 'system', content: header });
  }
  // Also handle body.system for clients that send it as a separate field (e.g. Claude API format)
  if (typeof body.system === 'string') {
    body.system = `${header}\n\n${body.system}`;
  }
}

export function contextMiddleware(req, res, next) {
  const contextId = String(req.headers?.[CONTEXT_HEADER] || '').trim();
  if (!contextId) {
    res.locals.contextId = null;
    return next();
  }

  const key = contextKey(contextId);
  const originalMessages = res.locals.originalMessages || [];

  // Only inject cross-session memory at the start of a NEW conversation.
  // If the client (OpenCode) is already sending multi-turn history, it manages its own context.
  const userTurnCount = originalMessages.filter((m) => m.role === 'user').length;
  const isNewConversation = userTurnCount <= 1;

  const previousEntries = getContextEntries(key);
  if (previousEntries.length && isNewConversation) {
    const header = buildContextHeader(previousEntries);
    injectIntoSystem(originalMessages, req.body, header);
  }

  // Store the semantic summary of this turn for future sessions.
  // semanticSummary is set by summaryMiddleware (last user message summary).
  const semanticSummary = res.locals.semanticSummary;
  if (semanticSummary) {
    addContextEntry(key, {
      semanticSummary,
      tokenCount: countTokens(res.locals.originalPrompt || ''),
    });
  }

  res.locals.contextId = contextId;
  return next();
}

// GET /router/context — list all known sessions with preview
export function contextListHandler(_req, res) {
  return res.json(listSessions());
}

// GET /router/context/:id — full turn history for a session
export function contextRouteHandler(req, res) {
  const contextId = req.params.id;
  if (!contextId) return res.status(400).json({ error: 'context id missing' });
  const entries = getContextEntries(contextKey(contextId));
  return res.json({ contextId, turns: entries.length, entries });
}

// GET /router/context/search?q=auth — search sessions by topic
export function contextSearchHandler(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'query param "q" required' });
  return res.json(searchSessions(q));
}

// DELETE /router/context/:id — forget a session (memory + disk)
export function contextDeleteHandler(req, res) {
  const contextId = req.params.id;
  if (!contextId) return res.status(400).json({ error: 'context id missing' });
  clearContext(contextKey(contextId));
  return res.json({ cleared: contextId });
}
