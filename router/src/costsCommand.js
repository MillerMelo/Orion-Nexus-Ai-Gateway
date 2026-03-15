import { config } from './config.js';
import { getAllCosts, getSessionCosts, clearSessionCosts } from './costs.js';
import { getLastUserMessage } from './helpers.js';

const COSTS_CMD = process.env.COSTS_COMMAND_FLAG || '/costs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function bar(ratio, width = 24) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(a, b) {
  if (!b) return '—';
  return `${Math.round((a / b) * 100)}%`;
}

function usd(amount) {
  if (amount === 0) return '$0.00';
  if (amount < 0.000001) return '<$0.000001';
  if (amount < 0.01) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(4)}`;
}

function num(n) {
  return n?.toLocaleString('es') ?? '0';
}

// Aggregate multiple session records into one totals object
function aggregate(records) {
  const totals = { originalTokens: 0, sentTokens: 0, outputTokens: 0, savedTokens: 0, totalCost: 0, savedCost: 0 };
  let remoteRequests = 0;
  let localRequests = 0;
  const modelCount = {};

  for (const record of records) {
    totals.originalTokens += record.totals.originalTokens;
    totals.sentTokens     += record.totals.sentTokens;
    totals.outputTokens   += record.totals.outputTokens;
    totals.savedTokens    += record.totals.savedTokens;
    totals.totalCost      += record.totals.totalCost;
    totals.savedCost      += record.totals.savedCost;

    for (const req of record.requests) {
      if (req.routing === 'local') localRequests++;
      else {
        remoteRequests++;
        const m = req.model?.actual ?? 'unknown';
        modelCount[m] = (modelCount[m] || 0) + 1;
      }
    }
  }

  return { totals, remoteRequests, localRequests, modelCount };
}

// ── Visual builders ───────────────────────────────────────────────────────────

function renderSavingsBar(savedCost, totalIfUncompressed) {
  const ratio = totalIfUncompressed > 0 ? savedCost / totalIfUncompressed : 0;
  return `${bar(ratio)} ${pct(savedCost, totalIfUncompressed)} ahorrado`;
}

function renderTokenBar(sent, original) {
  const ratio = original > 0 ? sent / original : 1;
  return `${bar(ratio)} ${pct(sent, original)} del original`;
}

function renderGlobal() {
  const all = getAllCosts();
  const records = Object.values(all);

  if (!records.length) {
    return [
      '**Router · Costos**',
      '',
      'Aún no hay solicitudes registradas.',
      'Los costos se acumulan automáticamente con cada consulta.',
    ].join('\n');
  }

  const { totals, remoteRequests, localRequests, modelCount } = aggregate(records);
  const totalIfUncompressed = totals.totalCost + totals.savedCost;
  const totalRequests = remoteRequests + localRequests;

  const modelLines = Object.entries(modelCount)
    .sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `  · ${m}: ${c} req`)
    .join('\n');

  const lines = [
    '**Router · Resumen de Costos**',
    `_${totalRequests} solicitudes · ${Object.keys(all).length} sesión(es)_`,
    '',
    '**Distribución de solicitudes**',
    `  Remotas  ${bar(remoteRequests / totalRequests)} ${remoteRequests}`,
    `  Locales  ${bar(localRequests  / totalRequests)} ${localRequests} (gratis)`,
    '',
    '**Tokens**',
    `  Original  ${num(totals.originalTokens)} tokens`,
    `  Enviados  ${renderTokenBar(totals.sentTokens, totals.originalTokens)}`,
    `  Reducción ${num(totals.originalTokens - totals.sentTokens)} tokens menos enviados`,
    '',
    '**Costo real vs sin router**',
    `  Sin router  ${usd(totalIfUncompressed)}`,
    `  Con router  ${usd(totals.totalCost)}`,
    `  Ahorro      ${renderSavingsBar(totals.savedCost, totalIfUncompressed)}`,
    `  Local       ${usd(totals.savedCost)} adicional (Ollama gratis)`,
    '',
  ];

  if (modelLines) {
    lines.push('**Modelos utilizados**', modelLines, '');
  }

  lines.push(
    '───────────────────────────────',
    `💰 **Ahorro total estimado: ${usd(totals.savedCost)}**`,
    `💵 **Gasto real acumulado:  ${usd(totals.totalCost)}**`,
    '',
    `_Usa \`${COSTS_CMD} session\` para ver la sesión actual · \`${COSTS_CMD} top\` para ranking_`,
  );

  return lines.join('\n');
}

