#!/usr/bin/env bash
set -euo pipefail

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "Starting ollama service..."
sudo docker compose up -d ollama

log "Waiting for ollama server to be ready..."
until sudo docker compose exec -T ollama ollama list &>/dev/null; do
  sleep 2
done
log "Ollama server is ready."

if sudo docker compose exec -T ollama ollama list | grep -q '^mistral\b'; then
  log "mistral is already downloaded, skipping."
  exit 0
fi

log "Downloading mistral model (this may take several minutes)..."
sudo docker compose exec -T ollama ollama pull mistral
log "mistral download complete."
