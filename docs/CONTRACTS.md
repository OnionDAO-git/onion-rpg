# ONION RPG — CONTRACTS.md

**Single source of truth.** Every other agent/component conforms to this file.
Foundations owns it; if you need a change here, it is a coordination point.

App root: `/Users/spacemandev/Projects/oniondao-git/onion-rpg`. Not a git repo,
no worktree isolation — only create/edit files inside the directory you own
(below).

---

## 1. Directory ownership

| Path | Owner | Notes |
|---|---|---|
| `src/lib/shared/` | Foundations | `protocol.ts`, `types.ts` — shared by all. Treat as frozen contract. |
| `src/lib/server/db/` | Foundations | schema + client. Additive migrations only. |
| `src/lib/server/challenges/registry.ts`, `catalog.ts` | Foundations | framework + catalog. |
| `src/lib/server/challenges/impl/<id>.ts` | Challenge agents | one file per challenge; self-registers. NEVER edit a shared array. |
| `src/lib/server/engine/` | Engine agent | engine/combat/inventory stubs. |
| `src/lib/server/onion/` | Onion-rewards agent | API client + gauge. |
| `src/lib/server/ai/` | AI agent | storyteller + STT. |
| `src/routes/api/` | Engine/API agents | route handlers (relay, callback, gauge). |
| `oRPG/` | Lua agent | badge client. |
| `beacon/` | Beacon agent | C3 firmware. |
| `sim/` | Sim agent | software beacon. |
| `firmware-ext/` | Firmware agent | proposed onion.* primitives. |
| `docs/` | Foundations | this file. |

---

## 2. Database schema (`src/lib/server/db/schema.sql`)

Postgres via the `postgres` (porsager) client, `transform: postgres.camel`
(snake_case columns <-> camelCase in TS). Apply with `bun run db:init`. Schema
is idempotent (IF NOT EXISTS); additive migrations only.

Tables (one-line purpose):

- `operatives` — a player; badge hardwareId/onionId/username linkage + registration + attest pubkey.
- `game_state` — per-operative progression (act, per-challenge status map, hp, flags).
- `inventory` — items / credentials / prompt-fragments owned; on-chain seam via `backing`+`backing_ref` ('db' today).
- `challenge_attempts` — every begin/validate cycle (input, result, status).
- `combat_sessions` — server-authoritative combat; the server generates and records every `roll` (it is the source of truth). Optional `client_entropy` (uint32) may be folded in as a hint. Rolls are NOT badge-signed (no Lua signing primitive).
- `onion_rewards` — ledger of Onion DAO API requests; `external_id` idempotency, async status machine.
- `beacons` — registered POI beacons (challenge id, landmark, espnow mac, online, source hardware|sim).
- `onion_supply_gauge` — single-row (id=1) shared festival win-bar (current/max).
- `storyteller_sessions` / `storyteller_transcripts` — DEEPDISH conversations + turn log.

Inventory `kind` ∈ `item` | `credential` | `prompt_fragment`. `backing` ∈ `db` |
`spl_token` | `nft`. Reward catalogIds resolve against `challenges/catalog.ts`.

---

## 3. ESP-NOW wire protocol (`src/lib/shared/protocol.ts`)

The badge's only network primitive on today's firmware is ESP-NOW (1..240 byte
payloads). The beacon relays frames to/from the server over HTTPS. Lua and C3
re-implement THIS byte layout; the sim imports the module directly.

**Frame = 8-byte binary header + body bytes (UTF-8 JSON, v1).** Body budget per
frame = 232 bytes. Chunked across frames sharing one `msgId`.

```
byte 0    MAGIC   = 0x4F ('O')
byte 1    VERSION = 0x01
byte 2    type    (MsgType)
byte 3    flags   (bit0 = more-chunks-follow)
byte 4-5  msgId   (uint16 BE)   request/response + chunk correlation
byte 6    seq     (uint8)       chunk index, 0-based
byte 7    total   (uint8)       total chunk count (>=1)
byte 8..N body    (<= 232 bytes)
```

Reassemble by collecting `total` chunks for a `msgId` in `seq` order, then
`JSON.parse` the concatenated body. TS helpers: `encodeMessage(type,msgId,body)`
-> `Uint8Array[]`, `decodeFrame(raw)`, `Reassembler`, `decodeSingle(raw)`.

