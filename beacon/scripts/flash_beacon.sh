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
#   - ESP-IDF v5.x installed. If idf.py/esptool aren't on PATH, this script
#     auto-sources export.sh from common locations (~/.espressif, ~/esp, etc.).
#     Override with IDF_EXPORT=/path/to/esp-idf/export.sh.
#   - An ESP32-C3 connected over USB (the port is auto-detected; multiple
#     boards are fine if you pass --port).

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
  --allow-empty-api-key
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
        --allow-empty-api-key) SPIFFS_ARGS+=(--allow-empty-api-key); shift ;;
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

# ── Locate ESP-IDF tooling ─────────────────────────────────────────────
# If idf.py / esptool aren't already on PATH, try to source ESP-IDF's
# export.sh from common install locations so you don't have to do it by hand.
source_esp_idf() {
    command -v idf.py &>/dev/null && return 0

    local candidates=()
    [[ -n "${IDF_EXPORT:-}" ]] && candidates+=("$IDF_EXPORT")
    [[ -n "${IDF_PATH:-}"   ]] && candidates+=("$IDF_PATH/export.sh")
    candidates+=(
        "$HOME"/.espressif/v5.*/esp-idf/export.sh
        "$HOME"/.espressif-5.*/v5.*/esp-idf/export.sh
        "$HOME/esp/esp-idf/export.sh"
        "$HOME/esp/v5.*/esp-idf/export.sh"
        "$HOME/.platformio/packages/framework-espidf/export.sh"
    )

    local export_script
    local export_log="${TMPDIR:-/tmp}/flash-beacon-idf-export.log"
    for export_script in "${candidates[@]}"; do
        [[ -f "$export_script" ]] || continue
        echo "Loading ESP-IDF from $export_script" >&2
        # shellcheck disable=SC1090
        if . "$export_script" >"$export_log" 2>&1; then
            command -v idf.py &>/dev/null && return 0
        else
            echo "Failed to load ESP-IDF from $export_script" >&2
            tail -n 20 "$export_log" >&2 || true
        fi
    done

    return 1
}

# Resolve the esptool binary name (esptool.py on older IDF, esptool on newer).
esptool_command() {
    if command -v esptool.py &>/dev/null; then
        echo "esptool.py"
    elif command -v esptool &>/dev/null; then
        echo "esptool"
    else
        echo ""
    fi
}

source_esp_idf || true

ESPTOOL="$(esptool_command)"
if [[ -z "$ESPTOOL" ]]; then
    echo "ERROR: esptool not found (tried esptool.py and esptool)." >&2
    echo "       Source ESP-IDF first (source \$IDF_PATH/export.sh) or set" >&2
    echo "       IDF_EXPORT=/path/to/esp-idf/export.sh and re-run." >&2
    exit 1
fi

# ── Auto-detect the ESP32-C3 serial port ───────────────────────────────
# Lists candidate serial devices and probes each with `esptool chip_id`,
# keeping the first that reports an ESP32-C3.
#
# IMPORTANT (macOS): only the /dev/cu.* "call-out" device is used. The
# matching /dev/tty.* device blocks on open() waiting for carrier-detect,
# which makes esptool hang or fail — so we deliberately skip tty.* there.
LAST_PROBE_OUTPUT=""
candidate_ports() {
    local patterns
    if [[ "$(uname -s)" == "Darwin" ]]; then
        patterns=(
            "/dev/cu.usbmodem"*
            "/dev/cu.usbserial"*
            "/dev/cu.wchusbserial"*
            "/dev/cu.SLAB_USBtoUART"*
        )
    else
        patterns=( "/dev/ttyUSB"* "/dev/ttyACM"* )
    fi
    local port
    for port in "${patterns[@]}"; do
        [[ -e "$port" ]] && printf '%s\n' "$port"
    done | sort -u
}

probe_esp32c3_port() {
    local port="$1"
    if ! LAST_PROBE_OUTPUT="$("$ESPTOOL" --chip auto --port "$port" --before default_reset --after no_reset chip_id 2>&1)"; then
        return 1
    fi
    grep -qiE 'ESP32-C3|ESP32C3' <<<"$LAST_PROBE_OUTPUT"
}

detect_port() {
    local port candidates=()
    while IFS= read -r port; do candidates+=("$port"); done < <(candidate_ports)

    if [[ ${#candidates[@]} -eq 0 ]]; then
        echo "ERROR: no serial devices found. Is the ESP32-C3 plugged in?" >&2
        return 1
    fi

    for port in "${candidates[@]}"; do
        echo "  probing $port ..." >&2
        if probe_esp32c3_port "$port"; then
            printf '%s\n' "$port"
            return 0
        fi
    done

    # No probe confirmed a C3. If there's exactly one candidate, it's almost
    # certainly the board (the probe can fail when the chip is mid-reset, busy,
    # or esptool needs a different reset mode) — use it but surface the error.
    if [[ ${#candidates[@]} -eq 1 ]]; then
        echo "WARNING: could not confirm an ESP32-C3 via chip_id, but only one" >&2
        echo "         serial device is present. Falling back to it: ${candidates[0]}" >&2
        echo "         (last esptool output below)" >&2
        echo "----------------------------------------------------------------" >&2
        echo "$LAST_PROBE_OUTPUT" >&2
        echo "----------------------------------------------------------------" >&2
        printf '%s\n' "${candidates[0]}"
        return 0
    fi

    echo "ERROR: no ESP32-C3 detected among: ${candidates[*]}" >&2
    echo "       Last esptool output:" >&2
    echo "$LAST_PROBE_OUTPUT" >&2
    echo "       Pass --port <dev> to select one explicitly." >&2
    return 1
}

if [[ -z "$PORT" ]]; then
    echo "Auto-detecting ESP32-C3..."
    PORT="$(detect_port)"
else
    if [[ ! -e "$PORT" ]]; then
        echo "ERROR: serial port does not exist: $PORT" >&2
        exit 1
    fi
    if ! probe_esp32c3_port "$PORT"; then
        echo "WARNING: $PORT did not respond as an ESP32-C3; using it anyway." >&2
    fi
fi
echo "Using port: $PORT"
echo "Challenge:  $CHALLENGE_ID"
echo

# ── 1. Build + flash firmware ──────────────────────────────────────────
if [[ "$CONFIG_ONLY" -eq 0 ]]; then
    if ! command -v idf.py &>/dev/null; then
        echo "ERROR: idf.py not on PATH (ESP-IDF could not be located)." >&2
        echo "       Source ESP-IDF (source \$IDF_PATH/export.sh) or set" >&2
        echo "       IDF_EXPORT=/path/to/esp-idf/export.sh, or use --config-only." >&2
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
