# ONION RPG — "The Great Onion Shortage"

A live-action infrastructure RPG for Onion DAO, Chicago. Operatives carry
ESP32-S3 hardware badges running `oRPG` on Onion OS, roam to 3D-printed
ESP32-C3 "Point of Interest" beacons, and play through a story driven by
**DEEPDISH** — a rogue AI that has seized control of every onion in the city
(and also the water, power, transit, and 911 systems, but mostly the onions).

Story bible: `SPEC.md`. Interface contracts: `docs/CONTRACTS.md`.

---

## Architecture

```
Badge (ESP32-S3 + oRPG.lua)
       |
       |  ESP-NOW frames (<=240 bytes, 8-byte binary header + JSON body)
       v
Beacon (ESP32-C3, beacon/)
       |
       |  HTTPS POST /api/relay  {beaconId, frames:[base64...]}
       v
Game Server (src/ — bun + SvelteKit 2 + Postgres)
       |
       |  Onion DAO external API  (https://oniondao.dev)
       v
Onion DAO — currency (Onions), Lua Script Registry, badge MQTT push
```

Four components talk to each other through a single shared wire protocol
defined in `src/lib/shared/protocol.ts`.

### 1. Game server (`src/`)

Bun + TypeScript + SvelteKit 2 (adapter-node), Tailwind 4, Postgres via the
`postgres` (porsager) client. Mirrors the sibling `landing-2026` app's
conventions (snake_case in DB, camelCase in TS, `$env/dynamic/private`).

Responsibilities:
- Runs the game engine: resolves operatives, gates progression by inventory,
  processes challenge attempts, runs combat sessions.
- Hosts the beacon bridge (`POST /api/relay`): beacons POST base64 ESP-NOW
  frames; the server decodes them, dispatches to the engine, and returns
  response frames.
- Calls the real **Onion DAO API** (at `https://oniondao.dev`) to award Onions
  to players when they complete challenges.
- Runs **DEEPDISH** — the AI Storyteller — via the Anthropic SDK
  (`@anthropic-ai/sdk`). `claude-opus-4-8` for the Act 4 finale;
  `claude-sonnet-4-6` for routine NPC dialogue. Prompt-caching enabled.
- Provides a public gauge endpoint (`GET /api/gauge`) showing the shared
  festival onion-supply win-bar.

Key source paths:
- `src/lib/server/db/` — Postgres schema + client
- `src/lib/server/challenges/` — challenge registry + all 13 implementations
- `src/lib/server/engine/` — orchestration, combat, inventory
- `src/lib/server/ai/` — DEEPDISH storyteller + pluggable STT
- `src/lib/server/onion/` — Onion DAO API client + gauge
- `src/routes/api/` — relay, onion callback, gauge, and per-challenge routes
- `src/lib/shared/` — wire protocol + shared types (used by server AND badge)

### 2. oRPG badge client (`oRPG/`)

Lua, published to the Onion OS Lua Script Registry. Runs on the ESP32-S3
badge under Onion OS.

- `oRPG.lua` — entry point + main loop. Discovers beacons via BEACON_HELLO,
  submits signed/unsigned `BADGE_MOVE` events, and renders server-sent
  `EINK_FRAME` operation streams.
- `oRPG/lib/net.lua` — ESP-NOW request/response helper (frames messages per
  the wire protocol, sends via `onion.espnow_send`, reassembles chunked
  replies).
- `oRPG/lib/identity.lua` — hardware id, linked Onion id, address discovery,
  and optional move signing when firmware exposes a signing primitive.
- `oRPG/lib/ui.lua` — native e-ink primitive renderer for compact server
  operation streams.
- `oRPG/lib/hardware.lua` — feature-detected GPIO, Sound mic/speaker, and
  CC1101 sub-GHz bridge. Server frames may request IO via an `io` directive;
  the badge executes it and sends the result as a `BADGE_MOVE` with `k='io'`.
- `oRPG/lib/caps.lua` — capability shim: detects firmware-extension
  primitives at runtime and uses them when present, falls back to
  ESP-NOW + beacon relay when absent. The game is fully playable on
  today's firmware (ESP-NOW only).
- `oRPG/screens/<challengeId>.lua` — legacy local screens kept for fallback
  bundles only. The standard badge bundle does not load them.

Capability shim logic:

```lua
caps.sign   = type(onion.sign_message) == 'function'
           or type(onion.wallet_sign)  == 'function'
           or type(onion.se_sign)      == 'function'
caps.secRng = type(onion.secure_random) == 'function'
caps.voice  = type(onion.sound_mic_begin) == 'function'
caps.subghz = type(onion.subghz_begin) == 'function'
```

