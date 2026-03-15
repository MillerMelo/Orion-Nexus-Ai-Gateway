# ORION

> **Orchestration · Routing · Intelligence · Optimization · Nexus**

ORION es una capa de inteligencia que actúa como proxy local entre tu cliente de IA (OpenCode, Claude Code, Cursor) y los modelos de lenguaje — compatible con la API estándar de Anthropic, sin modificar el cliente ni requerir ningún cambio en tu flujo de trabajo.

Lo configuras una vez apuntando el `baseURL` a `localhost:3000`. A partir de ahí, ORION optimiza cada request de forma transparente: decide qué modelo conviene usar, comprime el contexto cuando es necesario, mantiene memoria entre sesiones, y te muestra cuánto ahorraste al final del día.

```
Tu cliente (OpenCode / Claude Code / curl)
                    │
                    │  API Anthropic estándar — sin cambios en el cliente
                    ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                        ORION :3000                          │
  │                                                             │
  │   ① detecta sesión  →  ② comprime contexto                 │
  │   ③ resume el turno  →  ④ inyecta memoria                  │
  │   ⑤ clasifica el prompt  →  ⑥ elige el modelo              │
  │   ⑦ hace el proxy  →  ⑧ registra tokens y ahorro           │
  │                                                             │
  └──────────────────┬──────────────────────┬───────────────────┘
                     │                      │
              prompt simple           prompt técnico
              < 800 tokens            código / archivos / tools
                     │                      │
                     ▼                      ▼
            Ollama  (local)         Claude  ──fallback──▶  OpenAI
            Mistral / Qwen          gratis con            si Claude
            $0.00 · tu PC          tu API key             falla
```

---

## El problema que resuelve

Usar LLMs de forma intensiva en desarrollo tiene tres fricciones que nadie ha resuelto bien juntas:

**Costo.** Cada sesión larga de Claude o GPT-4o envía miles de tokens de historial que ya el modelo conoce. Pagas por comprimir, resumir y recuperar contexto que podrías manejar localmente.

**Memoria.** Cuando cierras OpenCode y lo vuelves a abrir mañana, el modelo no recuerda nada del proyecto. Vuelves a explicar el contexto desde cero.

**Desperdicio de modelo.** Una pregunta como *"¿qué hace esta función?"* no necesita Claude Sonnet. Un modelo local de 7B en tu propia máquina la responde igual de bien, en segundos, a costo cero.

ORION resuelve los tres problemas de forma transparente, sin cambiar cómo usas tu cliente de IA.

---

## Qué hace exactamente

### Enrutamiento inteligente

ORION analiza cada request y decide en milisegundos a dónde va:

| Señal en el prompt | Destino |
|-------------------|---------|
| Bloque de código (` ``` `) | Claude remoto |
| Ruta de archivo (`/src/index.js`) | Claude remoto |
| Tool result / tool use | Claude remoto |
| Prompt > 800 tokens | Claude remoto |
| Pregunta simple sin código | Ollama local — **$0.00** |

Si Claude falla por cualquier motivo → OpenAI como fallback automático, sin que el cliente reciba un error.

### Compresión de contexto

Cuando un prompt supera 3000 tokens, Mistral lo comprime localmente antes de enviarlo al LLM remoto. El modelo recibe un contexto estructurado y preciso en lugar de texto repetido. La diferencia entre tokens originales y tokens enviados es ahorro directo en tu factura.

### Memoria persistente entre sesiones

Cada turno de conversación se resume semánticamente y se almacena en disco. La próxima vez que abras el proyecto, ORION inyecta ese historial en el system prompt automáticamente:

```
[Turn 1] El usuario implementó autenticación JWT con NestJS Guards
[Turn 2] Se agregó refresh token con expiración de 7 días
[Turn 3] El bug de expiración inmediata fue por timezone en el servidor
```

El modelo arranca con contexto real del proyecto, no desde cero.

### Tracking de costos

```
Router · Resumen de Costos
38 solicitudes · 3 sesiones

Distribución
  Remotas  ████████████████░░░░  28 requests
  Locales  ████░░░░░░░░░░░░░░░░  10 requests  ($0.00)

Tokens
  Original  45,230 tokens
  Enviados  71% del original  (compresión activa)

Costo real vs sin router
  Sin router   $0.1892
  Con router   $0.1124
  ─────────────────────
  Ahorro       41%  →  $0.0768
```

---

## Inicio rápido

**Requisitos:** Docker Engine ≥ 24, Docker Compose v2, al menos una API key (Claude u OpenAI).

```bash
# 1. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus API keys

# 2. Levantar el stack
#    → detecta puertos libres automáticamente
#    → analiza tu hardware y recomienda el mejor modelo local
#    → descarga el modelo si es necesario (~4 GB, solo la primera vez)
make up

# 3. Verificar
curl http://localhost:3000/health
# {"status":"ok","version":"0.1.0","env":"development"}
```

### Conectar OpenCode

Edita `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "http://localhost:3000"
      }
    }
  }
}
```

Desde ese momento, cada request de OpenCode pasa por ORION. El cliente no nota nada.

Para darle memoria a un proyecto específico, copia el `opencode.json` que está en la raíz de este repo a la raíz de tu proyecto y cambia el `x-context-id`.

### Verificar que ORION está interceptando

Desde el chat de OpenCode:

```
/session
```

Si responde con el panel de sesión de ORION → está funcionando.
Si responde Claude sobre el comando `/session` → ORION no está interceptando.

---

## Comandos de chat

Disponibles desde cualquier cliente sin salir del chat:

```
/session                    sesión activa, turnos almacenados
/session list               todas las sesiones guardadas
/session search <tema>      busca sesiones por contenido
/session rename <título>    renombra la sesión actual
/session clear              limpia el historial de esta sesión

