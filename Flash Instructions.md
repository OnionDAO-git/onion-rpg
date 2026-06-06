Here's how to flash a beacon in this repo. The firmware is one binary for all beacons — a given beacon is distinguished only by its config (beacon ID + challenge), so "flashing a given beacon" really means flashing the firmware plus that beacon's identity config.

Hardware

- MCU: ESP32-C3, flashed over USB-C
- Toolchain: ESP-IDF v5.x — run source $IDF_PATH/export.sh first
- Firmware root: beacon/, scripts in beacon/scripts/

Easiest path — one command (firmware + config)

cd onion-rpg/beacon/
export BEACON_API_KEY="<the server BEACON_API_KEY>"
./scripts/flash_beacon.sh 0.1 \
 --wifi-ssid "CIC Guest" --wifi-pass "1nnovation" \
 --server-url https://rpg.oniondao.dev --api-key "$BEACON_API_KEY"
flash_beacon.sh <challengeId> auto-detects the ESP32-C3 serial port, then builds + flashes firmware (idf.py set-target esp32c3 build && idf.py -p <port> flash) and flashes the SPIFFS config
in one shot.

Config only (beacon already has firmware)

Use this to set/change a specific beacon's identity without reflashing firmware:
./scripts/flash_spiffs.sh \
 --challenge 0.1 --beacon-id b-ketchup-01 --port /dev/cu.usbmodemXXX \
 --wifi-ssid "CIC Guest" --wifi-pass "1nnovation" \
 --server-url "https://rpg.oniondao.dev" --api-key "$BEACON_API_KEY"
Or, no flash tool needed, set config in NVS over serial:
./scripts/provision_serial.sh --port /dev/cu.usbmodemXXX --challenge 0.1 \
 --wifi-ssid "CIC Guest" --wifi-pass "1nnovation"

What identifies "a given beacon"

- --beacon-id — convention b-<challenge_safe_id>-<nn> (e.g. b-ketchup-01), printed on the enclosure sticker. If omitted, it defaults to b-<safe_id>-01.
- --challenge <id> — pulls per-challenge params from beacon/challenges/<id>.json.
- Config load priority: /spiffs/beacon_config.json (from flash_spiffs.sh) > NVS (provision_serial.sh) > compile-time defaults in beacon/main/beacon_config.h.

On boot the beacon registers with the server (/api/relay) and heartbeats every 30s. Production requires the flashed `api_key` to match the server's `BEACON_API_KEY`; without it `/api/relay` returns `401 Unauthorized`.

One thing to flag

beacon/challenges/README.md documents a bun run beacon:flash:config ... command, but that script doesn't exist in package.json. The working route is the shell scripts above. Want me to
either add that npm/bun script or fix the README to point at flash_spiffs.sh?
