/**
 * beacon_hello.h — periodic BEACON_HELLO broadcast.
 *
 * Every BEACON_HELLO_INTERVAL_MS, the beacon broadcasts a BEACON_HELLO
 * frame (MSG_BEACON_HELLO, type 0x01) so nearby badges can discover it and
 * know which challengeId it hosts.
 *
 * Body schema (terse JSON, matches BeaconHelloBody in protocol.ts):
 *   { "b": "<beaconId>", "c": "<challengeId>|null", "m": "<mac hex>" }
 *
 * The hello task also sends an HTTP registration call to the server
 * (POST /api/relay with a synthetic BEACON_HELLO message) so the server can
 * upsert the beacons DB row and know the beacon is online.
 */
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Start the BEACON_HELLO background task.
 * Must be called after WiFi is connected, ESP-NOW is initialised, and
 * g_cfg.espnow_mac is populated.
 */
void beacon_hello_start(void);

/** Stop the hello task (e.g. on WiFi disconnect). */
void beacon_hello_stop(void);

#ifdef __cplusplus
}
#endif
