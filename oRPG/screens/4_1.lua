-- oRPG/screens/4.1-server-room.lua
-- Act 4, Challenge 4.1 — The Server Room (Boss Combat)
-- SPEC §5 Act 4: Physical data-center facility where DEEPDISH runs.
--
-- Uses the combat archetype from lib/archetypes.lua with boss-tier parameters.
-- Adds:
--   • Credential pre-check screen (gate_denied phase) before entering combat.
--   • Post-victory "console unlock" splash that bridges to challenge 4.2.
--
-- Combat model:
--   Combat is SERVER-AUTHORITATIVE. The server generates and records every roll
--   and the boss kill; there is NO Lua signing primitive on the badge (the
--   secure element can't do Ed25519 and the Solana key isn't exposed to
--   scripts), so caps.seAttest is always false. The archetypes combat runner
--   may seed client-side flavor with onion.secure_random when caps.secRng is
--   true, but the server stays the source of truth. No voice / sub-GHz needed.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID   = '4.1'
local CHALLENGE_NAME = 'The Server Room'

-- Required credentials (must match server-side impl).
local REQUIRED_CREDS = {
    'grid_credential',
    'dispatch_credential',
    'city_it_keycard',
}

-- Boss combat parameters (mirror 4.1-server-room.json).
local BOSS_OPTS = {
    enemy_name   = 'DEEPDISH Watchdog v1.0',
    enemy_max_hp = 150,
    op_max_hp    = 120,
    waves_req    = 3,
    intro_text   =
        "Welcome to my data center, champ.\n" ..
        "Three watchdog processes stand between\n" ..
        "you and the prompt console.\n" ..
        "Power. Cooling. Redundancy. Fiber.\n" ..
        "You won't make it past wave one.",
}

-- ── Module state ──────────────────────────────────────────────────────────

local state = {
    -- 'check_creds' -> 'intro' -> 'combat_active' -> 'victory' | 'defeat' | 'done'
    phase         = 'check_creds',
    runner        = nil,   -- combat archetype runner
    message       = '',
    final_verified = false, -- did the signed-kill land on wave 3?
    last_buttons  = nil,
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Checks whether the operative's inventory (from ctx.operative.inventory or a
-- server query) holds all three required credentials.
-- We rely on the server to enforce the gate; this is a UX hint only.
local function has_all_creds(ctx)
    -- ctx.operative.inventory is populated by the oRPG loader from the
    -- IDENTIFY_ACK / PROGRESSION_STATE frame.  If not available, assume ok
    -- (server will deny anyway).
    local inv = ctx.operative and ctx.operative.inventory
    if not inv then return true end  -- can't check locally; trust server
    local inv_set = {}
    for _, cid in ipairs(inv) do inv_set[cid] = true end
    for _, req in ipairs(REQUIRED_CREDS) do
        if not inv_set[req] then return false end
    end
    return true
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 4.1: begin  secRng=' .. tostring(caps.secRng))

    state.phase         = 'check_creds'
    state.runner        = nil
    state.message       = ''
    state.final_verified = false
    state.last_buttons  = nil

    -- Credential pre-check (local, best-effort — server is authoritative).
    if not has_all_creds(ctx) then
        state.phase   = 'gate_denied'
        state.message =
            "Grid Credential, Dispatch Credential,\n" ..
            "City IT Keycard — you need ALL THREE.\n" ..
            "Go earn them, champ."
        return
    end

    -- Notify server of begin; collect intro content.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        state.message = 'Server error: ' .. err
        state.phase   = 'gate_denied'
        return
    end

    -- Server may return a denied message if credentials are missing.
    if resp and resp.denied then
        state.message = resp.message or "Access denied. Earn your credentials."
        state.phase   = 'gate_denied'
        return
    end

    -- Build the boss combat runner.
    state.runner = archetypes.combat(CHALLENGE_ID, BOSS_OPTS)
    state.runner.begin(ctx)
    state.phase = 'combat_active'
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    if state.phase == 'gate_denied' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end

    elseif state.phase == 'combat_active' then
        local result = state.runner.update(ctx, dt)
        if result == 'done' then
            -- Combat finished.  Check the session result via the last COMBAT_ROLL_RESPONSE
            -- stored in the runner's session field.  We detect status from the runner's
            -- internal state (the archetype exposes session.st via the last server reply).
            local session = state.runner and state.runner._session
            if session then
                state.final_verified = session.finalVerified or false
                if session.st == 'won' then
                    state.phase = 'victory'
                elseif session.st == 'lost' or session.st == 'expired' then
                    state.phase = 'defeat'
                    state.message =
                        "The watchdog processes won this round.\n" ..
                        "Educational footnote: data centers run on\n" ..
                        "redundancy. You should try it."
                else
                    state.phase = 'done'
                end
            else
                -- No session info — treat as done.
                state.phase = 'done'
            end
        end

    elseif state.phase == 'victory' then
        if pressed == 'select' or pressed == 'cancel' then
            -- Transition to the console-unlock splash before exiting.
            state.phase = 'console_unlock'
        end

    elseif state.phase == 'console_unlock' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end

    elseif state.phase == 'defeat' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end

    elseif state.phase == 'done' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

function screen.render(ctx)
    onion.clear_display()

    if state.phase == 'gate_denied' then
        ui.border()
        ui.title('ACCESS DENIED', 20)
        ui.divider(36)
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 6, 44)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'combat_active' then
        -- Delegate all rendering to the combat archetype runner.
        state.runner.render(ctx)

    elseif state.phase == 'victory' then
        ui.border()
        -- Banner line
        ui.title('SERVER ROOM CLEARED', 4)
        ui.divider(18)
        -- Kill is recorded by the server (combat is server-authoritative;
        -- the badge does not sign rolls).
        onion.display_text('KILL LOGGED (server-verified)', 6, 24,
            { font = 'small', clear = false })
        ui.divider(34)
        local lines = ui.wrap_text(
            "The watchdogs are down, champ. " ..
            "Console access unlocked. " ..
            "Proceed to the prompt.", 38)
        ui.body_text(lines, 6, 40)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Console', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'console_unlock' then
        ui.border()
        ui.title('DEEPDISH CONSOLE', 4)
        ui.divider(18)
        local lines = ui.wrap_text(
            "Fragment slots: 1/4 ... 2/4 ... 3/4 ... 4/4.\n" ..
            "Awaiting prompt reassembly.\n" ..
            "Proceed to Challenge 4.2.", 38)
        ui.body_text(lines, 6, 26)
        ui.divider(ui.H - 28)
        onion.display_text('prompt_console_access: GRANTED', 6, ui.H - 22,
            { font = 'small', clear = false })
        onion.display_text('[SELECT] Continue', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'defeat' then
        ui.border()
        ui.title('SYSTEM OVERLOAD', 20)
        ui.divider(36)
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 6, 44)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Retry later', 6, ui.H - 14,
            { font = 'small', clear = false })

    else
        -- Generic done splash.
        ui.splash(CHALLENGE_NAME, 'Challenge ended.', '[SELECT] OK')
    end
end

return screen
