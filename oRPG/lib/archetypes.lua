-- oRPG/lib/archetypes.lua
-- Reusable screen logic for the four challenge archetypes defined in SPEC §5:
--   Combat    -> archetype.combat(ctx, challenge_id, opts)
--   Dialogue  -> archetype.dialogue(ctx, challenge_id, opts)
--   Merchant  -> archetype.merchant(ctx, challenge_id, opts)
--   NPC       -> archetype.npc(ctx, challenge_id, opts)
--
-- Per-challenge screens in oRPG/screens/*.lua are thin wrappers; they call
-- one of these functions and only override what makes their challenge unique.
--
-- All archetype functions return a "runner" table:
--   { begin(ctx), update(ctx,dt), render(ctx) }
-- matching the screen module contract from CONTRACTS §6.

local proto = require('lib.proto')
local net   = require('lib.net')
local ui    = require('lib.ui')
local caps  = require('lib.caps')

local MT = proto.MsgType

local archetypes = {}

-- ── Shared helpers ────────────────────────────────────────────────────────

-- Wait for a button edge (pressed this tick, not last tick).
-- Returns the button name pressed or nil.
local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then
            return b
        end
    end
    return nil
end

-- Generic "busy" wait screen used while awaiting a server reply.
local function draw_waiting(label)
    onion.clear_display()
    ui.title('Please wait...', 70)
    local lx = math.max(4, math.floor((ui.W - #label * ui.FONT_SMALL_W) / 2))
    onion.display_text(label, lx, 96, { font = 'small', clear = false })
end

-- ── COMBAT archetype ──────────────────────────────────────────────────────
-- opts: { enemy_name, enemy_max_hp, op_max_hp, waves_req, intro_text }

function archetypes.combat(challenge_id, opts)
    opts = opts or {}
    local state = {
        phase       = 'intro',  -- intro | active | waiting | done
        session     = nil,      -- CombatRollResponseBody from server
        message     = opts.intro_text or 'Combat begins...',
        last_buttons = nil,
        -- rendered state
        enemy_name   = opts.enemy_name   or 'ENEMY',
        enemy_hp     = opts.enemy_max_hp or 100,
        enemy_max_hp = opts.enemy_max_hp or 100,
        op_hp        = opts.op_max_hp    or 100,
        op_max_hp    = opts.op_max_hp    or 100,
        wave         = 1,
        waves_req    = opts.waves_req    or 1,
        status       = 'active',
    }

    local function do_roll()
        state.phase = 'waiting'
        -- Combat is SERVER-AUTHORITATIVE: the server generates and records the
        -- roll, so it cannot be tampered with from the badge. There is no Lua
        -- signing primitive (the ATECC608B can't do Ed25519 and the Solana key
        -- isn't exposed to scripts), so we do not send a signed roll. When the
        -- hardware RNG is present we attach a few bytes of client entropy the
        -- server folds into its roll; it's a convenience, never a source of
        -- authority.
        local roll_body = { c = challenge_id }
        if caps.secRng then
            local rng_bytes = onion.secure_random(4)
            if rng_bytes and #rng_bytes >= 4 then
                local e = 0
                for i = 1, 4 do e = e * 256 + rng_bytes:byte(i) end
                roll_body.e = e   -- client entropy hint (uint32)
            end
        end
        local resp, err = net.request(MT.COMBAT_ROLL_REQUEST, roll_body, 10000)
        if err then
            state.message = 'Network error: ' .. err
            state.phase   = 'active'
            return
        end
        -- update state from CombatRollResponseBody
        state.session    = resp
        state.enemy_hp   = resp.enemyHp or state.enemy_hp
        state.op_hp      = resp.opHp    or state.op_hp
        state.wave        = resp.wave    or state.wave
        state.waves_req   = resp.wavesReq or state.waves_req
        state.status      = resp.st      or 'active'
        if resp.st == 'won' then
            state.message = 'Victory! Challenge cleared.'
            state.phase   = 'done'
        elseif resp.st == 'lost' then
            state.message = 'Defeated. Try again.'
            state.phase   = 'done'
        else
            state.message = 'Wave ' .. state.wave .. '/' .. state.waves_req
            state.phase   = 'active'
        end
    end

    return {
        begin = function(ctx)
            -- start/join a combat session on the server
            draw_waiting('Starting combat...')
            local resp, err = net.request(MT.CHALLENGE_BEGIN, { c = challenge_id, h = ctx.hardware_id })
            if err then
                state.message = err
                return
            end
            -- server replies with IDENTIFY_ACK or CHALLENGE_INTRO; we use
            -- COMBAT_ROLL_REQUEST to open the combat session
            local csess, cerr = net.request(MT.COMBAT_ROLL_REQUEST, { c = challenge_id })
            if csess then
                state.session  = csess
                state.enemy_hp = csess.enemyHp  or state.enemy_max_hp
                state.op_hp    = csess.opHp     or state.op_max_hp
                state.wave      = csess.wave     or 1
                state.waves_req = csess.wavesReq or state.waves_req
                state.status    = csess.st       or 'active'
            end
            state.phase = 'intro'
        end,

        update = function(ctx, _dt)
            local buttons = onion.buttons()
            local pressed = edge(buttons, state.last_buttons)
            state.last_buttons = buttons

            if state.phase == 'intro' then
                if pressed == 'select' then
                    state.phase = 'active'
                elseif pressed == 'cancel' then
                    return 'done'
                end

            elseif state.phase == 'active' then
                if pressed == 'select' then
                    do_roll()
                elseif pressed == 'cancel' then
                    return 'done'
                end

            elseif state.phase == 'done' then
                if pressed == 'select' or pressed == 'cancel' then
                    return 'done'
                end
            end

            -- waiting phase has no input; server reply drives the transition
            return nil
        end,

        render = function(_ctx)
            if state.phase == 'intro' then
                ui.splash(state.enemy_name, state.message, '[SELECT] Fight  [CANCEL] Leave')
            elseif state.phase == 'waiting' then
                draw_waiting('Rolling...')
            else
                ui.combat_hud(state)
            end
        end,
    }
end

-- ── DIALOGUE (Voice) archetype ────────────────────────────────────────────
-- opts: { prompt_text, success_text, fail_text }
-- When caps.voice is true: opens the Sound-module PDM mic (onion.sound_mic_*),
--   confirms the operative actually spoke (energy gate), and submits via
--   VOICE_CAPTURE_SUBMIT with the measured audio energy. Server-side STT (fed
--   the spoken sequence through the deployment's capture path) does matching.
-- When caps.voice is false: shows the prompt and sends an empty
--   VOICE_CAPTURE_SUBMIT to signal "player is ready"; the beacon/server drives
--   capture and pushes back the VOICE_RESULT.

function archetypes.dialogue(challenge_id, opts)
    opts = opts or {}
    local state = {
        phase        = 'prompt',  -- prompt | listening | processing | result | done
        result_text  = '',
        passed       = false,
        last_buttons = nil,
    }

    -- Capture a short window of audio via the Sound-module PDM mic and return a
    -- rough energy summary { rms, peak } so the server knows the operative
    -- actually spoke. The badge has no on-device STT, so we don't return a
    -- transcript here; raw-PCM upload to a server STT endpoint is a TODO that
    -- depends on a voice-ingest route + the badge being on WiFi (caps.http).
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

    local function submit_voice(transcript, audio_ref, energy)
        state.phase = 'processing'
        local body = {
            c   = challenge_id,
            t   = transcript,
            ref = audio_ref,
            v   = energy,   -- { rms, peak } when an on-badge mic was used
        }
        local resp, err = net.request(MT.VOICE_CAPTURE_SUBMIT, body, 15000)
        if err then
            state.result_text = 'Error: ' .. err
            state.phase       = 'result'
            return
        end
        state.passed      = resp and resp.passed or false
        state.result_text = (resp and resp.message) or (state.passed and 'Correct!' or 'Try again.')
        state.phase       = 'result'
    end

    return {
        begin = function(ctx)
            net.request(MT.CHALLENGE_BEGIN, { c = challenge_id, h = ctx.hardware_id })
        end,

        update = function(_ctx, _dt)
            local buttons = onion.buttons()
            local pressed = edge(buttons, state.last_buttons)
            state.last_buttons = buttons

            if state.phase == 'prompt' then
                if pressed == 'select' then
                    if caps.voice then
                        -- on-badge capture via the Sound-module PDM mic
                        state.phase = 'listening'
                        onion.clear_display()
                        ui.voice_screen('listening', opts.prompt_text)
                        -- sample ~3s of audio energy to confirm the operative spoke
                        local energy = capture_voice_energy(3000)
                        submit_voice('', nil, energy)
                    else
                        -- No mic; ask the user to speak aloud (beacon captures via its
                        -- own mic or external trigger; we send an empty voice_submit to
                        -- signal "player is ready" and wait for VOICE_RESULT pushed back).
                        state.phase = 'listening'
                        submit_voice('', nil)
                    end
                elseif pressed == 'cancel' then
                    return 'done'
                end

            elseif state.phase == 'result' then
                if pressed == 'select' or pressed == 'cancel' then
                    if state.passed then return 'done'
                    else
                        state.phase = 'prompt'  -- retry
                    end
                end
            end
            return nil
        end,

        render = function(_ctx)
            if state.phase == 'prompt' or state.phase == 'listening' then
                local vstate = state.phase == 'listening' and 'listening' or 'idle'
                ui.voice_screen(vstate, opts.prompt_text)
            elseif state.phase == 'processing' then
                draw_waiting('Analysing...')
            else
                -- result
                ui.clear()
                ui.border()
                local icon = state.passed and '[ PASS ]' or '[ FAIL ]'
                ui.title(icon, 20)
                local lines = ui.wrap_text(state.result_text, 40)
                ui.body_text(lines, 8, 50)
                ui.divider(ui.H - 20)
                onion.display_text('[SELECT] Continue  [CANCEL] Retry', 6, ui.H - 14,
                    { font = 'small', clear = false })
            end
        end,
    }
end

-- ── MERCHANT (Buttons) archetype ──────────────────────────────────────────
-- opts: { items, balance_key }
-- items: array of { name, cost, description? }
-- balance_key: key in ctx to read for onion balance display

function archetypes.merchant(challenge_id, opts)
    opts  = opts or {}
    local items   = opts.items   or {}
    local state = {
        phase        = 'browsing',   -- browsing | confirming | waiting | done
        sequence     = {},           -- current button combo being entered
        message      = '',
        last_buttons = nil,
        result       = nil,
    }

    -- Map button name to a short label for the sequence display.
    local btn_labels = {
        up='U', down='D', left='L', right='R', select='SEL'
    }

    local function submit_sequence()
        state.phase = 'waiting'
        local resp, err = net.request(MT.MERCHANT_INPUT, {
            c   = challenge_id,
            seq = state.sequence,
        }, 10000)
        if err then
            state.message = 'Error: ' .. err
            state.phase   = 'browsing'
            return
        end
        state.result  = resp
        state.message = (resp and resp.message) or (resp and resp.passed and 'Trade accepted!' or 'Wrong sequence.')
        state.phase   = 'done'
    end

    return {
        begin = function(ctx)
            net.request(MT.CHALLENGE_BEGIN, { c = challenge_id, h = ctx.hardware_id })
        end,

        update = function(ctx, _dt)
            local buttons = onion.buttons()
            local pressed = edge(buttons, state.last_buttons)
            state.last_buttons = buttons

            if state.phase == 'browsing' then
                if pressed == 'cancel' then return 'done' end
                if pressed and pressed ~= 'cancel' then
                    -- record button as part of the sequence
                    local lbl = btn_labels[pressed] or pressed
                    state.sequence[#state.sequence + 1] = pressed
                    if #state.sequence >= 8 then
                        submit_sequence()
                    end
                end
            elseif state.phase == 'done' then
                if pressed == 'select' or pressed == 'cancel' then
                    return 'done'
                end
            end
            return nil
        end,

        render = function(ctx)
            local balance = (ctx.operative and ctx.operative.onions) or '?'
            local seq_str = table.concat((function()
                local t = {}
                for _, s in ipairs(state.sequence) do
                    t[#t+1] = btn_labels[s] or s
                end
                return t
            end)(), '-')
            if state.phase == 'waiting' then
                draw_waiting('Processing trade...')
            elseif state.phase == 'done' then
                ui.clear()
                ui.border()
                ui.title(state.message, 60)
                ui.divider(ui.H - 20)
                onion.display_text('[SELECT] Leave', 6, ui.H - 14,
                    { font = 'small', clear = false })
            else
                ui.merchant_screen(items, balance, seq_str)
            end
        end,
    }
end

-- ── NPC (AI Dialogue) archetype ───────────────────────────────────────────
-- opts: { npc_name, greeting }
-- Free-form text entry on the badge is limited (no keyboard), so the player
-- uses a simple set of pre-defined response options that are assembled into a
-- natural-language utterance and sent to the server (DEEPDISH judges comprehension).
-- opts.choices: array of choice strings the player can scroll through + select.

function archetypes.npc(challenge_id, opts)
    opts = opts or {}
    local choices = opts.choices or {
        'I understand.',
        'Tell me more.',
        'Because of the infrastructure.',
        'To protect the water supply.',
        'I have the credentials.',
        'The city depends on it.',
    }
    local state = {
        phase        = 'intro',      -- intro | choosing | waiting | reply | done
        session_id   = nil,
        hardware_id  = nil,
        npc_text     = opts.greeting or 'Hello, Operative.',
        selected     = 1,
        last_buttons = nil,
        passed       = false,
    }

    local function send_turn(utterance)
        state.phase = 'waiting'
        local body  = {
            c = challenge_id,
            h = state.hardware_id,
            s = state.session_id,
            t = utterance,
        }
        local resp, err = net.request(MT.NPC_DIALOGUE_TURN, body, 20000)
        if err then
            state.npc_text = 'Network error: ' .. err
            state.phase    = 'reply'
            return
        end
        state.session_id = resp and resp.s or state.session_id
        state.npc_text   = (resp and resp.t) or ''
        state.passed     = (resp and resp.passed) or false
        if state.passed then
            state.phase = 'done'
        else
            state.phase = 'reply'
        end
    end

    return {
        begin = function(ctx)
            state.hardware_id = ctx.hardware_id
            net.request(MT.CHALLENGE_BEGIN, { c = challenge_id, h = ctx.hardware_id })
        end,

        update = function(_ctx, _dt)
            local buttons = onion.buttons()
            local pressed = edge(buttons, state.last_buttons)
            state.last_buttons = buttons

            if state.phase == 'intro' then
                if pressed == 'select' then
                    state.phase = 'choosing'
                elseif pressed == 'cancel' then
                    return 'done'
                end

            elseif state.phase == 'choosing' then
                if pressed == 'up' then
                    state.selected = math.max(1, state.selected - 1)
                elseif pressed == 'down' then
                    state.selected = math.min(#choices, state.selected + 1)
                elseif pressed == 'select' then
                    send_turn(choices[state.selected])
                elseif pressed == 'cancel' then
                    return 'done'
                end

            elseif state.phase == 'reply' then
                if pressed == 'select' then
                    state.phase = 'choosing'
                elseif pressed == 'cancel' then
                    return 'done'
                end

            elseif state.phase == 'done' then
                if pressed == 'select' or pressed == 'cancel' then
                    return 'done'
                end
            end
            return nil
        end,

        render = function(_ctx)
            local npc_name = opts.npc_name or 'NPC'
            if state.phase == 'waiting' then
                draw_waiting('Thinking...')
                return
            end

            if state.phase == 'choosing' then
                ui.clear()
                ui.border()
                ui.title('[ ' .. npc_name .. ' ]', 4)
                -- show last NPC line truncated
                local preview = state.npc_text:sub(1, 36)
                onion.display_text(preview, 4, 22, { font = 'small', clear = false })
                ui.divider(34)
                -- show choice menu
                ui.menu(choices, state.selected, 4, 38, ui.W - 8)
                ui.divider(ui.H - 18)
                onion.display_text('[UP/DN] Scroll  [SEL] Say  [CANCEL] Leave',
                    4, ui.H - 14, { font = 'small', clear = false })
            elseif state.phase == 'done' then
                ui.clear()
                ui.border()
                ui.title('[ ' .. npc_name .. ' ]', 20)
                local lines = ui.wrap_text(state.npc_text, 38)
                ui.body_text(lines, 6, 44)
                ui.divider(ui.H - 20)
                onion.display_text('[SELECT] Continue', 6, ui.H - 14,
                    { font = 'small', clear = false })
            else
                -- intro or reply
                ui.clear()
                ui.border()
                ui.title('[ ' .. npc_name .. ' ]', 4)
                ui.divider(18)
                local lines = ui.wrap_text(state.npc_text, 40)
                ui.body_text(lines, 6, 24)
                ui.divider(ui.H - 20)
                local hint = state.phase == 'intro'
                    and '[SELECT] Respond  [CANCEL] Leave'
                    or  '[SELECT] Continue talking'
                onion.display_text(hint, 6, ui.H - 14,
                    { font = 'small', clear = false })
            end
        end,
    }
end

return archetypes
