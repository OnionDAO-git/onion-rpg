-- oRPG/lib/ui.lua
-- E-paper UI/render toolkit for the 264x176 B/W e-paper display.
--
-- The display is landscape 264x176.  All coordinates are (x, y) pixels from
-- top-left corner.  Colors: 'black' draws ink; 'white' erases.  Fonts: 'small'
-- (default), 'bold', 'large'.
--
-- Public API:
--   ui.clear()
--   ui.border(margin?)
--   ui.title(text, y?)
--   ui.body_text(lines_table, x?, y?, line_height?, font?)
--   ui.wrap_text(text, max_chars_per_line) -> lines_table
--   ui.hud(operavive_table)                  -- top-bar with act/HP/onions
--   ui.menu(items, selected_idx, x?, y?, w?) -> renders selectable list
--   ui.progress_bar(x, y, w, h, pct, label?) -- 0.0..1.0
--   ui.hp_bar(x, y, w, label, hp, max_hp, color?)
--   ui.combat_hud(state)                     -- full combat layout
--   ui.dialogue_screen(speaker, text, prompt?)
--   ui.voice_screen(state, prompt?)          -- 'listening'|'processing'|'done'
--   ui.merchant_screen(items, balance, prompt?)
--   ui.splash(title, subtitle?, attribution?)
--   ui.confirm(question, hint?)

local ui = {}

-- ── Display constants ─────────────────────────────────────────────────────

ui.W = 264
ui.H = 176

-- approximate character widths per font at the badge's fixed-pitch font sizes
ui.FONT_SMALL_W  = 6   -- ~6px per char, ~43 chars per row
ui.FONT_BOLD_W   = 8   -- ~8px per char, ~33 chars per row
ui.FONT_LARGE_W  = 12  -- ~12px per char, ~22 chars per row

-- line heights (pixels between baselines)
ui.LH_SMALL  = 14
ui.LH_BOLD   = 16
ui.LH_LARGE  = 24

-- ── Primitives ────────────────────────────────────────────────────────────

function ui.clear()
    onion.clear_display()
end

-- Draw a border rectangle inset by `margin` pixels (default 2).
function ui.border(margin)
    margin = margin or 2
    onion.display_rect(
        margin, margin,
        ui.W - margin * 2,
        ui.H - margin * 2,
        { clear = false }
    )
end

