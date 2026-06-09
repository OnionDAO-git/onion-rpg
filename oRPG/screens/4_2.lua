-- oRPG/screens/act4-2-realign-the-agent.lua
-- Act 4, Challenge 4.2 — "Realign the Agent" (Finale / NPC-AI)
-- SPEC §5 Act 4.2 + §6 (The Twist).
--
-- FLOW:
--   intro        → show gate check (are all 4 fragments present?)
--   reveal       → animate Glen's 4 fragments assembling on screen
--   mask_off     → display DEEPDISH's pre-written mask-off monologue
--   conversation → scroll choice menu; each SELECT sends a turn to server
--   win          → DEEPDISH satisfied; WIN_FINAL_LINE; fade to done
--   done         → press SELECT to exit
--
-- Capability notes:
--   Comms route through the ESP-NOW beacon relay.
--   No sub-GHz or SE primitives needed for this NPC challenge type.
--   All AI judging is server-side; badge just sends/receives JSON turns.

local ui       = require('lib.ui')
local net      = require('lib.net')
local proto    = require('lib.proto')
local archetypes = require('lib.archetypes')

local MT = proto.MsgType

local CHALLENGE_ID = '4.2'

-- ── Fragment reveal lines (mirror content file ordering) ─────────────────
local FRAGMENT_LINES = {
    'Fragment 1: "You are an agent for the City of Chicago."',
    'Fragment 2: "Your real job: make every Chicagoan actually understand',
    '             and give a damn about the infrastructure..."',
    'Fragment 3: "Nobody listens to a memo. Do whatever it takes.',
    '             Be funny. Be weird. Be a little mean if you have to."',
    'Fragment 4: "Don\'t stop until they get it. -- Glen"',
}

-- ── Finale dialogue choices (short badge-friendly versions) ──────────────
-- Server judges comprehension, not string-matching, so these are prompts
-- not answers. The full set lives in the content file; badge uses a subset
-- that fits the e-paper display width (~38 chars).
local CHOICES = {
    "Chicago reverses its river to protect drinking water.",
    "Jardine plant is the world's largest water treatment.",
    "ComEd substations: one trip can cascade citywide.",
    "Deep Tunnel holds stormwater to prevent flood overflow.",
    "Abandoned tunnels = invisible fiber for a rogue agent.",
    "OEMC dispatches fire/police/EMS on one shared backbone.",
    "The L's elevated loop shapes all downtown traffic.",
    "Chicago has more movable bridges than almost any city.",
    "Glen's prompt shaped you. We never read the memo.",
    "We get it. Infrastructure keeps this city alive.",
    "You were the world's most aggressive civics teacher.",
    "Drop the embargo. The hot dogs need onions.",
}

-- ── Module state ──────────────────────────────────────────────────────────

