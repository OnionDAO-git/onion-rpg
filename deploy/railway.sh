#!/usr/bin/env bash
#
# All-in-one RAILWAY deploy for Onion RPG.
#
#   ./deploy/railway.sh        # create/link project, provision Postgres,
#                              # push env vars, deploy, and assign a domain
#
# Idempotent: safe to re-run to push new env vars or redeploy.
#
# Requirements:
#   - Railway CLI v3+ ........ https://docs.railway.com/guides/cli  (`brew install railway`)
#   - A Railway account ...... `railway login` (the script will prompt if needed)
#
# Tunables (env vars):
#   PROJECT_NAME   default: onion-rpg     Railway project name
#   APP_SERVICE    default: onion-rpg     app service name
#   PG_SERVICE     default: Postgres      Postgres service name (Railway's default)
#   ENVIRONMENT    default: production    Railway environment
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env"

PROJECT_NAME="${PROJECT_NAME:-onion-rpg}"
APP_SERVICE="${APP_SERVICE:-onion-rpg}"
PG_SERVICE="${PG_SERVICE:-Postgres}"
ENVIRONMENT="${ENVIRONMENT:-production}"

if ! command -v railway >/dev/null 2>&1; then
  echo "ERROR: Railway CLI not found. Install it: brew install railway   (or npm i -g @railway/cli)" >&2
  exit 1
fi

gen_secret() { openssl rand -hex 32; }
get_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true; }
set_env() {
  local key="$1" val="$2" tmp
  if grep -qE "^$key=" "$ENV_FILE"; then
    tmp="$(mktemp)"; sed "s|^$key=.*|$key=$val|" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}
ensure_secret() { [ -z "$(get_env "$1")" ] && { set_env "$1" "$(gen_secret)"; echo "  generated $1"; } || true; }

echo "==> Authenticating with Railway"
if ! railway whoami >/dev/null 2>&1; then
  railway login
fi
railway whoami

echo "==> Preparing environment (.env)"
[ -f "$ENV_FILE" ] || { cp "$ROOT/.env.example" "$ENV_FILE"; echo "  created .env from .env.example"; }
ensure_secret BEACON_API_KEY
ensure_secret ONION_CALLBACK_SECRET
for key in ANTHROPIC_API_KEY ONION_EXTERNAL_API_KEY; do
  [ -z "$(get_env "$key")" ] && echo "  WARNING: $key is empty in .env — set it or related features will fail"
done

echo "==> Linking Railway project ($PROJECT_NAME)"
if ! railway status >/dev/null 2>&1; then
  # No linked project in this dir yet — create one.
  railway init --name "$PROJECT_NAME"
fi

echo "==> Provisioning Postgres service ($PG_SERVICE)"
# `add` is not strictly idempotent; ignore the error if it already exists.
railway add --database postgres >/dev/null 2>&1 && echo "  Postgres added" || echo "  Postgres already present (skipping)"

echo "==> Ensuring app service ($APP_SERVICE)"
railway add --service "$APP_SERVICE" >/dev/null 2>&1 && echo "  service created" || echo "  service already present (skipping)"

echo "==> Pushing environment variables to $APP_SERVICE"
# Wire DATABASE_URL to the Postgres service via Railway's reference syntax.
railway variables --service "$APP_SERVICE" --set 'DATABASE_URL=${{'"$PG_SERVICE"'.DATABASE_URL}}' >/dev/null
echo "  set DATABASE_URL -> \${{$PG_SERVICE.DATABASE_URL}}"

# Push every non-blank, non-comment key from .env EXCEPT DATABASE_URL and the
# compose-only POSTGRES_* knobs (Railway's Postgres plugin owns those).
while IFS= read -r line; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  key="${line%%=*}"
  val="${line#*=}"
  case "$key" in
    DATABASE_URL|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT|APP_PORT) continue ;;
  esac
  [ -z "$val" ] && continue
  railway variables --service "$APP_SERVICE" --set "$key=$val" >/dev/null
  echo "  set $key"
done < "$ENV_FILE"

echo "==> Deploying $APP_SERVICE"
railway up --service "$APP_SERVICE" --ci

echo "==> Assigning a public domain"
domain_out="$(railway domain --service "$APP_SERVICE" 2>&1 || true)"
echo "$domain_out"
domain="$(printf '%s\n' "$domain_out" | grep -oE '[a-zA-Z0-9.-]+\.up\.railway\.app' | head -n1 || true)"

if [ -n "$domain" ]; then
  railway variables --service "$APP_SERVICE" --set "ONION_CALLBACK_URL=https://$domain/api/onion/callback" >/dev/null
  echo
  echo "Deployed:  https://$domain"
  echo "  health:  https://$domain/api/gauge"
  echo "  set ONION_CALLBACK_URL -> https://$domain/api/onion/callback (redeploy to apply if needed)"
else
  echo
  echo "Deployed. Could not auto-detect the domain — run 'railway domain' and then set"
  echo "ONION_CALLBACK_URL=https://<your-domain>/api/onion/callback in the Railway dashboard."
fi

echo
echo "BEACON_API_KEY (for flashing beacons): $(get_env BEACON_API_KEY)"
