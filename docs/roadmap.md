# ORION — Roadmap de evolución

## Identidad del proyecto

```
ORION
Orchestration Routing Intelligence Optimization Nexus

Motor interno:
NEXUS — Neural Execution Unified System
```

**ORION** es la evolución del AI Router hacia una plataforma completa de orquestación de modelos y agentes de IA. Donde el AI Router actual intercepta y optimiza requests, ORION orquesta flujos completos de trabajo inteligente: análisis de repositorios, implementación autónoma de features, debugging multi-agente, y verticales industriales.

El paralelo conceptual es Docker: así como Docker estandarizó contenedores, ORION estandariza agentes de IA.

| Docker        | ORION               |
|---------------|---------------------|
| `container`   | `agent`             |
| `docker image`| `agent image`       |
| `Dockerfile`  | `Orionfile`         |
| `docker run`  | `orion run`         |
| `docker compose` | `orion workflow` |
| `docker hub`  | `agent registry`    |
| `dockerd`     | `oriond`            |

---

## Estado actual — Fase 0: AI Router base (✅ Implementado)

El AI Router es la base de ORION. Ya funciona:

```
OpenCode / Claude Code
         │
         ▼
    AI Router (Express, puerto 3000)
         │
    ┌────┴────────────────────────────┐
    │  auto-session → compresión →    │
    │  summary → contexto →           │
    │  clasificación → proxy → costos │
    └────┬────────────────────────────┘
         │
    ┌────┴────┐
    │         │
 Ollama    Claude / OpenAI
 (local)   (remoto, con fallback)
```

Capacidades activas:
- Compresión de contexto con Ollama/Mistral
- Sesiones persistentes con resumen semántico por turno
- Clasificación de prompts por reglas regex (código → remote, simple → local)
- Tracking de costos con comparativa real vs estimado
- Comandos de chat: `/session`, `/costs`, `/simulate`
- Integración transparente con OpenCode y Claude Code
- Detección de hardware y recomendación/migración de modelo local (`make check-hw`, `make optimize-model`)

---

## Fase 0.5 — Multi-provider + Quota Tracker (✅ Implementado / en migración)

**Nota:** Esta fase implementó acceso directo a múltiples proveedores (Claude, OpenAI, Gemini, Groq). La arquitectura funcionó y validó el concepto. La Fase 0.6 la reemplaza con OpenRouter como backend unificado — ver [ADR-002](decisions/ADR-002-openrouter-unified-backend.md).

Lo que se conserva de esta fase:
- El clasificador por matriz de capacidades (migrado a model IDs de OpenRouter en Fase 0.6)
- La estructura de fallback (delegada a OpenRouter)
- El tracking de costos (adaptado para modelo único de facturación)

Lo que queda obsoleto:
- Clientes individuales por proveedor (`providers/claude.js`, `providers/gemini.js`, `providers/groq.js`)
- Quota tracker por proveedor (`quota-tracker.js`) — OpenRouter gestiona sus propios límites
- Fallback chain multi-hop en `proxy.js` — se simplifica a un único cliente OpenRouter

### Archivos implementados (referencia histórica)

- `router/src/quota-tracker.js`
- `router/src/providers/gemini.js`, `providers/groq.js`
- `router/src/classifier.js` — matriz de capacidades + quota-awareness
- `router/src/proxy.js` — fallback chain multi-hop

---

## Fase 0.6 — OpenRouter + Clasificador Semántico (v0.6)

**Objetivo:** Migrar el backend remoto a OpenRouter como gateway unificado e introducir clasificación basada en comprensión semántica en lugar de regex.

Ver decisiones de diseño: [ADR-002](decisions/ADR-002-openrouter-unified-backend.md) y [ADR-003](decisions/ADR-003-semantic-evolutionary-classifier.md).

### 0.6.1 Migración a OpenRouter

```
CLI (OpenCode / Claude Code)
         │
         ▼
    AI Router (localhost:3000)
         │
         ├── clasificador semántico → elige model ID
         │
         ├── target=local  → Ollama (sin cambio)
         │
         └── target=remote → providers/openrouter.js
                               └→ openrouter.ai/api/v1/chat/completions
```

