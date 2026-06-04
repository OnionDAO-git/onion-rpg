-- oRPG/screens/act2-2-sorting-machine.lua
-- Act 2, Challenge 2.2 — The Sorting Machine (Merchant/Buttons)
-- SPEC §5 Act 2: weaponised USPS sorting machine = black-market merchant.
--
-- Mechanic:
--   1. Player sees the three trade tiers (Local/Regional/National) with their
--      Onion payout and sequence length hint.
--   2. Player scrolls to a tier and presses SELECT to begin entering the combo.
--   3. Buttons (UP/DOWN/LEFT/RIGHT/SELECT) are recorded one at a time.
--      The sequence display updates live. CANCEL while entering removes last input.
--   4. When the combo reaches the expected max length the sequence is submitted
--      to the server via MERCHANT_INPUT.
--   5. Server replies with tier/cost verdict (MERCHANT_RESULT body):
--        { passed, message, tier?, lesson? }
--   6. On success: show tier name + routing lesson. On failure: show penalty.
--
-- The generic archetypes.merchant runner handles the low-level sequence capture
-- and network round-trip. This screen adds:
--   a) A tier-selection splash before the combo entry.
--   b) Routing lesson display after each success.
--   c) Locked-state UX when wrong attempts are exhausted.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')

local CHALLENGE_ID = '2.2'

-- ── Tier catalogue (mirrors beacon/challenges/act2-2-sorting-machine.json) ──
-- These are display-only; the server validates the actual sequences.

local TIERS = {
    {
        name     = 'Local Route',
        item     = 'Sorting Sprocket',
        payout   = '30',
        seq_len  = 3,
        hint     = 'ZIP -> carrier route. 3 inputs.',
    },
    {
        name     = 'Regional Hub',
        item     = 'Conveyor Belt Frag',
        payout   = '60',
        seq_len  = 4,
        hint     = "ZIP+4 -> SCF (O'Hare). 4 inputs.",
    },
    {
        name     = 'Bridge Override Kit',
        item     = 'Bridge Override Schematic',
        payout   = '110',
        seq_len  = 5,
        hint     = 'NDC dispatch. 5 inputs.',
    },
}

-- ── Module state ──────────────────────────────────────────────────────────

local state = {
    phase         = 'intro',    -- intro | tier_select | entering | waiting | result | lesson | done
    message       = '',         -- last server message / error
    lesson        = '',         -- routing lesson text from successful trade
    selected_tier = 1,          -- currently highlighted tier (1-3)
    sequence      = {},         -- buttons entered so far during combo entry
    last_buttons  = nil,
    passed        = false,
    locked        = false,       -- machine locked due to too many wrong attempts
}

-- ── Helpers ────────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select', 'cancel', 'up', 'down', 'left', 'right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Short labels for the sequence display.
local BTN_LABELS = { up='U', down='D', left='L', right='R', select='SEL', cancel='X' }

