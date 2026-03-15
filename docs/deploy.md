# Guía de despliegue

## Prerequisitos

- Docker Engine ≥ 24 y Docker Compose v2
- ~5 GB de espacio en disco para el modelo Mistral
- Al menos una API key configurada (Claude, OpenAI, o Gemini)
- Usuario en el grupo `docker` (o acceso a `sudo`)

### Agregar usuario al grupo docker (una sola vez)

```bash
make docker-perms   # equivale a: sudo usermod -aG docker $USER
exec su -l $USER    # refresca la sesión sin cerrar terminal
```

---

## Primer despliegue

### 1. Configurar variables de entorno

```bash
make init   # copia .env.example → .env
```

Edita `.env` y rellena al menos una API key de proveedor remoto:

```dotenv
CLAUDE_API_KEY=sk-ant-api03-...    # Anthropic
OPENAI_API_KEY=sk-proj-...         # OpenAI (también actúa como fallback)
GEMINI_API_KEY=AIza...             # Google AI Studio
```

Las demás variables tienen valores por defecto funcionales. Ver [configuration.md](configuration.md) para el listado completo.

### 2. Verificar disponibilidad de puertos

```bash
make check-ports
```

ORION verifica si los puertos requeridos (`:3000` para el router, `:11434` para Ollama) están disponibles en el host. Si alguno está ocupado, encuentra el siguiente libre y actualiza `.env` automáticamente:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORION — Verificación de puertos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[OK]    Puerto router :3000 disponible.
[WARN]  Puerto :11434 ocupado por ollama.
[WARN]  Puerto alternativo encontrado: :11435
[OK]    Actualizado OLLAMA_PORT=11435 en .env

⚠  El puerto del router cambió de :3000 a :3001
   Actualiza ~/.config/opencode/opencode.json:
   Cambia:  "baseURL": "http://localhost:3000"
   Por:     "baseURL": "http://localhost:3001"
```

> **Nota:** `make up` ejecuta este check automáticamente como primer paso. Solo es necesario correrlo de forma independiente si quieres revisar los puertos antes de levantar el stack.

### 3. Verificar hardware y seleccionar modelo local

```bash
make check-hw
```

ORION detecta automáticamente tu hardware y recomienda el mejor modelo local disponible:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORION — Análisis de hardware y selección de LLM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO]  RAM disponible:       24 GB
[INFO]  VRAM GPU (NVIDIA):    4 GB
[INFO]  Modelo actual (.env): mistral
[INFO]  Modelo recomendado:   qwen2.5-coder:7b
```

El comando `check-hw` solo muestra la recomendación. Para aplicarla:

```bash
make optimize-model   # migración interactiva: descarga el recomendado, elimina el anterior opcional
```

La tabla de recomendaciones según hardware:

| RAM | VRAM | Modelo recomendado | Tamaño |
|-----|------|--------------------|--------|
| ≥32 GB | ≥8 GB | `deepseek-coder-v2:16b` | ~10 GB |
| ≥32 GB | CPU | `deepseek-coder-v2:16b` | ~10 GB |
| ≥16 GB | ≥6 GB | `qwen2.5-coder:7b` | ~5 GB |
| ≥16 GB | CPU | `qwen2.5-coder:7b` | ~5 GB |
| ≥8 GB | ≥4 GB | `mistral` | ~4 GB |
| ≥8 GB | CPU | `mistral` | ~4 GB |
| <8 GB | — | `phi3:mini` | ~2 GB |

### 4. Levantar el stack

```bash
make up
```

Este comando:
1. Ejecuta `scripts/pull-model.sh` — analiza hardware, recomienda el mejor modelo, descarga si es necesario
2. Si el modelo recomendado difiere del actual, ofrece migrar (pregunta interactiva con `[s/N]`)
3. Levanta ambos servicios (`router` y `ollama`) con `docker compose up --build`

La primera ejecución puede tardar varios minutos mientras descarga el modelo:

```
[08:30:00] Iniciando servicio Ollama...
[INFO]  Esperando que Ollama esté listo...
[OK]    Ollama está listo.
[INFO]  RAM disponible:       24 GB
[INFO]  Modelo recomendado:   qwen2.5-coder:7b

⚠  Se recomienda cambiar el modelo local:
   Actual:      mistral
   Recomendado: qwen2.5-coder:7b

  ¿Descargar el modelo recomendado? [s/N]: s
[INFO]  Descargando modelo qwen2.5-coder:7b...
[OK]    Modelo qwen2.5-coder:7b descargado.
[OK]    Actualizado OLLAMA_MODEL=qwen2.5-coder:7b en .env

  ¿Eliminar el modelo anterior (mistral) para liberar espacio? [s/N]:
```

