#!/bin/sh
# Container entrypoint: bootstrap the DB schema (idempotent), then serve.
# Set RUN_DB_INIT=false to skip the schema apply (e.g. read-replica scale-out).
set -e

: "${RUN_DB_INIT:=true}"
: "${PORT:=3000}"

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set." >&2
  exit 1
fi

if [ "$RUN_DB_INIT" = "true" ]; then
  echo "[entrypoint] applying database schema (idempotent)..."
  bun scripts/db-init.ts
fi

echo "[entrypoint] starting onion-rpg on :${PORT}"
exec bun ./build/index.js
