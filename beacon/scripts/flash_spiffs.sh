#!/usr/bin/env bash
# flash_spiffs.sh — build and flash the SPIFFS image for a beacon.
#
# Usage:
#   ./scripts/flash_spiffs.sh --challenge 0.1 --port /dev/cu.usbmodemXXX [--server-url https://...] [--api-key sk-...]
#
# This script:
#   1. Creates a temporary SPIFFS image directory.
#   2. Copies beacon_config.json (with the given challenge_id) into it.
#   3. Copies challenges/<challengeId>.json as challenge_<safe_id>.json.
#   4. Builds a SPIFFS binary using mkspiffs (or idf.py spiffsgen).
#   5. Flashes it to the beacon at the SPIFFS partition offset (0x310000).
#
# Prerequisites:
#   - ESP-IDF on PATH (idf.py, esptool.py, mkspiffs or spiffsgen.py).
#   - beacon firmware already flashed (this only updates SPIFFS).

set -euo pipefail

CHALLENGE_ID=""
PORT="/dev/cu.usbmodem*"
SERVER_URL="https://onion-rpg.example.com"
API_KEY=""
BEACON_ID=""
WIFI_SSID=""
WIFI_PASS=""
LANDMARK=""
MIN_RSSI=""
ALLOW_EMPTY_API_KEY=0

# ── Parse args ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --challenge)    CHALLENGE_ID="$2";  shift 2 ;;
        --port)         PORT="$2";          shift 2 ;;
        --server-url)   SERVER_URL="$2";    shift 2 ;;
        --api-key)      API_KEY="$2";       shift 2 ;;
        --allow-empty-api-key) ALLOW_EMPTY_API_KEY=1; shift ;;
        --beacon-id)    BEACON_ID="$2";     shift 2 ;;
        --wifi-ssid)    WIFI_SSID="$2";     shift 2 ;;
        --wifi-pass)    WIFI_PASS="$2";     shift 2 ;;
        --landmark)     LANDMARK="$2";      shift 2 ;;
        --min-rssi)     MIN_RSSI="$2";      shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [[ -z "$CHALLENGE_ID" ]]; then
    echo "Usage: $0 --challenge <id> --port <dev> [options]"
    echo "  Options: --server-url --api-key --allow-empty-api-key --beacon-id --wifi-ssid --wifi-pass --landmark --min-rssi"
    exit 1
fi

if [[ -z "$API_KEY" && -n "${BEACON_API_KEY:-}" ]]; then
    API_KEY="$BEACON_API_KEY"
fi

case "$SERVER_URL" in
    http://localhost*|https://localhost*|http://127.0.0.1*|https://127.0.0.1*|https://onion-rpg.example.com)
        ;;
    *)
        if [[ -z "$API_KEY" && "$ALLOW_EMPTY_API_KEY" -eq 0 ]]; then
            echo "ERROR: --api-key is required for server URL: $SERVER_URL" >&2
            echo "       Production /api/relay rejects unauthenticated beacon registration." >&2
            echo "       Pass --api-key \"\$BEACON_API_KEY\" or export BEACON_API_KEY first." >&2
            echo "       Use --allow-empty-api-key only for an intentionally open dev server." >&2
            exit 1
        fi
        ;;
esac

# ── Paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BEACON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHALLENGES_DIR="$BEACON_DIR/challenges"
TMP_DIR="$(mktemp -d)"
trap "rm -rf $TMP_DIR" EXIT

# ── Safe challenge ID (replace '.' with '_') ──────────────────────────
SAFE_ID="${CHALLENGE_ID//./_}"

# Auto-generate beacon_id if not provided
if [[ -z "$BEACON_ID" ]]; then
    BEACON_ID="b-${SAFE_ID}-01"
fi

# ── Write beacon_config.json ───────────────────────────────────────────
cat > "$TMP_DIR/beacon_config.json" <<EOF
{
  "beacon_id":    "$BEACON_ID",
  "challenge_id": "$CHALLENGE_ID",
  "landmark":     "$LANDMARK",
  "wifi_ssid":    "$WIFI_SSID",
  "wifi_pass":    "$WIFI_PASS",
  "server_url":   "$SERVER_URL",
  "api_key":      "$API_KEY"${MIN_RSSI:+,
  "min_rssi":     $MIN_RSSI}
}
EOF
echo "beacon_config.json:"
sed -E 's/("api_key":[[:space:]]*")[^"]*/\1***masked***/' "$TMP_DIR/beacon_config.json"

# ── Copy challenge config ──────────────────────────────────────────────
CHALLENGE_SRC="$CHALLENGES_DIR/${CHALLENGE_ID}.json"
if [[ -f "$CHALLENGE_SRC" ]]; then
    cp "$CHALLENGE_SRC" "$TMP_DIR/challenge_${SAFE_ID}.json"
    echo "Included challenge config: challenge_${SAFE_ID}.json"
else
    echo "WARNING: no challenge config found at $CHALLENGE_SRC; skipping."
fi

# ── Build SPIFFS image ─────────────────────────────────────────────────
IMAGE="$TMP_DIR/spiffs.bin"
SPIFFS_SIZE=524288   # 0x80000 = 512 KB (matches partitions.csv)
SPIFFS_PAGE=256
SPIFFS_BLOCK=4096

# Prefer spiffsgen.py (bundled with IDF) over standalone mkspiffs.
if command -v python3 &>/dev/null && \
   python3 -c "import spiffsgen" 2>/dev/null; then
    python3 -m spiffsgen "$SPIFFS_SIZE" "$TMP_DIR" "$IMAGE"
elif [[ -n "${IDF_PATH:-}" ]] && [[ -f "$IDF_PATH/components/spiffs/spiffsgen.py" ]]; then
    python3 "$IDF_PATH/components/spiffs/spiffsgen.py" \
        "$SPIFFS_SIZE" "$TMP_DIR" "$IMAGE"
elif command -v mkspiffs &>/dev/null; then
    mkspiffs -c "$TMP_DIR" -s "$SPIFFS_SIZE" \
             -p "$SPIFFS_PAGE" -b "$SPIFFS_BLOCK" "$IMAGE"
else
    echo "ERROR: need spiffsgen.py (from IDF) or mkspiffs on PATH."
    exit 1
fi
echo "SPIFFS image: $IMAGE ($(wc -c < "$IMAGE") bytes)"

# ── Flash ──────────────────────────────────────────────────────────────
SPIFFS_OFFSET="0x310000"
echo "Flashing SPIFFS to $PORT at offset $SPIFFS_OFFSET..."
esptool.py --port "$PORT" --baud 460800 write_flash "$SPIFFS_OFFSET" "$IMAGE"
echo "Done. Beacon will reload config on next boot."
