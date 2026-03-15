# ADR-001: Modelo de enrutamiento y clasificación de prompts

**Estado:** Aceptado
**Fecha:** 2026-03-15
**Autores:** equipo ORION

---

## Contexto

ORION necesita decidir, en cada request, qué modelo de lenguaje debe atenderlo. Los criterios relevantes son costo, capacidad del modelo y tipo de tarea. La pregunta es: ¿cómo se toma esa decisión y con qué criterios?

Las opciones evaluadas fueron:

1. **Reglas deterministas por patrones** — analizar el texto del prompt buscando señales explícitas (código, rutas de archivo, urgencia, etc.) y usar un umbral de tokens como fallback.
2. **Scoring multi-criterio ponderado** — asignar pesos a variables como costo estimado, longitud, tipo de tarea y complejidad inferida, y calcular un score para cada modelo candidato.
3. **Clasificador ML** — entrenar un modelo ligero que aprenda a enrutar a partir de ejemplos etiquetados.

---

## Decisión

Se adoptó la opción **1 — reglas deterministas por patrones**, con la siguiente lógica en orden de prioridad:

| Señal detectada en el prompt | Destino |
|------------------------------|---------|
| Palabras de urgencia (`urgent`, `emergencia`, `prioridad`) | Claude 3.5 Sonnet (remoto) |
| Términos legales/normativos (`legal`, `contrato`, `cumplimiento`) | Gemini 1.5 Pro (remoto) |
| Bloque de código (` ``` `) | Claude 3.5 Sonnet (remoto) |
| Ruta de archivo (`/path/to/file.ext`) | Claude 3.5 Sonnet (remoto) |
| Tool result / tool call | Claude 3.5 Sonnet (remoto) |
| Ninguna señal + tokens < 800 | Ollama local (Mistral, $0.00) |
| Ninguna señal + tokens ≥ 800 | Claude 3.5 Sonnet (remoto, default) |

El umbral de tokens y el modelo default son configurables vía variables de entorno (`LOCAL_MODEL_THRESHOLD`, `DEFAULT_REMOTE_MODEL`).

Las decisiones se cachean 120 segundos para prompts idénticos.

---

## Razones

- **Predecible y auditable.** El comportamiento del router puede verificarse leyendo el código, sin caja negra ni datos de entrenamiento. Importante en fase temprana donde la confianza del equipo en el sistema es baja.
- **Cero dependencias adicionales.** Un clasificador ML requeriría dataset, entrenamiento y mantenimiento. Las reglas viven en un archivo JS de ~60 líneas.
- **Suficiente para Fase 0.** El objetivo de esta fase es demostrar que el concepto funciona y generar ahorro medible. Las reglas actuales cubren los casos más frecuentes en flujos de desarrollo.
- **Fácil de extender.** Agregar una nueva regla es añadir una entrada al array en `classifier.js`. No requiere reentrenamiento ni despliegue especial.

---

## Consecuencias

**Positivas:**
- Latencia de clasificación < 5 ms (sin llamadas externas).
- Comportamiento 100% reproducible dado el mismo input.
- Cualquier miembro del equipo puede leer y modificar las reglas sin contexto adicional.

**Limitaciones conocidas:**
- El sistema no aprende ni se adapta. Si un patrón nuevo emerge (ej. prompts de análisis de datos que merecen Gemini), hay que añadir la regla manualmente.
- El conteo de tokens es por palabras (heurística), no tokenización real. Puede diferir ±15% del conteo real del modelo.
- No hay ponderación multi-criterio: costo y latencia no influyen en la decisión, solo se registran.

**Deuda técnica aceptada:**
El scoring multi-criterio ponderado (opción 2) es el objetivo para fases posteriores del clasificador, una vez que haya suficiente telemetría real para calibrar los pesos. Este ADR deberá ser supersedido cuando se implemente.

---

## Referencias

- Implementación: `router/src/classifier.js`
- Configuración: `docs/configuration.md` → sección `LOCAL_MODEL_THRESHOLD`
- Pregunta que originó este ADR: discusión del equipo sobre transparencia en criterios de enrutamiento (2026-03-15)
