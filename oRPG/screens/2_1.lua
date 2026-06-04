-- oRPG/screens/act2-1-loop-that-wont-stop.lua
-- Act 2, Challenge 2.1 — The Loop That Won't Stop (combat + sub-GHz timing)
-- SPEC §5 Act 2: driverless L won't open doors.
--
-- TWO-PHASE FLOW:
--   Phase 1 — Sub-GHz JAM:
--     If caps.subghz is true: badge opens the CC1101 radio (onion.subghz_begin),
--     transmits the stop code via onion.subghz_transmit, powers it back down with
--     onion.subghz_end, and waits for the beacon to confirm receipt
--     (CHALLENGE_RESULT {jammed:true}).
--     Fallback: badge sends a MERCHANT_INPUT jam_relay command so the beacon
--     relays the stop code, then awaits the same confirmation.
--     Either path has a 60-second countdown timer on-screen.
--
--   Phase 2 — RNG COMBAT (doors fighting back):
--     After a successful jam, uses the combat archetype runner (archetypes.combat).
--     One wave vs the Door Actuator Daemon (HP 60).
--
-- Capability shim: caps.subghz -> native path; else -> relay path.
-- Fully playable on today's ESP-NOW-only firmware via the relay fallback.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID  = '2.1'
local JAM_WINDOW_MS = 60000   -- must match beacon config
-- Sub-GHz stop code (beacon validates the same value).
-- Human-readable label for the UI/logs:
local STOP_CODE_HEX   = 'DEAD1A1A'
-- Raw 4-byte payload sent over the air (onion.subghz_transmit takes 1..61 bytes):
local STOP_CODE_BYTES = '\xDE\xAD\x1A\x1A'
-- CC1101 frequency for the jam (MHz; onion.subghz_begin/set_frequency use MHz).
local SUBGHZ_FREQ_MHZ = 433.92

-- ── State ─────────────────────────────────────────────────────────────────

