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
| `OLLAMA_API_KEY` | string | — | API key de Ollama (opcional) |
| `OLLAMA_MODEL` | string | `mistral` | Modelo local para inferencia directa, compresión y resúmenes |
| `OLLAMA_REQUEST_TIMEOUT_MS` | número | `120000` | Timeout de peticiones a Ollama en ms |

> Ollama tiene **tres roles** en el stack: inferencia local (cuando el clasificador decide `target=local`), compresión de prompts largos, y generación de resúmenes semánticos por turno.

## Variables de OpenRouter (backend remoto unificado)

OpenRouter es el único gateway para todos los modelos remotos ([ADR-002](decisions/ADR-002-openrouter-unified-backend.md)). Una sola key da acceso a Claude, Gemini, Llama, Mistral y 200+ modelos más.

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `OPENROUTER_API_KEY` | string | — | **Requerida** para enrutar a cualquier modelo remoto. Obtener en openrouter.ai |
| `OPENROUTER_BASE_URL` | string | `https://openrouter.ai/api/v1` | Base URL de OpenRouter |
| `DEFAULT_REMOTE_MODEL` | string | `anthropic/claude-3.5-sonnet` | Modelo OpenRouter usado cuando ninguna regla especifica uno |

> Los model IDs siguen el formato `proveedor/modelo` de OpenRouter. Ejemplos: `anthropic/claude-3.5-sonnet`, `google/gemini-1.5-pro`, `meta-llama/llama-3-70b-instruct`.

## Variables del clasificador semántico

El clasificador usa un modelo Ollama local para entender el intent del mensaje ([ADR-003](decisions/ADR-003-semantic-evolutionary-classifier.md)).

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `CLASSIFIER_MODEL` | string | `qwen2.5:3b` | Modelo Ollama para clasificación semántica. Debe ser pequeño y rápido |
| `CLASSIFIER_CONFIDENCE_THRESHOLD` | número | `0.6` | Confianza mínima del clasificador para aceptar su decisión. Bajo este umbral usa el modelo default |
| `DECISION_STORE_PATH` | string | `./data/decisions.json` | Ruta del archivo de decisiones persistidas |
| `DECISION_STORE_MAX_ENTRIES` | número | `1000` | Máximo de decisiones almacenadas (ring buffer) |

> Modelos recomendados para `CLASSIFIER_MODEL` según hardware: `qwen2.5:3b` (≥8 GB RAM), `phi3:mini` (<8 GB RAM).

## Variables de enrutamiento

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `LOCAL_MODEL_THRESHOLD` | número | `800` | Prompts con menos tokens que este valor van a Ollama local si no hay otra señal |
| `COMPRESSOR_TOKEN_THRESHOLD` | número | `3000` | Prompts con más tokens que este valor se comprimen antes de enviarse |

## Variables de resúmenes semánticos

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `SUMMARY_TOKEN_THRESHOLD` | número | `100` | Mínimo de tokens para activar la generación de resumen |
| `SUMMARY_INPUT_MAX_TOKENS` | número | `300` | Ventana máxima del prompt enviado a Ollama para resumir |
| `SUMMARY_OUTPUT_MAX_TOKENS` | número | `150` | Longitud máxima del resumen generado |

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

# ── OpenRouter (backend remoto unificado) ────────────────
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_REMOTE_MODEL=anthropic/claude-3.5-sonnet

# ── Clasificador semántico ───────────────────────────────
CLASSIFIER_MODEL=qwen2.5:3b
CLASSIFIER_CONFIDENCE_THRESHOLD=0.6
DECISION_STORE_PATH=./data/decisions.json
DECISION_STORE_MAX_ENTRIES=1000

# ── Enrutamiento ────────────────────────────────────────
LOCAL_MODEL_THRESHOLD=800
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
- Con OpenRouter solo necesitas gestionar **una sola API key** en lugar de múltiples claves de proveedor.
