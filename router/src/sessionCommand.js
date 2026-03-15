import { config } from './config.js';
import {
  getContextEntries, getSessionTitle, setSessionTitle,
  listSessions, searchSessions, clearContext, contextKey,
} from './contextStore.js';
import { getLastUserMessage } from './helpers.js';

const SESSION_CMD = process.env.SESSION_COMMAND_FLAG || '/session';

// ── Command detection ─────────────────────────────────────────────────────────

function detectSessionCommand(req) {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const last = getLastUserMessage(messages).trim();
  if (!last.startsWith(SESSION_CMD)) return null;
  const args = last.slice(SESSION_CMD.length).trim().split(/\s+/).filter(Boolean);
  return { sub: args[0] || 'info', args: args.slice(1) };
}

// ── Text builders ─────────────────────────────────────────────────────────────

function formatEntries(entries) {
  return entries
    .map((e, i) => `  [${i + 1}] ${e.recordedAt?.slice(0, 16).replace('T', ' ')} — ${e.semanticSummary}`)
    .join('\n');
}

function buildText(cmd, req) {
  const currentId = String(req.headers?.['x-context-id'] || '').trim() || null;
  const currentKey = currentId ? contextKey(currentId) : null;

  switch (cmd.sub) {

    case 'list': {
      const sessions = listSessions();
      if (!sessions.length) return '**Router · Sesiones**\n\nNo hay sesiones registradas todavía.';
      const lines = sessions.map((s) => {
        const active = s.id === currentId ? ' ◀ actual' : '';
        const date = s.lastActivity?.slice(0, 16).replace('T', ' ') ?? '—';
        return `• **${s.title}**${active}\n  ID: \`${s.id}\` · ${s.turns} turno(s) · ${date}\n  ${s.preview}`;
      });
      return `**Router · Sesiones disponibles (${sessions.length})**\n\n${lines.join('\n\n')}\n\n_Para retomar una sesión usa \`x-context-id: <id>\` en tu cliente._`;
    }

    case 'search': {
      const query = cmd.args.join(' ');
      if (!query) return `**Router · Búsqueda de sesiones**\n\nUso: \`${SESSION_CMD} search <término>\``;
      const results = searchSessions(query);
      if (!results.length) return `**Router · Búsqueda: "${query}"**\n\nNo se encontraron sesiones con ese término.`;
      const lines = results.map((s) => {
        const date = s.lastActivity?.slice(0, 16).replace('T', ' ') ?? '—';
        const excerpts = s.matchingTurns.slice(0, 2).map((t) => `  → _${t}_`).join('\n');
        return `• **${s.title}** (\`${s.id}\`) · ${s.matches} coincidencia(s) · ${date}\n${excerpts}`;
      });
      return `**Router · Resultados para "${query}"**\n\n${lines.join('\n\n')}`;
    }

    case 'rename': {
      if (!currentKey) return '**Router · Error**: no hay sesión activa (falta header `x-context-id`).';
      const newTitle = cmd.args.join(' ');
      if (!newTitle) return `**Router · Rename**\n\nUso: \`${SESSION_CMD} rename <nuevo título>\``;
      setSessionTitle(currentKey, newTitle);
      return `**Router · Sesión renombrada**\n\n\`${currentId}\` ahora se llama **${newTitle}**.`;
    }

    case 'clear': {
      if (!currentKey) return '**Router · Error**: no hay sesión activa (falta header `x-context-id`).';
      const title = getSessionTitle(currentKey) ?? currentId;
      clearContext(currentKey);
      return `**Router · Sesión limpiada**\n\nEl historial de **${title}** (\`${currentId}\`) ha sido eliminado.`;
    }

    case 'info':
    default: {
      if (!currentId) {
        return [
          '**Router · Sin sesión activa**',
          '',
          'No se encontró el header `x-context-id` en esta solicitud.',
          'Para activar el contexto persistente agrega el header en la configuración de tu cliente:',
          '```',
          'x-context-id: mi-proyecto',
          '```',
          '',
          '**Comandos disponibles:**',
          `\`${SESSION_CMD}\` — estado de la sesión actual`,
          `\`${SESSION_CMD} list\` — listar todas las sesiones`,
          `\`${SESSION_CMD} search <término>\` — buscar sesiones por tema`,
          `\`${SESSION_CMD} rename <título>\` — renombrar la sesión actual`,
          `\`${SESSION_CMD} clear\` — limpiar historial de la sesión actual`,
        ].join('\n');
      }

      const entries = getContextEntries(currentKey);
      const title = getSessionTitle(currentKey) ?? '(generando título…)';
      return [
        `**Router · Sesión activa**`,
        `Nombre: **${title}**`,
        `ID: \`${currentId}\` · ${entries.length}/${config.contextHistoryLimit} turnos almacenados`,
        '',
        entries.length
          ? `**Historial:**\n${formatEntries(entries)}`
          : '_Sin historial aún — se acumula automáticamente mientras conversas._',
        '',
        '**Comandos:**',
        `\`${SESSION_CMD} list\` · \`${SESSION_CMD} search <tema>\` · \`${SESSION_CMD} rename <título>\` · \`${SESSION_CMD} clear\``,
      ].join('\n');
    }
  }
}

// ── Response format ───────────────────────────────────────────────────────────

function fakeClaudeResponse(text) {
  return {
    id: `msg_router_session_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: config.defaultRemoteModel,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: text.split(/\s+/).length },
  };
}

function fakeOpenAIResponse(text) {
  return {
    id: `chatcmpl-router-session-${Date.now()}`,
    object: 'chat.completion',
    model: config.openaiDefaultModel || 'gpt-4o',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: text.split(/\s+/).length, total_tokens: text.split(/\s+/).length },
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function sessionCommandMiddleware(req, res, next) {
  const cmd = detectSessionCommand(req);
  if (!cmd) return next();
  const text = buildText(cmd, req);
  const payload = req.path === '/v1/chat/completions'
    ? fakeOpenAIResponse(text)
    : fakeClaudeResponse(text);
  return res.json(payload);
}
