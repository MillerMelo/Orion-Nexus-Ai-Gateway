#!/usr/bin/env bash
# check-ports.sh — Verifies that required ports are available on the host.
# If a port is taken, scans upward to find the next free one and updates .env.
#
# Usage:
#   ./scripts/check-ports.sh          # check and auto-resolve, updates .env
#   ./scripts/check-ports.sh --dry-run  # report only, no .env changes

set -euo pipefail

ENV_FILE=".env"

# ─── colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()   { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ─── port detection ───────────────────────────────────────────────────────────

# Returns 0 (true) if port is free, 1 if occupied.
port_is_free() {
  local port="$1"
  # Try ss first (modern Linux standard), then netstat, then /dev/tcp fallback
  if command -v ss &>/dev/null; then
    ! ss -tlnp 2>/dev/null | grep -qE ":${port}[[:space:]]|:${port}$"
  elif command -v netstat &>/dev/null; then
    ! netstat -tlnp 2>/dev/null | grep -qE ":${port}[[:space:]]|:${port}$"
  else
    # bash /dev/tcp fallback — tries to connect; success means port is in use
    ! (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null
  fi
}

# Scans upward from $1 until a free port is found. Prints the port.
find_free_port() {
  local port="$1"
  local max_scan="${2:-20}"
  local attempts=0
  while ! port_is_free "$port"; do
    port=$(( port + 1 ))
    attempts=$(( attempts + 1 ))
    if (( attempts >= max_scan )); then
      err "No se encontró un puerto libre en el rango $(( port - max_scan ))-${port}."
      return 1
    fi
  done
  echo "$port"
}

# Returns which process is using a port (best effort).
port_owner() {
  local port="$1"
  if command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -E ":${port}[[:space:]]|:${port}$" \
      | grep -oP 'users:\(\("?\K[^"]+' | head -1 || echo "proceso desconocido"
  elif command -v lsof &>/dev/null; then
    lsof -ti tcp:"$port" 2>/dev/null | head -1 | xargs ps -p 2>/dev/null -o comm= || echo "proceso desconocido"
  else
    echo "proceso desconocido"
  fi
}

# ─── .env helpers ─────────────────────────────────────────────────────────────

read_env_port() {
  local key="$1" default="$2"
  if [[ -f "$ENV_FILE" ]]; then
    local val
    val=$(grep -E "^${key}=" "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'" | head -1)
    echo "${val:-$default}"
  else
    echo "$default"
  fi
}

update_env_port() {
  local key="$1" value="$2"
  if [[ -f "$ENV_FILE" ]]; then
    if grep -qE "^${key}=" "$ENV_FILE"; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      echo "${key}=${value}" >> "$ENV_FILE"
    fi
  fi
}

# ─── main ─────────────────────────────────────────────────────────────────────

main() {
  local dry_run=false
  [[ "${1:-}" == "--dry-run" ]] && dry_run=true

  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  ORION — Verificación de puertos                 ${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  local router_port ollama_port
  router_port=$(read_env_port "ROUTER_PORT" "3000")
  ollama_port=$(read_env_port "OLLAMA_PORT" "11434")

  local changed=false
  local router_changed=false
  local ollama_changed=false
  local new_router_port="$router_port"
  local new_ollama_port="$ollama_port"

  # ── check router port ──────────────────────────────────────────────────────
  if port_is_free "$router_port"; then
    ok "Puerto router ${BOLD}:${router_port}${RESET} disponible."
  else
    local owner
    owner=$(port_owner "$router_port")
    warn "Puerto ${BOLD}:${router_port}${RESET} ocupado por ${YELLOW}${owner}${RESET}."

    new_router_port=$(find_free_port $(( router_port + 1 )))
    warn "Puerto alternativo encontrado: ${GREEN}${BOLD}:${new_router_port}${RESET}"
    router_changed=true
    changed=true
  fi

  # ── check ollama port ──────────────────────────────────────────────────────
  if port_is_free "$ollama_port"; then
    ok "Puerto Ollama  ${BOLD}:${ollama_port}${RESET} disponible."
  else
    local ollama_owner
    ollama_owner=$(port_owner "$ollama_port")
    warn "Puerto ${BOLD}:${ollama_port}${RESET} ocupado por ${YELLOW}${ollama_owner}${RESET}."

    new_ollama_port=$(find_free_port $(( ollama_port + 1 )))
    warn "Puerto alternativo encontrado: ${GREEN}${BOLD}:${new_ollama_port}${RESET}"
    ollama_changed=true
    changed=true
  fi

  # ── apply changes ──────────────────────────────────────────────────────────
  if ! $changed; then
    echo ""
    ok "Todos los puertos requeridos están disponibles."
    echo ""
    return 0
  fi

  echo ""

  if $dry_run; then
    warn "Modo --dry-run: no se modificó .env"
    if $router_changed; then
      echo -e "  Añadir en .env:  ${BOLD}ROUTER_PORT=${new_router_port}${RESET}"
    fi
    if $ollama_changed; then
      echo -e "  Añadir en .env:  ${BOLD}OLLAMA_PORT=${new_ollama_port}${RESET}"
    fi
    echo ""
    return 0
  fi

  # Update .env
  if $router_changed; then
    update_env_port "ROUTER_PORT" "$new_router_port"
    ok "Actualizado ROUTER_PORT=${new_router_port} en .env"
  fi
  if $ollama_changed; then
    update_env_port "OLLAMA_PORT" "$new_ollama_port"
    ok "Actualizado OLLAMA_PORT=${new_ollama_port} en .env"
  fi

  # ── warn about client configs that may need updating ──────────────────────
  if $router_changed; then
    echo ""
    echo -e "${YELLOW}${BOLD}⚠  El puerto del router cambió de :${router_port} a :${new_router_port}${RESET}"
    echo -e "   Actualiza estos archivos de configuración del cliente:"
    echo ""

    local opencode_global="$HOME/.config/opencode/opencode.json"
    if [[ -f "$opencode_global" ]]; then
      echo -e "   ${BOLD}~/.config/opencode/opencode.json${RESET}"
      echo -e "   Cambia:  ${RED}\"baseURL\": \"http://localhost:${router_port}\"${RESET}"
      echo -e "   Por:     ${GREEN}\"baseURL\": \"http://localhost:${new_router_port}\"${RESET}"
    fi

    if [[ -f "opencode.json" ]]; then
      echo -e "   ${BOLD}./opencode.json${RESET} (este proyecto)"
    fi

    echo ""
    echo -e "   Endpoint de salud: ${BOLD}http://localhost:${new_router_port}/health${RESET}"
    echo ""
  fi

  # Export for use by calling scripts
  export PORT_ROUTER="$new_router_port"
  export PORT_OLLAMA="$new_ollama_port"
}

main "${1:-}"
