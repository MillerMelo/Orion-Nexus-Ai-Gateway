# Configuración

Todas las variables se definen en `.env` en la raíz del proyecto. Copia `.env.example` como punto de partida:

```bash
make init   # equivale a: cp .env.example .env
```

## Variables del router

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `ROUTER_PORT` | número | `3000` | Puerto en el que escucha el servidor Express |
| `NODE_ENV` | string | `development` | Entorno de ejecución (`development` / `production`) |
| `LOG_LEVEL` | string | `info` | Nivel de log (`debug`, `info`, `warn`, `error`) |
| `CACHE_TTL_SECONDS` | número | `120` | Tiempo de vida de decisiones de enrutamiento cacheadas |

## Variables de Ollama (modelo local)

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `OLLAMA_URL` | string | — | URL base de Ollama. Dentro de Docker: `http://ollama:11434` |
| `OLLAMA_API_KEY` | string | — | API key de Ollama (opcional si no tienes auth configurada) |
| `OLLAMA_MODEL` | string | `mistral` | Modelo local a usar para inferencia, compresión y resúmenes |
| `OLLAMA_REQUEST_TIMEOUT_MS` | número | `120000` | Timeout de peticiones a Ollama en ms. Mistral en CPU tarda ~12-40s |

> **Nota:** El modelo local se usa para tres propósitos: compresión de prompts largos, generación de resúmenes semánticos, y respuestas directas cuando el clasificador elige enrutamiento local.

## Variables de proveedores remotos

### Anthropic (Claude)

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `CLAUDE_API_KEY` | string | — | API key de Anthropic. Requerida para enrutar a Claude |
| `CLAUDE_BASE_URL` | string | `https://api.anthropic.com` | Base URL. Útil para proxies corporativos |
| `DEFAULT_REMOTE_MODEL` | string | `claude-3.5-sonnet` | Modelo Claude por defecto cuando ninguna regla especifica uno |

### OpenAI

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `OPENAI_API_KEY` | string | — | API key de OpenAI. También actúa como fallback si Claude falla |
| `OPENAI_BASE_URL` | string | `https://api.openai.com` | Base URL de OpenAI |
| `OPENAI_DEFAULT_MODEL` | string | `gpt-4o` | Modelo OpenAI. Siempre se usa este, ignorando el modelo del request |

### Google Gemini

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `GEMINI_API_KEY` | string | — | API key de Google AI Studio. Requerida para enrutar a Gemini |

## Variables de enrutamiento

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `LOCAL_MODEL_THRESHOLD` | número | `150` | Prompts con menos tokens que este valor van a Ollama local |
| `COMPRESSOR_TOKEN_THRESHOLD` | número | `3000` | Prompts con más tokens que este valor se comprimen antes de enviarse |

## Variables de resúmenes semánticos

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `SUMMARY_TOKEN_THRESHOLD` | número | `100` | Mínimo de tokens para activar la generación de resumen |
| `SUMMARY_INPUT_MAX_TOKENS` | número | `300` | Ventana máxima del prompt enviado a Ollama para resumir |
| `SUMMARY_OUTPUT_MAX_TOKENS` | número | `150` | Longitud máxima del resumen generado (`-1` = sin límite) |

## Variables de contexto y sesiones

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `CONTEXT_HISTORY_LIMIT` | número | `6` | Máximo de turnos almacenados por sesión |
| `CONTEXT_SESSIONS_DIR` | string | `/data/sessions` | Directorio donde se persisten las sesiones en disco |

## Variables de comandos de chat

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `SIMULATION_COMMAND_FLAG` | string | `/simulate` | Prefijo para activar el modo simulación desde el chat |
| `SESSION_COMMAND_FLAG` | string | `/session` | Prefijo para los comandos de gestión de sesiones |
| `COSTS_COMMAND_FLAG` | string | `/costs` | Prefijo para los comandos de consulta de costos |

## Ejemplo de `.env` completo

```dotenv
# ── Router ──────────────────────────────────────────────
ROUTER_PORT=3000
NODE_ENV=development
LOG_LEVEL=info
CACHE_TTL_SECONDS=120

# ── Ollama (local) ───────────────────────────────────────
OLLAMA_URL=http://ollama:11434
OLLAMA_API_KEY=
OLLAMA_MODEL=mistral
OLLAMA_REQUEST_TIMEOUT_MS=120000

# ── Claude (Anthropic) ──────────────────────────────────
CLAUDE_API_KEY=sk-ant-api03-...
CLAUDE_BASE_URL=https://api.anthropic.com
DEFAULT_REMOTE_MODEL=claude-sonnet-4-6

# ── OpenAI ──────────────────────────────────────────────
OPENAI_API_KEY=sk-proj-...
OPENAI_BASE_URL=https://api.openai.com
OPENAI_DEFAULT_MODEL=gpt-4o

# ── Gemini ──────────────────────────────────────────────
GEMINI_API_KEY=AIza...

# ── Enrutamiento ────────────────────────────────────────
LOCAL_MODEL_THRESHOLD=150
COMPRESSOR_TOKEN_THRESHOLD=3000

# ── Resúmenes ───────────────────────────────────────────
SUMMARY_TOKEN_THRESHOLD=100
SUMMARY_INPUT_MAX_TOKENS=300
SUMMARY_OUTPUT_MAX_TOKENS=150

# ── Sesiones ────────────────────────────────────────────
CONTEXT_HISTORY_LIMIT=6
CONTEXT_SESSIONS_DIR=/data/sessions

# ── Comandos ────────────────────────────────────────────
SIMULATION_COMMAND_FLAG=/simulate
SESSION_COMMAND_FLAG=/session
COSTS_COMMAND_FLAG=/costs
```

## Notas de seguridad

- **Nunca subas `.env` a git.** Está en `.gitignore` por defecto.
- Las API keys se pasan al router como variables de entorno vía `env_file` en `docker-compose.yml`.
- Ollama no requiere API key por defecto. Si la configuras, el router enviará `Authorization: Bearer <key>` automáticamente.
- Si solo tienes una API key (p. ej. solo OpenAI), el router funciona correctamente; simplemente no enrutará a los proveedores sin key configurada.
