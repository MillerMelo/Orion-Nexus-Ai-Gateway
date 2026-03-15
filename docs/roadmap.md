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
- Clasificación de prompts (código → remote, simple → local)
- Tracking de costos con comparativa real vs estimado
- Comandos de chat: `/session`, `/costs`, `/simulate`
- Integración transparente con OpenCode y Claude Code
- Detección de hardware y recomendación/migración de modelo local (`make check-hw`, `make optimize-model`)

---

## Fase 0.5 — Multi-provider + Quota Tracker (✅ Implementado)

**Objetivo:** Aprovechar los free tiers de proveedores frontier para reducir costos y habilitar arena mode.

```
OpenCode / Claude Code
         │
         ▼
    AI Router (Express, puerto 3000)
         │
    ┌────┴──────────────────────────────────────┐
    │  clasificación con matriz de capacidades  │
    │  + quota tracker proactivo (por día)      │
    └────┬──────────────────────────────────────┘
         │
    ┌────┼────────┬────────┐
    │    │        │        │
 Ollama Groq  Gemini   Claude / OpenAI
 local  free   free    (pagado, fallback final)
```

### Proveedores free-tier integrados

| Proveedor | Modelo default | Límite free | Fortaleza |
|-----------|---------------|-------------|-----------|
| Groq | `llama3-8b-8192` | ~500K tokens/día | Velocidad — inferencia más rápida del mercado |
| Gemini | `gemini-1.5-flash` | ~1.5M tokens/día | Contexto largo (1M tokens), multilingüe |

### Matriz de capacidades (classifier)

| Señal en el prompt | Proveedor asignado | Razón |
|---|---|---|
| `urgent`, `emergencia`, `prioridad` | Claude (pagado) | Alta criticidad, siempre disponible |
| `legal`, `contrato`, `cumplimiento` | Gemini free | Razonamiento sobre documentos |
| Bloque de código (` ``` `) | Claude (pagado) | Mejor en code reasoning multi-archivo |
| Ruta de archivo (`/src/...`) | Claude (pagado) | File-system-aware tool use |
| Tool result / tool call | Claude (pagado) | Formato nativo de herramientas |
| `translate`, `traduc` | Gemini free | Cobertura multilingüe |
| `summarize`, `resumen` | Groq Llama3 70B | Rápido en tareas de compresión |
| Pregunta simple (`?`) | Groq Llama3 8B | Máxima velocidad, costo $0.00 |
| < 800 tokens sin señal | Ollama local | $0.00, procesado en tu PC |
| ≥ 800 tokens sin señal | Claude (default) | Fallback remoto estándar |

### Quota tracker proactivo

- Monitorea uso diario por proveedor en `./data/quota.json`
- No espera el 429 — excluye proveedores que superen el 100% de su límite configurado
- Rollover automático a medianoche UTC
- Si un proveedor se agota, el clasificador pasa al siguiente en la cadena

### Fallback chain extendida

```
Provider primario → falla / quota agotada
  → Groq (si no es el primario)
  → Gemini (si no es el primario)
  → OpenAI (fallback comercial)
```

### Endpoint de monitoreo

```
GET /router/quota   → cuota diaria por proveedor (usada / límite / restante)
```

### Archivos implementados

- `router/src/quota-tracker.js` — tracker con rollover diario y persistencia
- `router/src/providers/gemini.js` — integración vía OpenAI-compat endpoint
- `router/src/providers/groq.js` — integración OpenAI-compatible
- `router/src/classifier.js` — matriz de capacidades + quota-awareness
- `router/src/routing.js` — cache invalida entradas de proveedores con quota agotada
- `router/src/proxy.js` — fallback chain multi-hop + `recordUsage()` post-respuesta

---

## Fase 1 — ORION Router (v0.2)

**Objetivo:** Convertir el AI Router en el núcleo del sistema ORION con un registry de comandos extensible y exposición MCP.

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

### 1.5 Provider scoring multi-criterio

Extensión del clasificador con ponderación dinámica de proveedores:

```
score = capability_weight × 0.5
      + quota_remaining   × 0.3
      + latency_history   × 0.2
```

- **capability_weight** — matriz estática de fortalezas por tipo de tarea (seed en Fase 0.5)
- **quota_remaining** — porcentaje de cuota diaria disponible (del quota-tracker)
- **latency_history** — promedio de latencia de las últimas N llamadas por proveedor

El proveedor con mayor score gana. Evoluciona la lógica de Fase 0.5 de reglas fijas a scoring continuo.

**Archivos clave a crear:**
- `router/src/scorer.js` — cálculo de score + histórico de latencias
- `router/src/latency-tracker.js` — registro de latencia por proveedor (en memoria, persiste cada N requests)

---

## Fase 2 — oriond + NEXUS Runtime (v0.3)

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

**Archivos clave a crear:**
- `oriond/` — daemon Go o Node.js con servidor HTTP/gRPC
- `router/src/nexus/` — runtime de agentes
- `router/src/agents/planner.js`, `coder.js`, `reviewer.js`, `tester.js`

---

## Fase 3 — Context Graph + Autonomous Dev Mode (v0.4)

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

## Fase 4 — Agent Registry + ORION-Industrial (v0.5+)

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
| 0.5 — Multi-provider + Quota | v0.5 | Groq, Gemini free tiers, quota tracker, matriz de capacidades | ✅ Implementado |
| 1 — Command Registry + MCP + Arena | v0.2 | Registry extensible, plugins npm, MCP server, arena mode, provider scoring | ⬜ Pendiente |
| 2 — oriond + NEXUS + Agentes | v0.3 | Daemon, multi-agent pipeline, Orionfile | ⬜ Pendiente |
| 3 — Context Graph + Auto Dev | v0.4 | Grafo semántico, GitHub issue → PR | ⬜ Pendiente |
| 4 — Registry + Industrial | v1.0 | Agent Hub, ORION-Industrial (PLC/SCADA/IoT) | ⬜ Pendiente |

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

## Próximos pasos inmediatos

1. **Refactorizar comandos actuales** como entradas del Command Registry (`/session`, `/costs`, `/simulate`)
2. **Crear `router/src/commandRegistry.js`** con auto-discovery de comandos
3. **Primer comando externo** como prueba del plugin system: `orion-plugin-git` para comandos git básicos
4. **Exponer registry via MCP** para que Claude Code pueda llamar comandos ORION como herramientas
5. **Planificar oriond** como proceso separado que expone el router + registry via HTTP local

Ver [architecture.md](architecture.md) para el estado actual de la implementación.
