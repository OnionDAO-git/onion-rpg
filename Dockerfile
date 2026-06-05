# syntax=docker/dockerfile:1
#
# Single image for the Onion RPG game server (SvelteKit + adapter-node).
# Used by BOTH deploy targets:
#   - docker-compose.yml  (local / self-hosted)
#   - railway.json        (Railway, builder: DOCKERFILE)
#
# Build runs on Bun (matches the dev toolchain + bun.lock). The runtime also
# uses Bun so that `bun scripts/db-init.ts` (TypeScript, idempotent schema
# bootstrap) runs without a separate Node install.

# ---- Build stage: install all deps + compile the SvelteKit bundle ----
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- Runtime stage: production deps + compiled bundle only ----
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Production dependencies only (adapter-node keeps deps external).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Compiled server.
COPY --from=build /app/build ./build

# Files needed by the idempotent schema bootstrap (`bun scripts/db-init.ts`).
COPY scripts ./scripts
COPY src/lib/server/db/schema.sql ./src/lib/server/db/schema.sql

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

# /api/gauge is public, read-only, and touches Postgres — so it doubles as a
# liveness + DB-connectivity probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/gauge').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
