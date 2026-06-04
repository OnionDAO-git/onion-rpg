-- oRPG/screens/1.1-malort-fountains.lua
-- Act 1, Challenge 1.1 — Malört Fountains (Dialogue / Voice)
-- SPEC §5 Act 1.1: Water Reclamation NPC at a fountain beacon.
--
-- Mechanic: speak the five water-treatment stages in order —
--   intake → crib → tunnel → Jardine plant → distribution grid
-- Get it wrong: the fountain burps Malört.
-- Get it right: Water Main Key + 80 Onions.
--
-- Uses the dialogue archetype from lib/archetypes.lua with a custom
-- intro screen that explains the challenge in DEEPDISH voice and shows
-- a visual fountain + stage hints before the player presses SELECT to
-- record their voice sequence.
--
-- Capability paths (handled inside archetypes.dialogue):
--   caps.voice == true  → badge captures audio energy via the Sound-module PDM
--                          mic (onion.sound_mic_begin/sound_mic_level/sound_mic_end);
--                          server-side STT does the actual matching.
--   caps.voice == false → beacon captures + uploads out-of-band (ESP-NOW relay)
-- Both paths send VOICE_CAPTURE_SUBMIT and receive VOICE_RESULT / CHALLENGE_RESULT.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID   = '1.1'
local CHALLENGE_NAME = 'Malört Fountains'

-- ── Dialogue archetype runner (created once in begin, driven in update/render)

local runner = nil

-- ── Local state ───────────────────────────────────────────────────────────

local state = {
    phase        = 'deepdish_intro',  -- deepdish_intro | challenge | done
    last_buttons = nil,
    intro_text   = nil,    -- DEEPDISH intro fetched from server
    scroll       = 0,      -- intro text scroll offset (lines)
    result_text  = nil,    -- final pass/fail message
    passed       = false,
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Draw the fountain ASCII art (a tiny B/W glyph that fits the e-paper).
-- The fountain "drips" Malört in the intro phase.
local function draw_fountain(y_offset, malort)
    local W = ui.W
    local cx = math.floor(W / 2)
    -- basin
    onion.display_rect(cx - 20, y_offset + 28, 40, 6, { color = 'black', fill = false, clear = false })
    -- spout column
    onion.display_rect(cx - 2, y_offset + 4, 4, 24, { color = 'black', fill = true, clear = false })
    -- spray lines (top)
    onion.display_rect(cx - 8, y_offset, 2, 6, { color = 'black', fill = true, clear = false })
    onion.display_rect(cx + 6, y_offset, 2, 6, { color = 'black', fill = true, clear = false })
    onion.display_rect(cx - 1, y_offset - 2, 2, 4, { color = 'black', fill = true, clear = false })
    -- label
    local lbl = malort and '~~ MALÖRT ~~' or '~~ H2O ~~'
    local lx  = cx - math.floor(#lbl * ui.FONT_SMALL_W / 2)
    onion.display_text(lbl, lx, y_offset + 36, { font = 'small', clear = false })
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

-- begin(ctx): send CHALLENGE_BEGIN and fetch the DEEPDISH intro.
function screen.begin(ctx)
    onion.log('screen 1.1: begin')

    -- Reset state
    state.phase       = 'deepdish_intro'
    state.last_buttons = nil
    state.intro_text   = nil
    state.scroll       = 0
    state.result_text  = nil
    state.passed       = false
    runner             = nil

    -- Signal server; it responds with CHALLENGE_INTRO { intro, npcGreeting, ... }
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        onion.log('1.1 begin error: ' .. err)
        state.intro_text = "DEEPDISH: Malört Fountains.\nSpeak the treatment sequence.\n(Network error — local prompt.)"
    elseif resp and resp.intro then
        state.intro_text = resp.intro
    else
        -- Fallback static intro (server may return a generic OK for begin)
        state.intro_text =
            "DEEPDISH: Thirsty, champ?\n" ..
            "That's Malört, straight from\n" ..
            "the tap. Name all five stages\n" ..
            "of Chicago water treatment\n" ..
            "to get clean water back.\n" ..
            "[Lesson: intake→crib→tunnel\n" ..
            "→Jardine plant→grid]"
    end

    -- Build the dialogue archetype runner for the voice phase.
    -- The prompt text is shown during voice capture.
    runner = archetypes.dialogue(CHALLENGE_ID, {
        prompt_text  =
            "Speak the 5 stages:\n" ..
            "intake → crib → tunnel\n" ..
            "→ Jardine plant → grid\n" ..
            "\n[SELECT] to record"  ..
            (caps.voice and "" or "\n(Beacon will capture)"),
        success_text = "Water Main Key unlocked!\nFountains run clean again.",
        fail_text    = "Fountain burps Malört.\n[SELECT] Retry",
    })
end

-- update(ctx, dt): phase machine; returns 'done' when the player exits.
function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    if state.phase == 'deepdish_intro' then
        -- Show the DEEPDISH intro; UP/DOWN scroll long text;
        -- SELECT advances to the voice challenge; CANCEL leaves.
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'up' then
            state.scroll = math.max(0, state.scroll - 1)
        elseif pressed == 'down' then
            state.scroll = state.scroll + 1
        elseif pressed == 'select' then
            -- Hand off to the dialogue archetype runner
            state.phase = 'challenge'
            runner.begin(ctx)
        end

    elseif state.phase == 'challenge' then
        -- The dialogue archetype owns update for this phase.
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

-- render(ctx): draw the current frame.
-- The router guarantees onion.clear_display() was called before us.
function screen.render(ctx)
    if state.phase == 'deepdish_intro' then
        ui.border()

        -- Title bar
        ui.title('MALÖRT FOUNTAINS', 4)
        ui.divider(18)

        -- Fountain glyph (right-side, malort mode)
        draw_fountain(20, true)

        -- Scrollable intro text (left side, 19 chars wide to avoid the glyph)
        if state.intro_text then
            local lines = ui.wrap_text(state.intro_text, 18)
            -- apply scroll offset
            local start = state.scroll + 1
            local max_lines = 6
            for i = start, math.min(#lines, start + max_lines - 1) do
                local y = 22 + (i - start) * 12
                onion.display_text(lines[i], 4, y, { font = 'small', clear = false })
            end
            -- scroll indicator
            if #lines > max_lines then
                local scroll_hint = 'v' .. (state.scroll + 1) .. '/' .. math.max(1, #lines - max_lines + 1)
                onion.display_text(scroll_hint, 4, ui.H - 26, { font = 'small', clear = false })
            end
        end

        ui.divider(ui.H - 18)
        onion.display_text('[SEL] Begin  [U/D] Scroll  [CANCEL] Leave',
            4, ui.H - 14, { font = 'small', clear = false })

    elseif state.phase == 'challenge' then
        -- Delegate entirely to the dialogue archetype
        runner.render(ctx)

    elseif state.phase == 'done' then
        ui.border()
        -- Show the clean fountain if the player passed; Malört otherwise.
        -- We infer pass/fail from whether water_main_key is now in operative inventory.
        -- The archetype's result_text already contains the verdict message from server.
        ui.title('MALÖRT FOUNTAINS', 20)
        ui.divider(38)
        draw_fountain(40, false)  -- always show clean water on done screen
        onion.display_text('Fountain restored.', 4, 88,
            { font = 'small', clear = false })
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Continue', 4, ui.H - 14,
            { font = 'small', clear = false })
    end
end

return screen