### 3. ESP32-C3 beacons (`beacon/`)

ESP-IDF C firmware (no Arduino). Each beacon is an ESP-NOW to WiFi/HTTPS
bridge:

1. Broadcasts `BEACON_HELLO` every 5 s so nearby badges know which challenge
   is hosted here.
2. Receives ESP-NOW frames from the badge, reassembles chunked messages, POSTs
   them base64-encoded to `POST /api/relay` on the game server.
3. Returns the server's response frames to the badge over ESP-NOW unicast.
4. For voice challenges: the beacon (or badge with `voice_capture`) uploads
   audio out-of-band to the server; an opaque `ref` handle is passed instead
   of audio bytes over ESP-NOW.

Each beacon is differentiated only by its SPIFFS/NVS config
(`beacon_id`, `challenge_id`, WiFi credentials, server URL, API key). Flash
one firmware binary; differentiate via `beacon/scripts/flash_spiffs.sh`.

### 4. Software simulator (`sim/`)

TypeScript (Bun) simulator — no hardware required for local development or CI.

```
VirtualBadge  ──[SimChannel/EventEmitter]──  SimBeacon  ──[HTTP]──  Game server
```

The sim imports `src/lib/shared/protocol.ts` directly, so frames produced by
`VirtualBadge` are byte-for-byte identical to real ESP-NOW frames. The game
server cannot distinguish a hardware beacon from a sim beacon.

### 5. Firmware extensions (`firmware-ext/`)

Proposed C++ Lua-binding extensions for Onion OS, adding richer hardware
primitives the badge client uses when present:

| Primitive | Status | Purpose |
|---|---|---|
| `onion.http_request(opts)` | Real | Direct HTTPS to game server (beacon-free) |
| `onion.se_rng(nbytes)` | Real | ATECC608B-backed RNG for tamper-proof combat rolls |
| `onion.se_sign(msg)` | Real | Ed25519 attestation; server verifies vs stored pubkey |
| `onion.voice_capture(ms)` | Real (I2S) | On-badge mic capture for voice challenges |
| `onion.subghz_tx/rx` | Stub | Sub-GHz mini-events (CC1101; stub pending driver) |

Without these extensions, the game falls back to server-side RNG and
beacon-relayed voice.

---

## Relationship to the Onion DAO API (`landing-2026`)

The game server is an **external app** to `https://oniondao.dev`.

| Capability | How |
|---|---|
| Award Onions to a player | `POST /api/public/onions/requests` (async; player approves in their portal) |
| Receive reward confirmation | Webhook `POST /api/onion/callback`; HMAC-verified with `ONION_CALLBACK_SECRET` |
| Fetch player profile | `GET /api/public/profile/{username}` |
| Publish oRPG.lua | `POST /api/portal/lua-scripts` — attaches to the Lua Script Registry |
| Push oRPG to a badge | `POST /api/portal/lua-scripts/{id}/push` — MQTT delivery; badge shows accept popup |

See `docs/RUNBOOK.md` for the publish + push workflow.

---

## ESP-NOW wire protocol

Defined in `src/lib/shared/protocol.ts`; implemented by hand in Lua (`oRPG/lib/net.lua`)
and C (`beacon/main/onion_proto.c`).

```
byte 0    MAGIC   = 0x4F  ('O')
byte 1    VERSION = 0x01
byte 2    type    (MsgType enum)
byte 3    flags   (bit 0 = more-chunks-follow)
byte 4-5  msgId   (uint16 BE)
byte 6    seq     (uint8, 0-based chunk index)
byte 7    total   (uint8, total chunk count)
byte 8..N body    (UTF-8 JSON, <=232 bytes per chunk)
```

Long messages are chunked across multiple frames sharing the same `msgId`.
The reassembler collects all chunks in seq order then JSON.parses the
concatenated body.

Message types include: `BEACON_HELLO`, `OPERATIVE_IDENTIFY`, `IDENTIFY_ACK`,
`CHALLENGE_BEGIN`, `CHALLENGE_INTRO`, `CHALLENGE_RESULT`, `COMBAT_ROLL_REQUEST`,
`COMBAT_ROLL_RESPONSE`, `VOICE_CAPTURE_SUBMIT`, `VOICE_RESULT`, `MERCHANT_INPUT`,
`MERCHANT_RESULT`, `NPC_DIALOGUE_TURN`, `NPC_DIALOGUE_REPLY`, `REWARD_GRANT`,
`PROGRESSION_STATE`, `ACK`, `ERROR`. Full table in `docs/CONTRACTS.md §3`.

---

## Quickstart

### Prerequisites

