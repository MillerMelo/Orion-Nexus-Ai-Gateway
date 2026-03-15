# Desarrollo y tests

## Estructura del código

```
router/src/
├── server.js           # Entry point: registra middlewares y endpoints
├── config.js           # Variables de entorno con defaults
├── helpers.js          # Funciones puras reutilizables
│
├── autoSession.js      # Middleware: deriva x-context-id del system prompt
├── compression.js      # Middleware: comprime prompts largos con Ollama
├── summary.js          # Middleware: genera resumen semántico del turno
├── context.js          # Middleware: inyecta y guarda contexto cross-session
├── routing.js          # Middleware: clasifica y cachea la decisión de enrutamiento
├── proxy.js            # Middleware: llama al proveedor y hace streaming
│
├── classifier.js       # Lógica pura de clasificación (reglas)
├── cache.js            # Caché TTL en memoria
├── contextStore.js     # Almacenamiento de sesiones (memoria + disco)
├── costs.js            # Tracking de tokens y costos por sesión
├── ollamaClient.js     # Cliente HTTP para Ollama /api/generate
│
├── sessionCommand.js   # Comando /session desde el chat
├── costsCommand.js     # Comando /costs desde el chat
├── simulation.js       # Comando /simulate desde el chat
│
└── providers/
    ├── claude.js       # Llamada a Anthropic /v1/messages
    ├── openai.js       # Llamada a OpenAI /v1/chat/completions
    ├── ollama.js       # Llamada a Ollama /v1/chat/completions
    └── stream.js       # Proxy SSE con captura de usage tokens
```

## Ejecutar tests

```bash
# En contenedor (idéntico a CI)
make test

# Directamente en el host (requiere Node.js 20+)
cd router
node --test
```

Los tests usan el runner nativo de Node.js (`node:test`). No se requiere framework externo.

### Tests existentes

| Archivo | Qué prueba |
|---------|-----------|
| `cache.test.js` | TTL, hit/miss, expiración |
| `classifier.test.js` | Todas las reglas de clasificación y fallbacks |
| `compression.test.js` | Compresión con Ollama mockeado, multi-turn skip |
| `context.test.js` | Inyección de contexto, detección de new vs multi-turn |
| `contextStore.test.js` | Operaciones CRUD, límite de historial |
| `helpers.test.js` | countTokens, getLastUserMessage, gatherPromptFromBody |
| `routing.test.js` | Decisiones de enrutamiento, cache hit |
| `simulation.test.js` | Detección del comando /simulate, fases |
| `summary.test.js` | Threshold, ventana de tokens, instrucción de resumen |

---

## Agregar un nuevo proveedor

### 1. Crear el módulo del proveedor

Crea `router/src/providers/miprovedor.js` siguiendo el contrato de los providers existentes:

```js
import { config } from '../config.js';
import { errorFromResponse } from '../retry.js';

export async function callMiProveedor(req, locals) {
  if (!config.miProveedorApiKey) {
    return { ok: false, status: 500, error: 'MI_PROVEEDOR_API_KEY not configured' };
  }

  // Construye el payload usando locals.originalMessages y locals.compressedPrompt
  const payload = buildPayload(req.body, locals.originalMessages, locals.compressedPrompt);

  try {
    const response = await fetch(`${config.miProveedorBaseUrl}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.miProveedorApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return errorFromResponse(response);

    return { ok: true, response };
  } catch (err) {
    return { ok: false, status: 502, error: `MiProveedor unreachable: ${err.message}` };
  }
}
```

El contrato es simple:
- Recibe `(req, locals)` donde `locals` tiene `originalMessages` y `compressedPrompt`
- Devuelve `{ ok: true, response }` (donde `response` es el objeto `fetch Response`) en caso de éxito
- Devuelve `{ ok: false, status, error }` en caso de fallo
- Usa **`errorFromResponse(response)`** para los errores HTTP — esto incluye automáticamente el tiempo de espera del header `Retry-After` si el API devuelve 429, habilitando retry inteligente sin código adicional

### 2. Agregar variables de configuración

En `config.js`:
```js
miProveedorApiKey: process.env.MI_PROVEEDOR_API_KEY,
miProveedorBaseUrl: process.env.MI_PROVEEDOR_BASE_URL || 'https://api.miprovedor.com',
```

En `.env.example`:
```dotenv
MI_PROVEEDOR_API_KEY=
MI_PROVEEDOR_BASE_URL=https://api.miprovedor.com
```

### 3. Registrar en el proxy

En `proxy.js`, agrega el proveedor a los mapas de enrutamiento:

```js
import { callMiProveedor } from './providers/miprovedor.js';

