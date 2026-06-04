/**
 * challenge_config.h — per-challenge behavioral config loader.
 *
 * Challenge agents drop a JSON config file at:
 *   beacon/challenges/<challengeId>.json
 *
 * At flash/OTA time the operator copies the relevant file to SPIFFS as:
 *   /spiffs/challenge_<challengeId>.json
 *
 * This module loads the file and exposes the parsed data to the relay task so
 * challenge-specific parameters (timing windows, sub-GHz params, merchant
 * combos, voice keywords) can influence relay behaviour without firmware
 * changes.
 *
 * JSON schema (all fields optional; beacon ignores fields it doesn't use):
 * {
 *   "timing_window_ms":  30000,   // max time allowed for this challenge
 *   "voice_keywords":    ["jardine","intake","crib","tunnel","plant"],
 *   "merchant_combos":   [["up","up","select"],["down","right","select"]],
 *   "subghz": {
 *     "freq_hz":  433920000,
 *     "symbol_ms": 500
 *   },
 *   "custom": { ... }             // challenge-specific opaque blob
 * }
 *
 * Beacon code that doesn't care about these fields simply ignores them.
 * Challenge agents that DO care (e.g. the voice/subghz challenge agent)
 * extend this struct and the loader below.
 */
#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CHALLENGE_CFG_MAX_KEYWORDS  16
#define CHALLENGE_CFG_KEYWORD_LEN   64
#define CHALLENGE_CFG_MAX_COMBOS    16
#define CHALLENGE_CFG_COMBO_LEN     8
#define CHALLENGE_CFG_BTN_NAME_LEN  16

typedef struct {
    bool    loaded;
    char    challenge_id[64];

    /* General */
    uint32_t timing_window_ms;     /* 0 = no limit */

    /* Voice challenges */
    int   n_voice_keywords;
    char  voice_keywords[CHALLENGE_CFG_MAX_KEYWORDS][CHALLENGE_CFG_KEYWORD_LEN];

    /* Merchant / button challenges */
    int   n_merchant_combos;
    int   combo_lengths[CHALLENGE_CFG_MAX_COMBOS];
    char  merchant_combos[CHALLENGE_CFG_MAX_COMBOS][CHALLENGE_CFG_COMBO_LEN][CHALLENGE_CFG_BTN_NAME_LEN];

    /* Sub-GHz (2.1, 3.4 elevator hack) */
    struct {
        uint32_t freq_hz;     /* carrier freq, e.g. 433920000 */
        uint32_t symbol_ms;   /* symbol duration for handshake */
    } subghz;
} challenge_cfg_t;

/* Loaded by challenge_config_load(); read by relay task. */
extern challenge_cfg_t g_challenge_cfg;

/**
 * Load /spiffs/challenge_<challengeId>.json into g_challenge_cfg.
 * Must be called after SPIFFS is mounted and g_cfg.challenge_id is set.
 * Silently succeeds (with loaded=false) if no file exists.
 */
void challenge_config_load(void);

#ifdef __cplusplus
}
#endif