**MsgType (stable wire constants, append-only):**

| Hex | Name | Dir | Body shape |
|---|---|---|---|
| 0x01 | BEACON_HELLO | beacon→badge | `{b,c,m,r?,l?}` (beaconId, challengeId, mac, min RSSI dBm, landmark) |
| 0x02 | OPERATIVE_IDENTIFY | badge→srv | `{h,o?}` (hardwareId, onionId) |
| 0x03 | IDENTIFY_ACK | srv→badge | progression snapshot |
| 0x04 | BADGE_MOVE | badge→srv | `{h,o?,a?,b?,k,p?,q?,t?,caps?,sig?}` generic move/proximity event |
| 0x05 | EINK_FRAME | srv→badge | `{v,ops,state?,pollMs?,io?}` compact e-ink operation stream + optional IO request |
| 0x10 | CHALLENGE_BEGIN | badge→srv | `{c,h}` |
| 0x11 | CHALLENGE_INTRO | srv→badge | intro content |
| 0x12 | CHALLENGE_RESULT | srv→badge | verdict |
| 0x20 | COMBAT_ROLL_REQUEST | badge→srv | `{c,e?}` (challengeId; optional `e`=uint32 client entropy hint, server may ignore) |
| 0x21 | COMBAT_ROLL_RESPONSE | srv→badge | `{s,n,enemyHp,opHp,wave,wavesReq,st}` |
| 0x30 | VOICE_CAPTURE_SUBMIT | badge→srv | `{c,t?,ref?,v?}` (transcript or audio-blob ref; optional `v`={rms,peak} audio energy, server may ignore) |
| 0x31 | VOICE_RESULT | srv→badge | verdict + reaction |
| 0x40 | MERCHANT_INPUT | badge→srv | `{c,seq:string[]}` |
| 0x41 | MERCHANT_RESULT | srv→badge | tier/cost verdict |
| 0x50 | NPC_DIALOGUE_TURN | badge→srv | `{c,s?,t}` (session id, utterance) |
| 0x51 | NPC_DIALOGUE_REPLY | srv→badge | DEEPDISH reply (often chunked) |
| 0x60 | REWARD_GRANT | srv→badge | `{kind,v,st?}` |
| 0x61 | PROGRESSION_STATE | srv→badge | full state |
| 0x70 | ACK | both | — |
| 0x71 | ERROR | both | `{code,msg?}` |

Audio for voice challenges does NOT travel over ESP-NOW: the beacon uploads the
blob out-of-band and passes a `ref` handle in VOICE_CAPTURE_SUBMIT.

---

## 4. Server endpoint map (`src/routes/api/`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/relay` | Beacon bridge. Body `{beaconId, frames:string[]}` (base64 frames in), resp `{frames:string[]}` (base64 frames out). Bearer `BEACON_API_KEY`. |
| POST | `/api/onion/callback` | Onion DAO async reward webhook. Verifies `X-Onion-Signature` HMAC; reconciles `onion_rewards`. |
| GET | `/api/gauge` | Public read of the shared `onion_supply_gauge` win-bar. |

A badge on WiFi may call the server directly via `onion.http_post` (POST to
`/api/relay`) using the same logical message types — the relay JSON envelope is
the canonical server-facing shape whether frames arrive over the beacon or over
direct HTTP. (There is no `onion.http_request`; the shipped firmware exposes
`onion.http_get`/`onion.http_post`.)

Beacon auth: `Authorization: Bearer <BEACON_API_KEY>` (open if unset, dev only).

---

## 5. Challenge module export shape (`src/lib/server/challenges/`)

**Self-registration — NO shared index.** `registry.ts` globs `impl/*.ts`
eagerly (`import.meta.glob`), so each file's top-level `registerChallenge()`
runs on load. Add a challenge by creating ONE new file; never edit a shared
array (parallel-safe).

File: `src/lib/server/challenges/impl/<challengeId>.ts` (e.g. `0.1-ketchup-gauntlet.ts`).
It MUST call `registerChallenge(descriptor)` at module top level:

```ts
import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';

const challenge: ChallengeDescriptor = {
  id: '0.1',                 // globally unique; also the beacon's challengeId
  act: 0,                    // 0..4
  type: 'combat',            // 'combat'|'dialogue'|'merchant'|'npc'
  name: 'The Ketchup Gauntlet',
  requires: [],              // catalogIds gating entry (credential gating)
  rewards: [                 // RewardSpec[] — engine applies on pass
    { kind: 'inventory', catalogId: 'encased_meat_mk1' },
    { kind: 'onions', amount: 50 },
    { kind: 'gauge', amount: 500 }
  ],
  beaconConfig: { beaconIdHint: 'b-ketchup', landmark: 'Hot dog stand' },
  content: { /* prompts, button maps, voice targets, screen hints */ },
  validate(input, ctx): ChallengeResult { /* return verdict */ }
};

registerChallenge(challenge);
export default challenge; // optional; the register call is what matters
```

RULES: `id` unique (duplicate throws at load). `validate` is pure-ish — read
`ctx` ({operative, inventory, combat?, now}), return `{passed, message?,
rewards?, flags?, continued?}`. The ENGINE persists the attempt and APPLIES
rewards; challenges NEVER grant directly. RewardSpec kinds: `onions` (real Onion
DAO API), `inventory` (catalogId), `gauge` (win-bar bump).

---

## 6. oRPG Lua conventions (`oRPG/`)

**Thin loader.** `oRPG.lua` is the entry point + main loop. On a BEACON_HELLO
whose RSSI meets the advertised `r` threshold, it sends a `BADGE_MOVE` with
hardware id, linked Onion id, discovered addresses, beacon identity, runtime
capabilities, and an optional signature. The server owns all adventure and
challenge state and replies with `EINK_FRAME`.

**Move submission (`oRPG/lib/identity.lua`).** The badge maintains address
metadata and signs the canonical move envelope when firmware exposes a signing
primitive. Current shipped firmware does not expose arbitrary message signing,
so unsigned moves remain valid and server-authoritative.

**Server frame renderer (`oRPG/lib/ui.lua`).** The badge does not lay out game
screens. It maps compact server ops (`clear`, `text`, `lines`, `line`, `rect`)
to native e-paper primitives and commits once per frame.

**Submodule IO (`oRPG/lib/hardware.lua`).** `EINK_FRAME` may include an optional
`io` directive. After rendering, the badge executes supported requests and
submits `BADGE_MOVE { k:'io', p:{...results...} }`.

```ts
io?: {
  gpio?: { pins?: Record<string, number> },
  mic?: { ms?: number, sampleRate?: number },
  speaker?: { toneHz?: number, ms?: number, sound?: string },
  subghzTx?: { hex?: string, payload?: string, freq?: number, modulation?: string },
  subghzRx?: { timeoutMs?: number, freq?: number, modulation?: string }
}
```

GPIO is feature-detected (`gpio_read`, `digital_read`, or `pin_read`) and may
use a badge-local `ORPG_GPIO_PINS` table if the server omits pins. Mic uses
`sound_mic_level` when available, falling back to `sound_mic_read` RMS/peak
calculation. Speaker and sub-GHz are mutually respectful of module lifecycle:
the badge opens the module, performs the requested operation, and closes it.

**ESP-NOW client helper (`oRPG/lib/net.lua`).** The runtime frames a message per
§3, sends via `onion.espnow_send`, and reassembles the reply via
`onion.espnow_receive`:

```lua
-- returns decoded reply body (table) or nil,err
local frame, err = net.request(MsgType.BADGE_MOVE, move)
if frame then ui.render_frame(frame) end
```

**Capability shim (`oRPG/lib/caps.lua`).** Detect each shipped Onion OS
primitive by its canonical name and pick the richer path when present, else
fall back to ESP-NOW + beacon. The game MUST be fully playable on a bare badge
(ESP-NOW only). These are the REAL firmware names (see the badge README's
`onion` table + "Swappable modules"); the earlier proposed names
(`http_request`/`se_rng`/`se_sign`/`voice_capture`/`subghz_tx`) are gone.