**Épica:** Backend unificado
- Crear `router/src/providers/openrouter.js` — cliente único OpenAI-compatible
- Actualizar `config.js` — agregar `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
- Simplificar `proxy.js` — `handleRemote` pasa de despacho multi-proveedor a llamada única
- Actualizar model IDs en el clasificador al formato OpenRouter (`anthropic/claude-3.5-sonnet`, etc.)
- Marcar como opcionales los clientes directos de proveedor

### 0.6.2 Clasificador semántico (Capa A de ADR-003)

Reemplazar las reglas regex por un clasificador LLM local que entiende el intent del mensaje:

```
Prompt → Ollama (qwen2.5:3b / phi3:mini)
       → { category, confidence, suggested_model, reason }
       → routing decision
```

Las reglas regex se mantienen como fallback rápido para casos triviales (tool_use, empty, urgent).

**Épica:** Semantic Classifier
- Crear `router/src/classifier/` — estructura modular
- Crear `classifier/semantic.js` — clasificación via Ollama structured output
- Crear `classifier/rules.js` — reglas regex legacy como primer filtro
- Crear `classifier/index.js` — orquestador con flujo: rules → semantic → default
- Configurar modelo clasificador: `CLASSIFIER_MODEL` (default: `qwen2.5:3b`)

### 0.6.3 Decision Store + Captura de señales (Capa B de ADR-003)

Persistir cada decisión de enrutamiento con señales de calidad para habilitar el aprendizaje futuro:

**Épica:** Decision Store
- Crear `classifier/store.js` — SQLite con tabla de decisiones y señales
- Crear `classifier/feedback.js` — middleware que detecta señales implícitas post-respuesta
- Exponer `GET /router/classifier/decisions` para auditoría

### Tabla de fases actualizada al final del roadmap.

---

## Fase 1 — ORION Router (v1.0)

**Objetivo:** Convertir el AI Router en el núcleo del sistema ORION con un registry de comandos extensible, exposición MCP, y el ciclo completo de aprendizaje del clasificador.

### 1.1 Command Registry

Cada funcionalidad del router se expone como un comando semántico reutilizable:

```
orion session list
orion session search <tema>
orion costs top
orion simulate <prompt>
orion health
```

El Command Registry mantiene todos los comandos disponibles con la interfaz:

```js
// Contrato de un comando ORION
{
  name: 'session list',
  description: 'Lista sesiones activas',
  async run(ctx) {
    // ctx.llm, ctx.session, ctx.tools disponibles
    return result;
  }
}
```

Los comandos actuales (`/session`, `/costs`, `/simulate`) son la semilla de este registry.

### 1.2 Plugin System

Comandos externos como paquetes npm con prefijo `orion-plugin-*`:

```bash
npm install orion-plugin-security
npm install orion-plugin-devops
npm install orion-plugin-plc        # futuro: vertical industrial
```

ORION detecta plugins automáticamente escaneando `node_modules/orion-plugin-*` y registra sus comandos. Esto replica el patrón que escaló Terraform, kubectl y Docker CLI.

### 1.3 Exposición como MCP tools

Cada comando del registry se expone automáticamente como herramienta MCP:

```
CLI:  orion session list
API:  GET /orion/session/list
MCP:  tool: session_list
```

Un mismo comando funciona para humanos (CLI), servicios (API REST) y modelos (MCP). Esto convierte a ORION en una capa universal de herramientas inteligentes.

**Archivos clave a crear:**
- `router/src/commandRegistry.js` — registry + auto-discovery de plugins
- `router/src/mcp.js` — servidor MCP que expone el registry

### 1.4 Arena Mode (multi-provider fan-out)

Enviar el mismo prompt a múltiples proveedores en paralelo y comparar respuestas. Diseñado para aprovechar los free tiers integrados en Fase 0.5:

```
prompt ──────────────────────────────────┐
         │              │                │
         ▼              ▼                ▼
   Groq (free)    Gemini (free)    Claude (pagado)
         │              │                │
         └──────────────┴────────────────┘
                        │
              respuestas en panel comparativo
                        │
              usuario elige — o ORION elige
              la de mayor score de coherencia
```

**Activación:** prompt con prefijo `/arena` o header `x-orion-arena: true`.

**Resultado:** las N respuestas quedan guardadas en la sesión; el usuario puede continuar cualquier hilo.

**Archivos clave a crear:**
- `router/src/arena.js` — fan-out paralelo + agregación de respuestas
- Comando de chat `/arena <prompt>` registrado en el Command Registry

### 1.5 Caché semántico del clasificador (Capa C de ADR-003)

Evitar re-clasificar prompts semánticamente similares usando embeddings:

```
Prompt nuevo → embedding (Ollama nomic-embed-text)
             → buscar similitud coseno > 0.92 en store
             → hit: reusar decisión previa (< 5ms)
             → miss: clasificar con Ollama (~400ms)