/costs                      resumen global de ahorro
/costs session              detalle de la sesión actual
/costs top                  ranking de sesiones por ahorro
/costs reset                reinicia contadores de la sesión

/simulate <prompt>          muestra a dónde iría este prompt sin enviarlo
```

---

## Comandos make

```bash
make up             # levanta el stack (detección de puertos + hardware + modelo)
make down           # para los contenedores
make build          # reconstruye las imágenes sin iniciar
make logs           # sigue los logs del router en tiempo real
make test           # ejecuta la suite de tests
make init           # copia .env.example → .env
make clean          # elimina contenedores, redes e imágenes locales
make check-ports    # verifica disponibilidad de puertos, resuelve conflictos en .env
make check-hw       # analiza hardware y recomienda modelo Ollama
make optimize-model # migra al modelo recomendado de forma interactiva
```

---

## Estructura del proyecto

```
orion-nexus/
│
├── router/src/
│   ├── server.js           # pipeline de middlewares Express
│   ├── classifier.js       # reglas de enrutamiento
│   ├── proxy.js            # llamada al proveedor + fallback chain
│   ├── contextStore.js     # sesiones persistentes en disco
│   ├── costs.js            # tracking de tokens y ahorro
│   │
│   ├── autoSession.js      # detecta sesión desde el system prompt
│   ├── compression.js      # comprime prompts largos con Ollama
│   ├── summary.js          # resume cada turno semánticamente
│   ├── context.js          # inyecta historial en el system prompt
│   ├── routing.js          # clasifica y cachea decisión de enrutamiento
│   │
│   ├── sessionCommand.js   # maneja comandos /session
│   ├── costsCommand.js     # maneja comandos /costs
│   ├── simulation.js       # maneja comando /simulate
│   │
│   └── providers/
│       ├── claude.js       # Anthropic /v1/messages
│       ├── openai.js       # OpenAI /v1/chat/completions
│       ├── ollama.js       # Ollama /v1/chat/completions
│       └── stream.js       # proxy SSE con captura de usage tokens
│
├── scripts/
│   ├── check-ports.sh      # detecta conflictos de puerto, actualiza .env
│   ├── check-hardware.sh   # detecta RAM/VRAM, recomienda modelo Ollama
│   ├── pull-model.sh       # descarga modelo recomendado, maneja migración
│   └── run-tests.sh        # ejecuta tests en el contenedor
│
├── docs/
│   ├── architecture.md     # pipeline completo, clasificador, fallback chain
│   ├── configuration.md    # todas las variables de entorno
│   ├── api.md              # endpoints con ejemplos curl/JSON
│   ├── sessions.md         # memoria persistente, comandos /session
│   ├── costs.md            # tracking de ahorro, comando /costs
│   ├── opencode.md         # integración paso a paso
│   ├── deploy.md           # despliegue, checklist de lanzamiento
│   ├── development.md      # agregar proveedores, reglas, comandos
│   └── roadmap.md          # plan de evolución hacia ORION completo
│
├── docker-compose.yml
├── Makefile
├── opencode.json           # config del router para este proyecto
└── .env.example
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [Arquitectura](docs/architecture.md) | Pipeline completo, reglas del clasificador, cadena de fallback |
| [Configuración](docs/configuration.md) | Todas las variables de entorno con tipo, default y descripción |
| [API Reference](docs/api.md) | Endpoints con ejemplos curl y respuestas JSON |
| [Sesiones](docs/sessions.md) | Memoria persistente entre sesiones, comandos `/session` |
| [Costos](docs/costs.md) | Tabla de precios, lógica de ahorro, comando `/costs` |
| [OpenCode](docs/opencode.md) | Configuración global y por proyecto, troubleshooting |
| [Despliegue](docs/deploy.md) | Docker Compose, detección de hardware y puertos, checklist |
| [Desarrollo](docs/development.md) | Agregar proveedores, reglas de clasificación, comandos de chat |

---

## Hacia dónde va — ORION completo

Este repositorio es la **Fase 0**: el router inteligente que demuestra que el concepto funciona.

La hoja de ruta completa evoluciona en cinco fases hacia una plataforma de orquestación de agentes comparable en alcance a lo que Docker hizo con los contenedores:

```
Fase 0  ──▶  Fase 1  ──▶  Fase 2  ──▶  Fase 3  ──▶  Fase 4
AI Router    Command      oriond         Context       ORION
  (hoy)      Registry     daemon         Graph       Industrial
             + plugins    + agentes    + Auto Dev    PLC · SCADA
             + MCP        Planner       Mode (PR      IoT · OPC-UA
                          Coder         from issue)
                          Reviewer
                          Tester
```

El paralelo es directo con Docker:

| Docker | ORION |
|--------|-------|
| `Dockerfile` | `Orionfile` |
| `docker run` | `orion run` |
| `docker compose` | `orion workflow` |
| `dockerd` | `oriond` |
| Docker Hub | Agent Registry |

Ver [`docs/roadmap.md`](docs/roadmap.md) para el diseño técnico completo de cada fase.

---

## Motor interno — NEXUS

El router actual es la semilla de **NEXUS** (Neural Execution Unified System), el motor de ejecución que en fases futuras coordinará pipelines de agentes especializados. Cada middleware del pipeline actual — compresión, resumen, contexto, clasificación — es un nodo de lo que NEXUS eventualmente orquestará de forma distribuida.

---

<div align="center">

**ORION** · Orchestration Routing Intelligence Optimization Nexus
Powered by **NEXUS** · Neural Execution Unified System

</div>
