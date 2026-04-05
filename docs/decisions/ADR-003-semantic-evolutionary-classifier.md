# ADR-003: Clasificador semántico y auto-evolutivo

**Estado:** Aceptado
**Fecha:** 2026-04-04
**Autores:** equipo ORION
**Supersede:** [ADR-001](ADR-001-routing-classification-model.md)

---

## Contexto

ADR-001 adoptó un clasificador basado en reglas deterministas (regex + umbral de tokens). Esta decisión fue correcta para Fase 0 porque priorizaba la auditabilidad y la rapidez de implementación.

Las limitaciones conocidas de ese enfoque, aceptadas como deuda técnica, son ahora el cuello de botella para hacer ORION útil en escenarios reales:

- **No entiende contexto implícito:** "revisa esto" sin código visible no activa ninguna regla.
- **No aprende:** si emerge un patrón nuevo de uso, hay que añadir la regla manualmente.
- **Sin memoria de resultados:** el sistema no sabe si sus decisiones de enrutamiento fueron buenas o malas.
- **Primer match gana:** no hay graduación ni confianza — una sola señal determina todo.

La pregunta es: ¿cómo evolucionar el clasificador para que entienda semánticamente el intent del mensaje y mejore sus decisiones con el tiempo?

---

## Decisión

Se adopta un clasificador en cinco capas implementadas incrementalmente. Cada capa es funcional y útil por sí sola; las capas posteriores la potencian sin reescribirla.

### Capa A — Clasificador semántico con Ollama (reemplaza reglas regex)

En vez de buscar patrones en el texto, se usa un modelo LLM ligero local para inferir el intent del mensaje:

```
Prompt del usuario
      │
      ▼
Ollama (modelo rápido: qwen2.5:3b, phi3:mini)
  System: "Eres un clasificador de intents para un router de IA.
           Dado el mensaje, devuelve JSON:
           { category, confidence, suggested_model, reason }"
      │
      ▼
{ category: "code_review", confidence: 0.91,
  suggested_model: "anthropic/claude-3.5-sonnet",
  reason: "archivo mencionado + solicitud de mejora implícita" }
```

El modelo clasificador debe ser **pequeño y rápido** (objetivo: < 400ms). No es el mismo modelo que responde al usuario.

Las reglas regex de ADR-001 se mantienen como fallback de primer nivel para casos triviales (tool_use, empty, urgent keywords) donde la latencia adicional no está justificada.

### Capa B — Captura de señales para aprendizaje

Cada decisión de enrutamiento se persiste junto con señales de calidad implícitas:

```js
// Estructura de un registro de decisión
{
  id, timestamp,
  promptHash,           // hash del prompt para agrupar similares
  categoryDecided,      // lo que el clasificador eligió
  modelUsed,            // modelo que respondió finalmente
  confidence,           // confianza del clasificador
  latencyMs,            // tiempo de respuesta del modelo
  outputTokens,         // longitud de la respuesta
  implicitSignals: {
    userFollowedUp,     // ¿el usuario continuó la conversación?
    negativeFollowUp,   // ¿el follow-up fue "no, quiero..."?
    regenerated,        // ¿el usuario pidió regenerar?
    shortResponse,      // respuesta < 20 tokens para prompt > 100 tokens
  }
}
```

### Capa C — Caché semántico por similitud

Antes de invocar el clasificador Ollama, se busca si existe una decisión previa para un prompt semánticamente similar:

```
Prompt nuevo
      │
      ▼
Generar embedding (Ollama + nomic-embed-text)
      │
      ▼
Buscar en store: similitud coseno > 0.92
      │ hit
      ├──→ Reusar decisión previa (< 5ms)
      │ miss
      └──→ Clasificar con Ollama (~400ms) → guardar
```

### Capa D — Learner: análisis periódico y sugerencias

Un proceso `learner.js` corre en segundo plano (cron nocturno) y analiza el histórico de decisiones:

```
Leer últimas 500 decisiones con señales
      │
      ▼
Agrupar por similitud semántica (embeddings)
      │
      ▼
Por cada cluster analizar:
  - ¿Qué modelo tuvo mejores señales implícitas?
  - ¿Hubo fallbacks frecuentes? (→ clasificación incorrecta)
  - ¿Confianza baja repetida? (→ zona gris a mejorar)
      │
      ▼
Generar reporte de sugerencias:
  { pattern, suggested_model, confidence, evidence_count }
```

El reporte se expone en `GET /router/classifier/insights` y queda disponible para revisión humana.

