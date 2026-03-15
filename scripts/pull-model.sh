#!/usr/bin/env bash
# pull-model.sh — Hardware-aware Ollama model setup.
# Replaces pull-mistral.sh: detects hardware, recommends the best local LLM,
# and handles migration from the current model if a better one is available.
#
# Usage:
#   ./scripts/pull-model.sh               # interactive (auto mode during make up)
#   ./scripts/pull-model.sh --force <model>  # force a specific model, skip prompt
#   ./scripts/pull-model.sh --check       # only run hardware check, no pull

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=".env"

# ─── colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "[$(date '+%H:%M:%S')] $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()   { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ─── hardware detection (inline, same logic as check-hardware.sh) ─────────────

detect_ram_gb() {
  local ram_kb
  ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  echo $(( ram_kb / 1024 / 1024 ))
}

detect_vram_gb() {
  if command -v nvidia-smi &>/dev/null 2>&1; then
    local vram_mb
    vram_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
    if [[ -n "$vram_mb" && "$vram_mb" =~ ^[0-9]+$ ]]; then
      echo $(( vram_mb / 1024 ))
      return
    fi
  fi
  echo 0
}

recommend_model() {
  local ram_gb="$1" vram_gb="$2"
  if   (( ram_gb >= 32 && vram_gb >= 8 )); then echo "deepseek-coder-v2:16b"
  elif (( ram_gb >= 32 ));                 then echo "deepseek-coder-v2:16b"
  elif (( ram_gb >= 16 && vram_gb >= 6 )); then echo "qwen2.5-coder:7b"
  elif (( ram_gb >= 16 ));                 then echo "qwen2.5-coder:7b"
  elif (( ram_gb >= 8 ));                  then echo "mistral"
  else                                          echo "phi3:mini"
  fi
}

get_current_model() {
  if [[ -f "$ENV_FILE" ]]; then
    grep -E '^OLLAMA_MODEL=' "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'" || echo "mistral"
  else
    echo "mistral"
  fi
}

# ─── Ollama helpers ───────────────────────────────────────────────────────────

ollama_exec() {
  sudo docker compose exec -T ollama ollama "$@"
}

wait_for_ollama() {
  info "Esperando que Ollama esté listo..."
  local attempts=0
  until ollama_exec list &>/dev/null; do
    sleep 2
    attempts=$(( attempts + 1 ))
    if (( attempts > 30 )); then
      err "Ollama no responde después de 60 segundos. Verifica el stack."
      exit 1
    fi
  done
  ok "Ollama está listo."
}

model_is_downloaded() {
  local model="$1"
  # ollama list output: "mistral:latest  <id>  <size>  <date>"
  # strip tag for comparison if not specified
  local model_base="${model%%:*}"
  ollama_exec list 2>/dev/null | awk 'NR>1 {print $1}' | grep -q "^${model_base}" 2>/dev/null
}

pull_model() {
  local model="$1"
  info "Descargando modelo ${BOLD}$model${RESET} (puede tardar varios minutos)..."
  ollama_exec pull "$model"
  ok "Modelo $model descargado."
}

remove_model() {
  local model="$1"
  info "Eliminando modelo $model..."
  ollama_exec rm "$model" 2>/dev/null || warn "No se pudo eliminar $model (puede que no exista)."
  ok "Modelo $model eliminado."
}

update_env_model() {
  local new_model="$1"
  if [[ -f "$ENV_FILE" ]]; then
    # In-place replacement: works on Linux sed
    sed -i "s|^OLLAMA_MODEL=.*|OLLAMA_MODEL=${new_model}|" "$ENV_FILE"
    ok "Actualizado OLLAMA_MODEL=$new_model en $ENV_FILE"
  else
    warn "$ENV_FILE no existe. Crea el archivo con: make init"
  fi
}

# ─── main flow ────────────────────────────────────────────────────────────────

