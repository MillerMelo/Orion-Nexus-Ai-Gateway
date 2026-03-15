# API Reference

El router expone los endpoints estándar de Claude y OpenAI (para compatibilidad de clientes) más endpoints propios para gestión.

## Headers globales

| Header | Descripción |
|--------|-------------|
| `x-context-id` | ID de sesión para contexto persistente. Si se omite, el router intenta derivarlo del system prompt. |
| `x-router-debug: true` | Saltea el proxy; devuelve el resultado de todas las fases del pipeline como metadata. |

---

## Endpoints de inferencia

### `POST /v1/messages`

Formato Anthropic. Compatible con OpenCode, Claude Code, y cualquier cliente que use el SDK oficial de Anthropic.

**Request:**
```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "stream": true,
  "system": "You are a senior software engineer...",
  "messages": [
    {"role": "user", "content": "Explica cómo funciona el middleware de compresión"}
  ]
}
```

**Response (formato Claude):**
```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [{"type": "text", "text": "El middleware de compresión..."}],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 42, "output_tokens": 215}
}
```

**Ejemplo curl:**
```bash
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-context-id: mi-proyecto" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "¿Qué es Docker?"}]
  }'
```

---

### `POST /v1/chat/completions`

Formato OpenAI. Compatible con cualquier cliente que use la API de OpenAI.

**Request:**
```json
{
  "model": "gpt-4o",
  "stream": false,
  "messages": [
    {"role": "system", "content": "Eres un asistente técnico."},
    {"role": "user", "content": "¿Cómo configuro un volumen en Docker?"}
  ]
}
```

**Response (formato OpenAI):**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "Para configurar un volumen..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 28, "completion_tokens": 94, "total_tokens": 122}
}
```

**Ejemplo curl:**
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-context-id: mi-proyecto" \
  -d '{
    "model": "gpt-4o",
    "stream": false,
    "messages": [{"role": "user", "content": "Hola, ¿qué hora es?"}]
  }'
```

---

## Endpoints del router

### `GET /health`

Comprueba que el servicio está activo.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "env": "development"
}
```

---

### `POST /router/simulate`

Ejecuta solo las fases de preprocesamiento (sin llamar a ningún LLM remoto) y devuelve el resultado de cada fase. Útil para depurar la compresión, clasificación y contexto.

**Request:**
```json
{
  "messages": [{"role": "user", "content": "Refactoriza el módulo de auth"}],
  "phase": "full"
}
```

**Response:**
```json
{
  "simulation": {
    "triggeredBy": "/simulate",
    "phase": "full",
    "timeline": [
      {"name": "normalize", "status": "simulated"},
      {"name": "compress",  "status": "simulated"},
      {"name": "select",    "status": "simulated"},
      {"name": "route",     "status": "simulated"}
    ],
    "promptSummary": "Refactoriza el módulo de auth",
    "tokenCount": 6,
    "routerVersion": "0.1.0"
  }
}
```

También se puede activar desde el chat enviando `/simulate` como mensaje.

---

### `GET /router/debug` (header)

Agrega `x-router-debug: true` a cualquier request para recibir el metadata completo del pipeline en lugar de la respuesta del LLM:

```bash
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-router-debug: true" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hola"}]
  }'
