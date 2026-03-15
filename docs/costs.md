# Tracking de costos y ahorro

El router registra automáticamente el uso real de tokens en cada request y lo compara contra lo que habría costado sin optimización.

## Qué se mide

### Requests remotos (Claude / OpenAI)

| Campo | Descripción |
|-------|-------------|
| `tokens.original` | Estimación de tokens del prompt original completo (antes de compresión) |
| `tokens.sent` | Tokens reales enviados al LLM (según la API — más preciso que word count) |
| `tokens.output` | Tokens de la respuesta generada |
| `costs.input` | Costo real de los tokens enviados |
| `costs.output` | Costo real de los tokens de respuesta |
| `costs.total` | Costo real total del request |
| `costs.saved` | Ahorro estimado por compresión de contexto |

### Requests locales (Ollama)

| Campo | Descripción |
|-------|-------------|
| `tokens.original` | Tokens del prompt enviado a Ollama |
| `tokens.output` | Tokens de la respuesta de Ollama |
| `costs.total` | Siempre $0 (procesamiento local) |
| `costs.saved` | Costo que habría tenido en el modelo frontier más barato disponible |

## Tabla de precios

El router incluye precios actualizados (USD por millón de tokens):

| Modelo | Input | Output |
|--------|-------|--------|
| `claude-opus-4-6` | $15.00 | $75.00 |
| `claude-sonnet-4-6` | $3.00 | $15.00 |
| `claude-3-5-sonnet` | $3.00 | $15.00 |
| `claude-3-5-haiku` | $0.80 | $4.00 |
| `claude-3-haiku` | $0.25 | $1.25 |
| `gpt-4o` | $2.50 | $10.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `gpt-4-turbo` | $10.00 | $30.00 |
| `gemini-1.5-pro` | $1.25 | $5.00 |
| `gemini-1.5-flash` | $0.075 | $0.30 |

Para calcular el ahorro de requests locales, se usa el modelo más barato entre los proveedores con API key configurada (`claude-3-haiku`, `gpt-4o-mini`, o `gemini-1.5-flash`).

## Comando `/costs` desde el chat

### `/costs` — resumen global

```
Router · Resumen de Costos
_38 solicitudes · 3 sesión(es)_

Distribución de solicitudes
  Remotas  ████████████████░░░░░░░░ 28
  Locales  ████░░░░░░░░░░░░░░░░░░░░ 10 (gratis)

Tokens
  Original  45,230 tokens
  Enviados  ████████████████░░░░░░░░ 71% del original
  Reducción 13,117 tokens menos enviados al LLM

Costo real vs sin router
  Sin router  $0.1892
  Con router  $0.1124
  Ahorro      █████████░░░░░░░░░░░░░░░ 41% ahorrado
  Local       $0.0034 adicional (Ollama gratis)

Modelos utilizados
  · gpt-4o: 21 req
  · claude-sonnet-4-6: 7 req

───────────────────────────────
💰 Ahorro total estimado: $0.0768
💵 Gasto real acumulado:  $0.1124
```

### `/costs session` — sesión actual

Muestra el detalle de la sesión activa incluyendo las últimas 5 solicitudes con hora, modelo y costo individual.

### `/costs top` — ranking por ahorro

```
Router · Top sesiones por ahorro

1. `ai-router`
   ████████████████████ $0.0456 · 15 req

2. `optifac`
   █████████████░░░░░░░ $0.0298 · 32 req

3. `k8s-prod`
   ████░░░░░░░░░░░░░░░░ $0.0089 · 4 req
```

### `/costs reset`

Reinicia los contadores de la sesión actual sin afectar otras sesiones.

## API REST de costos

```bash
# Totales globales
GET /router/costs

# Sesión específica
GET /router/costs/mi-proyecto

# Limpiar sesión
DELETE /router/costs/mi-proyecto

# Limpiar todo
DELETE /router/costs
```

Ver ejemplos con respuestas JSON en [api.md](api.md#endpoints-de-costos).

## Cómo interpretar el ahorro

El ahorro tiene dos componentes:

**Ahorro por compresión:** cuando el prompt supera `COMPRESSOR_TOKEN_THRESHOLD` tokens, Ollama lo comprime antes de enviarlo. La diferencia entre tokens originales y tokens enviados se multiplica por el precio del modelo.

**Ahorro por enrutamiento local:** cuando el clasificador decide que el request puede manejarlo Ollama, el costo es $0. El "ahorro" reportado es lo que habría costado enviarlo al LLM más barato disponible (incluyendo tanto el input como el output).

> El ahorro es una **estimación**. Los tokens originales se calculan con word count (no BPE), por lo que puede haber diferencias respecto a los tokens reales de la API. Los tokens enviados sí son exactos (vienen del campo `usage` de la respuesta de la API).