function renderSession(sessionId) {
  if (!sessionId) {
    return `**Router · Error**: no hay sesión activa (falta header \`x-context-id\`).`;
  }

  const record = getSessionCosts(sessionId);
  if (!record) {
    return `**Router · Costos de sesión \`${sessionId}\`**\n\nNo hay registros para esta sesión todavía.`;
  }

  const { totals, remoteRequests, localRequests, modelCount } = aggregate([record]);
  const totalIfUncompressed = totals.totalCost + totals.savedCost;
  const totalRequests = remoteRequests + localRequests;

  const reqLines = record.requests.slice(-5).reverse().map((r, i) => {
    const time = r.recordedAt?.slice(11, 16);
    const model = r.routing === 'local' ? 'ollama (local)' : r.model?.actual ?? '?';
    const cost = r.routing === 'local' ? '$0 (gratis)' : usd(r.costs?.total ?? 0);
    return `  [${i + 1}] ${time} · ${model} · ${cost}`;
  });

  const modelLines = Object.entries(modelCount)
    .map(([m, c]) => `  · ${m}: ${c}`)
    .join('\n');

  return [
    `**Router · Sesión \`${sessionId}\`**`,
    `_${totalRequests} solicitudes (${remoteRequests} remotas · ${localRequests} locales)_`,
    '',
    '**Tokens**',
    `  Original  ${num(totals.originalTokens)}`,
    `  Enviados  ${renderTokenBar(totals.sentTokens, totals.originalTokens)}`,
    '',
    '**Costo**',
    `  Sin router  ${usd(totalIfUncompressed)}`,
    `  Con router  ${usd(totals.totalCost)}`,
    `  Ahorro      ${renderSavingsBar(totals.savedCost, totalIfUncompressed)}`,
    '',
    modelLines ? `**Modelos**\n${modelLines}\n` : '',
    '**Últimas solicitudes**',
    ...reqLines,
    '',
    `💰 **Ahorro sesión: ${usd(totals.savedCost)}**`,
  ].filter((l) => l !== undefined).join('\n');
}

function renderTop() {
  const all = getAllCosts();
  const entries = Object.entries(all);

  if (!entries.length) return '**Router · Top sesiones**\n\nNo hay datos todavía.';

  const ranked = entries
    .map(([id, record]) => ({ id, ...aggregate([record]) }))
    .sort((a, b) => b.totals.savedCost - a.totals.savedCost)
    .slice(0, 8);

  const maxSaved = ranked[0]?.totals.savedCost || 1;

  const lines = ranked.map((s, i) => {
    const ratio = s.totals.savedCost / maxSaved;
    const req = s.totals.remoteRequests + s.totals.localRequests;
    return `${i + 1}. \`${s.id}\`\n   ${bar(ratio, 20)} ${usd(s.totals.savedCost)} · ${req} req`;
  });

  return [
    '**Router · Top sesiones por ahorro**',
    '',
    ...lines,
  ].join('\n');
}

function renderReset(sessionId) {
  if (sessionId) {
    clearSessionCosts(sessionId);
    return `**Router · Costos limpiados**\n\nContadores de la sesión \`${sessionId}\` reiniciados.`;
  }
  clearSessionCosts();
  return '**Router · Costos limpiados**\n\nTodos los contadores han sido reiniciados.';
}

// ── Command detection ─────────────────────────────────────────────────────────

function detectCostsCommand(req) {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const last = getLastUserMessage(messages).trim();
  if (!last.startsWith(COSTS_CMD)) return null;
  const args = last.slice(COSTS_CMD.length).trim().split(/\s+/).filter(Boolean);
  return { sub: args[0] || 'global', args: args.slice(1) };
}

function buildText(cmd, req) {
  const sessionId = String(req.headers?.['x-context-id'] || '').trim() || null;

  switch (cmd.sub) {
    case 'session': return renderSession(sessionId);
    case 'top':     return renderTop();
    case 'reset':   return renderReset(sessionId);
    default:        return renderGlobal();
  }
}

// ── Response format ───────────────────────────────────────────────────────────

function fakeClaudeResponse(text) {
  return {
    id: `msg_router_costs_${Date.now()}`,
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
    id: `chatcmpl-router-costs-${Date.now()}`,
    object: 'chat.completion',
    model: config.openaiDefaultModel || 'gpt-4o',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function costsCommandMiddleware(req, res, next) {
  const cmd = detectCostsCommand(req);
  if (!cmd) return next();
  const text = buildText(cmd, req);
  const payload = req.path === '/v1/chat/completions'
    ? fakeOpenAIResponse(text)
    : fakeClaudeResponse(text);
  return res.json(payload);
}