- Bun >= 1.1
- Postgres 15+ (local docker or hosted)
- (Optional) Anthropic API key for DEEPDISH
- (Optional) Whisper-compatible STT endpoint for voice challenges

### 1. Install and configure

```bash
cd onion-rpg/
bun install
cp .env.example .env
# Edit .env — fill in DATABASE_URL at minimum; see below for all vars.
```

Required env vars:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | oRPG Postgres connection string |
| `ANTHROPIC_API_KEY` | DEEPDISH Storyteller (Anthropic Claude) |
| `ONION_EXTERNAL_API_KEY` | Bearer for Onion DAO reward API |
| `ONION_CALLBACK_SECRET` | HMAC secret for reward webhook verification |
| `ONION_CALLBACK_URL` | Public URL for `/api/onion/callback` |
| `BEACON_API_KEY` | Beacon bearer for `/api/relay` |
| `STT_PROVIDER` | `whisper-http` (default) or `mock` |
| `STT_ENDPOINT` / `STT_API_KEY` | Whisper-compatible STT endpoint |

See `.env.example` for full list including optional Solana vars.

### 2. Initialize the database

```bash
bun run db:init
# Applies src/lib/server/db/schema.sql (idempotent, IF NOT EXISTS)
```

### 3. Run the server

```bash
bun run dev       # development (vite dev, hot reload)
# or
bun run build && bun run start   # production build
```

Server listens on port 5173 (dev) or the PORT env var (production).

### 4. Run the simulator (no hardware needed)

```bash
# Spawn a beacon for the Act 0 tutorial:
bun run sim/cli.ts beacon 0.1

# Spawn all challenge beacons at once:
bun run sim/cli.ts beacons 0.1,act1-1,1.2,1.3,2.1,2.2,2.3,3.1,3.2,3.3,3.4,act4-1,act4.2

# Run the full Ketchup Gauntlet end-to-end test:
bun run sim/cli.ts test 0.1 --verbose

# Run all registered scenarios:
bun run sim/cli.ts test all
```

Simulator options: `--server <url>`, `--key <BEACON_API_KEY>`,
`--hw <hardwareId>`, `--onion <n>`, `--timeout <ms>`, `--verbose`.

### 5. Run tests

```bash
# Protocol unit tests (no server or hardware needed):
bun test sim/protocol.test.ts
```

### 6. Publish oRPG.lua to the Lua Script Registry

```bash
# Publish (creates a new version in the registry):
curl -X POST https://oniondao.dev/api/portal/lua-scripts \
  -H "Authorization: Bearer $PORTAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"oRPG","description":"The Great Onion Shortage","entrypoint":"oRPG.lua"}'

# Push to a specific online badge (MQTT delivery):
curl -X POST https://oniondao.dev/api/portal/lua-scripts/{id}/push \
  -H "Authorization: Bearer $PORTAL_API_KEY" \
  -d '{"onionId": 12345}'
```

See `docs/RUNBOOK.md` for the full live-event deployment procedure.

---

## Challenge overview

All 13 challenges self-register via `registerChallenge()` in
`src/lib/server/challenges/impl/`. See `docs/CHALLENGES.md` for the full
catalog with act, type, mechanic, rewards, and required credentials.

The four challenge types map to hardware primitives:
- **Combat** — Secure-element RNG rolls (signed by ATECC608B when available)
- **Dialogue** — Voice module; server-side STT matching + AI comprehension judgment
- **Merchant** — Button-based trade UI
- **NPC** — Free-form AI dialogue via DEEPDISH (Anthropic Claude)

---

## Key files

| Path | What it is |
|---|---|
| `SPEC.md` | Story bible and challenge catalog |
| `docs/CONTRACTS.md` | Shared interface contract (single source of truth) |
| `docs/CHALLENGES.md` | Full challenge catalog (act/type/mechanic/rewards) |
| `docs/RUNBOOK.md` | Live-event deployment runbook |
| `src/lib/shared/protocol.ts` | ESP-NOW wire framing |
| `src/lib/shared/types.ts` | Shared TypeScript types |
| `src/lib/server/db/schema.sql` | Postgres schema (10 tables) |
| `src/lib/server/challenges/catalog.ts` | Static item/credential catalog |
| `src/lib/server/challenges/impl/` | One file per challenge (self-registers) |
| `oRPG/lib/caps.lua` | Firmware capability shim |
| `oRPG/lib/net.lua` | ESP-NOW client helper |
| `beacon/main/main.c` | ESP32-C3 relay firmware entry point |
| `sim/cli.ts` | Simulator CLI |
| `firmware-ext/INTEGRATION.md` | How to apply firmware extensions |