const PRIMARY = {
  claude:       callClaude,
  openai:       callOpenAI,
  miprovedor:   callMiProveedor,   // ← agregar
};

const FALLBACK_CHAIN = {
  claude:       callOpenAI,
  gemini:       callOpenAI,
  miprovedor:   callOpenAI,        // ← fallback a OpenAI
  default:      callOpenAI,
};

const PROVIDER_DEFAULT_MODEL = {
  claude:       config.defaultRemoteModel,
  openai:       config.openaiDefaultModel,
  ollama:       config.ollamaModel,
  miprovedor:   config.miProveedorDefaultModel,  // ← agregar
};
```

### 4. Agregar regla al clasificador (opcional)

En `classifier.js`, agrega una regla que dirija ciertos prompts a tu proveedor:

```js
const rules = [
  // ... reglas existentes ...
  {
    name: 'contains_X',
    test: (t) => /tupatron/i.test(t),
    result: { target: 'remote', provider: 'miprovedor', model: 'mi-modelo' },
  },
];
```

### 5. Agregar precios al tracking de costos (opcional)

En `costs.js`:
```js
const MODEL_PRICING = {
  // ... precios existentes ...
  'mi-modelo-v1': { input: 2.00, output: 8.00 },
};
```

---

## Agregar una nueva regla de clasificación

Las reglas están en `classifier.js` como un array de objetos con `{ name, test, result }`:

```js
// Ejemplo: enrutar contenido de bases de datos a un modelo especializado
{
  name: 'contains_sql',
  test: (t) => /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bCREATE TABLE\b/i.test(t),
  result: { target: 'remote', provider: 'openai', model: 'gpt-4o' },
},
```

Las reglas se evalúan en orden; la primera que coincide gana. El fallback final es por tamaño de tokens.

---

## Agregar un nuevo comando de chat

Sigue el patrón de `sessionCommand.js` o `costsCommand.js`:

1. Detecta el prefijo en el último mensaje del usuario
2. Ejecuta la lógica del comando
3. Devuelve una respuesta falsa en formato Claude o OpenAI según el endpoint
4. Registra el middleware en `server.js` antes del pipeline de compresión

```js
// mi-comando.js
import { getLastUserMessage } from './helpers.js';

export function miComandoMiddleware(req, res, next) {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const last = getLastUserMessage(messages).trim();
  if (!last.startsWith('/micomando')) return next();

  const text = '**Mi Comando**\n\nResultado del comando aquí.';
  const isOpenAI = req.path === '/v1/chat/completions';

  return res.json(isOpenAI
    ? { object: 'chat.completion', choices: [{ message: { role: 'assistant', content: text } }] }
    : { type: 'message', role: 'assistant', content: [{ type: 'text', text }] }
  );
}
```

---

## Convenciones

- **ES Modules:** todo el código usa `import/export` (el `package.json` tiene `"type": "module"`)
- **Sin transpilación:** el código corre directamente en Node.js 20 — sin TypeScript, sin Babel
- **Middlewares Express:** cada etapa del pipeline es un middleware independiente con `(req, res, next)`
- **`res.locals`:** los middlewares se comunican entre sí a través de `res.locals`, nunca modificando `req.body` (excepto `autoSession` que agrega el header)
- **Providers:** devuelven `{ ok, response }` o `{ ok, status, error }` — nunca lanzan excepciones
- **Tests:** usan `node:test` y `node:assert` nativos, sin frameworks externos
