# ONION RPG — Live-Event Runbook

This runbook covers the end-to-end procedure for deploying ONION RPG at a
live Onion DAO event: server deployment, beacon flashing, firmware-extension
integration, and publishing/pushing oRPG.lua to badges.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Bun | >= 1.1 | Server runtime |
| Postgres | >= 15 | Game database |
| ESP-IDF | v5.x | Beacon firmware build |
| Anthropic account | — | DEEPDISH (Claude API) |
| Onion DAO portal account | — | Lua Registry + Onion reward API |
| Whisper-compatible STT | any | Voice challenge transcription |

---

## 1. Server deployment

### 1a. Provision infrastructure

The game server needs:
- A public HTTPS URL (e.g. `https://rpg.oniondao.dev`)
- Postgres database (separate from the landing-2026 DB)
- The following env vars (see `.env.example` for full list):

```
DATABASE_URL=postgresql://orpg:<password>@<host>:5432/orpg
ONION_API_BASE_URL=https://oniondao.dev
ONION_EXTERNAL_API_KEY=<issued by Onion DAO portal>
ONION_REQUESTER_ID=onion-rpg
ONION_CALLBACK_SECRET=<random 32+ hex chars>
ONION_CALLBACK_URL=https://rpg.oniondao.dev/api/onion/callback
ANTHROPIC_API_KEY=<from console.anthropic.com>
STORYTELLER_MODEL_FINALE=claude-opus-4-8
STORYTELLER_MODEL_DIALOGUE=claude-sonnet-4-6
STT_PROVIDER=whisper-http
STT_ENDPOINT=https://<your-whisper-server>/v1/audio/transcriptions
STT_API_KEY=<your-whisper-api-key>
BEACON_API_KEY=<random 32+ hex chars — shared with all beacons>
```

### 1b. Build and start

```bash
cd onion-rpg/
bun install
bun run build
bun run db:init    # idempotent — safe to re-run on schema changes
bun run start      # starts the node server on PORT (default 3000)
```

For production, run behind a reverse proxy (nginx/caddy) with TLS.
`PORT` env var controls the listen port.

### 1c. Verify server health

```bash
# Gauge endpoint should return { current: 0, max: ... }
curl https://rpg.oniondao.dev/api/gauge

# Auth-required relay endpoint should return 401 without a key
curl -X POST https://rpg.oniondao.dev/api/relay
```

### 1d. Register the reward webhook

In the Onion DAO portal, register `ONION_CALLBACK_URL` as the callback
endpoint for your external app. The server verifies every callback via
`X-Onion-Signature` HMAC using `ONION_CALLBACK_SECRET`.

---

## 2. Beacon flashing

### 2a. Build the beacon firmware once

```bash
source $IDF_PATH/export.sh    # ESP-IDF v5.x

cd onion-rpg/beacon/
idf.py set-target esp32c3
idf.py build
# Binary: build/beacon.bin
```

One firmware binary is flashed to every beacon. Differentiation is done
entirely through SPIFFS/NVS config.

### 2b. Flash a beacon (first time)

For each beacon, run `flash_spiffs.sh` which flashes both the firmware and
the SPIFFS config image in one step:

```bash
./scripts/flash_spiffs.sh \
    --challenge <challengeId>     \   # e.g. 0.1  or  act1-1
    --beacon-id <beaconId>        \   # e.g. b-ketchup-01
    --port      /dev/cu.usbmodemXXX \
    --wifi-ssid "<event-network>"  \
    --wifi-pass "<event-password>" \
    --server-url https://rpg.oniondao.dev \
    --api-key   "$BEACON_API_KEY"
```

Suggested `beacon_id` convention: `b-<challenge_safe_id>-<nn>`,
e.g. `b-ketchup-01`, `b-fountain-01`, `b-sorting-01`.
Print the `beacon_id` on a sticker on the bottom of the prop enclosure.

### 2c. Update config without reflashing

