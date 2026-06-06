/**
 * config.c — beacon configuration loader.
 *
 * Priority (highest wins):
 *   1. SPIFFS /beacon_config.json  (operator drops a JSON file at flash time)
 *   2. NVS namespace "beacon"      (set via serial provisioning commands)
 *   3. Compile-time defaults       (beacon_config.h)
 *
 * JSON schema for /beacon_config.json (all fields optional):
 * {
 *   "beacon_id":       "b-ketchup-01",
 *   "challenge_id":    "0.1",
 *   "landmark":        "Hot dog stand",
 *   "wifi_ssid":       "CIC Guest",
 *   "wifi_pass":       "1nnovation",
 *   "server_url":      "https://onion-rpg.example.com",
 *   "api_key":         "sk-...",
 *   "espnow_channel":  0,
 *   "lat":             41.8827,
 *   "lon":             -87.6233
 * }
 */

#include "config.h"
#include "beacon_config.h"

#include <string.h>
#include <stdlib.h>

#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_spiffs.h"
#include "cJSON.h"

static const char *TAG = "beacon:cfg";

beacon_runtime_cfg_t g_cfg;

/* ── NVS key names ────────────────────────────────────────────────────── */
#define NVS_NS        "beacon"
#define NVS_BEACON_ID "beacon_id"
#define NVS_CHALL_ID  "challenge_id"
#define NVS_LANDMARK  "landmark"
#define NVS_WIFI_SSID "wifi_ssid"
#define NVS_WIFI_PASS "wifi_pass"
#define NVS_SERVER    "server_url"
#define NVS_API_KEY   "api_key"
#define NVS_CHANNEL   "espnow_ch"
#define NVS_LAT       "lat"
#define NVS_LON       "lon"

/* ── Helpers ──────────────────────────────────────────────────────────── */

static void nvs_get_str_or(const char *key, char *dst, size_t dst_len, const char *fallback) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) {
        strlcpy(dst, fallback, dst_len);
        return;
    }
    size_t len = dst_len;
    esp_err_t err = nvs_get_str(h, key, dst, &len);
    nvs_close(h);
    if (err != ESP_OK || len == 0) {
        strlcpy(dst, fallback, dst_len);
    }
}

static int nvs_get_int_or(const char *key, int fallback) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return fallback;
    int32_t v = fallback;
    nvs_get_i32(h, key, &v);
    nvs_close(h);
    return (int)v;
}

static double nvs_get_double_or(const char *key, double fallback) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return fallback;
    /* Store doubles as string-encoded to avoid NVS type headaches. */
    char buf[32] = "";
    size_t len = sizeof(buf);
    nvs_get_str(h, key, buf, &len);
    nvs_close(h);
    if (buf[0] == '\0') return fallback;
    return atof(buf);
}

/* Apply a cJSON string field to dst if present and non-empty. */
static void apply_json_str(cJSON *obj, const char *key, char *dst, size_t dst_len) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsString(item) && item->valuestring && item->valuestring[0]) {
        strlcpy(dst, item->valuestring, dst_len);
    }
}

static void apply_json_int(cJSON *obj, const char *key, int *dst) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsNumber(item)) *dst = (int)item->valuedouble;
}

static void apply_json_double(cJSON *obj, const char *key, double *dst) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsNumber(item)) *dst = item->valuedouble;
}

/* ── SPIFFS /beacon_config.json loader ───────────────────────────────── */

static void load_spiffs_json(void) {
    FILE *f = fopen("/spiffs/beacon_config.json", "r");
    if (!f) {
        ESP_LOGI(TAG, "no /spiffs/beacon_config.json; skipping");
        return;
    }

    /* Read the whole file (config files are small). */
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    if (sz <= 0 || sz > 4096) {
        ESP_LOGW(TAG, "beacon_config.json size %ld out of range; skipping", sz);
        fclose(f);
        return;
    }

    char *buf = malloc(sz + 1);
    if (!buf) { fclose(f); return; }
    fread(buf, 1, sz, f);
    fclose(f);
    buf[sz] = '\0';

    cJSON *root = cJSON_ParseWithLength(buf, sz);
    free(buf);
    if (!root) {
        ESP_LOGW(TAG, "beacon_config.json parse error; skipping");
        return;
    }

    apply_json_str   (root, "beacon_id",      g_cfg.beacon_id,     sizeof(g_cfg.beacon_id));
    apply_json_str   (root, "challenge_id",   g_cfg.challenge_id,  sizeof(g_cfg.challenge_id));
    apply_json_str   (root, "landmark",       g_cfg.landmark,      sizeof(g_cfg.landmark));
    apply_json_str   (root, "wifi_ssid",      g_cfg.wifi_ssid,     sizeof(g_cfg.wifi_ssid));
    apply_json_str   (root, "wifi_pass",      g_cfg.wifi_pass,     sizeof(g_cfg.wifi_pass));
    apply_json_str   (root, "server_url",     g_cfg.server_url,    sizeof(g_cfg.server_url));
    apply_json_str   (root, "api_key",        g_cfg.api_key,       sizeof(g_cfg.api_key));
    apply_json_int   (root, "espnow_channel", &g_cfg.espnow_channel);
    apply_json_double(root, "lat",            &g_cfg.lat);
    apply_json_double(root, "lon",            &g_cfg.lon);

    cJSON_Delete(root);
    ESP_LOGI(TAG, "loaded beacon_config.json from SPIFFS");
}

