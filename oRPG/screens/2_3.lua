-- oRPG/screens/act2-3-bascule-standoff.lua
-- Act 2, Challenge 2.3 — Bascule Standoff (Voice + Combat)
-- SPEC §5: Voice the lowering sequence (uses Reversal Map from 1.3),
--          then short RNG combat as the Bridge Tender construct resists.
--
-- Two-phase flow:
--   Phase 1 — VOICE:  operative speaks the four-step lowering sequence.
--             On success (server flag 2.3:voice_cleared), transition to combat.
--   Phase 2 — COMBAT: one RNG wave vs Bridge Tender Construct.
--
-- Capability shim:
--   caps.voice   -> on-badge Sound-module PDM mic (onion.sound_mic_begin/
--                   sound_mic_level/sound_mic_end). The badge has no on-device
--                   STT, so it captures audio energy (rms/peak) to confirm the
--                   operative spoke; server-side STT does the actual matching.
--                   Fallback: beacon mic captures + uploads out-of-band.
--   Combat is SERVER-AUTHORITATIVE (the server rolls and records); the badge
--   never signs rolls. caps.secRng only seeds optional client-side flavor.
--
-- CONTRACTS §6: screen returns { begin, update, render } to the router.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local MT = proto.MsgType

local CHALLENGE_ID  = '2.3'
local CHALLENGE_NAME = 'Bascule Standoff'

-- ── Module-level state ────────────────────────────────────────────────────

