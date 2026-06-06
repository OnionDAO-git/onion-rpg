-- oRPG.lua — ONION RPG badge client entry point
-- "The Great Onion Shortage" by Onion DAO, Chicago
--
-- ── How to publish ────────────────────────────────────────────────────────
-- 1. Bundle this file plus oRPG/ (lib/*.lua, screens/*.lua) into a single
--    script directory upload, or publish just oRPG.lua as the top-level script
--    if the registry copies sibling directories automatically.
-- 2. POST to the Onion DAO Lua Script Registry:
--      POST https://oniondao.dev/api/portal/lua-scripts
--      Authorization: Bearer <PORTAL_API_KEY>
--      Content-Type: application/json
--      { "title": "oRPG", "fileName": "oRPG.lua",
--        "description": "The Great Onion Shortage — ONION RPG badge client",
--        "code": "<contents of this file>" }
-- 3. To push to a linked online badge:
--      POST https://oniondao.dev/api/portal/lua-scripts/<scriptId>/push
--      Authorization: Bearer <PORTAL_API_KEY>
--      { "hardwareId": "<badge hardware id>" }
--    The badge shows an accept popup and downloads the script over MQTT.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Library bootstrap ─────────────────────────────────────────────────────
-- Onion OS uses Lua's standard require() with the badge SPIFFS as the module
-- root.  All oRPG library modules live at oRPG/lib/*.lua on the badge.
-- When this script runs, package.path must include the script directory.
-- The firmware sets up "?.lua" relative to the script root, so:
--   require('lib.caps')  -> oRPG/lib/caps.lua  (when run from oRPG/)
-- Be tolerant of both upload layouts:
--   oRPG.lua + lib/*.lua + screens/*.lua
--   oRPG/oRPG.lua + oRPG/lib/*.lua + oRPG/screens/*.lua
-- Some badge registry builds do not seed package.path with the script dir.
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
add_lua_path('screens/?.lua')
add_lua_path('oRPG/?.lua')
add_lua_path('oRPG/?/init.lua')
add_lua_path('oRPG/lib/?.lua')
add_lua_path('oRPG/screens/?.lua')
package.path = _path

local caps   = require('lib.caps')
local proto  = require('lib.proto')
local net    = require('lib.net')
local ui     = require('lib.ui')
local router = require('lib.router')

-- ── Button compatibility shim ─────────────────────────────────────────────
-- Firmware builds have exposed badge input with a few different key names.
-- Normalise them once so every screen can keep reading onion.buttons().

local _raw_buttons = onion.buttons

local BUTTON_ALIASES = {
    up     = { 'up', 'UP', 'Up', 'u', 'U', 'arrow_up', 'ArrowUp', 'dpad_up', 'dpadUp', 'btn_up', 'button_up', 'nav_up' },
    down   = { 'down', 'DOWN', 'Down', 'd', 'D', 'arrow_down', 'ArrowDown', 'dpad_down', 'dpadDown', 'btn_down', 'button_down', 'nav_down' },
    left   = { 'left', 'LEFT', 'Left', 'l', 'L', 'arrow_left', 'ArrowLeft', 'dpad_left', 'dpadLeft', 'btn_left', 'button_left', 'nav_left' },
    right  = { 'right', 'RIGHT', 'Right', 'r', 'R', 'arrow_right', 'ArrowRight', 'dpad_right', 'dpadRight', 'btn_right', 'button_right', 'nav_right' },
    select = { 'select', 'SELECT', 'Select', 'sel', 'SEL', 'ok', 'OK', 'a', 'A', 'enter', 'Enter', 'start', 'center' },
    cancel = { 'cancel', 'CANCEL', 'Cancel', 'back', 'BACK', 'b', 'B', 'esc', 'ESC', 'escape', 'Escape', 'menu' },
}

-- Default pin map for the SpacemanDev e-ink badge. Override by defining
-- ORPG_BUTTON_PINS before loading this script if a board revision differs.
local DEFAULT_BUTTON_PINS = {
    up = 41, down = 40, left = 42, right = 39, select = 15, cancel = 16,
}

local function is_pressed_value(v)
    return v == true or v == 1 or v == '1' or v == 'true' or
        v == 'TRUE' or v == 'pressed' or v == 'down'
end

local function read_named_button(raw, aliases)
    if type(raw) ~= 'table' then return false end
    for _, key in ipairs(aliases) do
        if is_pressed_value(raw[key]) then return true end
    end
    return false
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

local function merge_button_bucket(out, bucket)
    if type(bucket) == 'string' then
        mark_pressed(out, bucket)
    elseif type(bucket) == 'table' then
        for name, aliases in pairs(BUTTON_ALIASES) do
            if read_named_button(bucket, aliases) then out[name] = true end
        end
        for _, value in ipairs(bucket) do
            mark_pressed(out, value)
        end
    end
end

local function read_gpio_pin(pin)
    if not pin then return nil end
    local readers = { 'gpio_read', 'gpio_get', 'digital_read', 'pin_read', 'read_gpio' }
    for _, reader_name in ipairs(readers) do
        local reader = onion[reader_name]
        if type(reader) == 'function' then
            local ok, value = pcall(reader, pin)
            if ok and value ~= nil then return value end
        end
    end
    if type(onion.gpio) == 'function' then
        local ok, value = pcall(onion.gpio, pin)
        if ok and value ~= nil then return value end
    end
    return nil
end

local function read_gpio_button(name)
    local pins = rawget(_G, 'ORPG_BUTTON_PINS') or DEFAULT_BUTTON_PINS
    local value = read_gpio_pin(pins[name])
    -- Badge buttons are normally pulled high and go low when pressed.
    return value == false or value == 0 or value == '0' or value == 'LOW'
end

local function normalised_buttons()
    local raw = {}
    if type(_raw_buttons) == 'function' then
        local ok, value = pcall(_raw_buttons)
        if ok and value ~= nil then raw = value end
    end

    local out = {
        up = false, down = false, left = false, right = false,
        select = false, cancel = false,
    }

    if type(raw) == 'string' then
        mark_pressed(out, raw)
    elseif type(raw) == 'table' then
        for name, aliases in pairs(BUTTON_ALIASES) do
            out[name] = read_named_button(raw, aliases)
        end
        for _, value in ipairs(raw) do
            mark_pressed(out, value)
        end
        merge_button_bucket(out, raw.pressed)
        merge_button_bucket(out, raw.down)
        merge_button_bucket(out, raw.held)
        merge_button_bucket(out, raw.buttons)
    end

    for name in pairs(out) do
        if not out[name] and read_gpio_button(name) then
            out[name] = true
        end
    end

    return out
end

onion.buttons = normalised_buttons

-- ── Constants ─────────────────────────────────────────────────────────────

local GAME_VERSION  = '0.1.0'
local LOOP_SLEEP_MS = 80    -- main loop tick rate (matches firmware examples)
local BEACON_TIMEOUT_MS = 30000  -- how long to wait for a beacon hello

-- ── Operative state ───────────────────────────────────────────────────────
-- Populated from IDENTIFY_ACK and updated by PROGRESSION_STATE messages.

local operative = {
    hardware_id = onion.hardware_id(),
    -- onion_id() returns 0 when unlinked; treat 0 as nil for the wire protocol
    onion_id    = (type(onion.onion_id) == 'function') and (onion.onion_id() ~= 0 and onion.onion_id() or nil) or nil,
    callsign    = nil,
    act         = 0,
    hp          = 100,
    max_hp      = 100,
    onions      = '?',   -- string to handle "?" before first server sync
    inventory   = {},    -- array of catalogId strings
    flags       = {},
}

-- ── Shared context ────────────────────────────────────────────────────────
-- Passed to every screen module as `ctx`.

local ctx = {
    hardware_id   = operative.hardware_id,
    onion_id      = operative.onion_id,
    operative     = operative,
    net           = net,
    ui            = ui,
    caps          = caps,
    proto         = proto,
    challenge_id  = nil,   -- set when a beacon hello is received
}

-- ── Screens ───────────────────────────────────────────────────────────────
-- Phase machine for the game flow before a challenge screen takes over.

local game_phase = 'boot'   -- boot | title | searching | hud | challenge | error

local error_msg   = ''
local beacon_mac  = nil    -- current beacon's ESP-NOW MAC
local beacon_id   = nil    -- current beacon's id string
local last_tick   = 0

-- ── Boot + ESP-NOW start ─────────────────────────────────────────────────

local function espnow_ready()
    if not operative.espnow_started then
        local ok, err = onion.espnow_start()
        if not ok then
            error_msg = 'ESP-NOW start failed: ' .. tostring(err)
            game_phase = 'error'
            return false
        end
        operative.espnow_started = true
        onion.log('oRPG: ESP-NOW started, MAC ' .. onion.espnow_mac())
    end
    return true
end

-- ── IDENTIFY_ACK / PROGRESSION_STATE handler ─────────────────────────────
-- Updates local operative from a server state snapshot.

local function apply_server_state(body)
    if not body then return end
    if body.act         then operative.act         = body.act         end
    if body.hp          then operative.hp          = body.hp          end
    if body.maxHp       then operative.max_hp      = body.maxHp       end
    if body.onions      then operative.onions      = body.onions      end
    if body.callsign    then operative.callsign    = body.callsign    end
    if body.inventory   then operative.inventory   = body.inventory   end
    if body.flags       then operative.flags       = body.flags       end
    -- propagate to ctx
    ctx.onion_id = body.onionId or ctx.onion_id
end

-- ── Identify handshake ───────────────────────────────────────────────────
-- Send OPERATIVE_IDENTIFY and wait for IDENTIFY_ACK.
-- Returns true on success.

local function identify()
    local body = {
        h = operative.hardware_id,
        o = operative.onion_id,
    }
    local resp, err = net.request(proto.MsgType.OPERATIVE_IDENTIFY, body, 12000)
    if err then
        onion.log('oRPG: identify failed: ' .. err)
        return false
    end
    apply_server_state(resp)
    onion.log('oRPG: identified — act ' .. tostring(operative.act))
    return true
end

-- ── BEACON_HELLO listener ────────────────────────────────────────────────
-- Listen on broadcast for a BEACON_HELLO frame; returns the parsed body or nil.

local function wait_for_beacon_hello(timeout_ms)
    local deadline = timeout_ms or BEACON_TIMEOUT_MS
    local reassembler = proto.new_reassembler()
    while deadline > 0 do
        local slice = math.min(deadline, 2000)
        local msg   = onion.espnow_receive(slice)
        if msg then
            local frame, err = proto.decode_frame(msg.message)
            if frame and frame.msg_type == proto.MsgType.BEACON_HELLO then
                local body = reassembler:push(frame)
                if body then
                    return body, msg.mac
                end
            end
        end
        deadline = deadline - slice
    end
    return nil, nil
end

-- ── HUD draw ─────────────────────────────────────────────────────────────
-- Renders the operative status HUD on the e-paper between challenges.

local function draw_hud()
    onion.clear_display()
    ui.border()
    -- Title bar
    ui.title('ONION RPG  v' .. GAME_VERSION, 4)
    ui.divider(16)

    -- Operative info
    local callsign = operative.callsign or operative.hardware_id:sub(1, 12)
    onion.display_text('Op: ' .. callsign, 6, 22, { font = 'bold', clear = false })

    local act_str = 'Act ' .. operative.act
    onion.display_text(act_str,
        ui.W - #act_str * ui.FONT_BOLD_W - 6, 22,
        { font = 'bold', clear = false })

    ui.divider(34)

    -- HP bar
    ui.hp_bar(6, 52, 110, 'HP', operative.hp, operative.max_hp)

    -- Onion balance
    local onion_str = 'Onions: ' .. tostring(operative.onions)
    onion.display_text(onion_str, ui.W - #onion_str * ui.FONT_SMALL_W - 6, 40,
        { font = 'small', clear = false })

    -- Inventory glyphs (show first 8 item abbreviations)
    local inv_line = ''
    for i = 1, math.min(8, #operative.inventory) do
        local id = operative.inventory[i]
        -- show first 3 chars of catalogId as a glyph
        inv_line = inv_line .. '[' .. id:sub(1, 3) .. ']'
    end
    if #inv_line > 0 then
        onion.display_text(inv_line, 6, 68, { font = 'small', clear = false })
    else
        onion.display_text('(no items)', 6, 68, { font = 'small', clear = false })
    end

    ui.divider(80)

    -- Beacon search hint
    onion.display_text('Searching for beacon...', 6, 86, { font = 'small', clear = false })

    ui.divider(ui.H - 18)
    onion.display_text('[CANCEL] exit oRPG', 6, ui.H - 14,
        { font = 'small', clear = false })
end

-- ── Title / DEEPDISH intro screen ─────────────────────────────────────────

local function draw_title()
    onion.clear_display()
    ui.border(3)

    -- DEEPDISH splash
    ui.title('THE GREAT', 10)
    ui.title('ONION SHORTAGE', 26)
    ui.divider(44)

    local lines = {
        'DEEPDISH speaks:',
        '"Chicago belongs to ME, champ.',
        ' Every onion: mine.',
        ' Every fountain: Malort.',
        ' Do something about it."',
    }
    ui.body_text(lines, 6, 50, ui.LH_SMALL, 'small')

    ui.divider(ui.H - 26)
    onion.display_text('ONION DAO  ' .. GAME_VERSION, 6, ui.H - 20,
        { font = 'small', clear = false })
    onion.display_text('[SELECT] Begin  [CANCEL] Exit', 6, ui.H - 10,
        { font = 'small', clear = false })
end

-- ── Error screen ─────────────────────────────────────────────────────────

local function draw_error()
    onion.clear_display()
    ui.border()
    ui.title('!! ERROR !!', 20)
    local lines = ui.wrap_text(error_msg, 38)
    ui.body_text(lines, 6, 50)
    ui.divider(ui.H - 20)
    onion.display_text('[CANCEL] Exit', 6, ui.H - 14,
        { font = 'small', clear = false })
end

-- ── Main loop ────────────────────────────────────────────────────────────

local last_buttons = nil

draw_title()
game_phase = 'title'

while true do
    local buttons = onion.buttons()
    local now     = os.clock and math.floor(os.clock() * 1000) or 0
    local dt      = now - last_tick
    last_tick     = now

    -- Global cancel: always let CANCEL exit oRPG from non-challenge screens.
    if buttons.cancel and (game_phase == 'title' or game_phase == 'error') then
        onion.log('oRPG: exit requested')
        onion.release_display()
        return
    end

    -- ── Phase transitions ────────────────────────────────────────────────

    if game_phase == 'title' then
        if buttons.select and not (last_buttons and last_buttons.select) then
            -- start ESP-NOW and show HUD
            if espnow_ready() then
                draw_hud()
                game_phase = 'searching'
            end
        end

    elseif game_phase == 'searching' then
        -- Redraw the HUD periodically so the "searching..." text is visible.
        -- Listen for a BEACON_HELLO in the background by polling espnow_receive.
        local msg = onion.espnow_receive(LOOP_SLEEP_MS)
        if msg then
            local frame, frame_err = proto.decode_frame(msg.message)
            if frame and frame.msg_type == proto.MsgType.BEACON_HELLO then
                local reas = proto.new_reassembler()
                local body = reas:push(frame)
                if body then
                    onion.log('oRPG: BEACON_HELLO from ' .. (body.b or '?')
                        .. ' challenge ' .. tostring(body.c))
                    beacon_mac  = msg.mac
                    beacon_id   = body.b
                    ctx.challenge_id = body.c

                    -- Point net at this beacon
                    net.init(beacon_mac)

                    -- Identify with the server via the beacon
                    onion.clear_display()
                    onion.display_lines({ 'Beacon found!', 'Identifying...' },
                        6, 70, 18, { font = 'bold', clear = false })

                    if identify() then
                        game_phase = 'hud'
                        draw_hud()
                    else
                        error_msg  = 'Identify failed'
                        game_phase = 'error'
                        draw_error()
                    end
                end
            end
            -- else: non-BEACON_HELLO frame; ignore
        else
            -- No message yet; redraw HUD to refresh "searching" indicator.
            draw_hud()
        end

        if buttons.cancel and not (last_buttons and last_buttons.cancel) then
            onion.release_display()
            return
        end

    elseif game_phase == 'hud' then
        -- Player is at the beacon; press SELECT to begin the challenge.
        if buttons.select and not (last_buttons and last_buttons.select) then
            if ctx.challenge_id then
                local ok, err = router.push(ctx.challenge_id, ctx)
                if ok then
                    game_phase = 'challenge'
                else
                    error_msg  = 'Load error: ' .. tostring(err)
                    game_phase = 'error'
                    draw_error()
                end
            else
                -- No challengeId from beacon; stay on HUD
                onion.log('oRPG: beacon has no challenge id')
            end
        end

        if buttons.cancel and not (last_buttons and last_buttons.cancel) then
            -- Return to searching (maybe walk to a different beacon)
            game_phase  = 'searching'
            beacon_mac  = nil
            beacon_id   = nil
            ctx.challenge_id = nil
            draw_hud()
        end

    elseif game_phase == 'challenge' then
        -- Delegate to the challenge screen via the router.
        local result = router.update(ctx, dt)
        router.render(ctx)

        if result == 'done' or result == 'error' then
            -- Challenge finished (or error); return to the HUD.
            router.pop()
            -- Refresh operative state from server
            local state_resp = net.request(proto.MsgType.PROGRESSION_STATE,
                { h = operative.hardware_id }, 6000)
            if state_resp then apply_server_state(state_resp) end
            game_phase = 'hud'
            draw_hud()
        end

    elseif game_phase == 'error' then
        -- Error screen; only CANCEL exits (handled at the top of the loop).
        -- Nothing else to do.
    end

    last_buttons = buttons
    onion.sleep(LOOP_SLEEP_MS)
end