### 5. Verificar el despliegue

```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{"status": "ok", "version": "0.1.0", "env": "development"}
```

```bash
docker compose ps
```

Ambos servicios deben estar en estado `running`:
```
NAME      IMAGE                 STATUS
router    ai_router-router      Up 2 minutes
ollama    ollama/ollama:latest  Up 2 minutes
```

### 6. Probar una consulta

```bash
# Consulta corta → va a Ollama local
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-context-id: test" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "¿Qué es Docker en una frase?"}]
  }'

# Consulta con código → va a Claude/OpenAI
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-context-id: test" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Revisa este código:\n```js\nconst x = 1\n```"}]
  }'
```

---

## Comandos del día a día

```bash
make up             # Analizar hardware, seleccionar modelo, iniciar stack
make down           # Parar contenedores
make build          # Reconstruir imágenes sin iniciar
make logs           # Seguir logs del router en tiempo real
make test           # Ejecutar suite de tests
make clean          # Eliminar contenedores, redes e imágenes locales
make check-hw       # Mostrar análisis de hardware y recomendación (sin descargar)
make optimize-model # Migrar al modelo recomendado de forma interactiva
```

### Ver logs en tiempo real

```bash
make logs
# o filtrado:
docker compose logs -f router | grep "\[cost\]"
docker compose logs -f router | grep "\[proxy\]"
docker compose logs -f router | grep "\[context\]"
```

---

## Actualizar el router

Cuando hay cambios en el código del router:

```bash
make down
make build
make up
```

O solo reconstruir el router sin tocar Ollama (Mistral ya está descargado):

```bash
docker compose up --build router
```

---

## Servicios y puertos

| Servicio | Puerto host | Puerto interno | Descripción |
|----------|-------------|----------------|-------------|
| Router | `3000` | `3000` | API principal (Anthropic + OpenAI compatible) |
| Ollama | `11434` | `11434` | API de Ollama (para pruebas directas desde host) |

Desde otros contenedores en la misma red `router-net`:
- Router: `http://router:3000`
- Ollama: `http://ollama:11434`

---

## Volúmenes

| Volumen | Montaje | Contenido |
|---------|---------|-----------|
| `./models` | `/root/.ollama` (ollama) | Pesos del modelo Mistral |
| `router-sessions` | `/data/sessions` (router) | Sesiones persistidas en JSON |

El volumen `router-sessions` es un volumen Docker nombrado — persiste entre reinicios del contenedor y se puede inspeccionar con:

```bash
docker volume inspect ai_router_router-sessions
```

---

## Configuración de Ollama

### API Key (opcional)

Ollama no requiere API key por defecto. Si quieres activar autenticación:

```bash
# Con el stack levantado:
docker compose exec ollama ollama key create router --output json
# Copia el valor "key" y agrégalo a .env:
# OLLAMA_API_KEY=<valor>

# Luego recrea el router:
docker compose up --build router
```

Si `OLLAMA_API_KEY` está vacía en `.env`, el router no envía el header `Authorization` a Ollama.

### Cambiar el modelo local

Para usar un modelo diferente a Mistral (p. ej. `llama3.2`, `qwen2.5`):

1. Descarga el modelo:
   ```bash
   docker compose exec ollama ollama pull llama3.2
   ```

2. Actualiza `.env`:
   ```dotenv
   OLLAMA_MODEL=llama3.2
   ```

3. Recrea el router:
   ```bash
   docker compose up --build router
   ```

---

## Checklist de lanzamiento

- [ ] `.env` configurado con al menos una API key de proveedor remoto
- [ ] `make check-hw` revisado — modelo recomendado anotado
- [ ] `make up` completado sin errores (incluye selección/descarga del modelo local)
- [ ] `curl http://localhost:3000/health` devuelve `{"status":"ok"}`
- [ ] `docker compose ps` muestra ambos servicios `Up`
- [ ] Test de consulta corta (→ Ollama) responde correctamente
- [ ] Test de consulta con código (→ Claude/OpenAI) responde correctamente
- [ ] Para OpenCode: `~/.config/opencode/opencode.json` configurado con `baseURL: http://localhost:3000`

---

## Producción

Para despliegue en servidor remoto, considera:

- Usar un reverse proxy (nginx, Caddy) con TLS en frente del puerto 3000
- Mover el volumen `router-sessions` a almacenamiento persistente externo
- Configurar `NODE_ENV=production` en `.env`
- Usar `LOG_LEVEL=warn` para reducir verbosidad
- Montar las API keys desde un gestor de secretos en lugar de un `.env` plano