```

**Épica:** Semantic Cache
- Crear `classifier/embeddings.js` — generación de embeddings + búsqueda por similitud coseno
- Actualizar `classifier/index.js` — integrar caché semántico antes del paso a Ollama
- Actualizar `classifier/store.js` — columna de vector en SQLite (o archivo paralelo)

### 1.6 Classifier Learner — análisis y sugerencias (Capa D de ADR-003)

Proceso periódico que analiza el histórico de decisiones y sugiere mejoras:

```
cron nocturno → leer 500 decisiones recientes
              → agrupar por similitud semántica
              → calcular señales de calidad por cluster
              → generar reporte de insights
              → exponer en GET /router/classifier/insights
```

**Épica:** Classifier Learner
- Crear `classifier/learner.js` — análisis de clusters + scoring de señales
- Exponer `GET /router/classifier/insights` — sugerencias de ajuste con evidencia
- Registrar changelog de reglas aplicadas en `classifier/changelog.json`

---

## Fase 2 — oriond + NEXUS Runtime + Auto-evolución (v2.0)

**Objetivo:** Daemon centralizado con motor de ejecución de agentes, replicando la arquitectura cliente-motor de Docker.

### 2.1 oriond — Motor central

```
ORION CLI / OpenCode / Claude Code / VSCode
                    │
                    │ HTTP local / gRPC
                    ▼
                oriond (puerto 8718)
                    │
                    ▼
              NEXUS Runtime
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
      Agents      Tools     LLM Router
```

`oriond` es el daemon que ejecuta toda la inteligencia. El cliente (CLI, extensión, OpenCode) solo envía comandos y recibe resultados. Ventajas:

- **Multi-cliente:** CLI, VSCode, JetBrains, web UI → mismo engine
- **Persistencia:** RAG index, project memory, execution history sobreviven entre sesiones
- **Paralelismo:** múltiples agentes y modelos simultáneos
- **Caching:** context cache, embedding cache, result cache

### 2.2 Multi-agent pipeline

NEXUS coordina agentes especializados en secuencia:

```
tarea
  │
  ▼
Planner Agent   → entiende la tarea, crea plan técnico
  │
  ▼
Coder Agent     → genera código usando RAG del repo
  │
  ▼
Reviewer Agent  → revisa calidad, seguridad, arquitectura
  │
  ▼
Tester Agent    → genera y ejecuta tests

Si Tester falla → retorna a Coder (loop de mejora automática)
```

Cada agente puede usar un modelo diferente según la tarea:

| Agente    | Modelo recomendado          | Razón                              |
|-----------|-----------------------------|------------------------------------|
| Planner   | Claude Sonnet               | Razonamiento arquitectónico        |
| Coder     | DeepSeek-Coder / local LLM  | Generación de código, más barato   |
| Reviewer  | Claude Sonnet               | Análisis de seguridad y calidad    |
| Tester    | Ollama local                | Generación de tests, costo $0      |

### 2.3 Orionfile

Configuración declarativa de agentes y workflows, análoga al Dockerfile:

```yaml
# orion.yaml — en la raíz del proyecto
project: backend-api

agents:
  planner:
    model: claude-sonnet-4-6
    role: architecture_planner
  coder:
    model: deepseek-coder
    role: code_generation
  reviewer:
    model: claude-sonnet-4-6
    role: code_review
  tester:
    model: ollama/mistral
    role: test_generation

workflows:
  implement_feature:
    - planner
    - coder
    - reviewer
    - tester

  debug_error:
    - coder
    - reviewer

  generate_docs:
    - planner
    - coder
```

Ejecución:

```bash
orion workflow run implement_feature "Add JWT authentication"
orion workflow run debug_error --logs ./logs/error.log
```

### 2.4 Auto-evolución del clasificador (Capa E de ADR-003)

Con suficiente historial validado por el Learner (Fase 1.6), el clasificador puede actualizarse automáticamente:

```
Sugerencia con confidence > 0.90 && evidence_count > 50
      → actualizar regla en classifier/rules.js
      → registrar en classifier/changelog.json
      → notificar via log