/* ── Public API ──────────────────────────────────────────────────────── */

void config_load(void) {
    /* Step 1: compiled-in defaults. */
    strlcpy(g_cfg.beacon_id,    BEACON_DEFAULT_ID,           sizeof(g_cfg.beacon_id));
    strlcpy(g_cfg.challenge_id, BEACON_DEFAULT_CHALLENGE_ID, sizeof(g_cfg.challenge_id));
    strlcpy(g_cfg.landmark,     BEACON_DEFAULT_LANDMARK,     sizeof(g_cfg.landmark));
    strlcpy(g_cfg.wifi_ssid,    BEACON_DEFAULT_WIFI_SSID,    sizeof(g_cfg.wifi_ssid));
    strlcpy(g_cfg.wifi_pass,    BEACON_DEFAULT_WIFI_PASS,    sizeof(g_cfg.wifi_pass));
    strlcpy(g_cfg.server_url,   BEACON_DEFAULT_SERVER_URL,   sizeof(g_cfg.server_url));
    strlcpy(g_cfg.api_key,      BEACON_DEFAULT_API_KEY,      sizeof(g_cfg.api_key));
    g_cfg.espnow_channel = BEACON_DEFAULT_ESPNOW_CHANNEL;
    g_cfg.lat = 0.0;
    g_cfg.lon = 0.0;

    /* Step 2: NVS overrides. */
    nvs_get_str_or(NVS_BEACON_ID, g_cfg.beacon_id,    sizeof(g_cfg.beacon_id),    g_cfg.beacon_id);
    nvs_get_str_or(NVS_CHALL_ID,  g_cfg.challenge_id, sizeof(g_cfg.challenge_id), g_cfg.challenge_id);
    nvs_get_str_or(NVS_LANDMARK,  g_cfg.landmark,     sizeof(g_cfg.landmark),     g_cfg.landmark);
    nvs_get_str_or(NVS_WIFI_SSID, g_cfg.wifi_ssid,    sizeof(g_cfg.wifi_ssid),    g_cfg.wifi_ssid);
    nvs_get_str_or(NVS_WIFI_PASS, g_cfg.wifi_pass,    sizeof(g_cfg.wifi_pass),    g_cfg.wifi_pass);
    nvs_get_str_or(NVS_SERVER,    g_cfg.server_url,   sizeof(g_cfg.server_url),   g_cfg.server_url);
    nvs_get_str_or(NVS_API_KEY,   g_cfg.api_key,      sizeof(g_cfg.api_key),      g_cfg.api_key);
    g_cfg.espnow_channel = nvs_get_int_or(NVS_CHANNEL, g_cfg.espnow_channel);
    g_cfg.lat = nvs_get_double_or(NVS_LAT, g_cfg.lat);
    g_cfg.lon = nvs_get_double_or(NVS_LON, g_cfg.lon);

    /* Step 3: SPIFFS JSON overrides (highest priority). */
    load_spiffs_json();

    /* Venue WiFi is fixed for this firmware build. */
    strlcpy(g_cfg.wifi_ssid, BEACON_DEFAULT_WIFI_SSID, sizeof(g_cfg.wifi_ssid));
    strlcpy(g_cfg.wifi_pass, BEACON_DEFAULT_WIFI_PASS, sizeof(g_cfg.wifi_pass));

    /* espnow_mac is filled in by main.c after WiFi init. */
}

int config_set_string(const char *key, const char *value) {
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    err = nvs_set_str(h, key, value);
    if (err == ESP_OK) nvs_commit(h);
    nvs_close(h);
    return err;
}

void config_dump(void) {
    ESP_LOGI(TAG, "beacon_id     = %s", g_cfg.beacon_id);
    ESP_LOGI(TAG, "challenge_id  = %s", g_cfg.challenge_id[0] ? g_cfg.challenge_id : "(none)");
    ESP_LOGI(TAG, "landmark      = %s", g_cfg.landmark[0] ? g_cfg.landmark : "(none)");
    ESP_LOGI(TAG, "wifi_ssid     = %s", g_cfg.wifi_ssid[0] ? g_cfg.wifi_ssid : "(not set)");
    ESP_LOGI(TAG, "server_url    = %s", g_cfg.server_url);
    ESP_LOGI(TAG, "espnow_ch     = %d", g_cfg.espnow_channel);
    ESP_LOGI(TAG, "lat/lon       = %.6f / %.6f", g_cfg.lat, g_cfg.lon);
}
