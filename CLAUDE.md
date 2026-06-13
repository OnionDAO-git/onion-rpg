# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ONION RPG — "The Great Onion Shortage" — a live-action infrastructure RPG for Onion DAO, Chicago. Operatives carry ESP32-S3 hardware badges running the `oRPG` Lua client, roam to 3D-printed ESP32-C3 "beacon" POIs, and play 13 challenges across 5 acts driven by **DEEPDISH**, a rogue AI Storyteller. The game server is **Bun + SvelteKit 2 (adapter-node) + TypeScript + Tailwind 4 + Postgres** (`postgres`/porsager client). It is an **external app** to the Onion DAO API at `https://oniondao.dev` (currency, auth SSO, Lua registry).

Four components share one wire protocol: game server (`src/`), Lua badge client (`oRPG/`), ESP32-C3 beacon firmware (`beacon/`), and a hardware-free TypeScript simulator (`sim/`).

## Companion docs

- **`SPEC.md`** — story bible + challenge catalog. Authoritative for narrative, DEEPDISH voice, act structure, and "why a challenge works this way." Read before re-litigating story/UX.
- **`docs/CONTRACTS.md`** — the shared interface contract (wire protocol message types, bodies). **Single source of truth** for anything crossing the badge↔server seam.
- **`docs/CHALLENGES.md`** — full catalog: act, type, mechanic, rewards, required credentials per challenge.
- **`docs/RUNBOOK.md`** — live-event publish + push + deploy procedure.
- **`README.md`** — architecture overview, quickstart, key-files table.

## Git / workflow guardrails

- **Working branch is `rizi_dev`** (off `main`, in the shared `OnionDAO-git/onion-rpg` repo — we are a contributor, not a fork). **`main` is protected — never push to it directly; open a PR.**
- **Never commit `.env`** (gitignored). Only `.env.example` is tracked.
- The Onion DAO API, Anthropic, and STT keys are **left empty for local/sim work** — the sim and `bun test` do not need them.

## Commands

```bash
bun install                       # install deps (runs svelte-kit sync)
bun run dev                       # vite dev — http://localhost:5173 (hot reload)
bun run build && bun run start    # production build (adapter-node) → ./build
bun run check                     # svelte-kit sync && svelte-check (type check)
bun run db:init                   # apply src/lib/server/db/schema.sql (idempotent)
bun test                          # bun:test suite — mocked DB/Anthropic/Onion, no server needed
bun run sim/cli.ts test all       # full sim end-to-end (needs dev server + Postgres up)
bun run sim/cli.ts test 0.1 -v    # one scenario, verbose
bun run sim/cli.ts beacon 0.1     # spawn a sim beacon and keep it alive
bun run sim/cli.ts list           # registered scenarios
```

## Local setup (verified Phase 0 baseline)

No Docker on this machine — Postgres runs natively via Homebrew (not `docker compose`):

```bash
brew install postgresql@16 && brew services start postgresql@16
psql -d postgres -c "CREATE ROLE orpg LOGIN PASSWORD 'orpg_dev';"
createdb -O orpg orpg
cp .env.example .env              # default DATABASE_URL already matches the role/db above
bun install
bun run db:init                   # creates 11 tables
bun run dev                       # terminal 1
bun run sim/cli.ts test all       # terminal 2 — should report all passed, exit 0
```

`DATABASE_URL=postgresql://orpg:orpg_dev@localhost:5432/orpg`. Bun auto-loads `.env`. Postgres binaries: `/opt/homebrew/opt/postgresql@16/bin`.

## Architecture — what cuts across files

### Wire protocol (the badge↔server seam)

`src/lib/shared/protocol.ts` is the canonical framing: 8-byte binary header (`MAGIC 0x4F`, version, MsgType, flags, msgId, seq, total) + UTF-8 JSON body, ≤232 bytes/chunk, chunked across frames sharing a `msgId`. It is **shared between server and sim** (the sim imports it directly, so sim frames are byte-identical to real ESP-NOW frames) and reimplemented by hand in Lua (`oRPG/lib/net.lua`) and C (`beacon/main/onion_proto.c`). **Change protocol.ts and you must mirror the Lua and C decoders** — keep `docs/CONTRACTS.md §3` in sync.

### Beacon bridge: `POST /api/relay`

Beacons (real or sim) POST `{ beaconId, frames: [base64...] }`; the server decodes, dispatches by `MsgType` to the engine, returns base64 response frames. Auth is `Authorization: Bearer BEACON_API_KEY` via `src/lib/server/api/auth.ts` — **open when `BEACON_API_KEY` is unset (local dev default)**, enforced when set.

