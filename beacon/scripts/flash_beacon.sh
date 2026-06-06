#!/usr/bin/env bash
# flash_beacon.sh — auto-detect a connected ESP32-C3 and flash both the
# firmware and the SPIFFS config for a given challenge, in one shot.
#
# Usage:
#   ./scripts/flash_beacon.sh <challengeId> [options]
#   ./scripts/flash_beacon.sh 0.1 --wifi-ssid "CIC Guest" --wifi-pass "1nnovation" \
#       --server-url https://onion-rpg.example.com --api-key sk-...
#
# This script:
#   1. Auto-detects the serial port of a connected ESP32-C3 (override: --port).
#   2. Builds + flashes the firmware (skip with --config-only).
#   3. Flashes the SPIFFS config via flash_spiffs.sh (beacon identity + challenge).
#
# Prerequisites:
#   - ESP-IDF v5.x sourced (idf.py, esptool.py on PATH). Run `source $IDF_PATH/export.sh`.
#   - A single ESP32-C3 connected over USB (multiple are fine if you pass --port).

set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BEACON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHALLENGES_DIR="$BEACON_DIR/challenges"

# ── Defaults / args ────────────────────────────────────────────────────
CHALLENGE_ID=""
PORT=""
CONFIG_ONLY=0
SPIFFS_ARGS=()   # passthrough to flash_spiffs.sh

usage() {
    cat <<EOF
Usage: $0 <challengeId> [options]

  <challengeId>        e.g. 0.1, 1.2, 2.2 (must match challenges/<id>.json)

Options:
  --port <dev>         serial port (default: auto-detect the ESP32-C3)
  --config-only        skip the firmware flash; only flash SPIFFS config
  --beacon-id <id>     override beacon_id (default: b-<challenge>-01)
  --wifi-ssid <ssid>
  --wifi-pass <pass>
  --server-url <url>
  --api-key <key>
  --landmark <text>
  -h, --help           show this help

Examples:
  $0 0.1
  $0 0.1 --wifi-ssid "CIC Guest" --wifi-pass "1nnovation" --api-key sk-...
  $0 0.1 --config-only --port /dev/cu.usbmodem1101
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --port)        PORT="$2";                       shift 2 ;;
        --config-only) CONFIG_ONLY=1;                   shift   ;;
        --beacon-id)   SPIFFS_ARGS+=(--beacon-id "$2"); shift 2 ;;
        --wifi-ssid)   SPIFFS_ARGS+=(--wifi-ssid "$2"); shift 2 ;;
        --wifi-pass)   SPIFFS_ARGS+=(--wifi-pass "$2"); shift 2 ;;
        --server-url)  SPIFFS_ARGS+=(--server-url "$2");shift 2 ;;
        --api-key)     SPIFFS_ARGS+=(--api-key "$2");   shift 2 ;;
        --landmark)    SPIFFS_ARGS+=(--landmark "$2");  shift 2 ;;
        -h|--help)     usage; exit 0 ;;
        -*)            echo "Unknown arg: $1" >&2; usage; exit 1 ;;
        *)
            if [[ -z "$CHALLENGE_ID" ]]; then
                CHALLENGE_ID="$1"; shift
            else
                echo "Unexpected positional arg: $1" >&2; exit 1
            fi
            ;;
    esac
done

if [[ -z "$CHALLENGE_ID" ]]; then
    echo "ERROR: missing <challengeId>." >&2
    usage
    exit 1
fi

# ── Validate challenge config exists ───────────────────────────────────
if [[ ! -f "$CHALLENGES_DIR/${CHALLENGE_ID}.json" ]]; then
    echo "ERROR: no challenge config at challenges/${CHALLENGE_ID}.json" >&2
    echo "Available challenges:" >&2
    for f in "$CHALLENGES_DIR"/*.json; do
        [[ -f "$f" ]] && echo "  - $(basename "$f" .json)" >&2
    done
    exit 1
fi

# ── Tooling check ──────────────────────────────────────────────────────
if ! command -v esptool.py &>/dev/null; then
    echo "ERROR: esptool.py not on PATH. Run: source \$IDF_PATH/export.sh" >&2
    exit 1
fi

# ── Auto-detect the ESP32-C3 serial port ───────────────────────────────
# Probes each candidate port with `esptool.py chip_id` and keeps the one
# that reports an ESP32-C3. Works on macOS (cu.usbmodem/usbserial) and
# Linux (ttyUSB/ttyACM).
detect_port() {
    local candidates=()
    case "$(uname -s)" in
        Darwin)
            # nullglob so unmatched globs expand to nothing
            shopt -s nullglob
            candidates=( /dev/cu.usbmodem* /dev/cu.usbserial* /dev/cu.wchusbserial* /dev/cu.SLAB_USBtoUART* )
            shopt -u nullglob
            ;;
        *)
            shopt -s nullglob
            candidates=( /dev/ttyUSB* /dev/ttyACM* )
            shopt -u nullglob
            ;;
    esac

    if [[ ${#candidates[@]} -eq 0 ]]; then
        echo "ERROR: no serial devices found. Is the ESP32-C3 plugged in?" >&2
        return 1
    fi

    local found=""
    for dev in "${candidates[@]}"; do
        echo "  probing $dev ..." >&2
        if esptool.py --port "$dev" --before default_reset --after no_reset chip_id 2>/dev/null \
             | grep -qiE 'ESP32-C3'; then
            found="$dev"
            break
        fi
    done

    if [[ -z "$found" ]]; then
        echo "ERROR: no ESP32-C3 detected among: ${candidates[*]}" >&2
        echo "       Pass --port <dev> to select one explicitly." >&2
        return 1
    fi
    echo "$found"
}

if [[ -z "$PORT" ]]; then
    echo "Auto-detecting ESP32-C3..."
    PORT="$(detect_port)"
fi
echo "Using port: $PORT"
echo "Challenge:  $CHALLENGE_ID"
echo

# ── 1. Build + flash firmware ──────────────────────────────────────────
if [[ "$CONFIG_ONLY" -eq 0 ]]; then
    if ! command -v idf.py &>/dev/null; then
        echo "ERROR: idf.py not on PATH. Run: source \$IDF_PATH/export.sh" >&2
        exit 1
    fi
    echo "==> Building + flashing firmware..."
    ( cd "$BEACON_DIR" && idf.py set-target esp32c3 build && idf.py -p "$PORT" flash )
    echo "Firmware flashed."
    echo
else
    echo "==> Skipping firmware flash (--config-only)."
    echo
fi

# ── 2. Flash SPIFFS config ─────────────────────────────────────────────
echo "==> Flashing SPIFFS config for challenge $CHALLENGE_ID..."
"$SCRIPT_DIR/flash_spiffs.sh" \
    --challenge "$CHALLENGE_ID" \
    --port "$PORT" \
    "${SPIFFS_ARGS[@]}"

echo
echo "Done. Beacon flashed for challenge $CHALLENGE_ID on $PORT."
echo "It will register with the server and start heartbeating on next boot."
