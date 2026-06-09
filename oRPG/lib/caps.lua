-- oRPG/lib/caps.lua
-- Capability shim: detects which optional Onion OS primitives this badge has and
-- selects the richer code path when present. Game/server traffic always stays
-- on the ESP-NOW + beacon relay path so the badge never carries server keys.
--
-- These names track the REAL Onion OS Lua API (see the badge README "Scripts
-- receive a small global `onion` table" + "Swappable modules"). Earlier drafts
-- gated on proposed firmware-ext names (http_request/se_rng/se_sign/
-- voice_capture/subghz_tx); those are gone — the shipped firmware uses the
-- canonical names below.
--
-- Usage:
--   local caps = require('lib.caps')
--   if caps.subghz then ... else ... end

local caps = {
    -- Direct game-server HTTPS is intentionally disabled. The beacon/gateway
    -- owns server authentication and forwards badge frames to /api/relay.
    http    = false,

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

-- Optional future signing boundary. Current shipped Onion OS docs say arbitrary
-- Lua message signing is not exposed, but keep this feature-detected so the
-- thin client can submit signed moves on firmware that does expose it.
caps.sign = type(onion.sign_message) == 'function'
    or type(onion.wallet_sign) == 'function'
    or type(onion.se_sign) == 'function'

-- Back-compat alias used by older screens. It means "can attest a move", not
-- "combat is badge-authoritative"; combat/game logic remains server-owned.
caps.seAttest = caps.sign

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
