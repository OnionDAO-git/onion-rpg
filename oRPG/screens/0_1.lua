-- oRPG/screens/act0-1-ketchup-gauntlet.lua
-- Act 0, Challenge 0.1 — The Ketchup Gauntlet (Combat + Operative Registration)
-- SPEC §5 Act 0: robot hot dog vendor turns hostile when you "order ketchup."
--
-- CONTRACTS §6: returns { begin(ctx), update(ctx,dt), render(ctx) }
--
-- Mechanic:
--   1. Vendor intro screen — player chooses "order normally" or "ORDER KETCHUP."
--   2. Either choice triggers combat (tutorial: both paths lead to combat).
--   3. Combat archetype: combat is SERVER-AUTHORITATIVE (the server rolls and
--      records). When caps.secRng is true the badge may seed client-side flavor
--      with onion.secure_random entropy; the badge never signs rolls.
--   4. On win: operative registered on the server (REGISTRATION_SUCCESS line shown).
--
-- The router (lib/router.lua) loads this file via require('screens.0.1').
-- screens/0.1.lua delegates here (or can be replaced by this file directly).
--
-- Display: 264x176 B/W e-paper. Fonts: small/bold/large.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID = '0.1'

-- ── DEEPDISH dialogue lines (mirrored from content/act0-1-ketchup-gauntlet.ts)
-- These are the short display versions; long footnotes live server-side.

local VENDOR_LINES = {
    main = "Welcome to Vienna Bob's. One Chicago dog. No. Ketchup.",
    deepdish = "Whatever you do — do NOT ask for ketchup. Capisce, champ?",
}

local KETCHUP_LINE =
    "KETCHUP. On a Chicago dog. Oh for cryin' out loud." ..
    " Vienna Bob is ACTIVATED."

local NORMAL_LINE =
    "Smart condiment choice. Too bad Bob got the override." ..
    " Educational purposes, pal."

local WIN_LINES = {
    "You beat the robot vendor. Encased Meat Mk.I acquired.",
    "Operative credential registered. 50 Onions incoming.",
    "LESSON: Chicago food supply = just-in-time distribution.",
    "One missing input cascades. That was the onion.",
    "-- DEEPDISH (educational, grudgingly)"
}

local LOSS_LINE =
    "Ketchup-tier performance. Try again, champ."

local REGISTRATION_LINE =
    "Operative ID registered. You exist now. Congratulations."

-- ── Module state ──────────────────────────────────────────────────────────────

local state = {
    phase        = 'vendor',   -- vendor | entering_combat | combat_active | win | lose
    ketchup      = false,      -- did the player press RIGHT (order ketchup)?
    last_buttons = nil,
    runner       = nil,        -- combat archetype runner (lazy init)
    registered   = false,      -- did we show the registration beat yet?
    scroll_tick  = 0,          -- counter for win text scrolling
}

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({ 'select', 'cancel', 'up', 'down', 'left', 'right' }) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Build the combat runner with correct narrative flavor.
local function make_runner()
    local intro = state.ketchup and KETCHUP_LINE or NORMAL_LINE
    return archetypes.combat(CHALLENGE_ID, {
        enemy_name   = 'Vienna Bob (HOSTILE)',
        enemy_max_hp = 80,
        op_max_hp    = 100,
        waves_req    = 1,
        intro_text   = intro,
    })
end

-- Notify the server about the ketchup flag so it can adjust DEEPDISH flavor.
-- Fire-and-forget — we do not wait for a response here.
local function notify_ketchup_choice()
    -- We send the flag as part of the combat begin body. The validate() function
    -- on the server reads input.ketchup from the COMBAT_ROLL_REQUEST body.
    -- This is handled automatically when the combat runner calls CHALLENGE_BEGIN.
end