To change WiFi creds or server URL on an already-flashed beacon:

```bash
# SPIFFS-only update:
./scripts/flash_spiffs.sh --challenge 0.1 --port /dev/cu.usbmodemXXX \
    --wifi-ssid "NewNetwork" --wifi-pass "NewPass"

# Or via USB serial (no flash tool needed):
./scripts/provision_serial.sh \
    --port /dev/cu.usbmodemXXX \
    --wifi-ssid "NewNetwork" --wifi-pass "NewPass"
```

Or open a 115200-baud serial terminal and type:
```
SET wifi_ssid NewNetwork
SET wifi_pass NewPass
SET server_url https://rpg.oniondao.dev
RESET
```

### 2d. Verify a beacon is online

After power-on the beacon will:
1. Connect to WiFi.
2. Start broadcasting `BEACON_HELLO` every 5 s over ESP-NOW.
3. Register itself with the server (heartbeat every 30 s).

Check the `beacons` table:
```sql
SELECT beacon_id, challenge_id, online, updated_at FROM beacons ORDER BY updated_at DESC;
```

Or watch server logs for the relay POST from that `beacon_id`.

### 2e. Multi-beacon channel management

All beacons share the 2.4 GHz WiFi channel with their AP. ESP-NOW locks to
the AP channel after association. Set the event WiFi AP to channel 1, 6, or
11 (least congested) and configure all beacons with that channel. If you need
different ESP-NOW and WiFi channels, set `espnow_channel` in
`beacon_config.json` (advanced).

### 2f. OTA firmware updates (during event)

The partition table has OTA_0 / OTA_1 slots. To push a firmware update over
LAN during the event:

```bash
idf.py -p /dev/cu.usbmodemXXX ota --ota-host <local-ota-server>
```

SPIFFS is NOT updated via OTA — use `flash_spiffs.sh` for config changes.

---

## 3. Applying firmware-ext primitives to Onion OS badges

The firmware-ext primitives add richer hardware paths for combat, voice, and
sub-GHz challenges. The game works without them (ESP-NOW fallback), but the
full experience requires them for signed combat rolls, on-badge voice capture,
and sub-GHz mini-events.

### 3a. Integration steps

1. Copy `firmware-ext/main/onion_ext.cpp` and `firmware-ext/main/onion_ext.h`
   into `<onion-os>/main/`.

2. Follow `firmware-ext/INTEGRATION.md` for the exact `CMakeLists.txt`
   component registration and the two-line `main.cpp` patch
   (add `#include "onion_ext.h"` and call `registerOnionExtLua(L)` after
   `luaL_openlibs`).

3. Optionally add pin defines to `badge_pins.h` for mic and sub-GHz
   hardware (see `firmware-ext/API.md` for pin names).

4. Build and flash to badges.

### 3b. Sub-GHz status

The shipped Onion OS firmware provides the real sub-GHz API backed by the
CC1101: `onion.subghz_begin`, `onion.subghz_transmit`, `onion.subghz_receive`,
and `onion.subghz_end`. The `subghz` capability is reported when the radio is
wired and configured. Challenges that use sub-GHz (2.1 Loop / 3.4 Elevator
Hack) fall back to a beacon-relay path automatically when the cap is absent.

### 3c. Capability shim auto-detection

`oRPG/lib/caps.lua` probes at runtime — no badge firmware version flag needed.
Upgraded badges gain the richer paths immediately on next oRPG load.

---

## 4. Publishing oRPG.lua to the Lua Script Registry

### 4a. Package the script

Bundle `oRPG.lua` and `oRPG/lib/*.lua` + `oRPG/screens/*.lua` into the
single archive the registry expects (or use the registry's multi-file upload
if supported). The entry point is `oRPG.lua`.

### 4b. Publish

