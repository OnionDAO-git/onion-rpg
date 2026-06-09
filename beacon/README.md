# beacon — ESP32-C3 Point-of-Interest firmware

ESP-IDF (pure C, no Arduino layer). An ESP-NOW <-> WiFi/HTTPS bridge: each
beacon receives badge ESP-NOW frames, POSTs them to the game server at
`/api/relay`, and returns the server's response frames to the badge over
ESP-NOW. Conforms exactly to `../docs/CONTRACTS.md` and
`../src/lib/shared/protocol.ts`.

---

## Hardware

- **MCU:** ESP32-C3 (single-core RISC-V, 160 MHz, 400 KB SRAM, 4 MB flash)
- **WiFi:** 2.4 GHz 802.11 b/g/n, shared with ESP-NOW
- **Form factor:** fits inside the 3D-printed "hot dog cart" enclosure (see
  section below)
- **Power:** USB-C or 3.3 V UART header; no battery (POI beacons are mains/
  USB-powered at fixed locations)

### Enclosure — 3D-print cart note

Each beacon ships in a 3D-printed prop enclosure themed to its challenge:

| Challenge | Prop | STL hint |
|---|---|---|
| 0.1 | Hot dog cart | `props/cart_0_1.stl` (not yet designed) |
| 1.1 | Drinking fountain | `props/fountain_1_1.stl` |
| 2.2 | USPS sorting unit | `props/sorting_2_2.stl` |

STL files are not in this repo yet. The enclosure only needs one external
feature: a USB-C port cutout for power + flashing. Mount the ESP32-C3 on a
custom PCB or a dev board (e.g. ESP32-C3-DevKitM-1).

---

## Directory layout

```
beacon/
  CMakeLists.txt              top-level IDF project file
  sdkconfig.defaults          build defaults (target=esp32c3, 4 MB flash)
  partitions/
    partitions.csv            NVS 256 KB, OTA x2, SPIFFS 512 KB
  main/
    CMakeLists.txt            component registration
    main.c                    app_main: WiFi + relay task + serial provisioning
    config.c/.h               config loader (compiled-in defaults → NVS → SPIFFS JSON)
    beacon_config.h           g_cfg struct + compile-time defaults
    onion_proto.c/.h          ESP-NOW frame encoder/decoder/reassembler
    espnow_rx.c/.h            ESP-NOW RX queue + TX helpers
    http_relay.c/.h           HTTPS POST to /api/relay; voice OOB upload
    beacon_hello.c/.h         periodic BEACON_HELLO broadcast + server registration
    challenge_config.c/.h     per-challenge SPIFFS JSON loader
  challenges/
    README.md                 how challenge agents add configs
    0.1.json                  example: Ketchup Gauntlet (combat)
    1.1.json                  example: Malört Fountains (voice)
    1.2.json                  example: Substation Reroute (combat waves)
    2.1.json                  example: Loop That Won't Stop (sub-GHz)
    2.2.json                  example: Sorting Machine (merchant)
    3.4.json                  example: Elevator Hack (sub-GHz)
  scripts/
    flash_spiffs.sh           build + flash SPIFFS image (beacon_config + challenge)
    provision_serial.sh       set config fields via USB serial
```

---

## Building

```sh
# Source ESP-IDF (v5.x) first:
source $IDF_PATH/export.sh

cd beacon/
idf.py set-target esp32c3
idf.py build
```

---

## Flashing

### First flash (firmware + SPIFFS)

```sh
# Flash the firmware binary:
idf.py -p /dev/cu.usbmodemXXX flash

# Flash the SPIFFS image with beacon identity (sets challenge_id + WiFi creds):
./scripts/flash_spiffs.sh \
    --challenge 0.1 \
    --beacon-id b-ketchup-01 \
    --port /dev/cu.usbmodemXXX \
    --wifi-ssid "CIC Guest" \
    --wifi-pass "1nnovation" \
    --min-rssi -75 \
    --server-url "https://onion-rpg.example.com" \
    --api-key "sk-..."
```

### Config-only update (no firmware reflash)

```sh
./scripts/flash_spiffs.sh --challenge 0.1 --port /dev/cu.usbmodemXXX
```

### Provisioning via USB serial (no flash tool needed)

```sh
./scripts/provision_serial.sh \
    --port /dev/cu.usbmodemXXX \
    --challenge 0.1 \
    --wifi-ssid "CIC Guest" \
    --wifi-pass "1nnovation"
```

Or open a serial terminal (115200 baud) and type commands manually:

```
SET beacon_id b-ketchup-01
SET challenge_id 0.1
SET wifi_ssid CIC Guest
SET wifi_pass 1nnovation
SET server_url https://onion-rpg.example.com
SET api_key sk-...
SET min_rssi -75
DUMP
RESET
```

