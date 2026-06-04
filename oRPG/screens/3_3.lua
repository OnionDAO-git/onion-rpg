-- oRPG/screens/act3-3-oemc-blackout.lua
-- Act 3, Challenge 3.3 — OEMC Blackout (Dialogue/Voice)
-- SPEC §5 Act 3: 911 center jammed; voice triage restores dispatch capacity.
--
-- MECHANIC: multi-call voice triage sequence.
--   - Each triage call is displayed on screen and read aloud (if beacon audio).
--   - Player speaks the priority ("Priority 1/2/3/4") or presses SELECT to
--     use on-badge voice capture (caps.voice).
--   - Server validates each call (VOICE_CAPTURE_SUBMIT → VOICE_RESULT).
--   - After TRIAGE_CALL_COUNT calls the server returns the final verdict.
--
-- HARDWARE PATHS:
--   caps.voice = true  → on-badge Sound-module PDM mic capture
--                        (onion.sound_mic_begin/sound_mic_level/sound_mic_end).
--                        No on-device STT: the badge submits an audio-energy
--                        summary { rms, peak } via VOICE_CAPTURE_SUBMIT and the
--                        server STT does the matching.
--   caps.voice = false → badge signals "ready" with empty VOICE_CAPTURE_SUBMIT;
--                        beacon captures + uploads audio out-of-band;
--                        beacon pushes VOICE_RESULT back to badge.
--
-- Uses the dialogue archetype from lib/archetypes.lua for rendering + network
-- calls, with a custom multi-call state machine on top.

local archetypes = require('lib.archetypes')
local ui         = require('lib.ui')
local net        = require('lib.net')
local proto      = require('lib.proto')
local caps       = require('lib.caps')

local CHALLENGE_ID      = '3.3'
local CHALLENGE_NAME    = 'OEMC Blackout'
local TRIAGE_CALL_COUNT = 4    -- must match server TRIAGE_SEQUENCE_COUNT

-- ── State ──────────────────────────────────────────────────────────────────

local state = {
    phase        = 'intro',    -- intro | dispatcher_greeting | call_active |
                               -- listening | processing | call_result | summary | done
    call_index   = 0,          -- 0-based; which call we're on (0..TRIAGE_CALL_COUNT-1)
    call_text    = '',         -- description for the current call
    result_text  = '',         -- DEEPDISH/dispatcher reaction to last answer
    final_text   = '',         -- end-of-challenge verdict
    passed       = false,      -- overall pass/fail
    last_buttons = nil,
    intro_line   = 1,          -- which intro line we're showing
}

-- Pre-defined intro lines (mirror DIALOGUE.intro from content file).
-- The server also returns them in CHALLENGE_INTRO; we keep a local copy
-- for display before the server responds.
local INTRO_LINES = {
    "OEMC's down. All of it — fire dispatch, police CAD, EMS routing. Jammed.",
    "You're the only one left to manually triage calls.",
    "Speak the correct priority for each call: 1, 2, 3, or 4. Go.",
}

local CALL_INTRO = "Next call coming in. Speak the priority."

local PRIORITY_HINT =
    "P1=Life threat  P2=Urgent\n" ..
    "P3=Routine      P4=Info only\n" ..
    "[SELECT]=Speak  [CANCEL]=Leave"

