/**
 * config.h — config loader interface (NVS + SPIFFS /beacon_config.json).
 */
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Load config from NVS and (if present) /beacon_config.json.
 * Must be called after nvs_flash_init() and SPIFFS mount.
 * Populates g_cfg (beacon_config.h).
 */
void config_load(void);

/**
 * Persist one string field to NVS. key is the NVS key; value is the new
 * string. Returns ESP_OK on success.
 * Used by the USB-serial provisioning command parser in main.c.
 */
int config_set_string(const char *key, const char *value);

/** Print current config summary to ESP_LOGI. */
void config_dump(void);

#ifdef __cplusplus
}
#endif
