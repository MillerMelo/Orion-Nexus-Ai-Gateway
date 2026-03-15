# AGENTS.md — Directrices para agentes en AI_Router / ORION

## Visión del proyecto

Este repositorio es la **Fase 0** de **ORION** (Orchestration Routing Intelligence Optimization Nexus), una plataforma de orquestación de modelos y agentes de IA. El motor interno se llama **NEXUS** (Neural Execution Unified System).

La evolución planificada: `AI Router → Command Registry → oriond daemon → Context Graph → ORION-Industrial`.

Ver [`docs/roadmap.md`](docs/roadmap.md) para el plan completo de evolución.

## Contexto del proyecto (Fase 0 actual)

AI Router es un proxy inteligente Node.js (Express) que intercepta requests de OpenCode hacia Claude/OpenAI, optimiza el contexto localmente con Ollama/Mistral, y enruta hacia el LLM más adecuado. Corre en Docker Compose con dos servicios: `router` (puerto 3000) y `ollama` (puerto 11434).

## Principios de desarrollo

### Infraestructura como código
Todo cambio de infraestructura va en archivos versionados, nunca como instrucción manual:
- Cambios de servicios → `docker-compose.yml`
- Variables nuevas → `.env.example` + `config.js` + `docs/configuration.md`
- Scripts de setup → `scripts/` + `Makefile`
- Documentación de despliegue → `docs/deploy.md`

Nunca proponer `apt install`, `curl | sh`, o `docker run` como solución final. Siempre codificar el cambio.

### Código sobre configuración
- El pipeline de middlewares está en `server.js` — nuevas etapas se agregan ahí
- Los providers siguen el contrato `(req, locals) → { ok, response } | { ok, status, error }`
- `res.locals` es el canal de comunicación entre middlewares — no modificar `req.body` salvo excepciones justificadas
- Las reglas del clasificador están en `classifier.js` como array de objetos `{ name, test, result }`

## Archivos críticos — leer antes de modificar

| Archivo | Por qué es crítico |
|---------|-------------------|
| `router/src/server.js` | Define el orden del pipeline completo |
| `router/src/proxy.js` | Maneja fallback chain y registro de costos |
| `router/src/contextStore.js` | Formato de persistencia en disco — cambios rompen sesiones guardadas |
| `router/src/costs.js` | Tabla de precios y lógica de ahorro — verificar al agregar proveedores |
| `router/src/classifier.js` | Reglas de enrutamiento — cambios afectan qué LLM recibe cada prompt |
| `docker-compose.yml` | Volúmenes y redes — cambios pueden perder datos de sesión |
| `scripts/check-hardware.sh` | Tabla de recomendaciones de modelos — actualizar al añadir modelos nuevos |
| `scripts/pull-model.sh` | Lógica de migración de modelos — sincronizar con check-hardware.sh |

## Convenciones del proyecto

- **Runtime:** Node.js 20, ES Modules (`import/export`), sin TypeScript, sin transpilación
- **Tests:** `node:test` + `node:assert` nativos — ejecutar con `make test` o `node --test`
- **Logs:** prefijos estructurados `[cost]`, `[proxy]`, `[context]`, `[session]`, `[cache]`
- **Idioma del código:** inglés (variables, funciones, comentarios inline)
- **Idioma de la documentación:** español

## Documentación — mantener actualizada

Al agregar funcionalidades, actualizar siempre:

| Cambio | Documentos a actualizar |
|--------|------------------------|
| Nueva variable de entorno | `docs/configuration.md`, `.env.example` |
| Nuevo endpoint REST | `docs/api.md` |
| Nueva regla de clasificación | `docs/architecture.md` |
| Nuevo proveedor | `docs/architecture.md`, `docs/development.md`, `docs/costs.md` |
| Nuevo comando de chat | `docs/api.md` |
| Cambio en formato de sesiones | `docs/sessions.md` |
| Cambio en despliegue | `docs/deploy.md` |

## Flujo para cambios de infraestructura

1. Identificar el cambio necesario
2. Modificar `docker-compose.yml`, `Dockerfile`, o scripts
3. Actualizar `.env.example` si hay nuevas variables
4. Actualizar `docs/deploy.md` si cambia el proceso de despliegue
5. Indicar al usuario el comando de reconstrucción necesario (`make build`, `docker compose up --build router`, etc.)

## Estado actual del proyecto

### Fase 0 — AI Router base (✅ Implementado)
- ✅ Pipeline completo: auto-session → compresión → summary → contexto → clasificación → proxy → costos
- ✅ Proveedores: Claude, OpenAI, Ollama (con fallback chain automático)
- ✅ Sesiones persistentes en disco con título auto-generado por Ollama
- ✅ Búsqueda de sesiones por tema
- ✅ Tracking de costos por sesión con comparativa real vs estimado
- ✅ Comandos de chat: `/session`, `/costs`, `/simulate`
- ✅ Integración OpenCode via `opencode.json` + auto-detección de sesión

### Deuda técnica (Fase 0)
- ⬜ Suite de tests completa (archivos `.test.js` existen, revisar cobertura)
- ⬜ Integración con Gemini (la API key se configura pero el provider no está implementado)
- ⬜ Módulo de Terraform/Ansible para despliegue cloud (`infra/`)

### Roadmap ORION (próximas fases)
- ⬜ **Fase 1** — Command Registry extensible + Plugin System (`orion-plugin-*`) + MCP server
- ⬜ **Fase 2** — `oriond` daemon + NEXUS Runtime + Multi-agent pipeline (Planner/Coder/Reviewer/Tester) + Orionfile
- ⬜ **Fase 3** — Context Graph semántico del repo + Autonomous Development Mode (GitHub issue → PR)
- ⬜ **Fase 4** — Agent Registry + ORION-Industrial (PLC / SCADA / IoT / OPC-UA)

Ver [`docs/roadmap.md`](docs/roadmap.md) para el diseño completo de cada fase.
