-- oRPG/screens/act3-4-elevator-hack.lua
-- Act 3, Challenge 3.4 — The Elevator Hack (Combat + sub-GHz puzzle)
-- SPEC §5 Act 3: hack a networked elevator to reach the City IT floor.
--
-- Flow:
--   1. intro       — DEEPDISH taunts; player reads challenge setup.
--   2. handshake   — Sub-GHz transmit (if caps.subghz) or relay-via-beacon fallback.
--   3. handshake_ack — Server acknowledges, IDS combat begins.
--   4. combat_active — 2-wave RNG combat using the combat archetype.
--   5. done        — Win/lose result screen.
--
-- Capability shim:
--   caps.subghz=true  : badge opens the CC1101 (onion.subghz_begin), sends the
--                       access code (onion.subghz_transmit) and powers it down
--                       (onion.subghz_end).
--   caps.subghz=false : badge presses SELECT to signal "ready"; beacon auto-opens
--                       the gate (fallback_auto_open=true in beacon config). The
--                       game is fully playable on today's base firmware.
--   Combat is SERVER-AUTHORITATIVE (the server rolls and records); the badge
--   never signs rolls. caps.secRng only seeds optional client-side flavor.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID = '3.4'
local CHALLENGE_NAME = 'The Elevator Hack'

-- Sub-GHz access code (mirrors beacon config accessCode).
-- In production a rolling code derived from the server nonce would be used;
-- for the festival build this fixed sentinel is fine.
local SUBGHZ_ACCESS_CODE = '\xDE\xAD\xBE\xEF'   -- 4-byte payload: 0xDEADBEEF
local SUBGHZ_FREQ_MHZ    = 315.0                 -- 315 MHz (subghz API uses MHz)

-- ── State ────────────────────────────────────────────────────────────────────

local state = {
    phase         = 'intro',  -- intro | handshake | hs_waiting | hs_ack | combat_active | done
    message       = '',       -- latest DEEPDISH line or status message
    combat_runner = nil,      -- combat archetype runner (created when handshake done)
    result_passed = false,
    last_buttons  = nil,
}

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Build the combat archetype runner for the IDS fight.
local function make_combat_runner()
    return archetypes.combat(CHALLENGE_ID, {
        enemy_name   = 'Intrusion Detection System v2.3',
        enemy_max_hp = 60,
        op_max_hp    = 100,
        waves_req    = 2,
        intro_text   =
            "IDS v2.3 is AWAKE. Two waves of security alarms. " ..
            "[SELECT] to roll. Survive both waves to reach Floor 47.",
    })
end

-- ── Sub-GHz handshake ─────────────────────────────────────────────────────────

-- Attempt the sub-GHz handshake. With caps.subghz we transmit on 315 MHz;
-- without it we send CHALLENGE_BEGIN with phase='handshake' so the beacon
-- triggers its fallback auto-open.
local function do_handshake(ctx)
    state.phase = 'hs_waiting'

    if caps.subghz then
        -- Rich path: badge transmits the elevator access code over 315 MHz using
        -- the real CC1101 lifecycle (begin -> transmit -> end). Sub-GHz shares the
        -- side-port pins with Sound, so we always power the radio down afterward.
        onion.log('elevator: subghz handshake on ' .. SUBGHZ_FREQ_MHZ .. ' MHz')
        local ok, err = onion.subghz_begin({ freq = SUBGHZ_FREQ_MHZ, modulation = 'ook' })
        if ok then
            local txok, txerr = onion.subghz_transmit(SUBGHZ_ACCESS_CODE)
            onion.subghz_end()
            if not txok then
                -- TX failed; fall through to relay/server path.
                onion.log('elevator: subghz_transmit failed: ' .. tostring(txerr) .. '; using relay')
            end
        else
            -- Radio didn't come up; fall through to relay/server path.
            onion.log('elevator: subghz_begin failed: ' .. tostring(err) .. '; using relay')
        end
    else
        -- Base-firmware fallback: no sub-GHz cap.
        -- The beacon config has fallback_auto_open=true; sending CHALLENGE_BEGIN
        -- with phase='handshake' tells the relay to set the handshake flag.
        onion.log('elevator: no subghz cap — relay handshake')
    end

    -- Regardless of RF path, notify the server of the handshake attempt.
    -- The engine/relay sets game_state flag elevatorHandshakeDone=true.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c     = CHALLENGE_ID,
        h     = ctx.hardware_id,
        phase = 'handshake',
    }, 12000)

    if err then
        state.message = 'Signal lost: ' .. err .. '\nRetry with [SELECT].'
        state.phase   = 'handshake'
        return
    end

    -- Server ACK includes DEEPDISH's handshakeAck message.
    state.message = (resp and resp.message)
        or "Handshake accepted. IDS is awake and angry."
    state.phase = 'hs_ack'
end

