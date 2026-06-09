-- oRPG.lua - ONION RPG thin badge runtime
--
-- Badge responsibilities:
--   1. Maintain badge identity/address metadata and optionally sign moves.
--   2. Submit moves/proximity events to the server through the ESP-NOW beacon.
--   3. Render compact e-ink frames sent by the server.
--
-- All adventure, challenge, combat, NPC, inventory, and progression logic is
-- server-owned. Legacy per-challenge Lua screens remain in the repo for older
-- bundles, but this entrypoint does not load them.

local _path = package.path or ''
local function add_lua_path(pattern)
    if not string.find(_path, pattern, 1, true) then
        _path = _path .. ';' .. pattern
    end
end

add_lua_path('?.lua')
add_lua_path('?/init.lua')
add_lua_path('lib/?.lua')
add_lua_path('lib/?/init.lua')
add_lua_path('oRPG/?.lua')
add_lua_path('oRPG/?/init.lua')
add_lua_path('oRPG/lib/?.lua')
package.path = _path

local caps     = require('lib.caps')
local proto    = require('lib.proto')
local net      = require('lib.net')
local ui       = require('lib.ui')
local identity = require('lib.identity')
local hardware = require('lib.hardware')

local GAME_VERSION = '0.2.0-thin'
local LOOP_SLEEP_MS = 80
local BEACON_DEFAULT_MIN_RSSI = -75
local BEACON_STALE_MS = 12000
local BEACON_PING_MS = 8000
local HEARTBEAT_MS = 30000

local hardware_id = identity.hardware_id()
local onion_id = identity.onion_id()
local addresses = identity.addresses()
local move_seq = 0

local beacon = nil
local last_buttons = nil
local last_beacon_ping = 0
local last_heartbeat = 0
local last_render_id = nil

-- Button compatibility shim. Firmware builds have exposed badge input with a
-- few different key names; normalize them once for move submission.
local _raw_buttons = onion.buttons
local BUTTON_ALIASES = {
    up     = { 'up', 'UP', 'u', 'arrow_up', 'dpad_up', 'btn_up', 'nav_up' },
    down   = { 'down', 'DOWN', 'd', 'arrow_down', 'dpad_down', 'btn_down', 'nav_down' },
    left   = { 'left', 'LEFT', 'l', 'arrow_left', 'dpad_left', 'btn_left' },
    right  = { 'right', 'RIGHT', 'r', 'arrow_right', 'dpad_right', 'btn_right' },
    select = { 'select', 'SELECT', 'ok', 'OK', 'a', 'enter', 'start', 'center' },
    cancel = { 'cancel', 'CANCEL', 'back', 'b', 'esc', 'escape', 'menu' },
}
local BUTTON_MASKS = { left = 1, down = 2, up = 4, right = 8, select = 16, cancel = 32 }

local function now_ms()
    if type(onion.millis) == 'function' then
        local ok, ms = pcall(onion.millis)
        if ok and type(ms) == 'number' then return ms end
    end
    return os.clock and math.floor(os.clock() * 1000) or 0
end

local function is_pressed_value(v)
    return v == true or v == 1 or v == '1' or v == 'true' or
        v == 'TRUE' or v == 'pressed' or v == 'down'
end

local function mark_pressed(out, value)
    if type(value) ~= 'string' then return end
    local lower = value:lower()
    for name, aliases in pairs(BUTTON_ALIASES) do
        for _, alias in ipairs(aliases) do
            if lower == tostring(alias):lower() then
                out[name] = true
                return
            end
        end
    end
end

local function read_named_button(raw, aliases)
    if type(raw) ~= 'table' then return false end
    for _, key in ipairs(aliases) do
        if is_pressed_value(raw[key]) then return true end
    end
    return false
end

local function read_mask_button(raw, name)
    if type(raw) ~= 'table' or type(raw.mask) ~= 'number' then return false end
    local mask = BUTTON_MASKS[name]
    if not mask then return false end
    return math.floor(raw.mask / mask) % 2 == 1