main() {
  local force_model=""
  local check_only=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)   force_model="${2:-}"; shift 2 ;;
      --check)   check_only=true; shift ;;
      *)         shift ;;
    esac
  done

  # ── step 0: port availability ─────────────────────────────────────────────
  bash "${SCRIPT_DIR}/check-ports.sh"

  # ── step 1: hardware analysis ──────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  ORION — Análisis de hardware y selección de LLM  ${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  local ram_gb vram_gb recommended current_model
  ram_gb=$(detect_ram_gb)
  vram_gb=$(detect_vram_gb)
  recommended=$(recommend_model "$ram_gb" "$vram_gb")
  current_model=$(get_current_model)

  info "RAM disponible:       ${BOLD}${ram_gb} GB${RESET}"
  if (( vram_gb > 0 )); then
    info "VRAM GPU (NVIDIA):    ${BOLD}${vram_gb} GB${RESET}"
  else
    info "GPU NVIDIA:           ${YELLOW}no detectada — modo CPU${RESET}"
  fi
  info "Modelo actual (.env): ${BOLD}${current_model}${RESET}"
  info "Modelo recomendado:   ${GREEN}${BOLD}${recommended}${RESET}"

  echo ""

  if $check_only; then
    echo -e "Para aplicar la recomendación ejecuta: ${BOLD}make optimize-model${RESET}"
    exit 0
  fi

  # Override with --force flag
  if [[ -n "$force_model" ]]; then
    recommended="$force_model"
    info "Modelo forzado por argumento: $recommended"
  fi

  # ── step 2: start Ollama ───────────────────────────────────────────────────
  log "Iniciando servicio Ollama..."
  sudo docker compose up -d ollama
  wait_for_ollama

  # ── step 3: migration check ────────────────────────────────────────────────
  local needs_migration=false

  # Compare base names (ignore tags like :latest)
  local current_base="${current_model%%:*}"
  local recommended_base="${recommended%%:*}"

  if [[ "$current_base" != "$recommended_base" ]]; then
    needs_migration=true
  fi

  if $needs_migration && [[ -z "$force_model" ]]; then
    echo -e "${YELLOW}${BOLD}⚠  Se recomienda cambiar el modelo local:${RESET}"
    echo ""
    echo -e "  Actual:      ${YELLOW}${current_model}${RESET}"
    echo -e "  Recomendado: ${GREEN}${recommended}${RESET}"
    echo ""

    # Explain why
    if (( ram_gb >= 32 )); then
      echo -e "  Con ${ram_gb} GB de RAM puedes correr modelos más grandes que mejoran"
      echo -e "  la calidad de compresión de contexto y resúmenes semánticos."
    elif (( ram_gb >= 16 )); then
      echo -e "  Con ${ram_gb} GB de RAM un modelo de código especializado"
      echo -e "  produce mejores comprensiones que Mistral para prompts técnicos."
    fi

    echo ""
    echo -n -e "  ${BOLD}¿Descargar el modelo recomendado? [s/N]:${RESET} "
    local answer
    read -r answer
    echo ""

    if [[ "${answer,,}" != "s" && "${answer,,}" != "si" && "${answer,,}" != "y" ]]; then
      info "Manteniendo el modelo actual: $current_model"
      needs_migration=false
    fi
  fi

  # ── step 4: download recommended model if needed ──────────────────────────
  if $needs_migration || [[ -n "$force_model" ]]; then
    if model_is_downloaded "$recommended"; then
      ok "El modelo $recommended ya está descargado."
    else
      pull_model "$recommended"
    fi

    # Update .env
    update_env_model "$recommended"

    # ── step 5: offer to remove old model ─────────────────────────────────
    if model_is_downloaded "$current_model" && [[ "$current_base" != "$recommended_base" ]]; then
      echo ""
      echo -n -e "  ${BOLD}¿Eliminar el modelo anterior ($current_model) para liberar espacio? [s/N]:${RESET} "
      local rm_answer
      read -r rm_answer
      echo ""

      if [[ "${rm_answer,,}" == "s" || "${rm_answer,,}" == "si" || "${rm_answer,,}" == "y" ]]; then
        remove_model "$current_model"
      else
        info "Modelo anterior $current_model conservado."
      fi
    fi

    echo ""
    echo -e "${GREEN}${BOLD}✓ Configuración actualizada.${RESET}"
    echo -e "  Ejecuta ${BOLD}docker compose up --build router${RESET} para aplicar el cambio."
    echo ""

  else
    # ── already using the right model, just ensure it's downloaded ─────────
    if model_is_downloaded "$current_model"; then
      ok "Modelo $current_model ya disponible, no se requiere descarga."
    else
      pull_model "$current_model"
    fi
  fi
}

main "$@"