```lua
local caps = {
  http    = type(onion.http_get) == 'function' and type(onion.http_post) == 'function',     -- direct HTTPS, beacon-free
  mqtt    = type(onion.mqtt_publish) == 'function' and type(onion.mqtt_subscribe) == 'function', -- shared MQTT bridge
  secRng  = type(onion.secure_random) == 'function',                                         -- ATECC608A RNG (entropy hint only)
  voice   = type(onion.sound_mic_begin) == 'function' and type(onion.sound_mic_read) == 'function', -- PDM mic capture
  speaker = type(onion.sound_speaker_begin) == 'function',                                   -- Sound-module speaker
  subghz  = type(onion.subghz_begin) == 'function' and type(onion.subghz_transmit) == 'function',  -- CC1101 sub-GHz
}
caps.sign = type(onion.sign_message) == 'function'
    or type(onion.wallet_sign) == 'function'
    or type(onion.se_sign) == 'function'
caps.seAttest = caps.sign -- legacy alias; game logic is still server-owned
```

- Combat is **SERVER-AUTHORITATIVE** and rolls are **NOT badge-signed**. The
  server generates and records every roll; that is the source of truth. If
  `caps.secRng`, the badge MAY attach a few bytes of client entropy as an
  optional `COMBAT_ROLL_REQUEST.e` (uint32) hint — additive, and the server may
  ignore it. There is no `se_sign`/attestation path: the ATECC608B cannot do
  Ed25519 and the badge's software Solana key is not exposed to scripts, so
  `caps.seAttest` is always `false`. Tamper resistance = server authority +
  `secure_random` entropy, not a signature.
- Voice: if `caps.voice`, capture on-badge via `onion.sound_mic_*` (the badge
  has no STT, so it measures an energy summary `{rms,peak}` and may include it
  as the optional `VOICE_CAPTURE_SUBMIT.v` field); else the beacon
  captures/uploads and passes a `ref`. Either way audio is uploaded out-of-band
  (not over ESP-NOW).
- Transport: if `caps.http`, talk to the server directly via `onion.http_post`
  (POST `/api/relay`) with the same logical message bodies; else relay through
  the beacon.

NOTE: every richer capability the earlier draft "proposed" already ships in
firmware under the canonical names above — `onion.http_get/http_post`,
`onion.mqtt_*`, `onion.secure_random`, `onion.sound_mic_*`/`sound_speaker_*`,
and `onion.subghz_*`. The ONE proposed primitive that is genuinely absent is
`onion.se_sign` (badge-signed rolls), and that is intentional (see combat
above). See `../firmware-ext/` for the full proposed→shipped mapping.

---

## 7. Environment variables (`.env.example`)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | oRPG Postgres connection string. |
| `ONION_API_BASE_URL` | Onion DAO API base (`https://oniondao.dev`). |
| `ONION_EXTERNAL_API_KEY` | Bearer for the external Onion request API. |
| `ONION_REQUESTER_ID` | `requester` value (scopes idempotency). Default `onion-rpg`. |
| `ONION_CALLBACK_SECRET` | HMAC secret we attach as `callbackSecret`. |
| `ONION_CALLBACK_URL` | Public URL for `/api/onion/callback`. |
| `ANTHROPIC_API_KEY` | DEEPDISH Storyteller. |
| `STORYTELLER_MODEL_FINALE` | finale model (default `claude-opus-4-8`). |
| `STORYTELLER_MODEL_DIALOGUE` | routine NPC model (default `claude-sonnet-4-6`). |
| `STT_PROVIDER` | `whisper-http` (default) \| `mock` \| custom. |
| `STT_ENDPOINT` / `STT_API_KEY` | Whisper-compatible STT endpoint. |
| `BEACON_API_KEY` | Beacon bearer for `/api/relay`. |
| `SOLANA_RPC_URL` | Future on-chain item backing (not required now). |

---

## 8. Currency & inventory authority

- **Onions (currency)** flow through the REAL Onion DAO API (external app). The
  oRPG server creates async requests (`type:'transfer'`/`'burn'`),
  idempotency = (`ONION_REQUESTER_ID`, `externalId`), reconciles via the
  `/api/onion/callback` webhook + polling. Ledger: `onion_rewards`.
- **Items / credentials / prompt-fragments** are authoritative in the oRPG
  Postgres `inventory` table, with a clean on-chain seam (`backing`,
  `backing_ref`) so they can later be SPL tokens / NFTs without changing
  callers. Do NOT block on on-chain item minting now.
- Progression gating is by inventory (credentials), enforced by the engine +
  Storyteller, not honor system.
