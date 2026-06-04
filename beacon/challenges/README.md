# beacon/challenges/ — per-challenge beacon config files

Each file here is named `<challengeId>.json` and contains optional
challenge-specific parameters the beacon firmware uses.

**Who writes these files:**
Challenge agents drop a JSON file here when they implement a challenge that
needs beacon-side parameters (timing windows, voice keywords, sub-GHz params,
merchant combos). The beacon firmware never changes; it just reads the config.

**How to flash a config onto a beacon:**
```sh
# From onion-rpg/ root:
bun run beacon:flash:config --challenge 0.1 --port /dev/cu.usbmodem*
# Or manually using esptool SPIFFS upload (see scripts/flash_spiffs.sh).
```

**At runtime** the beacon loads `/spiffs/challenge_<id>.json` where `.` in the
challenge ID is replaced by `_` (e.g. `0.1` → `challenge_0_1.json`).

**JSON schema** (all fields optional):

```json
{
  "timing_window_ms":  30000,
  "voice_keywords":    ["word1", "word2"],
  "merchant_combos":   [["up","up","select"], ["down","right","select"]],
  "subghz": {
    "freq_hz":   433920000,
    "symbol_ms": 500
  },
  "custom": {}
}
```

See `beacon/main/challenge_config.h` for the full struct definition.