end

local function merge_button_bucket(out, bucket)
    if type(bucket) == 'string' then
        mark_pressed(out, bucket)
    elseif type(bucket) == 'table' then
        for name, aliases in pairs(BUTTON_ALIASES) do
            if read_named_button(bucket, aliases) then out[name] = true end
        end
        for _, value in ipairs(bucket) do mark_pressed(out, value) end
    end
end

local function normalised_buttons()
    local raw = {}
    if type(_raw_buttons) == 'function' then
        local ok, value = pcall(_raw_buttons)
        if ok and value ~= nil then raw = value end
    end

    local out = { up = false, down = false, left = false, right = false, select = false, cancel = false }
    if type(raw) == 'string' then
        mark_pressed(out, raw)
    elseif type(raw) == 'table' then
        for name, aliases in pairs(BUTTON_ALIASES) do
            out[name] = read_named_button(raw, aliases) or read_mask_button(raw, name)
        end
        for _, value in ipairs(raw) do mark_pressed(out, value) end
        merge_button_bucket(out, raw.pressed)
        merge_button_bucket(out, raw.down)
        merge_button_bucket(out, raw.held)
        merge_button_bucket(out, raw.buttons)
    end
    return out
end
onion.buttons = normalised_buttons

local function local_frame(title, lines, footer)
    local ops = {
        { k = 'clear' },
        { k = 'rect', x = 2, y = 2, w = ui.W - 4, h = ui.H - 4 },
        { k = 'text', x = 8, y = 8, f = 'bold', t = title },
        { k = 'line', x1 = 4, y1 = 24, x2 = ui.W - 4, y2 = 24 },
        { k = 'lines', x = 8, y = 34, lh = ui.LH_SMALL, lines = lines or {} },
    }
    if footer then
        ops[#ops + 1] = { k = 'line', x1 = 4, y1 = ui.H - 20, x2 = ui.W - 4, y2 = ui.H - 20 }
        ops[#ops + 1] = { k = 'text', x = 8, y = ui.H - 14, f = 'small', t = footer }
    end
    ui.render_frame({ v = 1, ops = ops })
end

local function espnow_payload(msg)
    if type(msg) ~= 'table' then return nil end
    if type(msg.payload) == 'string' then return msg.payload end
    if type(msg.message) == 'string' then return msg.message end
    return nil
end

local function hello_min_rssi(body)
    if type(body) ~= 'table' then return BEACON_DEFAULT_MIN_RSSI end
    local advertised = body.r or body.minRssi or body.min_rssi
    if type(advertised) == 'number' then return advertised end
    return BEACON_DEFAULT_MIN_RSSI
end

local hello_reassembler = proto.new_reassembler()
local function decode_beacon_hello(msg)
    local payload = espnow_payload(msg)
    if not payload then return nil end
    local frame = proto.decode_frame(payload)
    if not frame or frame.msg_type ~= proto.MsgType.BEACON_HELLO then return nil end
    local body = hello_reassembler:push(frame)
    if type(body) ~= 'table' then return nil end

    local rssi = type(msg.rssi) == 'number' and msg.rssi or nil
    local min_rssi = hello_min_rssi(body)
    return {
        id = body.b,
        challenge_id = body.c,
        mac = msg.mac or body.m,
        label = body.l,
        rssi = rssi,
        min_rssi = min_rssi,
        seen_at = now_ms(),
        in_range = (rssi == nil) or (rssi >= min_rssi),
    }
end

local function caps_payload()
    return {
        sign = caps.sign == true,
        secRng = caps.secRng == true,
        voice = caps.voice == true,
        speaker = caps.speaker == true,
        subghz = caps.subghz == true,
        mqtt = caps.mqtt == true,
        gpio = hardware.capabilities().gpio == true,
    }
end

local function beacon_payload()
    if not beacon then return nil end
    return {
        id = beacon.id,
        challengeId = beacon.challenge_id,
        mac = beacon.mac,
        rssi = beacon.rssi,
        minRssi = beacon.min_rssi,
    }
end

local function build_move(kind, payload)
    move_seq = (move_seq + 1) % 1000000
    onion_id = identity.onion_id() or onion_id
    addresses = identity.addresses()

    local move = {
        h = hardware_id,
        o = onion_id,
        a = addresses,
        b = beacon_payload(),
        k = kind,
        p = payload,
        q = move_seq,
        t = now_ms(),
        caps = caps_payload(),
    }
    move.sig = identity.sign_move(move)
    return move
end

local function render_server_frame(frame)
    if type(frame) ~= 'table' or type(frame.ops) ~= 'table' then return false end
    if frame.id and frame.id == last_render_id then return true end
    local ok = ui.render_frame(frame)
    if ok then last_render_id = frame.id end
    return ok
end

local function submit_move(kind, payload, timeout_ms, process_io)
    if process_io == nil then process_io = true end
    if not beacon or not beacon.mac then return nil, 'no beacon' end
    net.init(beacon.mac)
    local body = build_move(kind, payload)
    local resp, err = net.request(proto.MsgType.BADGE_MOVE, body, timeout_ms or 10000)
    if err then return nil, err end
    render_server_frame(resp)
    if process_io and type(resp) == 'table' and type(resp.io) == 'table' then
        local io_result = hardware.collect(resp.io)
        if io_result then
            submit_move('io', io_result, 12000, false)
        end
    end
    return resp, nil
end

local function first_pressed(buttons, last)
    for _, name in ipairs({ 'select', 'cancel', 'up', 'down', 'left', 'right' }) do
        if buttons[name] and not (last and last[name]) then return name end
    end
    return nil
end

local function espnow_ready()
    local ok, err = onion.espnow_start()
    if not ok then
        local_frame('oRPG ERROR', { 'ESP-NOW start failed:', tostring(err) }, '[CANCEL] Exit')
        return false
    end
    onion.log('oRPG thin: ESP-NOW started')
    return true
end

local_frame('ONION RPG', {
    'Server-owned adventure runtime.',
    'Badge mode: sign, ping, render.',
    '',
    'Looking for nearby beacons...',
}, GAME_VERSION)

if not espnow_ready() then return end
last_buttons = onion.buttons()

while true do
    local now = now_ms()
    local buttons = onion.buttons()
    local pressed = first_pressed(buttons, last_buttons)

    local msg = onion.espnow_receive(LOOP_SLEEP_MS)
    if msg then
        local seen = decode_beacon_hello(msg)
        if seen then
            beacon = seen
            if seen.in_range then
                net.init(seen.mac)
                if now - last_beacon_ping > BEACON_PING_MS then
                    last_beacon_ping = now
                    submit_move('beacon_ping', {
                        event = 'seen',
                        label = seen.label,
                    }, 12000)
                end
            else
                local_frame('MOVE CLOSER', {
                    seen.label or seen.id or 'Beacon detected',
                    'Signal ' .. tostring(seen.rssi or '?') ..
                        ' / need ' .. tostring(seen.min_rssi) .. ' dBm',
                }, GAME_VERSION)
            end
        end
    elseif beacon and now - beacon.seen_at > BEACON_STALE_MS then
        beacon = nil
        local_frame('ONION RPG', {
            'Beacon signal lost.',
            'Looking for nearby beacons...',
        }, GAME_VERSION)
    end

    if pressed then
        if pressed == 'cancel' and not beacon then
            onion.release_display()
            return
        end
        local _, err = submit_move('button', { button = pressed }, 12000)
        if err and beacon then
            local_frame('NETWORK ERROR', { tostring(err):sub(1, 80) }, GAME_VERSION)
        end
    elseif beacon and now - last_heartbeat > HEARTBEAT_MS then
        last_heartbeat = now
        submit_move('heartbeat', {}, 8000)
    end

    last_buttons = buttons
    onion.sleep(LOOP_SLEEP_MS)
end
