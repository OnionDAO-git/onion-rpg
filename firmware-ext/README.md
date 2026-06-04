# firmware-ext — STATUS: obsolete, all primitives already ship in Onion OS

**This directory no longer proposes anything.** An earlier ONION RPG draft
proposed a set of new `onion.*` C++ Lua bindings (`http_request`, `se_rng`,
`se_sign`, `voice_capture`, `subghz_tx`, `subghz_rx`). The shipped Onion OS
firmware **already provides every one of those capabilities** under canonical
names — except `se_sign`, which is intentionally absent (see below).

There is therefore **no firmware extension to build, copy, or integrate**. The
C++ stub (`main/onion_ext.cpp`), its header, and the integration guide
(`INTEGRATION.md`) have been **deleted** because the firmware already implements
everything they described. This README plus `API.md` are kept only to document
the name mapping and the one genuine gap.

Authoritative source of truth: the badge README
`oniondao-badge/software/mods/onion-os/README.md` ("Scripts receive a small
global `onion` table" + "Swappable modules").

## Name mapping: proposed → what actually ships

| Proposed (obsolete) | Ships in firmware as | Notes |
|---|---|---|
| `onion.http_request(opts)` | `onion.http_get(url, opts)` / `onion.http_post(url, body, opts)` → `{status, body}` | HTTPS, CA-verified. `opts`: `headers`, `content_type`, `timeout_ms`. No extension needed. |
| `onion.se_rng(nbytes)` | `onion.secure_random(count)` → bytes | ATECC608A hardware RNG. Default 32, max 256. No extension needed. |
| `onion.se_sign(msg)` | **NOT PROVIDED** | Intentionally absent — see "The signing gap". |
| `onion.voice_capture(ms)` | `onion.sound_mic_begin/sound_mic_read/sound_mic_level/sound_mic_end` | SPH0641 PDM mic, raw int16 PCM. Swappable Sound module. No extension needed. |
| `onion.subghz_tx(payload, opts)` | `onion.subghz_begin` + `onion.subghz_transmit` (+`subghz_end`) | CC1101 swappable module. Transmit 1–61 bytes. No extension needed. |
| `onion.subghz_rx(timeout_ms)` | `onion.subghz_receive(timeout_ms)` (after `subghz_begin`) | Same module. No extension needed. |

Also already shipping and used by oRPG: `onion.mqtt_publish/subscribe/`
`unsubscribe/receive/connected/info`, and the Sound speaker side
(`onion.sound_speaker_begin/sound_play_tone/sound_play/sound_speaker_end`).

Sub-GHz and Sound are mutually exclusive — they share the same five side-port
pins, so call the active module's `*_end()` before starting the other.

## The signing gap (`onion.se_sign` / badge-signed combat rolls)

**There is no Lua message-signing primitive on the badge, and there will not
be one.** Two reasons:

1. **The ATECC608B cannot do Ed25519.** It has no Ed25519 signing capability,
   so there is no hardware path to a badge-attested Ed25519 signature from a
   script.
2. **The badge's software Solana key is deliberately not exposed to scripts.**
   The firmware signs Solana transactions with a software Ed25519 key (seed
   wrapped in NVS via an ATECC608B HMAC slot), but that key is a security
   boundary — user Lua scripts never see it and cannot sign arbitrary messages
   with it.

Consequently **oRPG combat is SERVER-AUTHORITATIVE**, not badge-signed:

- The **server generates and records the combat roll** and is the sole source
  of truth. Badges do not produce signed/attested rolls.
- When `onion.secure_random` is present, a badge may attach a few bytes of
  client entropy as an *optional, ignorable hint* (`COMBAT_ROLL_REQUEST.e`,
  a uint32). It seeds nothing authoritative — it is a convenience, never a
  signature, and the server may ignore it entirely.
- Combat tamper-resistance comes from **server authority + `secure_random`
  entropy**, not from any badge signature.

This is reflected in code: `oRPG/lib/caps.lua` sets `caps.seAttest = false`
unconditionally.

## Capability detection (real names)

The runtime shim `oRPG/lib/caps.lua` gates on the canonical names:

```lua
caps.http    = type(onion.http_get) == 'function' and type(onion.http_post) == 'function'
caps.mqtt    = type(onion.mqtt_publish) == 'function' and type(onion.mqtt_subscribe) == 'function'
caps.secRng  = type(onion.secure_random) == 'function'
caps.voice   = type(onion.sound_mic_begin) == 'function' and type(onion.sound_mic_read) == 'function'
caps.speaker = type(onion.sound_speaker_begin) == 'function'
caps.subghz  = type(onion.subghz_begin) == 'function' and type(onion.subghz_transmit) == 'function'
caps.seAttest = false  -- no Lua signing; combat is server-authoritative
```

See `API.md` for the full per-primitive reference (canonical signatures), and
`../docs/CONTRACTS.md §6` for the capability-shim contract.
