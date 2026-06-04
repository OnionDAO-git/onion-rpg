#!/usr/bin/env bash
# provision_serial.sh — set beacon config fields via USB serial.
#
# Usage:
#   ./scripts/provision_serial.sh --port /dev/cu.usbmodemXXX \
#       --challenge 0.1 --wifi-ssid "CIC Guest" --wifi-pass "1nnovation" \
#       --server-url https://onion-rpg.example.com --api-key sk-...
#
# Sends "SET <key> <value>" lines over the serial port, then "RESET" to reboot.
# Requires: screen, cu, or pyserial (python3 -m serial.tools.miniterm).

set -euo pipefail

PORT=""
CHALLENGE_ID=""
WIFI_SSID=""
WIFI_PASS=""
SERVER_URL=""
API_KEY=""
BEACON_ID=""
LANDMARK=""
BAUD=115200

while [[ $# -gt 0 ]]; do
    case $1 in
        --port)         PORT="$2";         shift 2 ;;
        --challenge)    CHALLENGE_ID="$2"; shift 2 ;;
        --wifi-ssid)    WIFI_SSID="$2";    shift 2 ;;
        --wifi-pass)    WIFI_PASS="$2";    shift 2 ;;
        --server-url)   SERVER_URL="$2";   shift 2 ;;
        --api-key)      API_KEY="$2";      shift 2 ;;
        --beacon-id)    BEACON_ID="$2";    shift 2 ;;
        --landmark)     LANDMARK="$2";     shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [[ -z "$PORT" ]]; then
    echo "Usage: $0 --port <dev> [--challenge X.Y] [--wifi-ssid ...] ..."
    exit 1
fi

send_cmd() {
    local cmd="$1"
    echo "  > $cmd"
    python3 -c "
import serial, time
s = serial.Serial('$PORT', $BAUD, timeout=2)
time.sleep(0.3)
s.write(('$cmd' + '\n').encode())
time.sleep(0.3)
out = s.read(s.in_waiting or 1)
print(out.decode(errors='replace').strip())
s.close()
"
}

echo "Provisioning beacon at $PORT (baud $BAUD)"

[[ -n "$BEACON_ID"    ]] && send_cmd "SET beacon_id $BEACON_ID"
[[ -n "$CHALLENGE_ID" ]] && send_cmd "SET challenge_id $CHALLENGE_ID"
[[ -n "$WIFI_SSID"    ]] && send_cmd "SET wifi_ssid $WIFI_SSID"
[[ -n "$WIFI_PASS"    ]] && send_cmd "SET wifi_pass $WIFI_PASS"
[[ -n "$SERVER_URL"   ]] && send_cmd "SET server_url $SERVER_URL"
[[ -n "$API_KEY"      ]] && send_cmd "SET api_key $API_KEY"
[[ -n "$LANDMARK"     ]] && send_cmd "SET landmark $LANDMARK"

send_cmd "DUMP"
read -r -p "Reboot beacon now? [y/N] " yn
if [[ "$yn" == [yY] ]]; then
    send_cmd "RESET"
    echo "Beacon rebooting..."
fi
