#!/usr/bin/env bash
#
# All-in-one DOCKER COMPOSE deploy for Onion RPG.
#
#   ./deploy/docker.sh           # set up env, build, and start everything
#   ./deploy/docker.sh down      # stop the stack (keeps the DB volume)
#   ./deploy/docker.sh logs      # tail app + postgres logs
#   ./deploy/docker.sh destroy   # stop AND delete the DB volume (DANGER)
#
# It ensures a .env exists, auto-generates the self-owned secrets
# (BEACON_API_KEY, ONION_CALLBACK_SECRET), warns about external keys you still
# need to fill (ANTHROPIC_API_KEY, ONION_EXTERNAL_API_KEY), then brings up
# Postgres + the game server via docker compose. DATABASE_URL is wired to the
# compose Postgres automatically (see docker-compose.yml).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env"

# Pick the compose command (plugin vs legacy binary).
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "ERROR: docker compose is not installed. Install Docker Desktop or the compose plugin." >&2
  exit 1
fi

gen_secret() { openssl rand -hex 32; }

# get_env KEY -> prints current value from .env (empty if unset/blank)
get_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true
}

# set_env KEY VALUE -> create or replace KEY=VALUE in .env (portable sed)
set_env() {
  local key="$1" val="$2" tmp
  if grep -qE "^$key=" "$ENV_FILE"; then
    tmp="$(mktemp)"
    # Use a non-/ delimiter; values may contain URLs.
    sed "s|^$key=.*|$key=$val|" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# ensure_secret KEY -> fill KEY with a generated secret if currently blank
ensure_secret() {
  local key="$1"
  if [ -z "$(get_env "$key")" ]; then
    set_env "$key" "$(gen_secret)"
    echo "  generated $key"
  fi
}

cmd="${1:-up}"
case "$cmd" in
  down)    "${COMPOSE[@]}" down; exit 0 ;;
  logs)    "${COMPOSE[@]}" logs -f --tail=100; exit 0 ;;
  destroy) "${COMPOSE[@]}" down -v; echo "Stack + DB volume removed."; exit 0 ;;
  up)      ;;
  *)       echo "Unknown command: $cmd (use: up | down | logs | destroy)" >&2; exit 1 ;;
esac

echo "==> Preparing environment (.env)"
if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
  echo "  created .env from .env.example"
fi

# Compose-only knobs (defaults live in docker-compose.yml; surface them here too).
[ -z "$(get_env POSTGRES_USER)" ]     && set_env POSTGRES_USER orpg
[ -z "$(get_env POSTGRES_PASSWORD)" ] && set_env POSTGRES_PASSWORD "$(gen_secret)"
[ -z "$(get_env POSTGRES_DB)" ]       && set_env POSTGRES_DB orpg
[ -z "$(get_env APP_PORT)" ]          && set_env APP_PORT 3000

echo "==> Generating self-owned secrets"
ensure_secret BEACON_API_KEY
ensure_secret ONION_CALLBACK_SECRET

# Default the public callback URL to the local app if it still points elsewhere
# and you haven't set a real domain.
if [ -z "$(get_env ONION_CALLBACK_URL)" ]; then
  set_env ONION_CALLBACK_URL "http://localhost:$(get_env APP_PORT)/api/onion/callback"
fi

echo "==> Checking external keys (must be filled by you)"
missing=0
for key in ANTHROPIC_API_KEY ONION_EXTERNAL_API_KEY; do
  if [ -z "$(get_env "$key")" ]; then
    echo "  WARNING: $key is empty — features that use it will fail until set in .env"
    missing=1
  fi
done
[ "$missing" -eq 0 ] && echo "  all external keys present"

echo "==> Building and starting the stack"
"${COMPOSE[@]}" up -d --build

echo "==> Waiting for the app to become healthy"
app_port="$(get_env APP_PORT)"
for i in $(seq 1 60); do
  if curl -fsS "http://localhost:${app_port}/api/gauge" >/dev/null 2>&1; then
    echo
    echo "Onion RPG is up:  http://localhost:${app_port}"
    echo "  health:  http://localhost:${app_port}/api/gauge"
    echo "  logs:    ./deploy/docker.sh logs"
    echo "  BEACON_API_KEY (for beacon flashing): $(get_env BEACON_API_KEY)"
    exit 0
  fi
  sleep 2
done

echo "App did not become healthy in time. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail=50 app >&2
exit 1
