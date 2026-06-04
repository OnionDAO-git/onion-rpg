/**
 * challenge_config.c — per-challenge SPIFFS JSON config loader.
 */

#include "challenge_config.h"
#include "beacon_config.h"

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "esp_log.h"
#include "cJSON.h"

static const char *TAG = "beacon:chcfg";

challenge_cfg_t g_challenge_cfg;

void challenge_config_load(void) {
    memset(&g_challenge_cfg, 0, sizeof(g_challenge_cfg));
    g_challenge_cfg.loaded = false;

    if (!g_cfg.challenge_id[0]) {
        ESP_LOGI(TAG, "no challenge_id configured; skipping challenge config");
        return;
    }

    char path[128];
    /* Replace '.' with '_' in challenge_id for a valid filename component.
     * challenge_id "0.1" -> /spiffs/challenge_0_1.json */
    char safe_id[64];
    strlcpy(safe_id, g_cfg.challenge_id, sizeof(safe_id));
    for (char *p = safe_id; *p; p++) {
        if (*p == '.') *p = '_';
    }
    snprintf(path, sizeof(path), "/spiffs/challenge_%s.json", safe_id);

    FILE *f = fopen(path, "r");
    if (!f) {
        ESP_LOGI(TAG, "no challenge config at %s; using defaults", path);
        return;
    }

    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    if (sz <= 0 || sz > 4096) {
        ESP_LOGW(TAG, "challenge config %s size %ld out of range", path, sz);
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
        ESP_LOGW(TAG, "challenge config JSON parse error");
        return;
    }

    strlcpy(g_challenge_cfg.challenge_id, g_cfg.challenge_id,
            sizeof(g_challenge_cfg.challenge_id));

    /* timing_window_ms */
    cJSON *tw = cJSON_GetObjectItemCaseSensitive(root, "timing_window_ms");
    if (cJSON_IsNumber(tw)) g_challenge_cfg.timing_window_ms = (uint32_t)tw->valuedouble;

    /* voice_keywords: ["word1","word2",...] */
    cJSON *kw_arr = cJSON_GetObjectItemCaseSensitive(root, "voice_keywords");
    if (cJSON_IsArray(kw_arr)) {
        cJSON *kw = NULL;
        int idx = 0;
        cJSON_ArrayForEach(kw, kw_arr) {
            if (idx >= CHALLENGE_CFG_MAX_KEYWORDS) break;
            if (cJSON_IsString(kw) && kw->valuestring) {
                strlcpy(g_challenge_cfg.voice_keywords[idx],
                        kw->valuestring,
                        CHALLENGE_CFG_KEYWORD_LEN);
                idx++;
            }
        }
        g_challenge_cfg.n_voice_keywords = idx;
    }

    /* merchant_combos: [["up","up","select"], ...] */
    cJSON *combos = cJSON_GetObjectItemCaseSensitive(root, "merchant_combos");
    if (cJSON_IsArray(combos)) {
        cJSON *combo = NULL;
        int ci = 0;
        cJSON_ArrayForEach(combo, combos) {
            if (ci >= CHALLENGE_CFG_MAX_COMBOS) break;
            if (!cJSON_IsArray(combo)) continue;
            int bi = 0;
            cJSON *btn = NULL;
            cJSON_ArrayForEach(btn, combo) {
                if (bi >= CHALLENGE_CFG_COMBO_LEN) break;
                if (cJSON_IsString(btn) && btn->valuestring) {
                    strlcpy(g_challenge_cfg.merchant_combos[ci][bi],
                            btn->valuestring,
                            CHALLENGE_CFG_BTN_NAME_LEN);
                    bi++;
                }
            }
            g_challenge_cfg.combo_lengths[ci] = bi;
            ci++;
        }
        g_challenge_cfg.n_merchant_combos = ci;
    }

    /* subghz: { "freq_hz": 433920000, "symbol_ms": 500 } */
    cJSON *sg = cJSON_GetObjectItemCaseSensitive(root, "subghz");
    if (cJSON_IsObject(sg)) {
        cJSON *freq = cJSON_GetObjectItemCaseSensitive(sg, "freq_hz");
        cJSON *sym  = cJSON_GetObjectItemCaseSensitive(sg, "symbol_ms");
        if (cJSON_IsNumber(freq)) g_challenge_cfg.subghz.freq_hz    = (uint32_t)freq->valuedouble;
        if (cJSON_IsNumber(sym))  g_challenge_cfg.subghz.symbol_ms  = (uint32_t)sym->valuedouble;
    }

    cJSON_Delete(root);
    g_challenge_cfg.loaded = true;

    ESP_LOGI(TAG, "loaded challenge config for '%s' from %s",
             g_cfg.challenge_id, path);
    ESP_LOGI(TAG, "  timing_window_ms=%u  voice_keywords=%d  combos=%d",
             g_challenge_cfg.timing_window_ms,
             g_challenge_cfg.n_voice_keywords,
             g_challenge_cfg.n_merchant_combos);
}