```

El umbral `CLASSIFIER_AUTO_EVOLVE_THRESHOLD` debe estar desactivado hasta que el Learner haya sido validado manualmente durante al menos un mes.

**Épica:** Classifier Auto-evolve
- Activar modo autónomo en `learner.js` con umbral configurable
- Crear mecanismo de rollback de reglas (`classifier/changelog.json` + comando `orion classifier rollback`)

**Archivos clave a crear:**
- `oriond/` — daemon Go o Node.js con servidor HTTP/gRPC
- `router/src/nexus/` — runtime de agentes
- `router/src/agents/planner.js`, `coder.js`, `reviewer.js`, `tester.js`

---

## Fase 3 — Context Graph + Autonomous Dev Mode (v3.0)

**Objetivo:** ORION mantiene conocimiento persistente del repositorio y puede resolver issues de GitHub automáticamente.

### 3.1 Context Graph

Un grafo semántico del código donde cada nodo es un elemento del sistema:

```
Nodos:  archivo, clase, función, módulo, servicio, API, tabla DB, dependencia
Aristas: imports, calls, extends, uses, writes, reads
```

Ejemplo:

```
AuthController
      │ calls
      ▼
AuthService
      │ uses
      ▼
UserRepository
      │ reads/writes
      ▼
users (tabla PostgreSQL)
```

El grafo responde preguntas estructurales que ningún copilot actual responde bien:
- ¿Qué módulos se rompen si cambio `AuthService`?
- ¿Qué archivos necesito leer para implementar logout?
- ¿Cuál es el impacto de cambiar el esquema de `users`?

**Comandos del Context Graph:**

```bash
orion graph build              # indexa el repositorio completo
orion graph query AuthService  # muestra dependencias del nodo
orion graph impact auth.js     # módulos impactados por un cambio
orion graph visualize          # genera diagrama de dependencias
```

**Implementación:**
- Code Scanner: `tree-sitter` para parsing multi-lenguaje
- Graph Storage: SQLite con tabla de nodos + tabla de aristas (simple y sin dependencias)
- Actualización incremental via `git diff` — solo re-indexa archivos modificados

### 3.2 Autonomous Development Mode

ORION toma un issue de GitHub y produce un PR funcional:

```
GitHub Issue #42 "Add JWT authentication"
         │
         ▼
Planner Agent    → lee issue + grafo → plan técnico
         │
         ▼
Coder Agent      → genera archivos usando Context Graph
         │
         ▼
Reviewer Agent   → detecta problemas → Coder retry si hay issues
         │
         ▼
Tester Agent     → genera tests → ejecuta → coverage report
         │
         ▼
GitHub PR        → branch: feature/jwt-auth
                   commit: feat(auth): add JWT authentication
                   PR con descripción auto-generada
```

**Uso:**

```bash
orion issue solve 42                    # resuelve issue específico
orion issue solve 42 --dry-run          # muestra plan sin ejecutar
oriond autonomous --watch               # modo continuo: monitorea el repo
```

**Módulo github-adapter:**
- `issue-fetcher` — obtiene título, descripción, comentarios, etiquetas
- `branch-manager` — crea rama `feature/<slug-del-issue>`
- `commit-engine` — genera commits atómicos por archivo
- `pr-generator` — abre PR con descripción estructurada

**Integración con CI/CD:** Si GitHub Actions falla en el PR, ORION recibe el feedback y reintenta automáticamente (loop de mejora).

---

## Fase 4 — Agent Registry + ORION-Industrial (v4.0)

**Objetivo:** Ecosistema de agentes reutilizables y vertical especializada para automatización industrial.

### 4.1 Agent Registry

Repositorio público de agent images, análogo a Docker Hub:

```bash
orion pull orion/coder-agent          # agente oficial de código
orion pull orion/devops-agent         # agente DevOps
orion pull orion/plc-agent            # agente industrial PLC

orion build my-coder-agent            # construye desde Orionfile
orion push myorg/my-coder-agent       # publica en el registry
```

Una agent image contiene: `model` + `tools` + `system prompt` + `memory config`.

### 4.2 ORION-Industrial

Vertical especializada para OT/IT convergence. Dado el perfil industrial del proyecto (PLC, IoT, SCADA), esta vertical es altamente diferenciadora — ningún copilot actual cubre este dominio.

**Agentes industriales:**

| Agente       | Función                                                    |
|--------------|-----------------------------------------------------------|
| PLC Agent    | Analiza lógica Ladder/SCL, detecta bugs, genera documentación |
| SCADA Agent  | Interpreta topologías de planta, optimiza pantallas HMI   |
| IoT Agent    | Analiza pipelines MQTT, genera integraciones Node-RED     |
| OPC-UA Agent | Genera clientes/servidores OPC-UA, mapea address space    |
| DataOps Agent| Analiza históricos industriales, detecta anomalías        |

**Comandos:**

```bash
orion industrial analyze plc ./logic/main.scl
orion industrial map plant ./topology.json
orion industrial generate mqtt-bridge --broker localhost --topics sensors/#
orion industrial audit scada --project optifac
```

**Context Graph industrial:**

Los nodos del grafo incluyen elementos OT además de código:

```
MQTT topic: sensors/temp/zone1
      │ feeds
      ▼
