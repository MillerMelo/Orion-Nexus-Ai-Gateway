# ADR-002: OpenRouter como backend unificado para modelos remotos

**Estado:** Aceptado
**Fecha:** 2026-04-04
**Autores:** equipo ORION

---

## Contexto

La Fase 0.5 integró múltiples proveedores remotos de forma directa (Claude, OpenAI, Gemini, Groq), cada uno con su propio cliente, API key, formato de request y lógica de fallback. Esto generó:

- 4 API keys a gestionar y rotar
- 4 clientes con formatos distintos (Anthropic Messages API, OpenAI-compat, Gemini REST, Groq OpenAI-compat)
- Lógica de fallback multi-hop duplicada en `proxy.js`
- Quota tracker por proveedor que el router debe mantener manualmente
- Fricción alta para agregar nuevos modelos (requiere nuevo cliente)

La pregunta es: ¿cómo simplificar el acceso a modelos remotos sin perder la capacidad de elegir el modelo óptimo por contexto?

Las opciones evaluadas fueron:

1. **Mantener multi-provider directo** — continuar con clientes individuales, mejorar la abstracción interna.
2. **OpenRouter como gateway unificado** — una sola API key, un solo endpoint, acceso a 200+ modelos.
3. **LiteLLM como proxy interno** — servidor local que normaliza múltiples APIs; añade una dependencia más al stack.

---

## Decisión

Se adopta la opción **2 — OpenRouter como backend unificado** para toda comunicación con modelos remotos.

### Arquitectura resultante

```
CLI (OpenCode / Claude Code)
         │
         ▼
    AI Router (localhost:3000)
         │
         ├── clasificador → elige modelo (ej. anthropic/claude-3.5-sonnet)
         │
         ├── target=local  → Ollama (sin cambio)
         │
         └── target=remote → providers/openrouter.js
                               │
                               └→ api.openrouter.ai/api/v1/chat/completions
                                  Authorization: Bearer <OPENROUTER_API_KEY>
                                  body.model = "anthropic/claude-3.5-sonnet"
```

### Mapeo de modelos (classifier → OpenRouter)

| Señal / contexto | Modelo OpenRouter |
|---|---|
| Código, rutas de archivo, tool calls, urgente | `anthropic/claude-3.5-sonnet` |
| Legal, documentos largos | `google/gemini-1.5-pro` |
| Traducción | `google/gemini-1.5-flash` |
| Resumen, compresión | `meta-llama/llama-3-70b-instruct` |
| Preguntas simples | `meta-llama/llama-3-8b-instruct` |
| Default remoto | `anthropic/claude-3.5-sonnet` |

### Nuevas variables de entorno

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   # opcional, tiene default
```

Las variables de API key individuales (CLAUDE_API_KEY, GEMINI_API_KEY, etc.) pasan a ser opcionales y solo se usan si se quiere mantener acceso directo al proveedor como fallback de emergencia.

---

## Razones

- **Una sola key.** Elimina la gestión de múltiples credenciales de proveedores.
- **Acceso a 200+ modelos.** Agregar un modelo nuevo es cambiar el string en el clasificador, no escribir un nuevo cliente.
- **Quota delegada.** OpenRouter gestiona rate limits y cuotas; el router deja de necesitar un quota-tracker por proveedor.
- **Fallback delegable.** OpenRouter ofrece fallback automático configurable entre modelos; el fallback multi-hop en `proxy.js` puede simplificarse.
- **Formato unificado.** OpenRouter es 100% compatible con la API de OpenAI. El cliente HTTP existente en `providers/openai.js` sirve de base con cambios mínimos.
- **Ollama no cambia.** El procesamiento local (clasificación auxiliar, compresión, resúmenes) sigue en Ollama sin modificación.

---

## Consecuencias

**Positivas:**
- `proxy.js` se simplifica: `handleRemote` pasa de un despacho multi-proveedor a una llamada única.
- `classifier.js` solo necesita actualizar los model ID strings al formato OpenRouter.
- Se eliminan `providers/claude.js`, `providers/gemini.js`, `providers/groq.js` o pasan a ser fallback opcional.
- El quota-tracker por proveedor puede eliminarse o simplificarse.

**Limitaciones conocidas:**
- Dependencia de un intermediario (OpenRouter). Si cae, toda la inferencia remota falla. Mitigación: mantener al menos un proveedor directo como fallback de emergencia.
- Latencia marginal adicional (~20-50ms) por el hop extra. Aceptable para el caso de uso.
- Precios de OpenRouter ligeramente superiores al API directo de algunos proveedores en escenarios de alto volumen. No relevante en la etapa actual.

**Deuda técnica:**
- El quota-tracker actual (`quota-tracker.js`) queda como código muerto una vez migrado. Debe eliminarse o adaptarse para monitorear gasto total en OpenRouter.

---

## Referencias

- Documentación OpenRouter: https://openrouter.ai/docs
- Implementación: `router/src/providers/openrouter.js` (a crear)
- Relacionado con: [ADR-003](ADR-003-semantic-evolutionary-classifier.md) — los model IDs del clasificador semántico usan el formato OpenRouter
