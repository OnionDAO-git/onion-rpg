-- oRPG/lib/caps.lua
-- Capability shim: detects which optional Onion OS primitives this badge has and
-- selects the richer code path when present, else falls back to the ESP-NOW +
-- beacon relay path. Every cap defaults to false on a bare badge.
--
-- These names track the REAL Onion OS Lua API (see the badge README "Scripts
-- receive a small global `onion` table" + "Swappable modules"). Earlier drafts
-- gated on proposed firmware-ext names (http_request/se_rng/se_sign/
-- voice_capture/subghz_tx); those are gone — the shipped firmware uses the
-- canonical names below.
--
-- Usage:
--   local caps = require('lib.caps')
--   if caps.http then ... else ... end

local caps = {
    -- Direct HTTPS to the game server, bypassing the beacon relay entirely.
    -- onion.http_get(url, opts) / onion.http_post(url, body, opts) -> {status, body}
    http    = type(onion.http_get) == 'function' and type(onion.http_post) == 'function',

    -- Badge's shared MQTT bridge (onion.mqtt_publish/subscribe/receive).
    mqtt    = type(onion.mqtt_publish) == 'function' and type(onion.mqtt_subscribe) == 'function',

    -- ATECC608A hardware RNG: onion.secure_random(count) -> bytes string.
    -- A high-quality client entropy source. Combat stays SERVER-AUTHORITATIVE:
    -- the server rolls and is the source of truth; secure_random only seeds
    -- optional client-side animation / tie-breaks.
    secRng  = type(onion.secure_random) == 'function',

    -- Sound module microphone (SPH0641 PDM): onion.sound_mic_begin/read/level/end.
    -- Voice challenges capture raw PCM and ship it to the server for STT.
    voice   = type(onion.sound_mic_begin) == 'function' and type(onion.sound_mic_read) == 'function',

    -- Sound module speaker (NS4168): onion.sound_speaker_begin/sound_play_tone/
    -- sound_play. Optional DEEPDISH audio flavor; never required for play.
    speaker = type(onion.sound_speaker_begin) == 'function',

    -- CC1101 sub-GHz radio: onion.subghz_begin/transmit/receive/end.
    -- Jamming/handshake mini-events (2.1, 3.4). Sub-GHz and Sound share the same
    -- side-port pins, so only one may be active at a time — call *_end before
    -- switching modules.
    subghz  = type(onion.subghz_begin) == 'function' and type(onion.subghz_transmit) == 'function',
}

-- IMPORTANT: there is NO Lua signing primitive on the badge. The ATECC608B
-- cannot do Ed25519, and the badge's software Solana key is not exposed to
-- scripts, so a badge-signed ("attested") combat roll is not achievable from
-- Lua. Combat tamper-resistance comes from the server being authoritative over
-- rolls (it generates and records them); secure_random is an entropy
-- convenience, not a signature. Kept as an explicit false so callers that
-- branch on it degrade cleanly.
caps.seAttest = false

-- Log active capabilities on first load (visible in the Onion OS log pane).
local active = {}
for k, v in pairs(caps) do
    if v == true then active[#active + 1] = k end
end
if #active > 0 then
    onion.log('oRPG caps: ' .. table.concat(active, ','))
else
    onion.log('oRPG caps: base (ESP-NOW relay only)')
end

return caps
