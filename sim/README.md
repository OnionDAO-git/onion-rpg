# sim — software beacon simulator

A bun/TypeScript simulator so the ONION RPG game is fully testable without
hardware. Emulates one or many ESP32-C3 beacons, provides a virtual badge
test client, and drives challenges end-to-end against a running game server.

---

## Architecture

```
VirtualBadge ──[ SimChannel / ESP-NOW stand-in ]── SimBeacon ──[ HTTP ]── game server
    (badge.ts)             (transport.ts)              (beacon.ts)         /api/relay
```

- **SimChannel** (`transport.ts`): an in-process EventEmitter bus that stands
  in for ESP-NOW radio. Peers are identified by MAC-like strings. Frames
  delivered here are byte-for-byte identical to real ESP-NOW frames.
- **SimBeacon** (`beacon.ts`): emulates a C3 beacon — registers with the
  server, broadcasts `BEACON_HELLO`, and relays badge frames to
  `POST /api/relay` then relays server response frames back to the badge.
  Loads config from `beacon/challenges/<challengeId>.json` (or synthesizes a
  stub if the file doesn't exist).
- **VirtualBadge** (`badge.ts`): emulates a badge — listens for `BEACON_HELLO`,
  sends typed requests (`identify`, `beginChallenge`, `combatRoll`, etc.), and
  reassembles chunked responses. All traffic goes through SimChannel, not the
  server directly.
- **runner.ts**: headless scenario runner. Starts a SimBeacon + VirtualBadge,
  hands them to a `ScenarioFn`, reports pass/fail with timing.
- **cli.ts**: CLI entrypoint — spawn beacons, run scenarios, list scenarios.
- **scenarios/**: per-challenge scenario scripts. Add one file per challenge.
- **config.ts**: loads/saves `beacon/challenges/<id>.json` configs.
- **protocol.test.ts**: unit tests for the shared protocol (encode/decode,
  chunking, out-of-order reassembly, SimChannel broadcast).

---

## Wire compatibility

The sim uses `src/lib/shared/protocol.ts` **directly** — the exact same module
the server uses. Frames produced by `VirtualBadge.request()` are byte-for-byte
identical to what a real badge emits over ESP-NOW. A real badge can talk to
either a real C3 beacon or this simulator interchangeably.

---

## Quick start

```bash
# From the repo root (onion-rpg/).

# Spawn a sim beacon for challenge 0.1 (Ketchup Gauntlet):
bun run sim/cli.ts beacon 0.1

# Spawn multiple beacons at once:
bun run sim/cli.ts beacons 0.1,1.1,1.2,1.3

# Run the smoke test (IDENTIFY + BEGIN only) against a running server:
bun run sim/cli.ts test smoke --challenge 0.1

# Run the full Ketchup Gauntlet scenario (verbose):
bun run sim/cli.ts test 0.1 --verbose

# Run all registered scenarios:
bun run sim/cli.ts test all

# List available scenarios:
bun run sim/cli.ts list

# Run unit tests (no server needed):
bun test sim/protocol.test.ts
```

---

## Options

| Flag | Default | Description |
|---|---|---|
| `--server <url>` | `http://localhost:5173` | Game server URL. Also reads `GAME_SERVER_URL`. |
| `--key <key>` | `BEACON_API_KEY` env | Bearer key for `/api/relay`. |
| `--hw <id>` | `sim-badge-01` | Virtual badge hardware id. |
| `--onion <n>` | — | Virtual badge numeric onion id. |
| `--timeout <ms>` | `15000` | Request timeout. |
| `--hello <ms>` | `5000` | Beacon hello broadcast period. `0` = once at start. |
| `--challenge <id>` | — | Challenge id for the `smoke` scenario. |
| `-v, --verbose` | false | Print every request/response frame. |

---

## Beacon challenge configs

Each simulated beacon loads its config from:
```
beacon/challenges/<challengeId>.json
```

Example (`beacon/challenges/0.1.json`):
```json
{
  "id": "b-ketchup-01",
  "challengeId": "0.1",
  "name": "The Ketchup Gauntlet",
  "landmark": "Busted hot dog stand",
  "lat": null,
  "lon": null,
  "espnowMac": null
}
```

If no JSON exists for a challengeId, a minimal stub is synthesized at runtime
(`{ id: "b-<challengeId>", challengeId, ... }`). The real C3 firmware reads
the same JSON from its LittleFS flash partition, so the config format is
shared.

---

## Adding a scenario

1. Create `sim/scenarios/<challengeId>.ts` exporting a `ScenarioFn`.
2. Register it in the `SCENARIOS` map in `sim/cli.ts`.

```typescript
// sim/scenarios/1.1-malort-fountains.ts
import type { ScenarioFn } from '../runner';
import { MsgType } from '../../src/lib/shared/protocol';

export const malortFountainsScenario: ScenarioFn = async (beacon, badge, ctx) => {
  const ack = await badge.identify(beacon.mac);
  ctx.assertMsgType(ack, MsgType.IDENTIFY_ACK);

  const intro = await badge.beginChallenge(beacon.mac, beacon.config.challengeId);
  ctx.assertMsgType(intro, MsgType.CHALLENGE_INTRO);

  // Pass a transcript for the voice challenge:
  const result = await badge.voiceSubmit(
    beacon.mac,
    beacon.config.challengeId,
    'Lake Michigan intake crib tunnel Jardine treatment plant grid'
  );
  ctx.assertPassed(result, 'voice verdict');
};

export default malortFountainsScenario;
```

---

## Unit tests

`sim/protocol.test.ts` covers:
- encode/decode roundtrip (single-frame and multi-frame/chunked)
- Reassembler in-order and out-of-order
- SimChannel: unicast, broadcast `ff:ff:ff:ff:ff:ff`, close/teardown
- `fakeMac` determinism + format

Run with:
```bash
bun test sim/protocol.test.ts
```

---

## Relationship to real hardware

| Component | Real | Sim |
|---|---|---|
| ESP-NOW radio | ESP32-C3 hardware | `SimChannel` EventEmitter |
| Badge firmware | `oRPG.lua` on ESP32-S3 | `VirtualBadge` TypeScript class |
| Beacon firmware | C3 ESP-IDF firmware | `SimBeacon` TypeScript class |
| `/api/relay` | Same real endpoint | Same real endpoint (HTTP) |
| Frame encoding | Lua hand-implementation | `src/lib/shared/protocol.ts` (direct import) |
| Challenge configs | LittleFS flash partition | `beacon/challenges/*.json` files |

The game server sees no difference between a hardware beacon and a sim beacon;
both call `POST /api/relay` with base64 frames.