Node-RED flow: temperature-monitor
      │ triggers
      ▼
PLC tag: T_ZONA1
      │ controls
      ▼
actuator: válvula-vapor-01
```

---

## Arquitectura completa objetivo

```
Developer / OpenCode / Claude Code / CI-CD
                      │
                      │ CLI / MCP / HTTP
                      ▼
                  ORION CLI
                      │
                      │ HTTP / gRPC
                      ▼
                   oriond
                      │
                      ▼
               NEXUS Runtime
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
   Agent Engine   LLM Router   Tool System
         │            │            │
    ┌────┤       ┌────┤       ┌────┤
    │    │       │    │       │    │
 Planner │    Ollama  │     git    │
 Coder   │    Claude  │     npm    │
 Reviewer│    OpenAI  │     docker │
 Tester  │    Gemini  │     github │
         │            │            │
         ▼            │            │
   Context Graph      │            │
         │            │            │
         └────────────┴────────────┘
              Plugin System
              (orion-plugin-*)
```

---

## Tabla de fases

| Fase | Versión | Componentes | Estado |
|------|---------|-------------|--------|
| 0 — AI Router base | v0.1 | Pipeline completo, sesiones, costos, OpenCode | ✅ Implementado |
| 0.5 — Multi-provider + Quota | v0.5 | Groq, Gemini free tiers, quota tracker, matriz de capacidades | ✅ Implementado (en migración) |
| 0.6 — OpenRouter + Semantic Classifier | v0.6 | OpenRouter backend, clasificador Ollama, decision store | ⬜ Pendiente |
| 1 — Command Registry + MCP + Learner | v1.0 | Registry extensible, plugins npm, MCP server, arena mode, caché semántico, classifier learner | ⬜ Pendiente |
| 2 — oriond + NEXUS + Agentes + Auto-evolve | v2.0 | Daemon, multi-agent pipeline, Orionfile, auto-evolución del clasificador | ⬜ Pendiente |
| 3 — Context Graph + Auto Dev | v3.0 | Grafo semántico, GitHub issue → PR | ⬜ Pendiente |
| 4 — Registry + Industrial | v4.0 | Agent Hub, ORION-Industrial (PLC/SCADA/IoT) | ⬜ Pendiente |

---

## Decisiones de implementación

### Stack tecnológico

El AI Router actual (Node.js + Express + ES Modules) es la base correcta. La evolución natural:

| Componente      | Tecnología           | Razón                                    |
|-----------------|----------------------|------------------------------------------|
| Router actual   | Node.js 20 + Express | Ya implementado, funciona bien           |
| oriond daemon   | Node.js (inicio) / Go (escala) | Empezar simple, migrar si se necesita concurrencia |
| NEXUS Runtime   | Node.js              | Ecosistema AI maduro (SDK Anthropic, etc.) |
| Context Graph   | SQLite               | Sin dependencias externas, embebido      |
| RAG embeddings  | Ollama + BGE         | Local, ya tenemos Ollama en el stack     |
| Plugin System   | npm + auto-discovery | Patrón estándar del ecosistema           |

### Principio de evolución

Cada fase debe ser funcional y útil por sí sola. No construir para el futuro — construir lo mínimo que aporta valor real hoy y que habilite la siguiente fase sin reescrituras.

El AI Router actual ya hace Fase 0 completa. Fase 1 agrega el registry sin romper nada. Fase 2 mueve la lógica a un daemon sin cambiar la API externa. Cada paso es aditivo.

---

## Próximos pasos inmediatos (Fase 0.6)

1. **Crear `router/src/providers/openrouter.js`** — cliente único para todos los modelos remotos
2. **Actualizar `config.js`** — agregar `OPENROUTER_API_KEY` y `OPENROUTER_BASE_URL`
3. **Simplificar `proxy.js`** — `handleRemote` pasa a usar solo `callOpenRouter`
4. **Actualizar model IDs en el clasificador** al formato OpenRouter (`anthropic/...`, `google/...`, etc.)
5. **Crear `router/src/classifier/`** — estructura modular con `rules.js`, `semantic.js`, `index.js`
6. **Crear `classifier/store.js`** — persistencia SQLite de decisiones de enrutamiento

Ver [architecture.md](architecture.md) para el estado actual de la implementación.