-- Draw a centred title string at y (default 12).
function ui.title(text, y)
    y = y or 12
    local char_w = ui.FONT_BOLD_W
    local x = math.max(4, math.floor((ui.W - #text * char_w) / 2))
    onion.display_text(text, x, y, { font = 'bold', clear = false })
end

-- Draw a horizontal divider line at y.
function ui.divider(y)
    onion.display_line(4, y, ui.W - 4, y, { clear = false })
end

-- ── Text helpers ──────────────────────────────────────────────────────────

local function font_char_width(font)
    if font == 'large' then return ui.FONT_LARGE_W end
    if font == 'bold' then return ui.FONT_BOLD_W end
    return ui.FONT_SMALL_W
end

local function max_chars_for_width(x, w, font)
    local available = w or (ui.W - x - 6)
    return math.max(1, math.floor(available / font_char_width(font)))
end

-- Wrap `text` into lines of at most `max_chars` characters, breaking on spaces.
function ui.wrap_text(text, max_chars)
    max_chars = max_chars or 36
    local lines = {}
    local current = ''
    for word in text:gmatch('%S+') do
        if #current == 0 then
            current = word
        elseif #current + 1 + #word <= max_chars then
            current = current .. ' ' .. word
        else
            lines[#lines + 1] = current
            current = word
        end
    end
    if #current > 0 then lines[#lines + 1] = current end
    if #lines == 0 then lines[1] = '' end
    return lines
end

-- Draw a table of lines starting at (x, y) with given line_height and font.
-- Returns the y coordinate after the last line.
function ui.body_text(lines, x, y, line_height, font, w, max_lines)
    x           = x           or 6
    y           = y           or 30
    line_height = line_height or ui.LH_SMALL
    font        = font        or 'small'
    if type(lines) == 'string' then lines = { lines } end

    local wrapped = {}
    local max_chars = max_chars_for_width(x, w, font)
    for _, line in ipairs(lines or {}) do
        local parts = ui.wrap_text(tostring(line or ''), max_chars)
        for _, part in ipairs(parts) do
            wrapped[#wrapped + 1] = part
        end
    end
    if #wrapped == 0 then wrapped[1] = '' end

    local limit = max_lines or #wrapped
    for i = 1, math.min(#wrapped, limit) do
        onion.display_text(wrapped[i], x, y + (i - 1) * line_height,
            { font = font, clear = false })
    end
    return y + math.min(#wrapped, limit) * line_height
end

-- ── HUD bar ───────────────────────────────────────────────────────────────
-- Draws a top info bar: "ACT N  HP:xx  🧅 yyy"
-- `op` is the operative table: { act, hp, max_hp, onions, callsign }

function ui.hud(op)
    local act     = op and op.act      or 0
    local hp      = op and op.hp       or 100
    local max_hp  = op and op.max_hp   or 100
    local onions  = op and op.onions   or '?'
    local sign    = op and op.callsign or ''

    local left  = string.format('ACT%d  %s', act, sign)
    local right = string.format('HP:%d/%d  O:%s', hp, max_hp, tostring(onions))

    onion.display_text(left,  4,  8, { font = 'small', clear = false })
    local rx = ui.W - #right * ui.FONT_SMALL_W - 4
    onion.display_text(right, rx, 8, { font = 'small', clear = false })
    -- divider below HUD
    onion.display_line(0, 18, ui.W, 18, { clear = false })
end

-- ── Progress bar ─────────────────────────────────────────────────────────
-- Draws a filled rectangle representing `pct` (0.0..1.0) of width `w`.
-- An optional label is drawn inside (right-aligned if fits).

function ui.progress_bar(x, y, w, h, pct, label)
    pct = math.max(0, math.min(1, pct))
    local fill = math.floor(w * pct)
    onion.display_rect(x, y, w, h, { clear = false })
    if fill > 0 then
        -- draw filled portion as a series of horizontal lines
        for row = y + 1, y + h - 1 do
            onion.display_line(x + 1, row, x + fill, row, { clear = false })
        end
    end
    if label then
        local lx = x + w + 4
        onion.display_text(label, lx, y + 2, { font = 'small', clear = false })
    end
end

-- ── HP bar ────────────────────────────────────────────────────────────────
-- Named variant of progress_bar for HP display.
-- label: 'Enemy' | 'You' | 'DEEPDISH' etc.

function ui.hp_bar(x, y, w, label, hp, max_hp)
    max_hp = math.max(1, max_hp)
    local pct = hp / max_hp
    local hp_label = string.format('%s %d/%d', label, hp, max_hp)
    onion.display_text(hp_label, x, y - 12, { font = 'small', clear = false })
    ui.progress_bar(x, y, w, 8, pct)
end

-- ── Selectable menu ───────────────────────────────────────────────────────
-- Draws a vertical list; `selected` item (1-based) gets a "> " prefix and
-- a filled selection box.
-- Returns the item table unmodified (for chaining).

function ui.menu(items, selected, x, y, w)
    x        = x        or 8
    y        = y        or 32
    w        = w        or (ui.W - 16)
    selected = selected or 1

    for i, item in ipairs(items) do
        local iy  = y + (i - 1) * ui.LH_BOLD
        local lbl = (i == selected) and ('> ' .. item) or ('  ' .. item)
        if i == selected then
            -- highlight row
            for row = iy - 1, iy + ui.LH_BOLD - 3 do
                onion.display_line(x, row, x + w, row, { clear = false })
            end
            onion.display_text(lbl, x + 2, iy, { font = 'bold', clear = false, color = 'white' })
        else
            onion.display_text(lbl, x + 2, iy, { font = 'bold', clear = false })
        end
    end
    return items
end

-- ── Combat HUD ────────────────────────────────────────────────────────────
-- Full-screen layout for a combat challenge.
-- state: { enemy_name, enemy_hp, enemy_max_hp, op_hp, op_max_hp,
--          wave, waves_req, status, message }

function ui.combat_hud(state)
    local enemy = state.enemy_name or 'ENEMY'
    local msg   = state.message    or ''
    local st    = state.status     or 'active'

    -- header
    onion.display_text('!! COMBAT !!', math.floor((ui.W - 12 * 12) / 2), 4,
        { font = 'large', clear = false })
    ui.divider(26)

    -- enemy name + wave counter
    local wave_str = string.format('Wave %d/%d', state.wave or 1, state.waves_req or 1)
    onion.display_text(enemy,    6, 32, { font = 'bold',  clear = false })
    onion.display_text(wave_str, ui.W - #wave_str * ui.FONT_BOLD_W - 6, 32,
        { font = 'bold', clear = false })

    -- HP bars
    local bar_w = math.floor((ui.W - 24) / 2)
    ui.hp_bar(6, 60, bar_w, enemy,
        state.enemy_hp or 0, state.enemy_max_hp or 100)
    ui.hp_bar(ui.W - bar_w - 6, 60, bar_w, 'You',
        state.op_hp or 0, state.op_max_hp or 100)

    -- status / message area
    ui.divider(82)
    if st == 'won' then
        ui.title('** YOU WIN **', 96)
    elseif st == 'lost' then
        ui.title('** DEFEATED **', 96)
    elseif st == 'active' then
        local lines = ui.wrap_text(msg, 42)
        ui.body_text(lines, 6, 90, ui.LH_SMALL)
    end

    -- button hints at the bottom
    onion.display_line(0, ui.H - 18, ui.W, ui.H - 18, { clear = false })
    onion.display_text('[SELECT] Roll  [CANCEL] Flee', 6, ui.H - 14,
        { font = 'small', clear = false })
end

-- ── Dialogue / NPC screen ─────────────────────────────────────────────────
-- speaker: 'DEEPDISH' | 'Operative' | NPC name
-- text: the utterance (will be wrapped)
-- prompt: optional bottom hint e.g. '[SELECT] Respond  [CANCEL] Leave'

function ui.dialogue_screen(speaker, text, prompt)
    -- speaker label
    local label = string.format('[ %s ]', speaker)
    onion.display_text(label, 4, 4, { font = 'bold', clear = false })
    ui.divider(18)

    -- wrapped body
    local lines = ui.wrap_text(text or '', 40)
    ui.body_text(lines, 6, 24, ui.LH_SMALL)

    -- prompt hint
    if prompt then
        ui.divider(ui.H - 20)
        onion.display_text(prompt, 6, ui.H - 16, { font = 'small', clear = false })
    end
end

-- ── Voice screen ─────────────────────────────────────────────────────────
-- state: 'idle' | 'listening' | 'processing' | 'done'
-- prompt: the challenge instruction (what to say)

function ui.voice_screen(state, prompt)
    local states = {
        idle       = 'Press SELECT to speak',
        listening  = '*** LISTENING ***',
        processing = 'Processing...',
        done       = 'Submitted.',
    }
    local label = states[state] or state

    ui.title('VOICE CHALLENGE', 6)
    ui.divider(20)

    if prompt then
        local lines = ui.wrap_text(prompt, 40)
        ui.body_text(lines, 6, 26, ui.LH_SMALL)
    end

    -- status indicator centred near bottom
    local sx = math.max(4, math.floor((ui.W - #label * ui.FONT_BOLD_W) / 2))
    onion.display_text(label, sx, ui.H - 32, { font = 'bold', clear = false })

    ui.divider(ui.H - 18)
    onion.display_text('[SELECT] Record  [CANCEL] Skip', 6, ui.H - 14,
        { font = 'small', clear = false })
end

-- ── Merchant screen ───────────────────────────────────────────────────────
-- items: array of { name, cost, description? }
-- balance: current onion balance (number or string)
-- prompt: active input sequence (e.g. 'up up select')

function ui.merchant_screen(items, balance, prompt)
    ui.title('=[ MERCHANT ]=', 4)
    onion.display_text('Onions: ' .. tostring(balance), ui.W - 80, 4,
        { font = 'small', clear = false })
    ui.divider(18)

    for i, item in ipairs(items) do
        local iy  = 22 + (i - 1) * ui.LH_SMALL
        local row = string.format('%-20s %dO', item.name or '?', item.cost or 0)
        onion.display_text(row, 6, iy, { font = 'small', clear = false })
    end

    ui.divider(ui.H - 30)
    local seq_label = prompt and ('> ' .. prompt) or 'Enter sequence:'
    onion.display_text(seq_label, 6, ui.H - 26, { font = 'small', clear = false })
    onion.display_text('[UP/DN/L/R/SEL] input  [CANCEL] leave', 6, ui.H - 14,
        { font = 'small', clear = false })
end

-- ── Splash screen ─────────────────────────────────────────────────────────
-- Used for title / boot / act transition screens.

function ui.splash(title, subtitle, attribution)
    ui.border(3)

    -- big title centred vertically-ish
    local title_lines = ui.wrap_text(title, 20)
    local total_h = #title_lines * ui.LH_LARGE + (subtitle and ui.LH_SMALL or 0)
    local start_y = math.floor((ui.H - total_h) / 2)

    for i, line in ipairs(title_lines) do
        local x = math.max(6, math.floor((ui.W - #line * ui.FONT_LARGE_W) / 2))
        onion.display_text(line, x, start_y + (i - 1) * ui.LH_LARGE,
            { font = 'large', clear = false })
    end

    if subtitle then
        local sub_y = start_y + #title_lines * ui.LH_LARGE + 4
        local sx = math.max(6, math.floor((ui.W - #subtitle * ui.FONT_SMALL_W) / 2))
        onion.display_text(subtitle, sx, sub_y, { font = 'small', clear = false })
    end

    if attribution then
        onion.display_text(attribution, 6, ui.H - 14,
            { font = 'small', clear = false })
    end
end

-- ── Confirm prompt ────────────────────────────────────────────────────────
-- Minimal yes/no prompt used for DEEPDISH intro acknowledgement, etc.
-- hint: e.g. '[SELECT] Yes  [CANCEL] No'

function ui.confirm(question, hint)
    ui.title(question, math.floor(ui.H / 2) - 10)
    hint = hint or '[SELECT] OK  [CANCEL] Cancel'
    ui.divider(ui.H - 20)
    local hx = math.max(4, math.floor((ui.W - #hint * ui.FONT_SMALL_W) / 2))
    onion.display_text(hint, hx, ui.H - 14, { font = 'small', clear = false })
end

return ui