-- ── Screen module ─────────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 3.4: begin')
    state.phase         = 'intro'
    state.message       = ''
    state.combat_runner = nil
    state.result_passed = false
    state.last_buttons  = nil

    -- Fetch the DEEPDISH intro from the server (non-blocking; best-effort).
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    }, 6000)
    if not err and resp then
        state.message = resp.intro or resp.message or ''
    end
    -- If the server is unreachable we still show the local intro copy below.
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed  = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── intro ──────────────────────────────────────────────────────────────
    if state.phase == 'intro' then
        if pressed == 'select' then
            state.phase = 'handshake'
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── handshake: waiting for player to attempt ───────────────────────────
    elseif state.phase == 'handshake' then
        if pressed == 'select' then
            do_handshake(ctx)
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── hs_waiting: waiting for server reply (blocking inside do_handshake) ─
    -- (do_handshake is synchronous; this phase is set only transiently)
    elseif state.phase == 'hs_waiting' then
        -- nothing; update won't be called until do_handshake returns

    -- ── hs_ack: server confirmed handshake; show result, then start combat ──
    elseif state.phase == 'hs_ack' then
        if pressed == 'select' then
            -- Transition into combat.
            state.combat_runner = make_combat_runner()
            state.combat_runner.begin(ctx)
            state.phase = 'combat_active'
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── combat_active: delegate to combat archetype runner ────────────────
    elseif state.phase == 'combat_active' then
        if state.combat_runner then
            local result = state.combat_runner.update(ctx, dt)
            if result == 'done' then
                -- Combat resolved; determine outcome from archetype state.
                -- The archetype sets its internal status field; we read it
                -- via the render state it exposes (convention from archetypes.lua).
                -- Use the last message to infer win/loss (combat runner does not
                -- expose status directly; the server has already persisted it).
                -- The engine will have run validate({phase:'combat'}) before this.
                state.result_passed =
                    state.combat_runner.last_status == 'won' or false
                state.phase = 'done'
            end
        end

    -- ── done: win/lose result screen ──────────────────────────────────────
    elseif state.phase == 'done' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

function screen.render(ctx)
    onion.clear_display()
    ui.border()

    if state.phase == 'intro' then
        ui.title(CHALLENGE_NAME, 4)
        ui.divider(18)

        -- Static intro if the server message hasn't arrived yet.
        local intro_text = (#state.message > 0) and state.message
            or ("A networked elevator. BACnet over IP. Sub-GHz handshake required. " ..
                "The City IT floor won't unlock itself, champ.")
        local lines = ui.wrap_text(intro_text, 38)
        ui.body_text(lines, 6, 26)
        ui.divider(ui.H - 22)

        local hint = caps.subghz
            and '[SELECT] Sub-GHz Hack  [CANCEL] Leave'
            or  '[SELECT] Relay Hack    [CANCEL] Leave'
        onion.display_text(hint, 6, ui.H - 16, { font = 'small', clear = false })

    elseif state.phase == 'handshake' then
        ui.title('ELEVATOR ACCESS', 4)
        ui.divider(18)

        if caps.subghz then
            onion.display_text('Sub-GHz transmitter ready.', 6, 26,
                { font = 'small', clear = false })
            onion.display_text('Freq: 315 MHz', 6, 40,
                { font = 'small', clear = false })
            onion.display_text('Code: DEADBEEF', 6, 54,
                { font = 'small', clear = false })
        else
            local lines = ui.wrap_text(
                "No sub-GHz cap. The beacon will relay the handshake. " ..
                "Press SELECT to signal ready.", 38)
            ui.body_text(lines, 6, 26)
        end

        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Transmit  [CANCEL] Leave', 6, ui.H - 16,
            { font = 'small', clear = false })

    elseif state.phase == 'hs_waiting' then
        ui.title('Transmitting...', 70)
        local lx = 60
        onion.display_text('Contacting elevator BAS', lx, 96,
            { font = 'small', clear = false })

    elseif state.phase == 'hs_ack' then
        ui.title('HANDSHAKE OK', 4)
        ui.divider(18)
        local ack = (#state.message > 0) and state.message
            or "Elevator unlocked. IDS is active. Prepare for combat."
        -- Truncate to 3 display lines (each ~38 chars).
        local lines = ui.wrap_text(ack, 38)
        ui.body_text(lines, 6, 26)
        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Fight the IDS  [CANCEL] Leave', 6, ui.H - 16,
            { font = 'small', clear = false })

    elseif state.phase == 'combat_active' then
        -- Delegate rendering entirely to the combat archetype runner.
        if state.combat_runner then
            state.combat_runner.render(ctx)
        end

    elseif state.phase == 'done' then
        if state.result_passed then
            -- Win screen.
            ui.splash(
                'Floor 47\nUnlocked',
                'City IT Keycard + Fragment #4',
                '[SELECT] Ascend'
            )
        else
            -- Loss screen.
            ui.title('ACCESS DENIED', 20)
            local lines = ui.wrap_text(
                "The IDS won this round. " ..
                "The elevator is sealed. Try again, champ.", 38)
            ui.body_text(lines, 6, 48)
            ui.divider(ui.H - 22)
            onion.display_text('[SELECT] Try Again  [CANCEL] Leave', 6, ui.H - 16,
                { font = 'small', clear = false })
        end
    end
end

return screen