---

## How it works

```
Badge (ESP32-S3)                    Beacon (ESP32-C3)           Game Server
  ──────────────                    ─────────────────           ───────────
  [ESP-NOW frames]  ──────────────> espnow_rx queue
                                    relay task dequeues
                                    reassembles chunks
                                              [HTTPS POST /api/relay] ──────>
                                              <─────── {frames:[...]} ───────
                    <── ESP-NOW ──  unicast response frames
```

1. **BEACON_HELLO** — broadcast every 5 s so badges can discover the beacon,
   know which challenge it hosts, and decide whether it is close enough by RSSI.
   Body: `{"b":"b-ketchup-01","c":"0.1","m":"AA:BB:CC:DD:EE:FF","r":-75,"l":"Hot dog stand"}`.

2. **Request relay** — the badge sends one or more ESP-NOW frames (8-byte
   header + JSON body, max 240 bytes each). The beacon reassembles chunked
   messages (same `msgId`, different `seq`), then POSTs all frames base64-
   encoded in `{beaconId, frames:[...]}` to `/api/relay`.

3. **Response relay** — the server's `{frames:[...]}` response is decoded from
   base64 and sent back to the badge via ESP-NOW unicast.

4. **Voice audio** — audio blobs do NOT travel over ESP-NOW. When the badge
   firmware extension `onion.voice_capture()` is present, the beacon receives
   the audio out-of-band (the firmware uploads it directly). For badges without
   that extension, a future beacon microphone path calls `http_upload_voice()`
   and substitutes the returned `ref` handle into the VOICE_CAPTURE_SUBMIT body.

5. **BEACON_HELLO server registration** — once every 30 s the beacon relays a
   BEACON_HELLO to `/api/relay` so the server can keep the `beacons` DB row
   current (online status, MAC, lat/lon).

---

## Configuration priority

Highest wins:

1. `/spiffs/beacon_config.json` (dropped by `flash_spiffs.sh`)
2. NVS namespace `beacon` (set via `SET` serial commands or `provision_serial.sh`)
3. Compiled-in defaults (`beacon_config.h` / `sdkconfig.defaults`)

---

## Per-challenge beacon config

Challenge agents drop a JSON file in `challenges/<challengeId>.json`.
`flash_spiffs.sh` copies it to SPIFFS as `challenge_<safe_id>.json` (with
`.` → `_`). The beacon loads it at boot and exposes `g_challenge_cfg` to the
relay task.

Parameters (all optional):

| Field | Type | Purpose |
|---|---|---|
| `timing_window_ms` | number | challenge time limit enforced by relay |
| `voice_keywords` | string[] | keywords the beacon can log/forward for STT debug |
| `merchant_combos` | string[][] | valid button sequences (beacon can pre-validate) |
| `subghz.freq_hz` | number | sub-GHz carrier for jamming/handshake events |
| `subghz.symbol_ms` | number | symbol duration |
| `custom` | object | challenge-specific opaque blob forwarded as-is |

---

## ESP-NOW channel

The ESP32-C3 shares one radio between WiFi STA and ESP-NOW. After WiFi
associates, ESP-NOW is locked to the AP channel. Set the AP channel to
match your venue's least-congested 2.4 GHz channel (typically 1, 6, or 11).

If you need a specific ESP-NOW channel that differs from the WiFi AP,
configure `espnow_channel` in beacon_config.json (advanced; not recommended
for typical deployments).

---

## Multi-beacon deployments

Flash one firmware binary; differentiate beacons only via SPIFFS/NVS config
(`beacon_id`, `challenge_id`, `min_rssi`). Each beacon registers with the
server on boot and heartbeats every 30 s, keeping the `beacons` DB row live.

Suggested naming convention:
- `beacon_id`: `b-<challenge_safe_id>-<nn>` e.g. `b-ketchup-01`
- Physical labelling: print the `beacon_id` on a sticker on the bottom of the
  enclosure.

---

## OTA (over-the-air firmware updates)

The partition table includes OTA_0 and OTA_1 slots. Use `idf.py` OTA or the
ESP-IDF `esp_ota` component to push firmware updates over HTTP (local LAN only;
`CONFIG_OTA_ALLOW_HTTP=y` in sdkconfig for dev, keep HTTPS in production).

SPIFFS is not updated via OTA — use `flash_spiffs.sh` for config changes.

---

## Environment / server variables

The beacon uses only `server_url` and `api_key` from its own config. The
matching server-side env var is `BEACON_API_KEY` (see `../docs/CONTRACTS.md §7`).
