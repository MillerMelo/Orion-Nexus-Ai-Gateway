# Sesiones y contexto persistente

El router mantiene memoria entre conversaciones usando un sistema de sesiones basado en resúmenes semánticos. Esto permite que el LLM "recuerde" trabajo anterior aunque empieces una nueva conversación.

## Cómo funciona

```
Sesión "ai-router" — Turno 1:
  Usuario: "Agrega compresión al pipeline del router"
  Ollama resume: "El usuario quiere agregar compresión de prompts largos usando Mistral local"
  → Guardado en memoria y en disco (/data/sessions/ctx_ai-router.json)

Sesión "ai-router" — Turno 2 (nueva conversación):
  Router detecta: 1 solo mensaje de usuario → nuevo inicio
  Hay entradas previas → inyecta en el system prompt:
    "Previous context (summarized):
     [Turn 1]: El usuario quiere agregar compresión de prompts largos usando Mistral local"
  Claude o GPT reciben el contexto anterior automáticamente
```

La inyección ocurre **solo al inicio de una nueva conversación** (1 turno de usuario). Si OpenCode ya envía historial de múltiples turnos, el router lo respeta y no duplica el contexto.

## Identificación de sesión

El router identifica la sesión mediante el header `x-context-id`. Si no se envía, intenta derivarlo automáticamente del system prompt.

### Prioridad de detección

1. **Header explícito:** `x-context-id: mi-proyecto`
2. **Auto-detección desde system prompt:** el router busca el directorio de trabajo en patrones como:
   - `<working-directory>/home/dev/Projects/MiApp</working-directory>`
   - `Working directory: /home/dev/Projects/MiApp`
   - `cwd: /home/dev/Projects/MiApp`
   → deriva el ID del basename: `MiApp`
3. **Sin sesión:** si no hay header ni se detecta el directorio, el request se procesa sin contexto.

## Persistencia en disco

Las sesiones se guardan como archivos JSON en el volumen `router-sessions` montado en `/data/sessions`:

```
/data/sessions/
  ctx_ai-router.json
  ctx_optifac.json
  ctx_AI_Router.json
```

Cada archivo tiene el formato:

```json
{
  "title": "Implementar proxy transparente a Claude",
  "entries": [
    {
      "semanticSummary": "El usuario implementó el proxy transparente con soporte de streaming y fallback a OpenAI",
      "tokenCount": 342,
      "recordedAt": "2026-03-14T09:15:00.000Z"
    },
    {
      "semanticSummary": "Se agregó tracking de costos reales vs estimados por sesión",
      "tokenCount": 215,
      "recordedAt": "2026-03-14T10:30:00.000Z"
    }
  ]
}
```

**El título se genera automáticamente** con Ollama en el primer turno (proceso en background, no bloquea la respuesta). Se puede cambiar con `/session rename`.

## Límite de historial

La variable `CONTEXT_HISTORY_LIMIT` (default: 6) limita cuántos turnos se almacenan por sesión. Cuando se alcanza el límite, se descarta el turno más antiguo.

## Comandos de sesión desde el chat

Todos los comandos se interceptan antes de llegar al LLM — costo $0, respuesta inmediata.

### `/session`

Muestra la sesión activa y su historial:

```
Router · Sesión activa
Nombre: Implementar proxy transparente a Claude
ID: `ai-router` · 4/6 turnos almacenados

Historial:
  [1] 2026-03-14 09:15 — El usuario implementó el proxy transparente con soporte streaming
  [2] 2026-03-14 10:30 — Se agregó tracking de costos reales vs estimados
  [3] 2026-03-14 11:00 — Corrección de bug en normalización de modelos para tabla de precios
  [4] 2026-03-14 11:45 — Implementación de enrutamiento local a Ollama con streaming

Comandos:
`/session list` · `/session search <tema>` · `/session rename <título>` · `/session clear`
```

### `/session list`

Lista todas las sesiones conocidas:

```
Router · Sesiones disponibles (3)

• Implementar proxy transparente a Claude ◀ actual
  ID: `ai-router` · 4 turnos · 2026-03-14 11:45
  Implementación de enrutamiento local a Ollama con streaming

• Migración microservicios a Go
  ID: `optifac` · 12 turnos · 2026-03-13 17:45
  Análisis final de la arquitectura de gateway antes de migrar

• Configuración cluster Kubernetes
  ID: `k8s-prod` · 2 turnos · 2026-03-12 14:00
  Setup inicial de namespaces y RBAC
```

### `/session search <término>`

Busca sesiones por tema en los summaries:

```
/session search autenticación
```

```
Router · Resultados para "autenticación"

• Refactor middleware JWT (2 coincidencias)
  ID: `auth-service` · última actividad: 2026-03-14 08:30
  → El usuario refactorizó el middleware JWT con soporte para tokens de refresco
  → Revisión de manejo de sesiones expiradas y rotación de claves
```

### `/session rename <título>`

Renombra la sesión actual:

```
/session rename Optimización pipeline de compresión y costos
```

```
Router · Sesión renombrada

`ai-router` ahora se llama **Optimización pipeline de compresión y costos**.
```

### `/session clear`

Elimina el historial de la sesión actual (memoria + disco):

```
/session clear
```

```
Router · Sesión limpiada

El historial de **Implementar proxy transparente a Claude** (`ai-router`) ha sido eliminado.
```

## API REST de sesiones

Para scripts, dashboards o integraciones externas:

```bash
# Listar todas las sesiones
GET /router/context

# Buscar por tema
GET /router/context/search?q=autenticación

# Ver historial completo
GET /router/context/ai-router

# Eliminar sesión
DELETE /router/context/ai-router
```

Ver ejemplos completos en [api.md](api.md).

## Cambio entre proyectos

El cambio de sesión es instantáneo — simplemente usa un `x-context-id` diferente. En OpenCode, se configura por proyecto en `opencode.json`:

```json
{
  "provider": {
    "anthropic": {
      "models": {
        "claude-sonnet-4-6": {
          "headers": { "x-context-id": "nombre-del-proyecto" }
        }
      }
    }
  }
}
```

Al abrir OpenCode en un directorio diferente, el router usa automáticamente el contexto correspondiente.
