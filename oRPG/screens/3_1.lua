-- oRPG/screens/act3-1-deep-tunnel-descent.lua
-- Act 3, Challenge 3.1 — Descent into the Deep Tunnel (Endurance Combat)
-- SPEC §5 Act 3: TARP "Deep Tunnel" flooding on purpose.
-- Endurance RNG combat vs "The Rising Water"; reach the beacon before a timer.
--
-- Mechanic bespoke to this challenge:
--   • A visible countdown timer shows how many seconds remain (timing_window_ms).
--   • Water-rise visual: a filled rectangle grows from the bottom each wave.
--   • DEEPDISH taunts cycle per wave transition.
--   • Combat is SERVER-AUTHORITATIVE: the server rolls and records (no Lua
--     signing primitive exists). caps.secRng lets the badge supply
--     onion.secure_random entropy as flavor; fully playable on ESP-NOW firmware.
--
-- Screen module contract (CONTRACTS.md §6):
--   { begin(ctx), update(ctx, dt) -> 'done'|nil, render(ctx) }

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID   = '3.1'
local CHALLENGE_NAME = 'Deep Tunnel Descent'
local TTL_MS         = 180000   -- must match beacon config + server TTL_SECONDS
local WAVES_REQ      = 3

-- Wave taunts (mirrors content layer; kept in Lua so badge shows them even if
-- server intro payload doesn't fit in a single ESP-NOW chunk).
local WAVE_TAUNTS = {
    "3.5 billion gallons per inch of rain. ALL comes here. *water rises*",
    "TARP took 40 years: 109 miles, 3 reservoirs. I'm flooding all of it.",
    "Combined sewer overflow = why Deep Tunnel exists. I'm undoing that now.",
}

-- ── Module state ───────────────────────────────────────────────────────────

local state = {
    phase         = 'intro',    -- intro | combat_active | done
    runner        = nil,        -- combat archetype runner (lazy-built)
    message       = '',
    last_buttons  = nil,
    -- timer
    elapsed_ms    = 0,
    timer_expired = false,
    -- water rise visual (0..WAVES_REQ)
    wave_cleared  = 0,
    -- outcome
    passed        = false,
    outcome_msg   = '',
}

-- ── Helpers ────────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Format remaining seconds as "MM:SS".
local function fmt_timer(remaining_ms)
    local s = math.max(0, math.floor(remaining_ms / 1000))
    return string.format('%02d:%02d', math.floor(s / 60), s % 60)
end

-- Build the combat archetype runner with Deep-Tunnel-specific tuning.
local function make_runner()
    return archetypes.combat(CHALLENGE_ID, {
        enemy_name   = 'THE RISING WATER',
        enemy_max_hp = 60,
        op_max_hp    = 90,
        waves_req    = WAVES_REQ,
        intro_text   =
            "TARP is flooding. 109 miles of tunnel, 300 ft underground. " ..
            "Reach the beacon before the water reaches YOU.",
    })
end

-- ── Render helpers ─────────────────────────────────────────────────────────

-- Draw a water-rise bar at the bottom of the screen.
-- fill_fraction: 0.0 (empty) to 1.0 (full).
local function draw_water_bar(fill_fraction)
    local bar_h = math.floor(fill_fraction * (ui.H - 40))
    if bar_h < 2 then return end
    -- Filled rectangle growing from bottom of usable area
    onion.display_rect(0, ui.H - bar_h, ui.W, bar_h,
        { color = 'black', fill = true, clear = false })
    -- "WATER LVL" label (white on black) — only when bar is tall enough
    if bar_h >= 10 then
        onion.display_text('WATER LVL', 6, ui.H - bar_h + 2,
            { font = 'small', color = 'white', clear = false })
    end
end

-- Draw the countdown timer in the top-right corner.
local function draw_timer(remaining_ms)
    local label = fmt_timer(remaining_ms)
    -- Right-align: each small-font char ≈ 6 px wide
    local x = ui.W - (#label * 6) - 4
    onion.display_text(label, x, 4,
        { font = 'small', color = 'black', clear = false })
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 3.1: begin — Deep Tunnel Descent')
    -- Reset state for a fresh attempt
    state.phase         = 'intro'
    state.elapsed_ms    = 0
    state.timer_expired = false
    state.wave_cleared  = 0
    state.passed        = false
    state.outcome_msg   = ''
    state.runner        = nil

    -- Notify server that the challenge is beginning; get intro content.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        onion.log('3.1 begin error: ' .. err)
        state.message = 'Connection error. Move closer to beacon.'
        return
    end

    -- Use server intro if provided; else fall back to local copy.
    state.message = (resp and resp.intro) or
        "TARP is flooding. 109 miles of tunnel, 300 ft underground. " ..
        "Reach the beacon before the water reaches YOU."
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    if state.phase == 'intro' then
        if pressed == 'select' then
            -- Build runner and enter combat.
            state.runner = make_runner()
            state.runner.begin(ctx)
            state.phase    = 'combat_active'
            state.elapsed_ms = 0
        elseif pressed == 'cancel' then
            return 'done'
        end

    elseif state.phase == 'combat_active' then
        -- Advance the endurance timer.
        state.elapsed_ms = state.elapsed_ms + (dt or 80)

        -- Timer expiry check (server will also expire the session; we mirror it
        -- locally so the badge UI responds without a round-trip).
        if state.elapsed_ms >= TTL_MS and not state.timer_expired then
            state.timer_expired = true
            state.passed        = false
            state.outcome_msg   =
                "Ran out of time. TARP fills fast during storm events. " ..
                "Commit or drown, pal."
            state.phase = 'done'
            return nil
        end

        -- Delegate to combat runner.
        local result = state.runner.update(ctx, dt)
        if result == 'done' then
            -- Runner exited; read last session status from runner state.
            -- The archetype runner sets runner.state.status from the server reply.
            local runner_status = state.runner.last_status or 'won'
            if runner_status == 'won' then
                state.passed      = true
                state.outcome_msg =
                    "You made it. Here's your Sump Pump. " ..
                    "And Fragment 1. Don't say I never taught you anything, champ."
                -- Advance the wave counter visually.
                state.wave_cleared = WAVES_REQ
            else
                state.passed      = false
                state.outcome_msg =
                    "Water got ya. That's what happens when you " ..
                    "disrespect the infrastructure. Try again."
            end
            state.phase = 'done'
        else
            -- Update wave-cleared counter for the water-rise visual.
            if state.runner.current_wave then
                -- wave_cleared = waves fully defeated (enemy_hp hit 0)
                -- runner tracks wave as the roll count; each wave reset = cleared
                state.wave_cleared = math.max(0,
                    (state.runner.current_wave or 1) - 1)
            end
        end

    elseif state.phase == 'done' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

function screen.render(ctx)
    if state.phase == 'intro' then
        -- ── Intro screen ───────────────────────────────────────────────
        onion.clear_display()
        ui.border()
        ui.title('DEEP TUNNEL', 4)
        ui.divider(18)
        onion.display_text('ACT 3 — TARP IS FLOODING', 6, 22,
            { font = 'small', clear = false })
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 6, 34)
        -- Water-rise preview at bottom (small teaser bar)
        draw_water_bar(0.08)
        ui.divider(ui.H - 28)
        onion.display_text('[SELECT] Descend  [CANCEL] Stay Safe', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'combat_active' then
        -- ── Combat screen (delegates to archetype runner + overlays timer) ──
        onion.clear_display()
        state.runner.render(ctx)

        -- Water-rise bar: proportional to waves cleared / total waves.
        -- At wave 0/3 it's a thin bar; at 2/3 it's ominous.
        local fill = (state.wave_cleared / WAVES_REQ) * 0.55 + 0.05
        draw_water_bar(fill)

        -- Countdown timer overlay (top right).
        local remaining = math.max(0, TTL_MS - state.elapsed_ms)
        draw_timer(remaining)

        -- Wave taunt (shown briefly at wave start; reuse runner's message area).
        -- The archetype's combat_hud already shows the DEEPDISH message line;
        -- we add a short "wave N/N" indicator top-left.
        local wave_disp = (state.runner.current_wave or 1)
        onion.display_text(
            'W ' .. wave_disp .. '/' .. WAVES_REQ,
            6, 4,
            { font = 'small', clear = false })

    elseif state.phase == 'done' then
        -- ── Outcome screen ─────────────────────────────────────────────
        onion.clear_display()
        ui.border()
        if state.passed then
            ui.title('SURFACE REACHED', 10)
            ui.divider(24)
        else
            local label = state.timer_expired and 'TIME\'S UP' or 'SUBMERGED'
            ui.title(label, 20)
            ui.divider(24)
        end
        local lines = ui.wrap_text(state.outcome_msg, 38)
        ui.body_text(lines, 6, 32)
        if state.passed then
            onion.display_text('Sump Pump + Fragment 1 unlocked!', 6, ui.H - 26,
                { font = 'small', clear = false })
        end
        ui.divider(ui.H - 18)
        onion.display_text('[SELECT] Continue', 6, ui.H - 14,
            { font = 'small', clear = false })
    end
end

return screen
