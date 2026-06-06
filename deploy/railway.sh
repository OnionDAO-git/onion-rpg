#!/usr/bin/env bash
#
# All-in-one RAILWAY deploy for Onion RPG.
#
#   ./deploy/railway.sh        # pick workspace + project, provision Postgres,
#                              # push env vars, deploy, and assign a domain
#
# On first run (or with RELINK=1) it prompts you to either LINK an existing
# project or CREATE a new one — and in both cases lets you choose which
# Railway workspace/team to deploy into. Idempotent: re-run to push new env
# vars or redeploy.
#
# ── One-time Railway setup ────────────────────────────────────────────────
#   1. Create a Railway account .......... https://railway.com
#   2. Install the CLI ................... brew install railway
#                                          (or: npm i -g @railway/cli)
#   3. Log in ............................ railway login   (opens a browser;
#                                          the script auto-runs this if needed)
#   4. (Optional) create a workspace/team in the dashboard if you want to
#      deploy somewhere other than your personal one — you'll pick it below.
#   That's it. Postgres, the app service, env vars, and the domain are all
#   provisioned by this script; nothing else to click in the dashboard.
#
# Requirements:
#   - Railway CLI v3+ ........ https://docs.railway.com/guides/cli
#   - A Railway account ...... `railway login` (the script will prompt if needed)
#
# Tunables (env vars):
#   RELINK=1       force re-selecting workspace/project even if already linked
#   PROJECT_NAME   default: onion-rpg     name used when CREATING a new project
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

echo "==> Selecting Railway workspace + project"
if railway status >/dev/null 2>&1 && [ "${RELINK:-0}" != "1" ]; then
  echo "  Already linked in this directory:"
  railway status 2>/dev/null | sed 's/^/    /' || true
  echo "  (re-run with RELINK=1 to pick a different workspace/project)"
else
  # Either nothing is linked yet, or the user asked to RELINK. Let them choose
  # to attach to an existing project or spin up a new one — both flows prompt
  # for the workspace/team to use.
  echo
  echo "  How do you want to target a Railway project?"
  echo "    [l] LINK an existing project   (pick workspace -> project -> environment)"
  echo "    [n] NEW project named '$PROJECT_NAME'  (pick the workspace to create it in)"
  printf "  Selection [l/n] (default: l): "
  # Read from the terminal even if the script was piped; tolerate EOF under set -e.
  choice=""
  read -r choice </dev/tty 2>/dev/null || choice=""
  case "$choice" in
    n|N)
      echo "  Creating a new project..."
      railway init --name "$PROJECT_NAME"
      ;;
    *)
      echo "  Linking an existing project (follow the interactive picker)..."
      railway link
      ;;
  esac
fi

# Make sure the chosen environment is the active one for all commands below.
railway environment "$ENVIRONMENT" >/dev/null 2>&1 \
  && echo "  using environment: $ENVIRONMENT" \
  || echo "  note: environment '$ENVIRONMENT' not found — using the linked default"

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