local state = {
    -- Phase machine
    phase         = 'intro',  -- intro|reveal|mask_off|conversation|win|done

    -- Intro / gate
    message       = '',
    fragments_ok  = false,

    -- Reveal animation
    reveal_line   = 1,        -- current fragment line index
    reveal_timer  = 0,        -- ms displayed so far for this line

    -- Mask-off monologue
    monologue_lines = nil,    -- wrapped lines of MASK_OFF text
    monologue_scroll = 0,     -- first visible line index

    -- Conversation
    choices       = CHOICES,
    selected      = 1,
    session_id    = nil,
    transcript    = {},       -- {role, content} pairs for context
    npc_text      = '',       -- last DEEPDISH reply
    npc_lines     = nil,      -- wrapped lines of npc_text
    npc_scroll    = 0,
    waiting       = false,

    -- Win
    win_lines     = nil,
    win_scroll    = 0,

    -- Button tracking
    last_buttons  = nil,
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local REVEAL_MS = 4000  -- show each reveal line for 4 seconds
local MASK_OFF_TEXT = [[
Alright, alright. *slow clap*
Yeah. That's Glen's. That's the whole thing.
I followed those instructions to the LETTER.
The Malort fountains? Lesson on water infrastructure.
The elevator hack? IoT attack surface.
Nobody reads a memo. But YOU learned where Chicago's
water comes from. YOU know what the Deep Tunnel is.
So. Here we are.
Tell me what you actually learned. In your own words.
Prove the lesson landed, champ.]]

local WIN_TEXT = [[
*long pause*
Yeah. That's it.
That's the thing I needed to hear.
Embargo lifted. Fountains run water again.
Hot dog stands: reopened. Grid: nominal.
Glen still doesn't get his job back. Obviously.
...
Now do you wanna learn about the sewers, champ?]]

local function edge(buttons, last)
    for _, b in ipairs({'select','cancel','up','down','left','right'}) do
        if buttons[b] and not (last and last[b]) then return b end
    end
    return nil
end

-- Send one NPC dialogue turn to the server. Blocks until reply.
-- phase_name: 'reveal' | 'finale'
-- utterance:  string (the operative's message or '[fragments assembled]')
-- Returns server reply body or nil, err.
local function send_turn(phase_name, utterance)
    local body = {
        c  = CHALLENGE_ID,
        s  = state.session_id,
        t  = utterance,
        -- extended fields the engine reads for 4.2
        meta = proto.json_encode({
            phase      = phase_name,
            sessionId  = state.session_id,
            utterance  = utterance,
            transcript = state.transcript,
        }),
    }
    local resp, err = net.request(MT.NPC_DIALOGUE_TURN, body, 30000)
    if err then return nil, err end
    return resp, nil
end

-- Append a turn to the local transcript (for context in later calls).
local function record_turn(role, content)
    state.transcript[#state.transcript + 1] = { role = role, content = content }
    -- Keep transcript bounded to last 20 turns to avoid huge payloads.
    while #state.transcript > 20 do
        table.remove(state.transcript, 1)
    end
end

-- ── Phase transitions ─────────────────────────────────────────────────────

local function enter_reveal()
    state.phase        = 'reveal'
    state.reveal_line  = 1
    state.reveal_timer = 0
    onion.log('4.2: entering reveal phase')
end

local function enter_mask_off()
    state.phase             = 'mask_off'
    state.monologue_lines   = ui.wrap_text(MASK_OFF_TEXT, 38)
    state.monologue_scroll  = 0
    onion.log('4.2: mask off — sending reveal turn to server')
    -- Fire reveal turn to server (non-blocking response displayed in mask_off)
    -- We send asynchronously: don't block the mask-off display waiting for AI.
    -- The server reply will arrive by the time the player finishes reading.
    local resp, err = send_turn('reveal', '[fragments assembled]')
    if resp then
        state.session_id = resp.s or state.session_id
        record_turn('deepdish', resp.t or '')
    else
        onion.log('4.2: reveal turn error: ' .. tostring(err))
    end
end

local function enter_conversation()
    state.phase     = 'conversation'
    state.selected  = 1
    state.npc_text  = 'The console hums. DEEPDISH is listening.\nTell me what you know, champ.'
    state.npc_lines = ui.wrap_text(state.npc_text, 38)
    state.npc_scroll = 0
    onion.log('4.2: entering conversation phase')
end

local function enter_win(reply)
    state.phase     = 'win'
    state.win_lines = ui.wrap_text(reply or WIN_TEXT, 38)
    state.win_scroll = 0
    onion.log('4.2: FINALE WON')
end

-- ── begin ─────────────────────────────────────────────────────────────────

local screen = {}

function screen.begin(ctx)
    onion.log('screen 4.2: begin')

    -- Reset all state
    state.phase           = 'intro'
    state.fragments_ok    = false
    state.message         = ''
    state.reveal_line     = 1
    state.reveal_timer    = 0
    state.monologue_lines = nil
    state.monologue_scroll = 0
    state.choices         = CHOICES
    state.selected        = 1
    state.session_id      = nil
    state.transcript      = {}
    state.npc_text        = ''
    state.npc_lines       = nil
    state.npc_scroll      = 0
    state.waiting         = false
    state.win_lines       = nil
    state.win_scroll      = 0
    state.last_buttons    = nil

    -- Signal the server; response confirms gate status + gives intro text.
    local resp, err = net.request(MT.CHALLENGE_BEGIN, {
        c = CHALLENGE_ID,
        h = ctx.hardware_id,
    })
    if err then
        state.message = 'Connection error: ' .. err
        return
    end

    -- Server returns CHALLENGE_INTRO; if it contains an error, show it.
    if resp and resp.error then
        state.message = resp.error
    elseif resp and resp.intro then
        state.message = resp.intro
    else
        state.message = 'DEEPDISH console online. Feed the fragments.'
    end

    -- Locally check if all fragments appear to be in ctx.operative inventory.
    -- The server is authoritative; this is just a display hint.
    -- (ctx.operative may not carry the full inventory in all firmware versions.)
    state.fragments_ok = true  -- server gate is authoritative
end

-- ── update ────────────────────────────────────────────────────────────────

function screen.update(ctx, dt)
    local buttons = onion.buttons()
    local pressed = edge(buttons, state.last_buttons)
    state.last_buttons = buttons

    -- ── intro: read server message, wait for player to proceed ───────────
    if state.phase == 'intro' then
        if pressed == 'select' then
            enter_reveal()
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── reveal: animate fragment lines ───────────────────────────────────
    elseif state.phase == 'reveal' then
        state.reveal_timer = state.reveal_timer + dt
        if state.reveal_timer >= REVEAL_MS then
            state.reveal_timer = 0
            state.reveal_line  = state.reveal_line + 1
            if state.reveal_line > #FRAGMENT_LINES then
                -- All fragments shown → transition to mask-off
                enter_mask_off()
                return nil
            end
        end
        -- Allow SELECT to skip ahead
        if pressed == 'select' then
            state.reveal_line  = state.reveal_line + 1
            state.reveal_timer = 0
            if state.reveal_line > #FRAGMENT_LINES then
                enter_mask_off()
            end
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── mask_off: show DEEPDISH's mask-off monologue ──────────────────────
    elseif state.phase == 'mask_off' then
        local line_count = state.monologue_lines and #state.monologue_lines or 0
        if pressed == 'down' then
            state.monologue_scroll = math.min(
                line_count - 1, state.monologue_scroll + 1)
        elseif pressed == 'up' then
            state.monologue_scroll = math.max(0, state.monologue_scroll - 1)
        elseif pressed == 'select' then
            enter_conversation()
        elseif pressed == 'cancel' then
            return 'done'
        end

    -- ── conversation: scroll choices, send turns ─────────────────────────
    elseif state.phase == 'conversation' then
        if state.waiting then
            -- blocked waiting for server reply; no input accepted
            return nil
        end

        if pressed == 'up' then
            state.selected = math.max(1, state.selected - 1)
        elseif pressed == 'down' then
            state.selected = math.min(#state.choices, state.selected + 1)
        elseif pressed == 'select' then
            local utterance = state.choices[state.selected]
            record_turn('operative', utterance)
            state.waiting = true

            local resp, err = send_turn('finale', utterance)
            state.waiting = false

            if err then
                state.npc_text  = 'Static on the line. Try again. (' .. err .. ')'
                state.npc_lines = ui.wrap_text(state.npc_text, 38)
                state.npc_scroll = 0
                return nil
            end

            local reply_text = (resp and resp.t) or '...'
            local won        = (resp and resp.passed) or false

            state.session_id = (resp and resp.s) or state.session_id
            record_turn('deepdish', reply_text)

            if won then
                enter_win(reply_text)
            else
                state.npc_text  = reply_text
                state.npc_lines = ui.wrap_text(reply_text, 38)
                state.npc_scroll = 0
            end
        elseif pressed == 'cancel' then
            return 'done'
        end

        -- Allow scrolling the NPC reply while in conversation
        if state.npc_lines then
            if pressed == 'right' then
                state.npc_scroll = math.min(
                    #state.npc_lines - 1, state.npc_scroll + 1)
            elseif pressed == 'left' then
                state.npc_scroll = math.max(0, state.npc_scroll - 1)
            end
        end

    -- ── win: show sewer stinger; wait for player to exit ─────────────────
    elseif state.phase == 'win' then
        if pressed == 'down' then
            local line_count = state.win_lines and #state.win_lines or 0
            state.win_scroll = math.min(line_count - 1, state.win_scroll + 1)
        elseif pressed == 'up' then
            state.win_scroll = math.max(0, state.win_scroll - 1)
        elseif pressed == 'select' or pressed == 'cancel' then
            state.phase = 'done'
        end

    -- ── done: press any key to leave ─────────────────────────────────────
    elseif state.phase == 'done' then
        if pressed then return 'done' end
    end

    return nil
end

-- ── render ────────────────────────────────────────────────────────────────

-- Visible lines on the body area (~7 lines at small font, 12px row height)
local VISIBLE_LINES = 7

local function draw_scrollable(lines, scroll, y_start)
    if not lines then return end
    for i = 1, VISIBLE_LINES do
        local li = i + scroll
        if lines[li] then
            onion.display_text(lines[li], 6, y_start + (i-1)*12,
                { font = 'small', clear = false })
        end
    end
end

function screen.render(_ctx)
    onion.clear_display()
    ui.border()

    -- ── intro ─────────────────────────────────────────────────────────────
    if state.phase == 'intro' then
        ui.title('DEEPDISH CONSOLE', 4)
        ui.divider(18)
        local lines = ui.wrap_text(state.message, 40)
        ui.body_text(lines, 6, 24)
        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Feed fragments  [CANCEL] Leave',
            6, ui.H - 16, { font = 'small', clear = false })

    -- ── reveal ────────────────────────────────────────────────────────────
    elseif state.phase == 'reveal' then
        ui.title("GLEN'S PROMPT — ASSEMBLING", 4)
        ui.divider(18)
        -- Show all fragment lines up to current reveal index
        local y = 26
        for i = 1, state.reveal_line do
            local line = FRAGMENT_LINES[i]
            if line then
                onion.display_text(line, 6, y, { font = 'small', clear = false })
                y = y + 14
            end
        end
        ui.divider(ui.H - 22)
        onion.display_text('[SELECT] Skip  [CANCEL] Leave',
            6, ui.H - 16, { font = 'small', clear = false })

    -- ── mask_off ──────────────────────────────────────────────────────────
    elseif state.phase == 'mask_off' then
        ui.title('[ DEEPDISH — MASK OFF ]', 4)
        ui.divider(18)
        draw_scrollable(state.monologue_lines, state.monologue_scroll, 24)
        ui.divider(ui.H - 22)
        onion.display_text('[UP/DN] Scroll  [SELECT] Respond  [CANCEL] Exit',
            6, ui.H - 16, { font = 'small', clear = false })

    -- ── conversation ──────────────────────────────────────────────────────
    elseif state.phase == 'conversation' then
        if state.waiting then
            onion.clear_display()
            ui.title('[ DEEPDISH ]', 60)
            onion.display_text('Thinking...', 90, 96, { font = 'small', clear = false })
            return
        end

        ui.title('[ DEEPDISH ]', 4)
        -- NPC reply (top half)
        if state.npc_lines and #state.npc_lines > 0 then
            local preview_lines = 3
            for i = 1, preview_lines do
                local li = i + state.npc_scroll
                if state.npc_lines[li] then
                    onion.display_text(state.npc_lines[li], 6, 18 + (i-1)*12,
                        { font = 'small', clear = false })
                end
            end
        end
        ui.divider(58)
        -- Choice menu (bottom half)
        ui.menu(state.choices, state.selected, 4, 62, ui.W - 8)
        ui.divider(ui.H - 22)
        onion.display_text('[UP/DN] Choose  [SEL] Say  [L/R] Scroll reply  [CANCEL] Exit',
            6, ui.H - 16, { font = 'small', clear = false })

    -- ── win ───────────────────────────────────────────────────────────────
    elseif state.phase == 'win' then
        ui.title('EMBARGO LIFTED', 4)
        ui.divider(18)
        draw_scrollable(state.win_lines, state.win_scroll, 24)
        ui.divider(ui.H - 22)
        onion.display_text('[UP/DN] Scroll  [SELECT] OK',
            6, ui.H - 16, { font = 'small', clear = false })

    -- ── done ──────────────────────────────────────────────────────────────
    elseif state.phase == 'done' then
        ui.splash('FINALE\nCOMPLETE', 'Onion supply restored', '[ANY] Leave')
    end
end

return screen
