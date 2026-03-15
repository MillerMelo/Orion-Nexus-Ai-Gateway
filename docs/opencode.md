# Integración con OpenCode

OpenCode es un cliente CLI para LLMs que soporta configurar proveedores personalizados con base URL propia. El router se integra de forma transparente — OpenCode no sabe que hay un proxy en el medio.

## Configuración global

Crea o edita `~/.config/opencode/opencode.json` para redirigir todas las llamadas a Anthropic al router:

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

Con esto, cada vez que OpenCode haga una llamada a Claude, irá al router en lugar de ir directamente a `api.anthropic.com`.

> **API key:** OpenCode sigue usando su propia key de Anthropic para autenticarse. El router usa su propia `CLAUDE_API_KEY` (del `.env`) para el forward. Ambas keys son independientes.

## Configuración por proyecto

Para que cada proyecto tenga su propia sesión de contexto, crea un `opencode.json` en la raíz del proyecto:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "models": {
        "claude-sonnet-4-6": {
          "headers": {
            "x-context-id": "nombre-del-proyecto"
          }
        },
        "claude-opus-4-6": {
          "headers": {
            "x-context-id": "nombre-del-proyecto"
          }
        }
      }
    }
  }
}
```

Cambia `nombre-del-proyecto` por un identificador único para el proyecto (p. ej. `ai-router`, `optifac-backend`, `k8s-infra`).

Este repositorio ya incluye un `opencode.json` de ejemplo con el ID `ai-router`.

## Auto-detección de sesión

Si no configuras un `opencode.json` por proyecto, el router intenta derivar el ID de sesión automáticamente desde el system prompt de OpenCode. OpenCode incluye el directorio de trabajo en su system prompt, y el router extrae el basename:

```
Directorio detectado: /home/dev/Projects/MiApp
→ Session ID derivado: MiApp
```

Patrones que el router reconoce:
```
<working-directory>/home/dev/Projects/MiApp</working-directory>
Working directory: /home/dev/Projects/MiApp
cwd: /home/dev/Projects/MiApp
```

Si ningún patrón coincide, el request se procesa sin sesión (sin contexto persistente).

## Flujo de una sesión real

```
1. Abres OpenCode en /home/dev/Projects/MiApp
   → opencode.json envía x-context-id: mi-app
   → (o el router detecta "MiApp" del system prompt)

2. Primera pregunta: "Agrega tests al módulo de usuario"
   → El router clasifica: contiene código/rutas → remote → Claude
   → Claude responde
   → El router guarda el resumen: "El usuario quiere agregar tests al módulo de usuario"

3. Terminas la sesión de OpenCode

4. Al día siguiente, abres OpenCode de nuevo en el mismo proyecto
   → El router detecta la sesión "mi-app"
   → En la primera pregunta, inyecta en el system prompt:
      "Previous context (summarized):
       [Turn 1]: El usuario quiere agregar tests al módulo de usuario"
   → Claude ya sabe de qué proyecto y contexto vienes
```

## Verificar que el router está activo

Desde el chat de OpenCode, escribe:

```
/session
```

Si el router está interceptando correctamente, verás algo como:

```
Router · Sesión activa
Nombre: (generando título…)
ID: `mi-app` · 0/6 turnos almacenados

Sin historial aún — se acumula automáticamente mientras conversas.

Comandos:
`/session list` · `/session search <tema>` · `/session rename <título>` · `/session clear`
```

Si en cambio OpenCode te responde con una respuesta normal de Claude sobre el comando `/session`, significa que el router **no está interceptando** — revisa que `baseURL` en el config global apunta a `http://localhost:3000` y que el stack está corriendo (`make up`).

## Comportamiento del clasificador con OpenCode

OpenCode envía mensajes con bloques de código, rutas de archivos, tool results y system prompts complejos. El clasificador reconoce todos estos patrones y los enruta a Claude:

| Contenido del mensaje | Enrutamiento |
|----------------------|--------------|
| Bloque de código (` ``` `) | → Claude 3.5 Sonnet |
| Ruta de archivo (`/src/index.js`) | → Claude 3.5 Sonnet |
| Tool result (`tool_result`, `tool_use`) | → Claude 3.5 Sonnet |
| System prompt complejo (`You are...`) | → Default remote |
| Pregunta corta sin código | → Ollama local (< 150 tokens) |

Esto significa que las consultas interactivas breves pueden ir a Mistral local (gratis, ~15-40s), mientras que las tareas de código siempre van a Claude o su fallback.

## Modelos compatibles

El router acepta cualquier nombre de modelo que Claude reconozca. OpenCode puede usar:

```
claude-sonnet-4-6
claude-opus-4-6
claude-haiku-4-5
claude-3-5-sonnet-20241022
claude-3-7-sonnet-20250219
```

El router usa el nombre del modelo para seleccionar los precios correctos en el tracking de costos. Si el modelo no está en la tabla de precios, usa el precio del modelo más similar (prefix match).

## Troubleshooting

**El router no intercepta las llamadas de OpenCode:**
- Verifica que `~/.config/opencode/opencode.json` existe y tiene `baseURL: http://localhost:3000`
- Verifica que el router está corriendo: `curl http://localhost:3000/health`
- Reinicia OpenCode después de editar el config

**Los requests van a Ollama cuando deberían ir a Claude:**
- El clasificador usa umbral de 150 tokens. Prompts cortos (preguntas simples) van a Ollama por diseño.
- Para forzar remote, incluye código o rutas de archivo en tu mensaje, o ajusta `LOCAL_MODEL_THRESHOLD` en `.env`.

**La sesión no se detecta automáticamente:**
- Verifica que el system prompt de OpenCode incluye el directorio de trabajo.
- Como alternativa, configura `x-context-id` explícitamente en el `opencode.json` del proyecto.

**Error de timeout en Ollama:**
- Mistral en CPU tarda 12-40s por respuesta. El default es 120s.
- Si necesitas más tiempo, ajusta `OLLAMA_REQUEST_TIMEOUT_MS` en `.env`.
