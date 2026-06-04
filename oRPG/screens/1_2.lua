-- oRPG/screens/act1-2-substation-reroute.lua
-- Act 1, Challenge 1.2 — Substation Reroute (3-wave combat)
-- SPEC §5 Act 1: ComEd substation under "demand spike" attack.
-- Survive 3 RNG-combat waves to close all 3 breakers and restore the feeder.
--
-- Capability shim behaviour (oRPG/lib/caps.lua):
--   Combat is SERVER-AUTHORITATIVE: the server generates and records every roll
--   (there is no Lua signing primitive on the badge). When caps.secRng is true
--   the badge can supply onion.secure_random entropy as a client-side
--   convenience, but the server remains the source of truth either way.
--   Fully playable on ESP-NOW-only firmware; the fight resolves identically.
--
-- This screen wraps the generic combat archetype from lib/archetypes.lua
-- and adds:
--   • A 3-panel breaker intro (showing the three feeders to restore).
--   • Per-wave breaker-close animation (display a "BREAKER CLOSED" flash).
--   • A lesson splash on success (grid segmentation / cascading failure).

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')

local CHALLENGE_ID = '1.2'

-- Feeder names shown in the HUD header and breaker-close flash.
local FEEDERS = {
    'IRVING PARK FEEDER',
    'ALBANY PARK LOOP',
    'PRIMARY BUS',
}

-- DEEPDISH intro text (static fallback; server sends a richer AI-generated
-- intro via CHALLENGE_INTRO if the Anthropic call succeeds).
local INTRO_TEXT =
    "North Side feeders: TRIPPED. Three breakers, three demand spikes. " ..
    "Survive each wave to close a breaker. I believe in you, champ. " ..
    "Not really, but the legal team said I had to say something nice."

-- ── State ─────────────────────────────────────────────────────────────────

