# Guía de despliegue

## Prerequisitos

- Docker Engine ≥ 24 y Docker Compose v2
- ~2 GB de espacio mínimo para el modelo clasificador (`qwen2.5:3b`)
- Una API key de [OpenRouter](https://openrouter.ai) (reemplaza a las claves individuales de Claude/OpenAI/Gemini)
- Usuario en el grupo `docker` (o acceso a `sudo`)

### Agregar usuario al grupo docker (una sola vez)

```bash
make docker-perms   # equivale a: sudo usermod -aG docker $USER
exec su -l $USER    # refresca la sesión sin cerrar terminal
```

---

## Primer despliegue

### 1. Obtener API key de OpenRouter

Crear cuenta en [openrouter.ai](https://openrouter.ai) → Settings → API Keys → Create Key.

Una sola key da acceso a Claude, Gemini, Llama y 200+ modelos. No se necesitan claves individuales de proveedor.

### 2. Configurar variables de entorno

```bash
make init   # copia .env.example → .env
```

Edita `.env` y configura las variables mínimas:

```dotenv
# Requerida — backend remoto unificado
OPENROUTER_API_KEY=sk-or-v1-...

# Modelo local para inferencia, compresión y clasificación semántica
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=mistral
CLASSIFIER_MODEL=qwen2.5:3b
```

Las demás variables tienen valores por defecto funcionales. Ver [configuration.md](configuration.md) para el listado completo.

### 3. Verificar disponibilidad de puertos

```bash
make check-ports
```

ORION verifica si los puertos requeridos (`:3000` para el router, `:11434` para Ollama) están disponibles. Si alguno está ocupado, encuentra el siguiente libre y actualiza `.env`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORION — Verificación de puertos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[OK]    Puerto router :3000 disponible.
[WARN]  Puerto :11434 ocupado por ollama.
[WARN]  Puerto alternativo encontrado: :11435
[OK]    Actualizado OLLAMA_PORT=11435 en .env
```

> `make up` ejecuta este check automáticamente. Solo es necesario correrlo de forma independiente para revisar antes de levantar.

### 4. Verificar hardware y seleccionar modelo local

```bash
make check-hw
```

ORION detecta tu hardware y recomienda el mejor modelo local:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORION — Análisis de hardware y selección de LLM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO]  RAM disponible:       24 GB
[INFO]  VRAM GPU (NVIDIA):    4 GB
[INFO]  Modelo actual (.env): mistral
[INFO]  Modelo recomendado:   qwen2.5-coder:7b
```

```bash
make optimize-model   # migración interactiva: descarga el recomendado, elimina el anterior (opcional)
```

Tabla de recomendaciones:

| RAM | VRAM | Modelo recomendado | Tamaño |
|-----|------|--------------------|--------|
| ≥32 GB | ≥8 GB | `deepseek-coder-v2:16b` | ~10 GB |
| ≥16 GB | ≥6 GB | `qwen2.5-coder:7b` | ~5 GB |
| ≥8 GB | ≥4 GB | `mistral` | ~4 GB |
| <8 GB | — | `phi3:mini` | ~2 GB |

> El `CLASSIFIER_MODEL` (`qwen2.5:3b`) es independiente del `OLLAMA_MODEL`. El clasificador usa siempre el modelo pequeño; el modelo de inferencia puede ser más grande.

### 5. Levantar el stack

```bash
make up
```

Este comando:
1. Verifica puertos disponibles
2. Analiza hardware y ofrece migrar el modelo si hay uno mejor
3. Levanta `router` y `ollama` con `docker compose up --build`
4. Descarga automáticamente el `CLASSIFIER_MODEL` si no está disponible

### 6. Verificar el despliegue

```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{"status": "ok", "version": "0.6.0", "env": "development"}
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

### 7. Probar una consulta

```bash
# Consulta corta → va a Ollama local
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-context-id: test" \
  -d '{
    "model": "ignored-by-router",
    "messages": [{"role": "user", "content": "¿Qué es Docker en una frase?"}]
  }'

# Consulta con código → clasificador detecta 'code' → OpenRouter anthropic/claude-3.5-sonnet
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-context-id: test" \
  -d '{
    "model": "ignored-by-router",
    "messages": [{"role": "user", "content": "Revisa este código:\n```js\nconst x = 1\n```"}]
  }'
```

> **Nota:** El campo `model` del request es ignorado por el router. El clasificador decide el modelo según el contenido del mensaje.

Ver la decisión tomada en la respuesta:
```json
{
  "classifierSource": "semantic",
  "routeResult": {
    "target": "remote",
    "model": "anthropic/claude-3.5-sonnet",
    "reason": "semantic:code",
    "confidence": 0.94
  }
}
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
# Filtrados por componente:
docker compose logs -f router | grep "\[cost\]"
docker compose logs -f router | grep "\[classifier\]"
docker compose logs -f router | grep "\[proxy\]"
```

---

## Actualizar el router

```bash
make down && make build && make up
```

O solo reconstruir el router:

```bash
docker compose up --build router
```

---

## Servicios y puertos

| Servicio | Puerto host | Descripción |
|----------|-------------|-------------|
| Router | `3000` | API principal (OpenAI-compatible) |
| Ollama | `11434` | Inferencia local + clasificador semántico |

Desde otros contenedores en la red `router-net`:
- Router: `http://router:3000`
- Ollama: `http://ollama:11434`

---

## Volúmenes

| Volumen | Montaje | Contenido |
|---------|---------|-----------|
| `./models` | `/root/.ollama` (ollama) | Pesos de modelos locales |
| `router-sessions` | `/data/sessions` (router) | Sesiones persistidas en JSON |
| `./data` | `/data` (router) | Decisiones del clasificador (`decisions.json`), quota tracker |

```bash
docker volume inspect ai_router_router-sessions
```

---

## Endpoints de monitoreo

| Endpoint | Descripción |
|---|---|
| `GET /health` | Estado del router |
| `GET /router/costs` | Resumen de costos por sesión |
| `GET /router/quota` | Cuota diaria por proveedor |
| `GET /router/classifier/decisions` | Historial de decisiones del clasificador con señales de calidad |

---

## Checklist de lanzamiento

- [ ] `OPENROUTER_API_KEY` configurada en `.env`
- [ ] `OLLAMA_URL` apunta al servicio Ollama correcto
- [ ] `CLASSIFIER_MODEL` (`qwen2.5:3b`) descargado en Ollama
- [ ] `make check-hw` revisado — modelo de inferencia recomendado anotado
- [ ] `make up` completado sin errores
- [ ] `curl http://localhost:3000/health` devuelve `{"status":"ok"}`
- [ ] `docker compose ps` muestra ambos servicios `Up`
- [ ] Test de consulta corta (→ Ollama local) responde correctamente
- [ ] Test de consulta con código (→ OpenRouter) responde correctamente
- [ ] Para OpenCode: `~/.config/opencode/opencode.json` configurado con `baseURL: http://localhost:3000`

---

## Producción

- Usar un reverse proxy (nginx, Caddy) con TLS en frente del puerto 3000
- Configurar `NODE_ENV=production` y `LOG_LEVEL=warn` en `.env`
- Mover `./data` a almacenamiento persistente externo
- Gestionar `OPENROUTER_API_KEY` desde un gestor de secretos en lugar de `.env` plano