-- ── Helpers ────────────────────────────────────────────────────────────────

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Wrap text to a max character width; returns array of lines.
local function simple_wrap(text, width)
    local lines = {}
    local start = 1
    while start <= #text do
        local finish = math.min(start + width - 1, #text)
        if finish < #text and text:sub(finish, finish) ~= ' ' then
            -- back up to nearest space
            local sp = text:sub(start, finish):match('.*()%s')
            if sp then finish = start + sp - 2 end
        end
        lines[#lines + 1] = text:sub(start, finish):match('^%s*(.-)%s*$')
        start = finish + 1
        if text:sub(start, start) == ' ' then start = start + 1 end
    end
    return lines
end

-- ── Network helpers ────────────────────────────────────────────────────────

-- Signal server to begin the challenge and receive intro content.
local function do_begin(ctx)
    local resp, err = net.request(proto.MsgType.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        onion.log('OEMC begin error: ' .. err)
        return nil
    end
    return resp
end

-- Submit a voice answer for the current call and get server verdict.
-- transcript: spoken text (or '' — the badge has no on-device STT)
-- audio_ref:  audio blob ref from out-of-band upload, or nil
-- energy:     { rms, peak } audio-energy summary when an on-badge mic was used
-- Returns the VOICE_RESULT body or nil + error string.
local function submit_voice_answer(transcript, audio_ref, energy)
    local body = {
        c          = CHALLENGE_ID,
        callIndex  = state.call_index,
        t          = transcript or '',
        ref        = audio_ref,
        v          = energy,   -- { rms, peak } when an on-badge mic was used
    }
    local resp, err = net.request(proto.MsgType.VOICE_CAPTURE_SUBMIT, body, 15000)
    return resp, err
end

-- Capture a short window of audio energy via the Sound-module PDM mic. No
-- on-device STT exists, so we return a rough { rms, peak } summary that confirms
-- the operative spoke; the server STT does the actual priority matching. Sub-GHz
-- and Sound share the side port, so we always close the mic with sound_mic_end.
local function capture_voice_energy(ms)
    if not caps.voice then return nil end
    local ok = onion.sound_mic_begin({ sample_rate = 16000 })
    if not ok then return nil end
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

-- ── On-badge voice capture path (caps.voice = true) ───────────────────────

local function do_on_badge_capture()
    -- Capture audio energy via the Sound-module PDM mic and submit the summary;
    -- the server STT matches the spoken priority.
    state.phase = 'listening'
    onion.clear_display()
    ui.voice_screen('listening', 'Speak the priority now...')

    local energy = capture_voice_energy(4000)
    state.phase = 'processing'

    local resp, err = submit_voice_answer('', nil, energy)
    return resp, err
end

-- ── Beacon-relay voice path (caps.voice = false) ──────────────────────────
--
-- The badge sends an empty VOICE_CAPTURE_SUBMIT to signal "player is ready";
-- the beacon captures audio via its own hardware mic (or the sim reads from
-- stdin/file), uploads it out-of-band to /api/voice, and pushes the
-- VOICE_RESULT frame back to the badge via the relay.
-- We still need to send the body so the server knows which callIndex we're on.

local function do_relay_capture()
    state.phase = 'listening'
    -- Send empty submit; beacon drives the actual capture + upload.
    local resp, err = submit_voice_answer('', nil)
    return resp, err
end

-- ── Process server VOICE_RESULT ───────────────────────────────────────────

local function handle_voice_result(resp)
    if not resp then
        state.result_text = 'No server response. Try again.'
        state.phase = 'call_result'
        return
    end

    -- resp: { passed, message, continued, ... }
    state.result_text = resp.message or (resp.passed and 'Correct!' or 'Wrong priority.')

    local continued = resp.continued -- true = more calls remain
    state.call_index = state.call_index + 1

    if continued then
        -- More calls remain; brief result then move to next call.
        state.phase = 'call_result'
    else
        -- All calls answered; show final verdict.
        state.passed    = resp.passed or false
        state.final_text = resp.message or (state.passed and 'Dispatch restored!' or 'Failed triage.')
        state.phase     = 'summary'
    end
end

-- ── Screen module ─────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 3.3: begin')
    -- Reset state.
    state.phase        = 'intro'
    state.call_index   = 0
    state.call_text    = ''
    state.result_text  = ''
    state.final_text   = ''
    state.passed       = false
    state.intro_line   = 1
    state.last_buttons = nil

    -- Fire CHALLENGE_BEGIN in background (don't block the render loop).
    do_begin(ctx)
end

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── INTRO: cycle DEEPDISH intro lines, then move to dispatcher greeting.
    if state.phase == 'intro' then
        if pressed == 'cancel' then
            return 'done'
        elseif pressed == 'select' then
            state.intro_line = state.intro_line + 1
            if state.intro_line > #INTRO_LINES then
                state.phase = 'dispatcher_greeting'
            end
        end

    -- ── DISPATCHER GREETING: NPC sets the scene.
    elseif state.phase == 'dispatcher_greeting' then
        if pressed == 'cancel' then return 'done'
        elseif pressed == 'select' then
            -- Move to first call.
            state.call_text = CALL_INTRO
            state.phase = 'call_active'
        end

    -- ── CALL ACTIVE: show call description, wait for SELECT to speak.
    elseif state.phase == 'call_active' then
        if pressed == 'cancel' then return 'done'
        elseif pressed == 'select' then
            -- Player ready to speak.
            local resp, err
            if caps.voice then
                resp, err = do_on_badge_capture()
            else
                resp, err = do_relay_capture()
            end
            if err then
                state.result_text = 'Error: ' .. err
                state.phase = 'call_result'
            else
                handle_voice_result(resp)
            end
        end

    -- ── CALL RESULT: show per-call reaction, then advance to next call.
    elseif state.phase == 'call_result' then
        if pressed == 'select' or pressed == 'cancel' then
            if state.call_index < TRIAGE_CALL_COUNT then
                -- Next call.
                state.call_text = CALL_INTRO
                state.phase = 'call_active'
            else
                -- Should not happen (server would have said continued=false),
                -- but guard anyway.
                state.phase = 'summary'
            end
        end

    -- ── SUMMARY: final verdict.
    elseif state.phase == 'summary' then
        if pressed == 'select' or pressed == 'cancel' then
            return 'done'
        end

    -- ── DONE: router will pop this screen.
    elseif state.phase == 'done' then
        return 'done'
    end

    return nil
end

function screen.render(ctx)
    onion.clear_display()

    if state.phase == 'intro' then
        ui.border()
        ui.title('[ DEEPDISH ]', 4)
        ui.divider(18)
        local line = INTRO_LINES[state.intro_line] or INTRO_LINES[#INTRO_LINES]
        local lines = ui.wrap_text(line, 40)
        ui.body_text(lines, 6, 24)
        ui.divider(ui.H - 26)
        onion.display_text(
            '[SELECT] Next  [CANCEL] Leave',
            6, ui.H - 20, { font = 'small', clear = false })
        onion.display_text(
            '-- OEMC BLACKOUT  Act 3.3 --',
            6, ui.H - 10, { font = 'small', clear = false })

    elseif state.phase == 'dispatcher_greeting' then
        ui.border()
        ui.title('[ Dispatcher Rodriguez ]', 4)
        ui.divider(18)
        local lines = ui.wrap_text(
            "I need you to triage. Speak the priority for each call: " ..
            "1, 2, 3, or 4.", 40)
        ui.body_text(lines, 6, 24)
        ui.divider(ui.H - 26)
        onion.display_text('[SELECT] Ready  [CANCEL] Leave',
            6, ui.H - 20, { font = 'small', clear = false })
        onion.display_text(PRIORITY_HINT,
            6, ui.H - 10, { font = 'small', clear = false })

    elseif state.phase == 'call_active' then
        ui.border()
        -- Header: call number
        local header = 'CALL ' .. (state.call_index + 1) .. '/' .. TRIAGE_CALL_COUNT
        ui.title(header, 4)
        ui.divider(18)
        -- Show the call description (or placeholder until server sends first call).
        local call_body = state.call_text
        if call_body == CALL_INTRO then
            call_body = 'Incoming call...'
        end
        local lines = ui.wrap_text(call_body, 38)
        ui.body_text(lines, 6, 24)
        ui.divider(ui.H - 36)
        -- Priority hint at bottom
        onion.display_text('P1=Life P2=Urgent P3=Routine P4=Info',
            6, ui.H - 32, { font = 'small', clear = false })
        if caps.voice then
            onion.display_text('[SELECT] Speak priority  [CANCEL] Leave',
                6, ui.H - 22, { font = 'small', clear = false })
        else
            onion.display_text('[SELECT] Signal ready (beacon captures)',
                6, ui.H - 22, { font = 'small', clear = false })
            onion.display_text('[CANCEL] Leave',
                6, ui.H - 12, { font = 'small', clear = false })
        end

    elseif state.phase == 'listening' then
        ui.border()
        ui.title('LISTENING...', 60)
        local mic_icon = caps.voice and '[ MIC ACTIVE ]' or '[ BEACON CAPTURE ]'
        onion.display_text(mic_icon, 80, 96, { font = 'bold', clear = false })
        onion.display_text('Speak: "Priority 1/2/3/4"',
            30, 120, { font = 'small', clear = false })

    elseif state.phase == 'processing' then
        ui.border()
        ui.title('Analysing...', 64)
        onion.display_text('Sending to OEMC dispatch...',
            30, 96, { font = 'small', clear = false })

    elseif state.phase == 'call_result' then
        ui.border()
        local header = 'CALL ' .. state.call_index .. '/' .. TRIAGE_CALL_COUNT .. ' RESULT'
        ui.title(header, 4)
        ui.divider(18)
        local lines = ui.wrap_text(state.result_text, 40)
        ui.body_text(lines, 6, 24)
        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Next call  [CANCEL] Leave',
            6, ui.H - 16, { font = 'small', clear = false })

    elseif state.phase == 'summary' then
        ui.border()
        local verdict = state.passed and '[ DISPATCH RESTORED ]' or '[ DISPATCH FAILED ]'
        ui.title(verdict, 10)
        ui.divider(24)
        local lines = ui.wrap_text(state.final_text, 40)
        ui.body_text(lines, 6, 30)
        if state.passed then
            ui.divider(ui.H - 26)
            onion.display_text('Prompt Fragment #3 + Dispatch Credential awarded.',
                6, ui.H - 22, { font = 'small', clear = false })
        end
        ui.divider(ui.H - 12)
        onion.display_text('[SELECT] Continue  [CANCEL] OK',
            6, ui.H - 8, { font = 'small', clear = false })
    end
end

-- ── Incoming VOICE_RESULT push from beacon ────────────────────────────────
-- When caps.voice is false, the beacon may push a VOICE_RESULT frame
-- asynchronously after uploading the audio. The router calls this handler
-- if it routes an unsolicited VOICE_RESULT to the active screen.
-- (Optional integration point — the main flow above also handles the response
-- synchronously via net.request; this handles the async push variant.)

function screen.on_voice_result(resp)
    if state.phase == 'listening' or state.phase == 'processing' then
        handle_voice_result(resp)
    end
end

return screen