local function seq_str()
    local parts = {}
    for _, b in ipairs(state.sequence) do
        parts[#parts + 1] = (BTN_LABELS[b] or b)
    end
    return table.concat(parts, '-')
end

-- Submit the current sequence to the server and update state from the reply.
local function submit_sequence()
    state.phase = 'waiting'
    local resp, err = net.request(proto.MsgType.MERCHANT_INPUT, {
        c   = CHALLENGE_ID,
        seq = state.sequence,
    }, 12000)

    if err then
        state.message = 'Network error: ' .. err
        state.phase   = 'result'
        return
    end

    state.passed  = resp and resp.passed or false
    state.message = (resp and resp.message) or (state.passed and 'Trade accepted!' or 'Wrong sequence.')
    state.lesson  = (resp and resp.lesson)  or ''

    -- Server signals machine locked via a specific message pattern.
    if state.message and state.message:find('locked', 1, true) then
        state.locked = true
    end

    if state.passed and state.lesson ~= '' then
        state.phase = 'lesson'
    else
        state.phase = 'result'
    end
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 2.2: begin (sorting machine)')
    -- Reset state for a fresh session.
    state.phase         = 'intro'
    state.message       = ''
    state.lesson        = ''
    state.selected_tier = 1
    state.sequence      = {}
    state.last_buttons  = nil
    state.passed        = false
    state.locked        = false

    -- Signal the server to begin this challenge.
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        state.message = 'Begin error: ' .. err
        return
    end
    -- Server intro text (DEEPDISH taunts) shown in the intro phase.
    if resp and resp.intro then
        state.message = resp.intro
    end
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── Intro: show DEEPDISH cold open; any button proceeds ───────────
    if state.phase == 'intro' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'select' or pressed == 'down' or pressed == 'up' then
            state.phase = 'tier_select'
        end

    -- ── Tier select: scroll tiers with UP/DOWN, SELECT to enter combo ──
    elseif state.phase == 'tier_select' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'up' then
            state.selected_tier = math.max(1, state.selected_tier - 1)
        elseif pressed == 'down' then
            state.selected_tier = math.min(#TIERS, state.selected_tier + 1)
        elseif pressed == 'select' then
            if state.locked then
                state.message = 'Machine locked. Too many misroutes.'
                state.phase   = 'result'
            else
                -- Start entering the combo for this tier.
                state.sequence = {}
                state.phase    = 'entering'
            end
        end

    -- ── Entering combo: record each button press ────────────────────────
    elseif state.phase == 'entering' then
        local tier = TIERS[state.selected_tier]
        if pressed == 'cancel' then
            -- Remove last input (backspace) or leave if sequence is empty.
            if #state.sequence > 0 then
                state.sequence[#state.sequence] = nil
            else
                state.phase = 'tier_select'
            end
        elseif pressed then
            state.sequence[#state.sequence + 1] = pressed
            -- Auto-submit when the sequence reaches the tier's expected length.
            if #state.sequence >= tier.seq_len then
                submit_sequence()
            end
        end

    -- ── Waiting: network round-trip in progress (no input) ─────────────
    elseif state.phase == 'waiting' then
        -- no input; submit_sequence() drives the transition

    -- ── Result: show verdict; SELECT/CANCEL to continue ────────────────
    elseif state.phase == 'result' then
        if pressed == 'select' or pressed == 'cancel' then
            if state.locked or (pressed == 'cancel' and not state.passed) then
                return 'done'
            elseif state.passed then
                state.phase = 'tier_select'  -- can attempt another tier
            else
                state.sequence = {}
                state.phase    = 'entering'  -- retry the same tier
            end
        end

    -- ── Lesson: display routing education text after a successful trade ─
    elseif state.phase == 'lesson' then
        if pressed == 'select' or pressed == 'cancel' then
            state.phase = 'tier_select'  -- back to tier menu after reading
        end

    -- ── Done: final splash ──────────────────────────────────────────────
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
        -- DEEPDISH cold open splash
        ui.title('USPS SORTING', 6)
        ui.divider(20)
        local intro = state.message ~= '' and state.message
            or "Enter routing sequences to trade for parts. Wrong codes cost Onions."
        local lines = ui.wrap_text(intro, 38)
        ui.body_text(lines, 6, 26)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Enter  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'tier_select' then
        -- Trade tier menu
        ui.title('=[ SORTING MACHINE ]=', 4)
        local bal = (ctx.operative and ctx.operative.onions) or '?'
        onion.display_text('O:' .. tostring(bal), ui.W - 40, 4,
            { font = 'small', clear = false })
        ui.divider(18)

        for i, tier in ipairs(TIERS) do
            local iy  = 22 + (i - 1) * 22
            local pre = (i == state.selected_tier) and '> ' or '  '
            local row = string.format('%s%-20s +%sO', pre, tier.name, tier.payout)
            local fn  = (i == state.selected_tier) and 'bold' or 'small'
            onion.display_text(row, 4, iy, { font = fn, clear = false })
        end

        -- Show hint for selected tier
        local hint_y = 22 + #TIERS * 22
        local sel_hint = TIERS[state.selected_tier].hint
        ui.divider(hint_y)
        onion.display_text(sel_hint, 6, hint_y + 4, { font = 'small', clear = false })

        ui.divider(ui.H - 20)
        onion.display_text('[UP/DN] Scroll  [SEL] Trade  [CANCEL] Leave', 4, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'entering' then
        -- Live combo entry display
        local tier = TIERS[state.selected_tier]
        ui.title(tier.name:upper(), 6)
        ui.divider(20)
        onion.display_text(tier.hint, 6, 26, { font = 'small', clear = false })
        onion.display_text(
            string.format('Sequence (%d/%d):', #state.sequence, tier.seq_len),
            6, 46, { font = 'small', clear = false })

        -- Draw the entered buttons as a large-font string
        local display_seq = seq_str()
        if display_seq == '' then display_seq = '---' end
        ui.title(display_seq, 70)

        ui.divider(ui.H - 30)
        onion.display_text('[U/D/L/R/SEL] Input  [CANCEL] Backspace', 4, ui.H - 26,
            { font = 'small', clear = false })
        onion.display_text('[CANCEL when empty] Back', 4, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'waiting' then
        ui.title('PROCESSING...', 70)
        onion.display_text('Routing sequence submitted.', 6, 96,
            { font = 'small', clear = false })

    elseif state.phase == 'result' then
        local icon = state.passed and '[ TRADE OK ]' or '[ MISROUTE ]'
        ui.title(icon, 20)
        ui.divider(36)
        local lines = ui.wrap_text(state.message, 40)
        ui.body_text(lines, 6, 42)
        ui.divider(ui.H - 20)
        local hint = state.locked
            and '[CANCEL] Leave'
            or (state.passed and '[SEL] More trades  [CANCEL] Leave'
                             or '[SEL] Retry  [CANCEL] Leave')
        onion.display_text(hint, 6, ui.H - 14, { font = 'small', clear = false })

    elseif state.phase == 'lesson' then
        -- Routing lesson after a successful trade
        ui.title('ROUTING LESSON', 6)
        ui.divider(20)
        local lines = ui.wrap_text(state.lesson, 38)
        ui.body_text(lines, 6, 26)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Got it', 6, ui.H - 14, { font = 'small', clear = false })

    elseif state.phase == 'done' then
        ui.splash('Sort\nComplete', 'Parts acquired', '[SELECT] OK')
    end
end

return screen