### Engine (`src/lib/server/engine/`)

`index.ts` orchestrates: `resolveOperative` → `beginChallenge` (gates on inventory/credentials via `canBegin`, inserts a `challenge_attempts` row, marks `game_state.challenge_status`) → `submitChallenge` (runs `challenge.validate`, persists, `applyRewards`, marks cleared, `maybeAdvanceAct`). `combat.ts` runs combat sessions (server-side RNG fallback when the badge has no secure element; verifies signed rolls when `operatives.attest_pubkey` is set).

**Postgres gotcha:** `jsonb_set(target, path, value)` requires `(jsonb, text[], jsonb)`. When passing a path/value through the `postgres` client, cast explicitly — `${...}::text[]` for the path and `::jsonb` for the value — or Postgres errors `function jsonb_set(jsonb, unknown, text) does not exist`. (This was the bug fixed to green the Phase 0 baseline.)

### Challenges (`src/lib/server/challenges/`)

All 13 live in `impl/` (one file per challenge, named `act<N>-<n>-<slug>.ts`) and **self-register via `registerChallenge()`** — importing the file registers it. `catalog.ts` is the static item/credential catalog; `registry.ts` resolves by id. Four types map to hardware: **combat** (secure-element RNG rolls), **dialogue** (voice + STT + AI judgment), **merchant** (button trade UI), **NPC** (free-form DEEPDISH dialogue). Challenge ids are dotted (`0.1`, `1.2`, `act4-1`).

### AI Storyteller — DEEPDISH (`src/lib/server/ai/`)

Anthropic SDK (`@anthropic-ai/sdk`), prompt-caching enabled. **`claude-opus-4-8` for the Act 4 finale / high-stakes beats; `claude-sonnet-4-6` for routine NPC dialogue** (`STORYTELLER_MODEL_FINALE` / `STORYTELLER_MODEL_DIALOGUE` in `.env`). STT is pluggable (`whisper-http` default, `mock` for dev/tests). When building or changing any LLM call, use the latest Claude model ids and the Anthropic SDK conventions — do not answer model/pricing questions from memory.

### Onion DAO integration (`src/lib/server/onion/`)

External app to `https://oniondao.dev`: awards Onions via `POST /api/public/onions/requests` (async; player approves in portal), receives HMAC-verified reward callbacks at `POST /api/onion/callback`, reads the shared `session` SSO cookie for the admin console, exposes the public win-bar at `GET /api/gauge`.

### Database (`src/lib/server/db/`)

`schema.sql` (11 tables, idempotent `IF NOT EXISTS`) applied by `scripts/db-init.ts`. Convention: **snake_case in DB, camelCase in TS**, env via `$env/dynamic/private`. `index.ts` exports the `sql` client singleton — import from there, never construct a new `postgres()` client in app code.

## Testing

- **`bun test`** — fast, hermetic. `tests/game-loop.test.ts` mocks the DB (in-memory), `$env/dynamic/private`, Anthropic, and the Onion API, and drives the full Act 0 combat / voice / NPC / Act-4-gating loops. No server or Postgres needed. **This is the logic safety net.**
- **`sim test all`** — real end-to-end: needs `bun run dev` + live Postgres. Exercises the actual SQL and relay path that `bun test` mocks out. The scenario registry is in `sim/cli.ts`; `smoke` is a generic pipeline helper (run as `test smoke --challenge <id>`) and is excluded from `test all`.
- Add a sim scenario per new challenge under `sim/scenarios/` and register it in `sim/cli.ts`'s `SCENARIOS`.

## Conventions

- Keep server and badge in agreement: any change to `src/lib/shared/protocol.ts` or `types.ts` must be reflected in `oRPG/lib/net.lua`, `beacon/main/onion_proto.c`, and `docs/CONTRACTS.md`.
- New challenge: add `impl/act<N>-<n>-<slug>.ts` that calls `registerChallenge()`, declare requires/rewards, add a sim scenario, and document it in `docs/CHALLENGES.md`.
- Run `bun run check` (svelte-check) and `bun test` before committing; run `sim test all` against a live server before claiming an end-to-end change works.
- The badge client must stay playable on today's firmware (ESP-NOW only) — richer `firmware-ext/` primitives are feature-detected via `oRPG/lib/caps.lua`, never assumed present.
