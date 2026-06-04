-- oRPG/screens/act1-3-river-ran-backwards.lua
-- Act 1, Challenge 1.3 — The River Ran Backwards (NPC/AI)
-- SPEC §5 Act 1: Old Ike, a ghost civil-engineer from 1900, quizzes the
-- operative on WHY Chicago reversed the Chicago River (hint: sewage +
-- Lake Michigan drinking water). DEEPDISH judges comprehension via the AI.
--
-- Uses the NPC archetype runner from lib/archetypes.lua with challenge-
-- specific choices and a custom intro screen before handing off to the
-- archetype. No special hardware primitives needed for NPC type.
--
-- Capability shim usage:
--   caps.http  → send NPC_DIALOGUE_TURN directly to server (no beacon relay)
--   (baseline) → route through beacon relay via ESP-NOW as normal
-- The NPC archetype handles both paths transparently via net.request().

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')

local CHALLENGE_ID   = '1.3'
local CHALLENGE_NAME = 'The River Ran Backwards'

-- ── Answer choices surfaced in the badge scroll menu ─────────────────────
-- DEEPDISH judges comprehension — paraphrases and sideways angles that show
-- the sewage-to-drinking-water connection all pass. Rote "flooding" answers fail.

local CHOICES = {
    -- Correct: various framings of the sewage / Lake Michigan connection
    "Sewage was poisoning the Lake Michigan water supply.",
    "To keep waste out of the lake -- it was our drinking water.",
    "Typhoid from river filth was killing people; reverse it away from the lake.",
    "The Sanitary District reversed it so filth flowed away, not into the lake.",
    -- Partial credit / sideways (AI may pass with good framing)
    "Chicago drew water from Lake Michigan and needed to protect it.",
    "The water intake cribs were being contaminated by river sewage.",
    -- Probably wrong (AI decides; listed last so player scrolls past correct ones)
    "To improve river navigation and shipping.",
    "To prevent flooding in downtown Chicago.",
    "I'm not certain -- something about the lake.",
}

-- ── NPC archetype runner ──────────────────────────────────────────────────

local runner = archetypes.npc(CHALLENGE_ID, {
    npc_name = "Old Ike",
    greeting = "Hrmph. Another one. Fine.\n" ..
               "Tell me: WHY did Chicago reverse\n" ..
               "the river in 1900?\n" ..
               "Don't say flooding. I will walk\n" ..
               "into the river myself.",
    choices  = CHOICES,
})

-- ── Screen-level state (wraps the archetype) ──────────────────────────────

local state = {
    phase        = 'intro',   -- intro | npc | done
    last_buttons = nil,
}

-- Edge-detection helper.
local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 1.3: begin')
    state.phase       = 'intro'
    state.last_buttons = nil
    -- Do NOT call runner.begin here yet; wait until the player confirms intro.
    -- Signal the server so it knows this operative has reached the beacon.
    net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    if state.phase == 'intro' then
        -- Show DEEPDISH's taunting intro; player presses SELECT to proceed.
        if pressed == 'select' then
            -- Transition into the NPC archetype.
            runner.begin(ctx)
            state.phase = 'npc'
        elseif pressed == 'cancel' then
            return 'done'
        end

    elseif state.phase == 'npc' then
        local result = runner.update(ctx, dt)
        if result == 'done' then
            state.phase = 'done'
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
        -- DEEPDISH intro screen before the NPC dialogue starts.
        onion.clear_display()
        ui.border()
        ui.title('ACT 1 — 1.3', 4)
        ui.divider(18)

        onion.display_text('DEEPDISH says:', 6, 24,
            { font = 'small', clear = false })

        local intro_text =
            "There's an old engineer by the river.\n" ..
            "He won't help 'til you prove you know\n" ..
            "WHY Chicago reversed the river in 1900.\n" ..
            "Most people can't. Can you, champ?"

        local lines = ui.wrap_text(intro_text, 38)
        ui.body_text(lines, 6, 36)

        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Talk to Old Ike', 6, ui.H - 18,
            { font = 'small', clear = false })
        onion.display_text('[CANCEL] Leave', 6, ui.H - 8,
            { font = 'small', clear = false })

    elseif state.phase == 'npc' then
        -- Delegate fully to the NPC archetype renderer.
        runner.render(ctx)

    elseif state.phase == 'done' then
        onion.clear_display()
        ui.border()
        ui.title('Old Ike nods.', 20)
        ui.divider(36)

        local result_text =
            "Reversal Map acquired.\n" ..
            "'Now you know how the city\n" ..
            "keeps its water clean, champ.'"
        local lines = ui.wrap_text(result_text, 38)
        ui.body_text(lines, 6, 44)

        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Continue', 6, ui.H - 14,
            { font = 'small', clear = false })
    end
end

return screen