local state = {
    phase         = 'intro',  -- intro | jam_waiting | jam_counting | jam_result | combat_active | done
    intro_text    = '',
    jam_started   = false,
    jam_elapsed   = 0,        -- ms elapsed since jam window opened
    jam_result    = nil,      -- nil | {jammed=bool, relay=bool}
    jam_message   = '',
    combat_runner = nil,
    result_text   = '',
    passed        = false,
    last_buttons  = nil,
    last_tick_ms  = 0,
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Render a countdown bar in the bottom strip.
-- filled 0..1 (1 = full time remaining).
local function draw_countdown(elapsed_ms, window_ms)
    local remaining = math.max(0, window_ms - elapsed_ms)
    local frac      = remaining / window_ms
    local bar_w     = math.floor((ui.W - 12) * frac)
    -- draw background rect
    onion.display_rect(6, ui.H - 12, ui.W - 12, 8, { clear = false, color = 'white', fill = true })
    -- draw filled portion
    if bar_w > 0 then
        onion.display_rect(6, ui.H - 12, bar_w, 8, { clear = false, color = 'black', fill = true })
    end
    -- seconds label
    local secs = math.floor(remaining / 1000)
    onion.display_text(secs .. 's', ui.W - 24, ui.H - 14,
        { font = 'small', clear = false })
end

-- ── Sub-GHz jam: native path (caps.subghz == true) ───────────────────────

local function do_jam_native()
    -- Real CC1101 lifecycle: begin -> transmit -> end. Sub-GHz and Sound share
    -- the side-port pins, so we always close the radio with subghz_end before
    -- returning. transmit takes a raw 1..61 byte payload.
    onion.log('2.1: subghz transmit stop code ' .. STOP_CODE_HEX
        .. ' @ ' .. SUBGHZ_FREQ_MHZ .. ' MHz')

    local ok, err = onion.subghz_begin({ freq = SUBGHZ_FREQ_MHZ, modulation = 'ook' })
    if not ok then
        onion.log('2.1: subghz_begin failed: ' .. tostring(err))
        return false, tostring(err)
    end

    local txok, txerr = onion.subghz_transmit(STOP_CODE_BYTES)
    onion.subghz_end()  -- always power the radio back down

    if not txok then
        onion.log('2.1: subghz_transmit failed: ' .. tostring(txerr))
        return false, tostring(txerr)
    end
    return true, nil
end

-- ── Sub-GHz jam: beacon relay fallback (caps.subghz == false) ────────────

local function do_jam_relay(ctx)
    -- Tell the beacon to relay the stop code on our behalf.
    -- We repurpose MERCHANT_INPUT with a special marker sequence so the relay
    -- endpoint doesn't need a new MsgType (stays within v1 protocol).
    local resp, err = net.request(proto.MsgType.MERCHANT_INPUT, {
        c   = CHALLENGE_ID,
        seq = { 'jam_relay' },
    }, 15000)
    if err then
        return nil, err
    end
    -- resp should be MERCHANT_RESULT {passed:bool, jammed:bool, message:string}
    return resp, nil
end

-- ── Open the combat runner after a successful jam ─────────────────────────

local function start_combat(ctx)
    state.combat_runner = archetypes.combat(CHALLENGE_ID, {
        enemy_name   = 'Door Actuator Daemon',
        enemy_max_hp = 60,
        op_max_hp    = 100,
        waves_req    = 1,
        intro_text   =
            "Door actuator daemon is FURIOUS, champ. " ..
            "Three pneumatic doors with attitude problems. Survive this.",
    })
    state.combat_runner.begin(ctx)
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 2.1: begin')
    state.phase        = 'intro'
    state.jam_started  = false
    state.jam_elapsed  = 0
    state.jam_result   = nil
    state.jam_message  = ''
    state.combat_runner = nil
    state.result_text  = ''
    state.passed       = false
    state.last_buttons = nil
    state.last_tick_ms = onion.sleep and 0 or 0  -- reset tick reference

    -- Signal server that the challenge is beginning; capture intro text.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        state.intro_text = 'Server error: ' .. err
    else
        state.intro_text = (resp and resp.intro)
            or "Welcome to the Loop, champ. Jam the signal to stop the train."
    end
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── INTRO ─────────────────────────────────────────────────────────────
    if state.phase == 'intro' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'select' then
            state.phase = 'jam_waiting'
        end

    -- ── JAM WAITING: player is prompted to begin the jam window ──────────
    elseif state.phase == 'jam_waiting' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'select' then
            -- Open the 60-second jam window.
            state.jam_elapsed = 0
            state.jam_started = true
            state.phase       = 'jam_counting'

            if caps.subghz then
                -- Fire the sub-GHz tx immediately; the window started.
                local ok, err = do_jam_native()
                if not ok then
                    state.jam_message = 'TX error: ' .. tostring(err)
                    -- Continue counting — the badge might retry or beacon picks it up.
                end
            else
                -- Relay fallback: send async; don't block the timer loop.
                -- We call the relay in a fire-and-forget pattern using a coroutine
                -- equivalent — Lua sandbox has no coroutines but pcall is fine here
                -- since net.request is synchronous (blocks until reply or timeout).
                -- We'll do the relay call in the jam_counting phase after a short
                -- delay to let the countdown screen render first.
                state.jam_relay_pending = true
            end
        end

    -- ── JAM COUNTING: 60-second countdown, waiting for beacon ack ─────────
    elseif state.phase == 'jam_counting' then
        state.jam_elapsed = state.jam_elapsed + (dt or 80)

        -- Relay path: send the relay request (once) after first tick.
        if state.jam_relay_pending then
            state.jam_relay_pending = false
            local resp, err = do_jam_relay(ctx)
            if err then
                state.jam_message = 'Relay error: ' .. err
                -- fall through; the window will time out naturally
            elseif resp and resp.jammed then
                -- Beacon confirmed the relay jam succeeded.
                state.jam_result  = { jammed = true, relay = true }
                state.jam_elapsed = resp.elapsed_ms or state.jam_elapsed
                state.phase       = 'jam_result'
            else
                state.jam_message = (resp and resp.message) or 'Relay failed.'
                -- Show the message and let the window tick to expiry.
            end
        end

        -- Check for timeout.
        if state.jam_elapsed >= JAM_WINDOW_MS and state.phase == 'jam_counting' then
            state.jam_result = { jammed = false }
            state.phase      = 'jam_result'
        end

        -- CANCEL aborts the jam attempt.
        if pressed == 'cancel' then
            state.jam_result = { jammed = false }
            state.phase      = 'jam_result'
        end

        -- Native sub-GHz path: after transmitting, poll the server to see
        -- if the beacon received it (we use a CHALLENGE_BEGIN re-ping with a
        -- special flag; the server/beacon reports receipt in the response).
        -- We poll every ~5 s to avoid hammering ESP-NOW.
        if caps.subghz and state.jam_elapsed % 5000 < (dt or 80) then
            local resp, _ = net.request(proto.MsgType.MERCHANT_INPUT, {
                c   = CHALLENGE_ID,
                seq = { 'jam_poll' },
            }, 4000)
            if resp and resp.jammed then
                state.jam_result = { jammed = true, relay = false }
                state.phase      = 'jam_result'
            end
        end

    -- ── JAM RESULT: show pass/fail, then transition ───────────────────────
    elseif state.phase == 'jam_result' then
        if pressed == 'select' or pressed == 'cancel' then
            local jam = state.jam_result
            if jam and jam.jammed then
                -- Tell the server about the successful jam, open combat.
                local resp, err = net.request(proto.MsgType.MERCHANT_INPUT, {
                    c   = CHALLENGE_ID,
                    seq = { 'phase:jam', 'jammed:true',
                            jam.relay and 'relay:true' or 'relay:false' },
                }, 8000)
                if err then
                    state.result_text = 'Server error: ' .. err
                    state.phase       = 'done'
                else
                    -- Server returns continued=true; we open the combat runner.
                    start_combat(ctx)
                    state.phase = 'combat_active'
                end
            else
                -- Jam failed; challenge over.
                state.result_text = jam and
                    "Window closed. The train kept going. Try again, pal." or
                    "Jam attempt failed. The doors remain hostile."
                state.phase       = 'done'
            end
        end

    -- ── COMBAT: delegate to the combat archetype runner ───────────────────
    elseif state.phase == 'combat_active' then
        if state.combat_runner then
            local result = state.combat_runner.update(ctx, dt)
            if result == 'done' then
                -- Combat finished; check final status.
                -- The runner signals 'done' after won OR lost.
                -- The session status is reported in the runner's internal state
                -- via the last COMBAT_ROLL_RESPONSE from the server.
                -- We submit the final validate call to the engine.
                local resp, err = net.request(proto.MsgType.MERCHANT_INPUT, {
                    c   = CHALLENGE_ID,
                    seq = { 'phase:combat', 'submit:true' },
                }, 8000)
                if err then
                    state.result_text = 'Server error: ' .. err
                else
                    state.passed      = resp and resp.passed or false
                    state.result_text = (resp and resp.message) or
                        (state.passed
                            and "Doors open. Transit Pass unlocked. 90 Onions earned."
                            or  "Defeated. The actuator daemon wins this round.")
                end
                state.phase = 'done'
            end
        end

    -- ── DONE: show result, wait for dismiss ───────────────────────────────
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
        ui.title("THE LOOP", 4)
        ui.divider(18)
        local lines = ui.wrap_text(state.intro_text, 38)
        ui.body_text(lines, 6, 24)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Begin  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'jam_waiting' then
        ui.title("L CONTROL JAM", 4)
        ui.divider(18)
        local cap_label = caps.subghz
            and "Sub-GHz ready (433.92 MHz)"
            or  "No sub-GHz: relay via beacon"
        onion.display_text(cap_label, 6, 24, { font = 'small', clear = false })
        local lines = ui.wrap_text(
            "60-second window. Transmit stop code to halt the train. " ..
            "Then survive the door actuator.", 38)
        ui.body_text(lines, 6, 38)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Start jam  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'jam_counting' then
        ui.title("JAMMING SIGNAL", 4)
        ui.divider(18)
        -- Show signal source
        local src = caps.subghz and "433.92 MHz TX active" or "Beacon relay active"
        onion.display_text(src, 6, 24, { font = 'small', clear = false })
        -- Show any relay/error message
        if state.jam_message ~= '' then
            local lines = ui.wrap_text(state.jam_message, 38)
            ui.body_text(lines, 6, 38)
        else
            onion.display_text("Waiting for train to receive stop code...", 6, 38,
                { font = 'small', clear = false })
        end
        onion.display_text('[CANCEL] Abort', 6, ui.H - 24,
            { font = 'small', clear = false })
        -- Countdown bar
        draw_countdown(state.jam_elapsed, JAM_WINDOW_MS)

    elseif state.phase == 'jam_result' then
        local jam = state.jam_result
        if jam and jam.jammed then
            ui.title("SIGNAL JAMMED", 20)
            local lines = ui.wrap_text(
                "Train stopped! Now the doors are fighting back. " ..
                "Brace yourself.", 38)
            ui.body_text(lines, 6, 50)
        else
            ui.title("JAM FAILED", 20)
            local lines = ui.wrap_text(
                "Window closed. Train kept moving. " ..
                "That's a no from me, chief.", 38)
            ui.body_text(lines, 6, 50)
        end
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Continue', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'combat_active' then
        if state.combat_runner then
            state.combat_runner.render(ctx)
        end

    elseif state.phase == 'done' then
        local icon = state.passed and "LOOP CLEARED" or "LOOP BLOCKED"
        ui.title(icon, 20)
        local lines = ui.wrap_text(state.result_text, 38)
        ui.body_text(lines, 6, 48)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] OK', 6, ui.H - 14,
            { font = 'small', clear = false })
    end
end

return screen
