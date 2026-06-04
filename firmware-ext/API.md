# firmware-ext — onion.* primitive STATUS & name mapping

STATUS: the primitives an earlier oRPG draft proposed as new C++ bindings
**already ship in Onion OS** under canonical names. This file is now a mapping
reference, not an extension spec. The authoritative API reference is the badge
README: `oniondao-badge/software/mods/onion-os/README.md`.

The runtime shim `oRPG/lib/caps.lua` detects each primitive with
`type(onion.x) == 'function'` and selects the richer path when present, else
falls back to the ESP-NOW + beacon relay.

---

## http_request → onion.http_get / onion.http_post  (SHIPS)

Proposed `onion.http_request(opts)` is **not needed**: the firmware ships
`onion.http_get` and `onion.http_post`.

- `onion.http_get(url, options)` → `{ status, body }` | `nil, err`
- `onion.http_post(url, body, options)` → `{ status, body }` | `nil, err`

HTTPS only; server certificates are verified against the bundled root CAs.
`options` (optional): `headers` (name→value table), `content_type`
(POST body defaults to `application/json`), `timeout_ms` (default 10000,
max 30000). HTTP requires WiFi; the calls connect automatically.

oRPG direct-server path uses `onion.http_post` to `POST <server>/api/relay`
(see `oRPG/lib/net.lua` `net.http_request()`):

```lua
local caps = require('lib.caps')
if caps.http then
  local resp, err = onion.http_post(server_url .. '/api/relay', payload, {
    content_type = 'application/json',
    timeout_ms   = 15000,
  })
  -- resp.status, resp.body
end
```

`caps.http = type(onion.http_get) == 'function' and type(onion.http_post) == 'function'`.

---

## se_rng → onion.secure_random  (SHIPS)

Proposed `onion.se_rng(nbytes)` is **not needed**: the firmware ships
`onion.secure_random`.

- `onion.secure_random(count)` → random bytes (binary Lua string) | `nil, err`

ATECC608A hardware RNG. `count` is optional, defaults to `32`, max `256`.
Returns `nil` plus an error string if the secure element is unavailable.

In oRPG this is **optional client entropy only** — combat is
server-authoritative (the server rolls and records). The badge may fold a few
bytes into `COMBAT_ROLL_REQUEST.e` as an ignorable hint:

```lua
if caps.secRng then
  local b = onion.secure_random(4)
  if b and #b >= 4 then
    local e = 0
    for i = 1, 4 do e = e * 256 + b:byte(i) end
    -- attach as roll_body.e (uint32); server MAY ignore it
  end
end
```

`caps.secRng = type(onion.secure_random) == 'function'`.

---

## se_sign → NOT PROVIDED (intentional security boundary)

Proposed `onion.se_sign(msg)` **does not exist and will not be added.**

- The **ATECC608B cannot do Ed25519** — there is no hardware signing path.
- The badge's **software Solana Ed25519 key is not exposed to Lua scripts** —
  it is a deliberate security boundary (the seed is wrapped in NVS via an
  ATECC608B HMAC slot and used only by firmware to sign server-built Solana
  transactions, never by user scripts).

Therefore there are **no badge-signed / attested combat rolls**. Combat is
**SERVER-AUTHORITATIVE**: the server generates and records every roll. Tamper
resistance comes from server authority plus optional `secure_random` client
entropy — not from a badge signature.

`caps.seAttest` is therefore **always `false`** in `oRPG/lib/caps.lua`.

---

## voice_capture → onion.sound_mic_*  (SHIPS, swappable Sound module)

Proposed `onion.voice_capture(ms)` is **not needed**: the firmware ships the
PDM-mic primitives on the swappable Sound module (SPH0641).

- `onion.sound_mic_begin(options)` → `true` | `nil, err` (`options.sample_rate`
  default 16000; pin overrides `clk`, `din`, `power_pin`)
- `onion.sound_mic_read(num_samples)` → raw signed 16-bit PCM string
  (max 4096 samples)
- `onion.sound_mic_level(duration_ms)` → `{ rms, peak, samples }`
  (`duration_ms` max 1000) — energy probe
- `onion.sound_mic_end()` stops the mic

The badge has no on-device STT. oRPG captures an energy summary
(`{rms, peak}`) to confirm the operative actually spoke, then submits
`VOICE_CAPTURE_SUBMIT` (optionally with `v = {rms, peak}`); raw-PCM upload to
a server STT route is out-of-band and depends on WiFi (`caps.http`). See
`oRPG/lib/archetypes.lua` `capture_voice_energy()`.

Speaker side (also Sound module, mutually exclusive with the mic):
`onion.sound_speaker_begin/sound_play_tone/sound_play/sound_speaker_end`.
`caps.speaker = type(onion.sound_speaker_begin) == 'function'`.

`caps.voice = type(onion.sound_mic_begin) == 'function' and type(onion.sound_mic_read) == 'function'`.

---

## subghz_tx / subghz_rx → onion.subghz_* (SHIPS, swappable CC1101 module)

Proposed `onion.subghz_tx`/`subghz_rx` are **not needed**: the firmware ships
the full CC1101 sub-GHz API.

- `onion.subghz_begin(options)` → `true` | `nil, err` (fails if no CC1101
  present; `options`: `freq` MHz default 433.92, `modulation`, pin overrides)
- `onion.subghz_transmit(payload)` → `true` | `nil, err` (payload **1–61 bytes**)
- `onion.subghz_receive(timeout_ms)` → `{ payload, message, len, rssi,
  rssi_dbm }` | `nil` (timeout, max 30000 ms)
- `onion.subghz_set_frequency(mhz)` retunes while running
- `onion.subghz_info()` → `{ variant, active, ... }`
- `onion.subghz_end()` powers the radio down

Sub-GHz and Sound share the same five side-port pins — only one active at a
time; call the other module's `*_end()` before switching.

`caps.subghz = type(onion.subghz_begin) == 'function' and type(onion.subghz_transmit) == 'function'`.

---

## Summary

| Proposed | Ships as | caps flag |
|---|---|---|
| `http_request` | `http_get` + `http_post` | `caps.http` |
| (mqtt) | `mqtt_publish/subscribe/...` | `caps.mqtt` |
| `se_rng` | `secure_random` | `caps.secRng` |
| `se_sign` | **NOT PROVIDED** | `caps.seAttest` (always `false`) |
| `voice_capture` | `sound_mic_begin/read/level/end` | `caps.voice` |
| (speaker) | `sound_speaker_begin/...` | `caps.speaker` |
| `subghz_tx`/`subghz_rx` | `subghz_begin` + `transmit`/`receive` + `end` | `caps.subghz` |

The game is fully playable on shipped firmware. No C++ extension is required.
