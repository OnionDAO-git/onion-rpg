-- oRPG/screens/_template.lua
-- Challenge screen template. Copy this file, rename it to <challengeId>.lua
-- (e.g. 0.1.lua, 1.1.lua), and fill in the marked sections.
--
-- SCREEN MODULE CONTRACT (from CONTRACTS.md §6):
--   begin(ctx)           called once when the screen is pushed onto the router
--   update(ctx, dt)      called every loop tick; return 'done' to exit screen
--   render(ctx)          draws the current frame to the 264x176 e-paper
--
-- The `ctx` table provided by oRPG.lua contains:
--   ctx.hardware_id  : string  — badge hardware id
--   ctx.onion_id     : number? — linked Onion DAO user id
--   ctx.operative    : table?  — { act, hp, max_hp, onions, callsign }
--   ctx.net          : lib/net module (send ESP-NOW requests)
--   ctx.ui           : lib/ui module  (e-paper draw helpers)
--   ctx.caps         : lib/caps table (feature flags)
--   ctx.challenge_id : string  — the challenge this screen handles
--
-- For a fully worked example see screens/0.1.lua (Ketchup Gauntlet, combat).
-- For generic archetype runners see lib/archetypes.lua.

-- ── CONFIGURATION (edit these) ────────────────────────────────────────────

local CHALLENGE_ID = 'X.X'        -- TODO: replace with real challengeId
local CHALLENGE_NAME = 'My Challenge'

-- ── Dependencies ─────────────────────────────────────────────────────────

local ui   = require('lib.ui')
local net  = require('lib.net')
local proto = require('lib.proto')

-- ── State ─────────────────────────────────────────────────────────────────
-- Declare all mutable state local to this module.

local state = {
    phase        = 'intro',   -- screens should define their own phase machine
    message      = '',
    last_buttons = nil,
    -- TODO: add challenge-specific fields here
}

-- ── Internal helpers ──────────────────────────────────────────────────────

-- Returns the first button pressed this tick (edge detection).
local function pressed_button(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

-- begin(ctx): Called once when the screen is entered.
-- Use this to send CHALLENGE_BEGIN and fetch any intro content from the server.
function screen.begin(ctx)
    onion.log('screen ' .. CHALLENGE_ID .. ': begin')

    -- Signal the server to begin this challenge for the operative.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        state.message = 'Begin error: ' .. err
        return
    end

    -- TODO: read server intro content from resp and update state.
    state.message = (resp and resp.intro) or ('Welcome to ' .. CHALLENGE_NAME)
    state.phase   = 'intro'
end

-- update(ctx, dt): Called every loop tick (~80 ms).
-- dt is milliseconds since last call.
-- Return 'done' to signal the router to pop this screen.
function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = pressed_button(buttons, state.last_buttons)
    state.last_buttons = buttons

    if state.phase == 'intro' then
        -- TODO: show intro, wait for SELECT to proceed or CANCEL to leave.
        if pressed == 'select' then
            state.phase = 'active'
        elseif pressed == 'cancel' then
            return 'done'
        end

    elseif state.phase == 'active' then
        -- TODO: implement your challenge input logic here.
        -- When challenge is resolved:
        --   state.phase = 'done'

        if pressed == 'cancel' then return 'done' end

    elseif state.phase == 'done' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

-- render(ctx): Called every loop tick after update().
-- The router calls onion.clear_display() before this, so always draw fresh.
function screen.render(ctx)
    ui.border()

    if state.phase == 'intro' then
        -- TODO: draw your intro screen.
        ui.title(CHALLENGE_NAME, 20)
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 8, 50)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Begin  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'active' then
        -- TODO: draw your active challenge UI.
        ui.title(CHALLENGE_NAME, 6)
        ui.divider(20)
        onion.display_text(state.message, 6, 30, { font = 'small', clear = false })

    elseif state.phase == 'done' then
        ui.splash('Challenge\nComplete!', CHALLENGE_ID, '[SELECT] OK')
    end
end

return screen
