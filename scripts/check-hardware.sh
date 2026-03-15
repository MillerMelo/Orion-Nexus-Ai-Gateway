#!/usr/bin/env bash
# check-hardware.sh — Detects local compute capabilities and recommends an Ollama model.
# Usage:
#   ./scripts/check-hardware.sh            # interactive display
#   source ./scripts/check-hardware.sh     # load functions without running main
#   RECOMMENDED_MODEL=$(./scripts/check-hardware.sh --model-only)

set -euo pipefail

# ─── colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── hardware detection ───────────────────────────────────────────────────────

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

detect_gpu_name() {
  if command -v nvidia-smi &>/dev/null 2>&1; then
    nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | sed 's/^[[:space:]]*//'
  else
    echo "No GPU detected"
  fi
}

detect_cpu_cores() {
  nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo
}

detect_disk_free_gb() {
  local target="${1:-./models}"
  if [[ ! -d "$target" ]]; then
    target="."
  fi
  df -BG "$target" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G'
}

detect_current_model() {
  local env_file="${1:-.env}"
  if [[ -f "$env_file" ]]; then
    grep -E '^OLLAMA_MODEL=' "$env_file" | cut -d= -f2 | tr -d '"' | tr -d "'"
  else
    echo "mistral"  # fallback to default
  fi
}

# ─── model recommendation ─────────────────────────────────────────────────────
# Returns: "model_name|reason|size_gb|tier"

recommend_model() {
  local ram_gb="$1" vram_gb="$2"

  # Tier 1: ≥32 GB RAM + ≥8 GB VRAM — best for code tasks
  if (( ram_gb >= 32 && vram_gb >= 8 )); then
    echo "deepseek-coder-v2:16b|Modelo de código de alta capacidad — GPU puede cargarlo completo|10|1"
    return
  fi

  # Tier 1b: ≥32 GB RAM, CPU only — 16B model runs in CPU
  if (( ram_gb >= 32 && vram_gb == 0 )); then
    echo "deepseek-coder-v2:16b|Gran capacidad de RAM permite correr 16B en CPU|10|1"
    return
  fi

  # Tier 2: ≥16 GB RAM + ≥6 GB VRAM — code-specialized 7B
  if (( ram_gb >= 16 && vram_gb >= 6 )); then
    echo "qwen2.5-coder:7b|Modelo especializado en código, corre completo en GPU|5|2"
    return
  fi

  # Tier 2b: ≥16 GB RAM, CPU only — 7B code model in CPU
  if (( ram_gb >= 16 && vram_gb == 0 )); then
    echo "qwen2.5-coder:7b|Modelo de código 7B — suficiente RAM para CPU inference|5|2"
    return
  fi

  # Tier 3: ≥8 GB RAM + ≥4 GB VRAM — standard mistral
  if (( ram_gb >= 8 && vram_gb >= 4 )); then
    echo "mistral|Modelo general equilibrado — encaja bien con GPU y RAM disponibles|4|3"
    return
  fi

  # Tier 3b: ≥8 GB RAM, CPU only — mistral in CPU
  if (( ram_gb >= 8 )); then
    echo "mistral|Modelo general — mínimo recomendado para compresión de contexto|4|3"
    return
  fi

  # Tier 4: <8 GB RAM — minimal model
  echo "phi3:mini|RAM insuficiente para modelos 7B — phi3:mini es la opción más liviana|2|4"
}

# ─── display ──────────────────────────────────────────────────────────────────

bar() {
  local val="$1" max="$2" width="${3:-20}"
  local filled=$(( val * width / max ))
  local empty=$(( width - filled ))
  printf '%s%s' "$(printf '█%.0s' $(seq 1 $filled 2>/dev/null || true))" \
                "$(printf '░%.0s' $(seq 1 $empty 2>/dev/null || true))"
}

tier_label() {
  case "$1" in
    1) echo -e "${GREEN}Alto rendimiento${RESET}" ;;
    2) echo -e "${GREEN}Bueno para código${RESET}" ;;
    3) echo -e "${YELLOW}Estándar${RESET}" ;;
    4) echo -e "${RED}Limitado${RESET}" ;;
    *) echo "Desconocido" ;;
  esac
}

print_hardware_report() {
  local ram_gb="$1" vram_gb="$2" gpu_name="$3" cpu_cores="$4" disk_gb="$5"
  local current_model="$6" recommended="$7" reason="$8" model_size="$9" tier="${10}"

  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║        ORION — Análisis de hardware local        ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
  echo ""

  echo -e "${BOLD}Hardware detectado:${RESET}"
  printf "  RAM        %s GB  [%s]\n" "$ram_gb" "$(bar $ram_gb 64 20)"
  if (( vram_gb > 0 )); then
    printf "  VRAM GPU   %s GB  [%s]\n" "$vram_gb" "$(bar $vram_gb 16 20)"
    printf "  GPU        %s\n" "$gpu_name"
  else
    printf "  GPU        Sin GPU NVIDIA detectada (modo CPU)\n"
  fi
  printf "  CPU cores  %s\n" "$cpu_cores"
  printf "  Disco lib. %s GB  [%s]\n" "$disk_gb" "$(bar $disk_gb 100 20)"

  echo ""
  echo -e "${BOLD}Modelo actual:${RESET}        ${YELLOW}$current_model${RESET}"
  echo -e "${BOLD}Modelo recomendado:${RESET}   ${GREEN}$recommended${RESET}  (~${model_size} GB)"
  echo -e "${BOLD}Tier de rendimiento:${RESET}  $(tier_label $tier)"
  echo -e "${BOLD}Razón:${RESET}                $reason"
  echo ""
}

# ─── main ─────────────────────────────────────────────────────────────────────

main() {
  local model_only=false
  [[ "${1:-}" == "--model-only" ]] && model_only=true

  local ram_gb vram_gb gpu_name cpu_cores disk_gb current_model
  ram_gb=$(detect_ram_gb)
  vram_gb=$(detect_vram_gb)
  gpu_name=$(detect_gpu_name)
  cpu_cores=$(detect_cpu_cores)
  disk_gb=$(detect_disk_free_gb "./models")
  current_model=$(detect_current_model ".env")

  local rec_line recommended reason model_size tier
  rec_line=$(recommend_model "$ram_gb" "$vram_gb")
  IFS='|' read -r recommended reason model_size tier <<< "$rec_line"

  if $model_only; then
    echo "$recommended"
    return 0
  fi

  print_hardware_report \
    "$ram_gb" "$vram_gb" "$gpu_name" "$cpu_cores" "$disk_gb" \
    "$current_model" "$recommended" "$reason" "$model_size" "$tier"

  # Export for use by calling scripts
  export HW_RAM_GB="$ram_gb"
  export HW_VRAM_GB="$vram_gb"
  export HW_DISK_GB="$disk_gb"
  export HW_CURRENT_MODEL="$current_model"
  export HW_RECOMMENDED_MODEL="$recommended"
  export HW_MODEL_SIZE_GB="$model_size"
  export HW_TIER="$tier"
}

main "${1:-}"