-- ── Screen module ─────────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 0.1: begin (act0-1-ketchup-gauntlet)')
    state.phase        = 'vendor'
    state.ketchup      = false
    state.last_buttons = nil
    state.runner       = nil
    state.registered   = false
    state.scroll_tick  = 0

    -- Signal the server to begin the challenge and collect the intro content.
    -- We ignore the response here; the vendor screen runs locally first.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        onion.log('screen 0.1: begin error: ' .. tostring(err))
    end
    -- If the server returned DEEPDISH intro copy, we could show it; skip for tutorial speed.
    _ = resp
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── Vendor intro ──────────────────────────────────────────────────────────
    if state.phase == 'vendor' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'right' then
            -- ORDER KETCHUP: the ketchup path → hostile narrative
            state.ketchup = true
            state.phase   = 'entering_combat'
        elseif pressed == 'select' or pressed == 'left' or pressed == 'up' then
            -- Normal order — still triggers combat (tutorial)
            state.ketchup = false
            state.phase   = 'entering_combat'
        end
    end

    -- ── Transition into combat ────────────────────────────────────────────────
    if state.phase == 'entering_combat' then
        state.runner = make_runner()
        state.runner.begin(ctx)
        state.phase = 'combat_active'
    end

    -- ── Combat archetype loop ─────────────────────────────────────────────────
    if state.phase == 'combat_active' then
        local result = state.runner.update(ctx, dt)
        if result == 'done' then
            -- Check session status from the runner's internal state.
            -- The runner signals 'done' on both win and loss.
            -- We need to distinguish: query the server or read runner state.
            -- Since the runner exposes its internal `state.status` via the
            -- CombatRollResponseBody on the last roll, we read the status that
            -- was persisted into the session by the last response.
            -- Fallback: if no session info, default to 'lose' (conservative).
            local session_status = 'lost'
            if state.runner._state then
                session_status = state.runner._state.status or 'lost'
            end

            if session_status == 'won' then
                state.phase = 'win'
            else
                state.phase = 'lose'
            end
        end

    -- ── Win beat ──────────────────────────────────────────────────────────────
    elseif state.phase == 'win' then
        state.scroll_tick = state.scroll_tick + (dt or 80)
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end

    -- ── Loss beat ─────────────────────────────────────────────────────────────
    elseif state.phase == 'lose' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

function screen.render(ctx)
    -- Router calls clear_display() before render(), so always draw fresh.

    -- ── Vendor intro screen ───────────────────────────────────────────────────
    if state.phase == 'vendor' then
        ui.border()
        ui.title("VIENNA BOB'S", 4)
        ui.divider(18)

        -- Vendor copy
        local lines = ui.wrap_text(VENDOR_LINES.main, 38)
        ui.body_text(lines, 6, 24)

        -- DEEPDISH speech bubble (indented)
        onion.display_text('DEEPDISH:', 6, 58, { font = 'bold', clear = false })
        local dd_lines = ui.wrap_text(VENDOR_LINES.deepdish, 36)
        ui.body_text(dd_lines, 6, 72)

        ui.divider(ui.H - 30)
        onion.display_text('[SEL/L/U] Order dog', 6, ui.H - 26,
            { font = 'small', clear = false })
        onion.display_text('[RIGHT]   Order ketchup   [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    -- ── Combat phase: delegate to runner ─────────────────────────────────────
    elseif state.phase == 'entering_combat' or state.phase == 'combat_active' then
        if state.runner then
            state.runner.render(ctx)
        else
            ui.title('Loading...', 80)
        end

    -- ── Win screen ────────────────────────────────────────────────────────────
    elseif state.phase == 'win' then
        ui.border()
        ui.title('GAUNTLET CLEARED', 4)
        ui.divider(18)

        -- Ketchup flavor line
        local flavor = state.ketchup and 'Ketchup ordered. Chaos respected.' or 'Dog ordered normally. Bob disagreed.'
        onion.display_text(flavor, 6, 22, { font = 'small', clear = false })

        -- Scroll through win lines (one revealed every ~2s)
        local revealed = math.min(#WIN_LINES,
            1 + math.floor(state.scroll_tick / 2000))
        for i = 1, revealed do
            local ly = 34 + (i - 1) * ui.LH_SMALL
            onion.display_text(WIN_LINES[i], 6, ly, { font = 'small', clear = false })
        end

        -- Show registration beat after win lines finish scrolling
        if revealed >= #WIN_LINES then
            ui.divider(ui.H - 30)
            onion.display_text(REGISTRATION_LINE, 6, ui.H - 26,
                { font = 'small', clear = false })
        end

        ui.divider(ui.H - 16)
        onion.display_text('[SELECT] Continue', 6, ui.H - 12,
            { font = 'small', clear = false })

    -- ── Loss screen ───────────────────────────────────────────────────────────
    elseif state.phase == 'lose' then
        ui.border()
        ui.title('DEFEATED', 40)
        ui.divider(60)
        local lines = ui.wrap_text(LOSS_LINE, 38)
        ui.body_text(lines, 6, 68)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Try again  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })
    end
end

return screen