```bash
curl -X POST https://oniondao.dev/api/portal/lua-scripts \
  -H "Authorization: Bearer $PORTAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "oRPG",
    "description": "The Great Onion Shortage — Onion DAO live-event RPG",
    "entrypoint": "oRPG.lua",
    "version": "1.0.0"
  }'
# Returns { id: "<scriptId>", ... }
```

Note the returned `<scriptId>` for pushing.

### 4c. Push to individual badges

```bash
# Push to a specific badge by onionId (badge shows an accept popup via MQTT):
curl -X POST https://oniondao.dev/api/portal/lua-scripts/<scriptId>/push \
  -H "Authorization: Bearer $PORTAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"onionId": 12345}'
```

Alternatively, attendees can browse the registry on their badge and
download oRPG manually.

### 4d. Update/republish

Publish a new version (the registry is append-only per the Onion DAO API).
Push the new version to online badges as in 4c.

---

## 5. Pre-event checklist

### Server
- [ ] `bun run db:init` applied to production DB
- [ ] `GET /api/gauge` returns `{ current: 0, max: <n> }`
- [ ] Test relay with sim: `bun run sim/cli.ts test smoke --challenge 0.1 --server https://rpg.oniondao.dev`
- [ ] Onion DAO callback webhook registered; test with a mock POST to `/api/onion/callback`
- [ ] `STT_PROVIDER` configured and endpoint reachable (or set to `mock` for dev)
- [ ] DEEPDISH: `ANTHROPIC_API_KEY` set; test via a direct NPC dialogue request

### Beacons (one per challenge)
- [ ] All beacons appear online in `beacons` table
- [ ] Each beacon's `challenge_id` matches the challenge it hosts
- [ ] Prop enclosures labeled with `beacon_id` on the bottom
- [ ] USB-C power cables + power banks / outlet strips in place
- [ ] Spare beacon (pre-flashed `b-ketchup-01`) on hand for hot-swap

### Badges
- [ ] oRPG.lua published to the registry
- [ ] Test badge accepts and runs the script
- [ ] Firmware-ext patches applied (if using extended hardware paths)
- [ ] At least one hardware run of the Act 0 Ketchup Gauntlet end-to-end

### Festival operations
- [ ] `BEACON_API_KEY` recorded in operations doc (needed for beacon replacement)
- [ ] Onion supply gauge displayed on a visible screen (poll `GET /api/gauge`)
- [ ] Staff briefed on the challenge flow and credential gates

---

## 6. Troubleshooting

### Beacon not appearing in `beacons` table
- Check serial output (115200 baud) for WiFi connection errors.
- Verify `server_url` and `api_key` match `BEACON_API_KEY` in server env.
- Confirm the beacon's WiFi channel matches the AP channel.

### Relay returning 401
- `BEACON_API_KEY` is unset (server runs open in dev; prod requires it).
- Beacon `api_key` config doesn't match server `BEACON_API_KEY`.

### Voice challenge always failing
- Set `STT_PROVIDER=mock` and `STT_MOCK_TRANSCRIPT=<expected-phrase>` for testing.
- Confirm `STT_ENDPOINT` is reachable from the server's network.
- Check beacon serial log for audio upload errors.

### DEEPDISH not responding / dialogue challenge stuck
- Verify `ANTHROPIC_API_KEY` is valid.
- Check server logs for `anthropic` client errors.
- NPC challenges fall back to pre-written content strings on AI errors;
  the challenge `continued: true` keeps the session alive for a retry.

### Onion reward not arriving to player
- Rewards are async: the player must approve in their Onion DAO portal.
- Check `onion_rewards` table for the reward row and its `status` column.
- If `status = failed`: re-POST to the Onion DAO API using the same
  `external_id` (idempotent).
- Confirm `ONION_CALLBACK_URL` is publicly reachable (the Onion DAO server
  must be able to POST to it).

### `bun run db:init` fails
- `DATABASE_URL` not set or incorrect.
- Postgres user lacks CREATE TABLE privilege.
- Schema is idempotent — safe to re-run after fixing credentials.