local state = {
    phase        = 'intro',  -- intro | voice_prompt | listening | voice_wait |
                             --   voice_fail | voice_pass | combat_active | done
    message      = '',
    last_buttons = nil,
    attempt_id   = nil,      -- returned by server on CHALLENGE_BEGIN
    voice_passed = false,
    combat_runner = nil,     -- combat archetype runner (created after voice pass)
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({ 'select', 'cancel', 'up', 'down', 'left', 'right' }) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

local function draw_waiting(label)
    onion.clear_display()
    ui.title('Please wait...', 70)
    local lx = math.max(4, math.floor((ui.W - #label * 6) / 2))
    onion.display_text(label, lx, 96, { font = 'small', clear = false })
end

-- ── Voice submission ──────────────────────────────────────────────────────

-- Capture a short window of audio energy via the Sound-module PDM mic. The
-- badge has no on-device STT, so we return only a rough { rms, peak } summary
-- that lets the server confirm the operative actually spoke; server-side STT
-- does the real matching. Sub-GHz and Sound share the side port, so we always
-- close the mic with sound_mic_end before returning.
local function capture_voice_energy(ms)
    if not caps.voice then return nil end
    local ok = onion.sound_mic_begin({ sample_rate = 16000 })
    if not ok then return nil end
    -- sound_mic_level samples for up to `ms` (max 1000 per call) and returns
    -- { rms, peak, samples }. Average a few windows over the speak window.
    local total_rms, total_peak, n = 0, 0, 0
    local remaining = ms or 3000
    while remaining > 0 do
        local slice = math.min(remaining, 1000)
        local lvl = onion.sound_mic_level(slice)
        if lvl then
            total_rms = total_rms + (lvl.rms or 0)
            if (lvl.peak or 0) > total_peak then total_peak = lvl.peak end
            n = n + 1
        end
        remaining = remaining - slice
    end
    onion.sound_mic_end()
    if n == 0 then return nil end
    return { rms = math.floor(total_rms / n), peak = total_peak }
end

-- submit_voice(transcript, ref, energy): sends VOICE_CAPTURE_SUBMIT to the
-- server, handles the response, and advances state.phase accordingly.
local function submit_voice(transcript, ref, energy)
    state.phase = 'voice_wait'
    local body = {
        c   = CHALLENGE_ID,
        t   = transcript,
        ref = ref,
        v   = energy,   -- { rms, peak } when an on-badge mic was used
    }
    local resp, err = net.request(MT.VOICE_CAPTURE_SUBMIT, body, 15000)
    if err then
        state.message = 'Network error: ' .. err
        state.phase   = 'voice_fail'
        return
    end

    -- Server returns VOICE_RESULT body: { passed, continued, message, flags? }
    if resp and resp.passed == false and resp.continued then
        -- voice cleared: move to combat
        -- (server sets 2.3:voice_cleared flag server-side; badge just trusts resp)
        if resp.flags and resp.flags['2.3:voice_cleared'] then
            state.message    = resp.message or 'Sequence accepted. Fight time.'
            state.voice_passed = true
            state.phase      = 'voice_pass'
        else
            -- partial or wrong — try again
            state.message = resp.message or 'Wrong sequence. Try again.'
            state.phase   = 'voice_fail'
        end
    elseif resp and resp.passed then
        -- Shouldn't happen for voice-only (combat still needed), but handle it.
        state.message    = resp.message or 'Accepted.'
        state.voice_passed = true
        state.phase      = 'voice_pass'
    else
        state.message = (resp and resp.message) or 'Sequence incorrect. Try again.'
        state.phase   = 'voice_fail'
    end
end

-- ── Combat runner (lazy construction after voice pass) ────────────────────

local function make_combat_runner()
    return archetypes.combat(CHALLENGE_ID, {
        enemy_name   = 'Bridge Tender Construct',
        enemy_max_hp = 60,
        op_max_hp    = 100,
        waves_req    = 1,
        intro_text   =
            "Counterweight locked. Leaf level. Now the construct is fighting back.\n" ..
            "One wave. Make it count, champ.",
    })
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

-- begin(ctx): entered when the router pushes this screen (after BEACON_HELLO).
function screen.begin(ctx)
    onion.log('screen 2.3: begin')
    state.phase        = 'intro'
    state.message      = ''
    state.voice_passed = false
    state.combat_runner = nil
    state.attempt_id   = nil

    -- Signal the server to begin this challenge attempt.
    draw_waiting('Approaching bridge...')
    local resp, err = net.request(MT.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })

    if err then
        state.message = 'Server error: ' .. err
        state.phase   = 'intro'
        return
    end

    -- Server may return CHALLENGE_INTRO with intro text + attempt_id.
    state.attempt_id = resp and resp.attemptId or nil
    state.message    = (resp and resp.intro) or
        "The bascule bridge is stuck mid-raise, pal. " ..
        "You need the Reversal Map clues. Speak the sequence when ready."
    state.phase = 'intro'
end

-- update(ctx, dt): called every tick (~80ms).
function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── INTRO ───────────────────────────────────────────────────────────────
    if state.phase == 'intro' then
        if pressed == 'select' then
            state.phase = 'voice_prompt'
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── VOICE PROMPT ────────────────────────────────────────────────────────
    elseif state.phase == 'voice_prompt' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'select' then
            if caps.voice then
                -- On-badge capture via the Sound-module PDM mic. No on-device
                -- STT — we sample ~3s of audio energy to confirm the operative
                -- spoke and submit that; the server STT does the matching.
                state.phase = 'listening'
                onion.clear_display()
                ui.voice_screen('listening',
                    "Speak: lock traffic, release counterweight, lower leaf, secure locks.")
                local energy = capture_voice_energy(3000)
                submit_voice('', nil, energy)
            else
                -- No mic on today's firmware: badge signals "ready to speak"
                -- and the BEACON captures audio, uploads out-of-band, pushes
                -- VOICE_RESULT back. We send an empty submit and wait.
                state.phase = 'listening'
                submit_voice('', nil)
            end
        end

    -- ── LISTENING / WAITING for STT reply ──────────────────────────────────
    elseif state.phase == 'listening' or state.phase == 'voice_wait' then
        -- no input during async processing; state driven by submit_voice()

    -- ── VOICE FAIL ──────────────────────────────────────────────────────────
    elseif state.phase == 'voice_fail' then
        if pressed == 'select' then
            -- retry voice phase
            state.phase = 'voice_prompt'
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── VOICE PASS (transition screen before combat) ─────────────────────────
    elseif state.phase == 'voice_pass' then
        if pressed == 'select' then
            -- Start the combat phase via the archetype runner.
            state.combat_runner = make_combat_runner()
            state.combat_runner.begin(ctx)
            state.phase = 'combat_active'
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── COMBAT ACTIVE ────────────────────────────────────────────────────────
    elseif state.phase == 'combat_active' then
        if state.combat_runner then
            local result = state.combat_runner.update(ctx, dt)
            if result == 'done' then
                state.phase = 'done'
            end
        end

    -- ── DONE ─────────────────────────────────────────────────────────────────
    elseif state.phase == 'done' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end
    end

    return nil
end

-- render(ctx): draw the current frame (264x176 B/W e-paper).
function screen.render(ctx)
    onion.clear_display()

    if state.phase == 'intro' then
        -- ── Intro: bridge stuck mid-raise ──────────────────────────────────
        ui.border()
        ui.title('BASCULE STANDOFF', 4)
        ui.divider(18)
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 6, 26)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Begin  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'voice_prompt' then
        -- ── Voice prompt: show the sequence clue ──────────────────────────
        ui.border()
        ui.title('SPEAK THE SEQUENCE', 4)
        ui.divider(18)
        onion.display_text('(Use your Reversal Map)', 6, 24,
            { font = 'small', clear = false })
        ui.divider(32)
        onion.display_text('1. Lock traffic',          6, 38, { font = 'small', clear = false })
        onion.display_text('2. Release counterweight', 6, 50, { font = 'small', clear = false })
        onion.display_text('3. Lower leaf',             6, 62, { font = 'small', clear = false })
        onion.display_text('4. Secure locks',           6, 74, { font = 'small', clear = false })
        ui.divider(ui.H - 20)
        local hint = caps.voice and '[SELECT] Record  [CANCEL] Back'
                                 or '[SELECT] Signal ready  [CANCEL] Back'
        onion.display_text(hint, 6, ui.H - 14, { font = 'small', clear = false })

    elseif state.phase == 'listening' then
        -- ── Listening: mic active or waiting for beacon capture ────────────
        ui.voice_screen('listening', 'Speak the sequence now...')

    elseif state.phase == 'voice_wait' then
        -- ── Processing STT ────────────────────────────────────────────────
        draw_waiting('Analysing sequence...')

    elseif state.phase == 'voice_fail' then
        -- ── Sequence rejected ─────────────────────────────────────────────
        ui.border()
        ui.title('[ REJECTED ]', 14)
        ui.divider(30)
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 6, 38)
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Retry  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'voice_pass' then
        -- ── Sequence accepted — transition to combat ───────────────────────
        ui.border()
        ui.title('SEQUENCE ACCEPTED', 6)
        ui.divider(20)
        local lines = ui.wrap_text(state.message, 38)
        ui.body_text(lines, 6, 28)
        -- Draw a simple ASCII bascule-bridge lowering graphic
        onion.display_text('  /|  -> __|__', 6, ui.H - 32,
            { font = 'small', clear = false })
        onion.display_text('Bridge leaf lowering...', 6, ui.H - 20,
            { font = 'small', clear = false })
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Fight  [CANCEL] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })

    elseif state.phase == 'combat_active' then
        -- ── Delegate combat rendering to the archetype runner ─────────────
        if state.combat_runner then
            state.combat_runner.render(ctx)
        end

    elseif state.phase == 'done' then
        -- ── Done: bridge lowered, construct defeated ───────────────────────
        ui.border()
        ui.title('BRIDGE LOWERED', 14)
        ui.divider(30)
        onion.display_text('River Access granted.', 6, 38,
            { font = 'small', clear = false })
        onion.display_text('+110 Onions', 6, 50, { font = 'small', clear = false })
        ui.divider(ui.H - 22)
        onion.display_text('DEEPDISH: "Ya earned it, I guess."', 6, ui.H - 18,
            { font = 'small', clear = false })
        ui.divider(ui.H - 20)
        onion.display_text('[SELECT] Leave', 6, ui.H - 14,
            { font = 'small', clear = false })
    end
end

return screen