local state = {
    phase            = 'intro',   -- intro | combat | breaker_flash | lesson | done
    runner           = nil,       -- combat archetype runner
    intro_text       = INTRO_TEXT,
    last_buttons     = nil,
    wave             = 0,         -- last wave completed (0 = none yet)
    waves_required   = 3,
    flash_timer      = 0,         -- ms remaining for the breaker-close flash
    won              = false,
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Build or rebuild the combat runner.  We re-build each time the screen is
-- entered so state is fresh; the server keeps the authoritative session.
local function make_runner()
    return archetypes.combat(CHALLENGE_ID, {
        enemy_name   = 'DEMAND SPIKE',
        enemy_max_hp = 100,   -- server sets per-wave HP; this is the display max
        op_max_hp    = 100,
        waves_req    = 3,
        intro_text   = state.intro_text,
    })
end

-- Render the three-breaker status bar at the bottom of the combat HUD.
-- Closed breakers show a filled box; open ones are empty.
local function draw_breaker_bar(wave_completed)
    local y = ui.H - 22
    onion.display_text('BREAKERS:', 6, y, { font = 'small', clear = false })
    for i = 1, 3 do
        local x = 60 + (i - 1) * 22
        if i <= wave_completed then
            -- Closed: solid 14x10 rect
            onion.display_rect(x, y - 1, 14, 10,
                { color = 'black', fill = true, clear = false })
        else
            -- Open: hollow rect
            onion.display_rect(x, y - 1, 14, 10,
                { color = 'black', fill = false, clear = false })
        end
    end
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 1.2: begin')
    state.phase        = 'intro'
    state.runner       = nil
    state.wave         = 0
    state.flash_timer  = 0
    state.won          = false
    state.last_buttons = nil
    state.intro_text   = INTRO_TEXT

    -- Fetch intro from server (may return a richer AI-generated line).
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN,
        { c = CHALLENGE_ID, h = ctx.hardware_id })
    if resp and resp.intro then
        state.intro_text = resp.intro
    elseif err then
        onion.log('1.2: CHALLENGE_BEGIN error: ' .. tostring(err))
    end

    state.runner = make_runner()
    state.runner.begin(ctx)
    state.phase = 'intro'
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── Breaker-close flash (250 ms) ──────────────────────────────────────
    if state.phase == 'breaker_flash' then
        state.flash_timer = state.flash_timer - dt
        if state.flash_timer <= 0 then
            if state.won then
                state.phase = 'lesson'
            else
                -- More waves — resume combat
                state.phase = 'combat'
            end
        end
        return nil
    end

    -- ── Intro ─────────────────────────────────────────────────────────────
    if state.phase == 'intro' then
        if pressed == 'select' then
            state.phase = 'combat'
        elseif pressed == 'cancel' then
            return 'done'
        end
        return nil
    end

    -- ── Combat (delegate to archetype runner) ────────────────────────────
    if state.phase == 'combat' then
        local result = state.runner.update(ctx, dt)

        -- Detect wave completion / session end by inspecting the runner's
        -- internal session (exposed via the COMBAT_ROLL_RESPONSE body it
        -- stores in its state table — we read it via the runner's render).
        -- Simpler approach: check runner status returned from the last roll.
        -- The runner returns 'done' when the fight resolves (won or lost).
        if result == 'done' then
            -- Check the final status from the runner's session field.
            -- The runner sets session.st on the last CombatRollResponseBody.
            local session = state.runner._session  -- may be nil on old firmware
            local st = session and session.st or nil

            if st == 'won' then
                state.won  = true
                state.wave = state.waves_required
                state.flash_timer = 600   -- longer flash for final victory
                state.phase = 'breaker_flash'
            elseif st == 'lost' or st == 'expired' then
                state.won   = false
                state.phase = 'done'
            else
                -- Runner returned 'done' without a clear status — treat as
                -- lost (safe default; player can retry from the intro).
                state.won   = false
                state.phase = 'done'
            end
            return nil
        end

        -- Check if a wave was just completed (enemy HP reached 0 but fight
        -- continues). The runner's session.wave increments each roll; when
        -- enemy_hp resets to max mid-fight a breaker was closed.
        local session = state.runner._session
        if session and session.wave and session.wave > state.wave then
            local newly_closed = session.wave
            -- Only flash if this is a mid-fight wave change (not final win).
            if newly_closed < state.waves_required then
                state.wave        = newly_closed
                state.flash_timer = 250
                state.phase       = 'breaker_flash'
            else
                state.wave = newly_closed
            end
        end

        return nil
    end

    -- ── Lesson splash (post-success) ─────────────────────────────────────
    if state.phase == 'lesson' then
        if pressed == 'select' or pressed == 'cancel' then
            state.phase = 'done'
        end
        return nil
    end

    -- ── Done ──────────────────────────────────────────────────────────────
    if state.phase == 'done' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

function screen.render(ctx)
    onion.clear_display()

    -- ── Intro ─────────────────────────────────────────────────────────────
    if state.phase == 'intro' then
        ui.border()
        ui.title('SUBSTATION REROUTE', 4)
        ui.divider(18)

        -- Show three breaker slots (all open on intro).
        local fy = 22
        for i = 1, 3 do
            onion.display_text(
                '[ ] ' .. FEEDERS[i], 6, fy,
                { font = 'small', clear = false })
            fy = fy + 12
        end

        ui.divider(60)
        local lines = ui.wrap_text(state.intro_text, 36)
        ui.body_text(lines, 6, 64)

        ui.divider(ui.H - 18)
        onion.display_text(
            '[SELECT] Fight  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    -- ── Breaker-close flash ───────────────────────────────────────────────
    elseif state.phase == 'breaker_flash' then
        ui.border()
        ui.title('BREAKER CLOSED', 30)
        -- Show feeder name for the just-closed breaker.
        local feeder = FEEDERS[state.wave] or ('FEEDER ' .. state.wave)
        local cx = math.max(4,
            math.floor((ui.W - #feeder * ui.FONT_SMALL_W) / 2))
        onion.display_text(feeder, cx, 60,
            { font = 'small', clear = false })

        -- Progress bar: filled boxes for closed breakers.
        draw_breaker_bar(state.wave)

    -- ── Active combat ─────────────────────────────────────────────────────
    elseif state.phase == 'combat' then
        -- Delegate to archetype combat renderer, then overlay the breaker bar.
        state.runner.render(ctx)
        draw_breaker_bar(state.wave)

    -- ── Lesson splash (success) ───────────────────────────────────────────
    elseif state.phase == 'lesson' then
        ui.border()
        ui.title('[ ALL BREAKERS CLOSED ]', 8)
        ui.divider(22)
        local lesson_lines = ui.wrap_text(
            'The feeder is live. Grid Credential earned. ' ..
            'Substations step ~138 kV down to ~12 kV for neighborhood ' ..
            'feeders. Each breaker isolates one segment — trip them ' ..
            'all and cascading failure drops the city block by block. ' ..
            'You just stopped that. Nice work, pal.', 38)
        ui.body_text(lesson_lines, 6, 28)
        ui.divider(ui.H - 18)
        onion.display_text('[SELECT] OK', 6, ui.H - 14,
            { font = 'small', clear = false })

    -- ── Done (lost / exit) ────────────────────────────────────────────────
    elseif state.phase == 'done' then
        if state.won then
            ui.splash('Grid Restored', 'Grid Credential unlocked', '[SELECT] OK')
        else
            ui.border()
            ui.title('BLACKOUT', 50)
            local lines = ui.wrap_text(
                'The demand spikes won this round. ' ..
                'The North Side is still dark. Try again, champ.', 38)
            ui.body_text(lines, 6, 80)
            ui.divider(ui.H - 18)
            onion.display_text('[SELECT] Retry  [CANCEL] Leave', 6, ui.H - 14,
                { font = 'small', clear = false })
        end
    end
end

return screen
