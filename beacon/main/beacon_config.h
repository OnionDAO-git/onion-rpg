/**
 * beacon_config.h — per-beacon identity and runtime configuration.
 *
 * Config is loaded at boot in this priority order:
 *   1. Compile-time defaults from beacon_config.h (this file).
 *   2. NVS namespace "beacon" (survives flash; set via provisioning serial cmd).
 *   3. SPIFFS /beacon_config.json (optional, dropped by flash script or OTA).
 *
 * The most recently written NVS value wins over compiled-in defaults.
 * beacon_config.json is applied over NVS on each boot (allows field updates).
 */
#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Compile-time defaults (override in beacon_config_local.h or sdkconfig) */

#ifndef BEACON_DEFAULT_ID
#define BEACON_DEFAULT_ID           "b-unknown-01"
#endif

#ifndef BEACON_DEFAULT_CHALLENGE_ID
#define BEACON_DEFAULT_CHALLENGE_ID ""          /* empty = no challenge */
#endif

#ifndef BEACON_DEFAULT_LANDMARK
#define BEACON_DEFAULT_LANDMARK     ""
#endif

/* Hardcoded venue WiFi so a freshly-flashed beacon auto-joins and reaches the
 * server with zero provisioning. Override per-beacon via NVS (`SET wifi_ssid`)
 * or /spiffs/beacon_config.json if deployed on a different network. */
#ifndef BEACON_DEFAULT_WIFI_SSID
#define BEACON_DEFAULT_WIFI_SSID    "CIC Guest"
#endif

#ifndef BEACON_DEFAULT_WIFI_PASS
#define BEACON_DEFAULT_WIFI_PASS    "1nnovation"
#endif

#ifndef BEACON_DEFAULT_SERVER_URL
#define BEACON_DEFAULT_SERVER_URL   "https://onion-rpg.example.com"
#endif

#ifndef BEACON_DEFAULT_API_KEY
#define BEACON_DEFAULT_API_KEY      ""
#endif

/* BEACON_ESPNOW_CHANNEL: 0 = use AP channel after WiFi connect (recommended) */
#ifndef BEACON_DEFAULT_ESPNOW_CHANNEL
#define BEACON_DEFAULT_ESPNOW_CHANNEL 0
#endif

/* Interval (ms) between BEACON_HELLO broadcast bursts. */
#ifndef BEACON_HELLO_INTERVAL_MS
#define BEACON_HELLO_INTERVAL_MS    5000
#endif

/* How many BEACON_HELLO frames to send per burst (increases reachability). */
#ifndef BEACON_HELLO_BURST
#define BEACON_HELLO_BURST          3
#endif

/* Maximum length of field strings in BeaconRuntimeConfig. */
#define BEACON_STR_MAX 128

/* ── Runtime config struct ─────────────────────────────────────────────── */

typedef struct {
    char     beacon_id[BEACON_STR_MAX];       /* "b-ketchup-01" */
    char     challenge_id[BEACON_STR_MAX];    /* "0.1", "1.2", etc., or empty */
    char     landmark[BEACON_STR_MAX];        /* human name, e.g. "Hot dog stand" */
    char     wifi_ssid[BEACON_STR_MAX];
    char     wifi_pass[BEACON_STR_MAX];
    char     server_url[BEACON_STR_MAX];      /* https://... (no trailing slash) */
    char     api_key[BEACON_STR_MAX];         /* Bearer BEACON_API_KEY */
    int      espnow_channel;                  /* 0 = auto */
    uint8_t  espnow_mac[6];                   /* filled in at runtime */
    /* latitude / longitude for the DB beacon record (optional, 0.0 = unset) */
    double   lat;
    double   lon;
} beacon_runtime_cfg_t;

/* Global singleton — populated by config_load(). */
extern beacon_runtime_cfg_t g_cfg;

#ifdef __cplusplus
}
#endif