```

```json
{
  "handledBy": "router",
  "routerVersion": "0.1.0",
  "originalPrompt": "Hola",
  "compressorMetadata": {"reason": "below_threshold", "tokenCount": 1},
  "routeDecision": {"target": "local", "reason": "below_threshold", "tokenCount": 1},
  "routeResult": {"target": "local", "provider": "local"},
  "routeCacheHit": false,
  "semanticSummary": "Hola",
  "summaryMetadata": {"provider": "ollama", "ok": false, "reason": "below_threshold"},
  "contextId": "mi-proyecto",
  "messageCount": 1,
  "metrics": {
    "phases": {"normalize": 0, "compress": 1, "summary": 0, "route": 2},
    "tokens": {"original": 1, "compressed": 1, "saved": 0},
    "model": null,
    "provider": null,
    "totalMs": 5
  }
}
```

---

## Endpoints de contexto / sesiones

### `GET /router/context`

Lista todas las sesiones conocidas con título auto-generado y preview.

```bash
curl http://localhost:3000/router/context
```

```json
[
  {
    "id": "ai-router",
    "title": "Refactor middleware de autenticación",
    "turns": 4,
    "lastActivity": "2026-03-14T09:30:00.000Z",
    "preview": "El usuario quiere optimizar el pipeline de compresión y el clasificador"
  },
  {
    "id": "optifac",
    "title": "Migración microservicios Node a Go",
    "turns": 12,
    "lastActivity": "2026-03-13T17:45:00.000Z",
    "preview": "Análisis de la arquitectura actual antes de migrar el gateway"
  }
]
```

---

### `GET /router/context/search?q=<término>`

Busca sesiones por contenido de sus summaries.

```bash
curl "http://localhost:3000/router/context/search?q=autenticación"
```

```json
[
  {
    "id": "ai-router",
    "title": "Refactor middleware de autenticación",
    "turns": 4,
    "lastActivity": "2026-03-14T09:30:00.000Z",
    "matches": 3,
    "matchingTurns": [
      "El usuario quiere refactorizar el middleware JWT de autenticación",
      "Revisión de tokens de refresco y manejo de sesiones expiradas"
    ]
  }
]
```

---

### `GET /router/context/:id`

Devuelve el historial completo de una sesión.

```bash
curl http://localhost:3000/router/context/ai-router
```

```json
{
  "contextId": "ai-router",
  "turns": 2,
  "entries": [
    {
      "semanticSummary": "El usuario quiere refactorizar el middleware JWT",
      "tokenCount": 87,
      "recordedAt": "2026-03-14T09:15:00.000Z"
    },
    {
      "semanticSummary": "Implementación de refresh tokens y manejo de expiración",
      "tokenCount": 134,
      "recordedAt": "2026-03-14T09:30:00.000Z"
    }
  ]
}
```

---

### `DELETE /router/context/:id`

Elimina una sesión de memoria y disco.

```bash
curl -X DELETE http://localhost:3000/router/context/ai-router
```

```json
{"cleared": "ai-router"}
```

---

## Endpoints de costos

### `GET /router/costs`

Totales globales de todas las sesiones.

```bash
curl http://localhost:3000/router/costs
```

```json
{
  "mi-proyecto": {
    "requests": [...],
    "totals": {
      "originalTokens": 45230,
      "sentTokens": 28140,
      "outputTokens": 12300,
      "savedTokens": 0,
      "totalCost": 0.1124,
      "savedCost": 0.0768
    }
  }
}
```

---

### `GET /router/costs/:sessionId`

Costos detallados de una sesión específica.

```bash
curl http://localhost:3000/router/costs/mi-proyecto
```

```json
{
  "sessionId": "mi-proyecto",
  "requests": [
    {
      "routing": "remote",
      "model": {"intended": "claude-sonnet-4-6", "actual": "gpt-4o"},
      "tokens": {"original": 619, "sent": 619, "output": 195, "saved": 0},
      "costs": {"input": 0.001548, "output": 0.00195, "total": 0.003498, "saved": 0.0},
      "recordedAt": "2026-03-14T10:00:00.000Z"
    },
    {
      "routing": "local",
      "model": {"intended": "local", "actual": "ollama/mistral", "reference": "gpt-4o-mini"},
      "tokens": {"original": 15, "sent": 15, "output": 514, "saved": 0},
      "costs": {"input": 0, "output": 0, "total": 0, "saved": 0.000311},
      "recordedAt": "2026-03-14T10:05:00.000Z"
    }
  ],
  "totals": {
    "originalTokens": 634,
    "sentTokens": 634,
    "outputTokens": 709,
    "savedTokens": 0,
    "totalCost": 0.003498,
    "savedCost": 0.000311
  }
}
```

---

### `DELETE /router/costs/:sessionId`

Reinicia los contadores de una sesión.

```bash
curl -X DELETE http://localhost:3000/router/costs/mi-proyecto
```

```json
{"cleared": "mi-proyecto"}
```

---

### `DELETE /router/costs`

Reinicia todos los contadores.

```bash
curl -X DELETE http://localhost:3000/router/costs
```

```json
{"cleared": "all"}
```

---

## Comandos desde el chat

Estos comandos se envían como mensajes normales en OpenCode o cualquier cliente. El router los intercepta y responde sin llamar a ningún LLM (costo $0).

### Comandos de sesión

```
/session                  → Estado de la sesión actual e historial
/session list             → Lista todas las sesiones con títulos
/session search auth      → Busca sesiones por tema
/session rename <título>  → Renombra la sesión actual
/session clear            → Elimina el historial de la sesión actual
```

### Comandos de costos

```
/costs                    → Resumen global con barras visuales
/costs session            → Costos de la sesión actual
/costs top                → Ranking de sesiones por ahorro
/costs reset              → Reinicia contadores de la sesión actual
```

### Comando de simulación

```
/simulate                 → Ejecuta el pipeline completo y muestra metadata
/simulate phase=compress  → Ejecuta solo hasta la fase de compresión
```