### Capa E — Auto-evolución con umbral de confianza

Cuando el learner genera una sugerencia con evidencia suficiente, puede actualizar las reglas del clasificador automáticamente:

```
Sugerencia: confidence > 0.90 && evidence_count > 50
      │ sí
      ▼
Actualizar regla en classifier/rules.js
Registrar el cambio en classifier/changelog.json
Notificar via log: [classifier] auto-updated rule for "data_analysis" → gemini-1.5-pro
```

El umbral es configurable vía `CLASSIFIER_AUTO_EVOLVE_THRESHOLD` (default: desactivado hasta Capa D validada).

---

## Estructura de archivos

```
router/src/classifier/
├── index.js          ← orquestador (reemplaza classifier.js raíz)
├── rules.js          ← reglas base regex (fallback rápido, ADR-001 legacy)
├── semantic.js       ← clasificación via Ollama structured output
├── embeddings.js     ← generación y búsqueda de embeddings (caché semántico)
├── feedback.js       ← captura y persiste señales implícitas por request
├── learner.js        ← análisis periódico del histórico + generación de insights
└── store.js          ← persistencia SQLite de decisiones y embeddings
```

## Flujo completo del clasificador (Capas A-C activas)

```
Request entra
      │
      ▼
[rules.js] ¿match trivial? (tool_use / empty / urgent)
      │ sí → decisión inmediata (< 1ms)
      │ no
      ▼
[embeddings.js] ¿existe caché semántico?
      │ hit → decisión cacheada (< 5ms)
      │ miss
      ▼
[semantic.js] clasificar con Ollama (~400ms)
      │
      ▼
confidence ≥ 0.6 → usar decisión
confidence < 0.6 → modelo default (seguro)
      │
      ▼
[feedback.js] registrar decisión para aprendizaje futuro
```

---

## Razones

- **Contexto implícito.** Un LLM local entiende "revisa esto" + historial de mensajes; las regex no.
- **Multilingüe por defecto.** El clasificador semántico maneja español, inglés y mezclas sin reglas explícitas.
- **Evolución gradual.** Las cinco capas son independientes. Si Capa A ya aporta valor, no es necesario implementar Capa E.
- **Sin dependencias externas nuevas.** Ollama ya está en el stack; solo se necesita un modelo más pequeño para clasificación.
- **La deuda técnica de ADR-001 queda saldada.** El scoring multi-criterio y la adaptación a patrones nuevos están cubiertos por Capas D y E.

---

## Consecuencias

**Positivas:**
- Clasificación correcta en escenarios que hoy fallan (contexto implícito, ambigüedad, idiomas mixtos).
- Base de datos de decisiones que hace al sistema auditable y mejorable.
- El sistema se vuelve más preciso con el uso, sin intervención manual.

**Limitaciones conocidas:**
- Capa A introduce latencia adicional (~400ms). Mitigado por Capa C (caché semántico).
- La calidad del clasificador semántico depende del modelo Ollama disponible localmente. En hardware limitado, puede requerirse un modelo más pequeño con menor precisión.
- Las señales implícitas son proxy de calidad, no ground truth. El sistema puede aprender patrones incorrectos si las señales son ruidosas.

**Deuda técnica:**
- `classifier.js` (raíz) queda como wrapper de compatibilidad hasta completar Capa A. Se elimina cuando `classifier/index.js` esté validado.
- El quota-tracker por proveedor de ADR-001 pierde sentido con OpenRouter (ADR-002). Se mantiene temporalmente como telemetría de uso por modelo hasta diseñar el módulo de costos unificado.

---

## Plan de implementación por fases

| Capa | Epic en roadmap | Prerequisito |
|---|---|---|
| A — Semántico | Fase 1: Semantic Classifier | ADR-002 (OpenRouter) implementado |
| B — Captura de señales | Fase 1: Decision Store | Capa A en producción |
| C — Caché semántico | Fase 1: Semantic Cache | Capa B (store disponible) |
| D — Learner | Fase 2: Classifier Learner | Capa B con ≥ 500 registros |
| E — Auto-evolución | Fase 2: Auto-evolve | Capa D validada manualmente |

---

## Referencias

- Supersede: [ADR-001](ADR-001-routing-classification-model.md)
- Relacionado: [ADR-002](ADR-002-openrouter-unified-backend.md) — los model IDs en `semantic.js` usan formato OpenRouter
- Implementación destino: `router/src/classifier/`
- Modelo clasificador recomendado: `qwen2.5:3b` o `phi3:mini` vía Ollama
