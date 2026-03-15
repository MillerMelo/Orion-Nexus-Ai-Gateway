# Arquitectura del AI Router

## Pipeline completo

Cada request que llega al router atraviesa estos pasos en orden:

```
POST /v1/messages  o  /v1/chat/completions
         │
         ▼
┌─────────────────────┐
│   autoSession       │  Si falta x-context-id, lo deriva del
│                     │  working directory en el system prompt
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  sessionCommand     │  Intercepta /session [list|search|rename|clear]
│  costsCommand       │  Intercepta /costs [session|top|reset]
│  simulationCommand  │  Intercepta /simulate [phase=X]
└────────┬────────────┘  → responde directamente, sin LLM
         ▼
┌─────────────────────┐
│   compression       │  Si el último mensaje del usuario > 3000 tokens
│                     │  → Ollama/Mistral lo comprime
│                     │  Conversaciones multi-turno: nunca se comprimen
└────────┬────────────┘
         ▼
┌─────────────────────┐
│     summary         │  Si el último mensaje > 100 tokens
│                     │  → Ollama/Mistral genera un resumen semántico
│                     │  → Se almacenará como memoria cross-session
└────────┬────────────┘
         ▼
┌─────────────────────┐
│     context         │  Si es inicio de conversación nueva (1 turno)
│                     │  y hay sesiones anteriores guardadas:
│                     │  → Inyecta summaries anteriores en el system prompt
│                     │  → Guarda el summary del turno actual en disco
└────────┬────────────┘
         ▼
┌─────────────────────┐
│     routing         │  Clasifica el último mensaje del usuario:
│                     │  ¿local o remote? ¿qué proveedor? ¿qué modelo?
│                     │  Consulta caché TTL antes de recalcular
└────────┬────────────┘
         ▼
┌─────────────────────┐
│      proxy          │  Llama al proveedor elegido,
│                     │  hace streaming de la respuesta al cliente,
│                     │  registra tokens y costo
└────────┬────────────┘
         ▼
    Respuesta al cliente
    (formato idéntico al del proveedor: Claude, OpenAI, o Ollama)
```

## Clasificador de enrutamiento

El clasificador analiza el **último mensaje del usuario** (sin comprimir, sin contexto inyectado) y aplica reglas en orden:

| Regla | Patrón detectado | Destino |
|-------|-----------------|---------|
| `contains_priority` | `urgent`, `emergencia`, `prioridad` | Claude 3.5 Sonnet |
| `contains_policy` | `legal`, `contrato`, `cumplimiento` | Gemini 1.5 Pro |
| `contains_code` | Bloques ` ``` ` en el mensaje | Claude 3.5 Sonnet |
| `contains_file_path` | Rutas como `/src/index.js` o `src/utils/foo.ts` | Claude 3.5 Sonnet |
| `contains_tool_result` | `tool_result`, `tool_use`, `<tool_call>` | Claude 3.5 Sonnet |
| `contains_system_prompt` | Mensaje empieza con `You are` o `You have access` | Default remote |
| **fallback por tamaño** | tokens < `LOCAL_MODEL_THRESHOLD` (150) | Ollama local |
| **fallback por tamaño** | tokens ≥ `LOCAL_MODEL_THRESHOLD` | Default remote |

El resultado se cachea por TTL para no recalcular decisiones idénticas.

## Cadena de fallback de proveedores

```
Proveedor elegido → falla
       │
       ▼
¿Tiene fallback?
  claude  → openai
  gemini  → openai
  openai  → (sin fallback, error 502)
  default → openai
       │
       ▼
¿Fallback también falla?
  → Error 502 con detalle de ambos errores
```

El cliente nunca sabe que hubo un fallback — recibe la respuesta de OpenAI como si fuera del proveedor original.

## Gestión de contexto cross-session

El router mantiene memoria entre conversaciones distintas. El flujo es:

```
Conversación A (turno 1):
  Usuario: "Refactoriza el módulo de autenticación"
  → summary: "El usuario quiere refactorizar auth, enfocado en JWT y middleware"
  → guardado en sesión "mi-proyecto"

Conversación B (inicio, mismo x-context-id):
  → Detecta: 1 solo turno (nuevo inicio)
  → Inyecta en system prompt:
     "Previous context (summarized):
      [Turn 1]: El usuario quiere refactorizar auth, enfocado en JWT y middleware"
  → Claude recibe el contexto anterior automáticamente
```

Para conversaciones con historial ya incluido (OpenCode en modo multi-turno), la inyección se omite — el historial ya está en `messages`.

## Módulos y responsabilidades

```
server.js          Registra el pipeline de middlewares, define endpoints REST
config.js          Única fuente de verdad para variables de entorno
autoSession.js     Parsea working_dir del system prompt → x-context-id
compression.js     Llama a ollamaClient para comprimir; guarda originalMessages
summary.js         Llama a ollamaClient para resumir el último mensaje
context.js         Lee/escribe contextStore; inyecta en system de originalMessages
contextStore.js    Map en memoria + archivos JSON en /data/sessions
routing.js         Llama al classifier; consulta/escribe cache.js
classifier.js      Reglas puras: texto → { target, provider, model, reason }
cache.js           Map en memoria con expiración por TTL
proxy.js           handleLocal() / handleRemote() + fallback + recordCost()
costs.js           Map en memoria de tokens/costos por sesión
ollamaClient.js    fetch a /api/generate de Ollama (stream: false)
providers/
  claude.js        fetch a /v1/messages con formato Anthropic
  openai.js        fetch a /v1/chat/completions con formato OpenAI
  ollama.js        fetch a /v1/chat/completions de Ollama (compatible OpenAI)
  stream.js        pipeResponseAndCapture: proxy SSE + extrae usage tokens
sessionCommand.js  Detecta /session en mensajes; responde como LLM fake
costsCommand.js    Detecta /costs en mensajes; responde como LLM fake
simulation.js      Detecta /simulate; responde metadata de fases sin llamar LLM
helpers.js         gatherPromptFromBody, getLastUserMessage, countTokens, etc.
```
