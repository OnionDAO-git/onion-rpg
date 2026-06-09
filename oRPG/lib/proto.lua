-- oRPG/lib/proto.lua
-- Lua re-implementation of the CONTRACTS §3 ESP-NOW wire protocol.
--
-- Frame layout (mirrors src/lib/shared/protocol.ts exactly):
--   byte 0    MAGIC   = 0x4F ('O')
--   byte 1    VERSION = 0x01
--   byte 2    type    (MsgType)
--   byte 3    flags   (bit0 = more-chunks-follow)
--   byte 4-5  msgId   (uint16 BE)
--   byte 6    seq     (uint8)  chunk index, 0-based
--   byte 7    total   (uint8)  total chunk count (>=1)
--   byte 8..N body    (UTF-8 JSON, <= 232 bytes per frame)

local proto = {}

-- ── Constants ─────────────────────────────────────────────────────────────

proto.MAGIC   = 0x4F
proto.VERSION = 0x01
proto.HEADER  = 8
proto.BODY_MAX = 232  -- 240 - 8

proto.FLAG_MORE = 0x01

-- MsgType numeric constants (stable wire values — append-only).
proto.MsgType = {
    BEACON_HELLO         = 0x01,
    OPERATIVE_IDENTIFY   = 0x02,
    IDENTIFY_ACK         = 0x03,
    BADGE_MOVE           = 0x04,
    EINK_FRAME           = 0x05,

    CHALLENGE_BEGIN      = 0x10,
    CHALLENGE_INTRO      = 0x11,
    CHALLENGE_RESULT     = 0x12,

    COMBAT_ROLL_REQUEST  = 0x20,
    COMBAT_ROLL_RESPONSE = 0x21,

    VOICE_CAPTURE_SUBMIT = 0x30,
    VOICE_RESULT         = 0x31,

    MERCHANT_INPUT       = 0x40,
    MERCHANT_RESULT      = 0x41,

    NPC_DIALOGUE_TURN    = 0x50,
    NPC_DIALOGUE_REPLY   = 0x51,

    REWARD_GRANT         = 0x60,
    PROGRESSION_STATE    = 0x61,

    ACK   = 0x70,
    ERROR = 0x71,
}

-- ── Minimal JSON encoder ──────────────────────────────────────────────────
-- Lua has no built-in JSON. We need encode only (server sends us JSON that
-- we decode with the tiny decoder below). Handles: nil, bool, number,
-- string, array-table, map-table. Not production-hardened, but covers every
-- body shape in CONTRACTS §3.

local function json_encode(v)
    local t = type(v)
    if v == nil then
        return 'null'
    elseif t == 'boolean' then
        return v and 'true' or 'false'
    elseif t == 'number' then
        -- format integers without decimal point for wire compactness
        if v == math.floor(v) and math.abs(v) < 1e15 then
            return string.format('%d', v)
        end
        return string.format('%g', v)
    elseif t == 'string' then
        -- escape special chars
        local s = v:gsub('\\', '\\\\')
                   :gsub('"', '\\"')
                   :gsub('\n', '\\n')
                   :gsub('\r', '\\r')
                   :gsub('\t', '\\t')
        return '"' .. s .. '"'
    elseif t == 'table' then
        -- detect array vs map: an array has only sequential integer keys
        local is_arr = true
        local n = 0
        for k, _ in pairs(v) do
            n = n + 1
            if type(k) ~= 'number' or k ~= math.floor(k) or k < 1 then
                is_arr = false
                break
            end
        end
        is_arr = is_arr and (n == #v)

        if is_arr then
            local parts = {}
            for i = 1, #v do
                parts[i] = json_encode(v[i])
            end
            return '[' .. table.concat(parts, ',') .. ']'
        else
            local parts = {}
            for k, val in pairs(v) do
                parts[#parts + 1] = json_encode(tostring(k)) .. ':' .. json_encode(val)
            end
            return '{' .. table.concat(parts, ',') .. '}'
        end
    end
    return 'null'
end

-- ── Minimal JSON decoder ──────────────────────────────────────────────────
-- Parses only the subset we receive from the server (object, array, string,
-- number, bool, null). Recursive descent. Returns value, rest_of_string.

local function json_skip_ws(s, i)
    while i <= #s and s:sub(i, i):match('%s') do i = i + 1 end
    return i
end

local json_parse_value  -- forward declaration

local function json_parse_string(s, i)
    -- i points at opening "
    i = i + 1 -- skip "
    local buf = {}
    while i <= #s do
        local c = s:sub(i, i)
        if c == '"' then
            return table.concat(buf), i + 1
        elseif c == '\\' then
            i = i + 1
            local e = s:sub(i, i)
            if     e == '"'  then buf[#buf+1] = '"'
            elseif e == '\\' then buf[#buf+1] = '\\'
            elseif e == '/'  then buf[#buf+1] = '/'
            elseif e == 'n'  then buf[#buf+1] = '\n'
            elseif e == 'r'  then buf[#buf+1] = '\r'
            elseif e == 't'  then buf[#buf+1] = '\t'
            else                   buf[#buf+1] = e
            end
        else
            buf[#buf+1] = c
        end
        i = i + 1
    end
    error('unterminated string')
end

local function json_parse_array(s, i)
    i = i + 1 -- skip [
    local arr = {}
    i = json_skip_ws(s, i)
    if s:sub(i, i) == ']' then return arr, i + 1 end
    while true do
        local v
        v, i = json_parse_value(s, i)
        arr[#arr + 1] = v
        i = json_skip_ws(s, i)
        local c = s:sub(i, i)
        if c == ']' then return arr, i + 1 end
        if c ~= ',' then error('expected , or ] in array') end
        i = i + 1
        i = json_skip_ws(s, i)
    end
end

local function json_parse_object(s, i)
    i = i + 1 -- skip {
    local obj = {}
    i = json_skip_ws(s, i)
    if s:sub(i, i) == '}' then return obj, i + 1 end
    while true do
        i = json_skip_ws(s, i)
        local k
        k, i = json_parse_string(s, i)
        i = json_skip_ws(s, i)
        if s:sub(i, i) ~= ':' then error('expected : in object') end
        i = i + 1
        local v
        v, i = json_parse_value(s, i)
        obj[k] = v
        i = json_skip_ws(s, i)
        local c = s:sub(i, i)
        if c == '}' then return obj, i + 1 end
        if c ~= ',' then error('expected , or } in object') end
        i = i + 1
    end
end

json_parse_value = function(s, i)
    i = json_skip_ws(s, i)
    local c = s:sub(i, i)
    if c == '"' then
        return json_parse_string(s, i)
    elseif c == '[' then
        return json_parse_array(s, i)
    elseif c == '{' then
        return json_parse_object(s, i)
    elseif s:sub(i, i+3) == 'true' then
        return true, i + 4
    elseif s:sub(i, i+4) == 'false' then
        return false, i + 5
    elseif s:sub(i, i+3) == 'null' then
        return nil, i + 4
    else
        -- number
        local num_s, j = s:match('^(-?%d+%.?%d*[eE]?[+-]?%d*)()', i)
        if num_s then
            return tonumber(num_s), j
        end
        error('unexpected token at pos ' .. i .. ': ' .. s:sub(i, i+8))
    end
end

local function json_decode(s)
    if not s or s == '' then return nil end
    local ok, v = pcall(function()
        local val, _ = json_parse_value(s, 1)
        return val
    end)
    if ok then return v end
    onion.log('oRPG json_decode error: ' .. tostring(v))
    return nil
end

-- expose helpers for other modules
proto.json_encode = json_encode
proto.json_decode = json_decode

-- ── Frame encode ──────────────────────────────────────────────────────────
-- Encodes a body table into one or more binary frames (as Lua strings,
-- since onion.espnow_send accepts a string payload).
--
-- Returns: array of frame strings, each <= 240 bytes.

local function uint16_be_bytes(n)
    return string.char(math.floor(n / 256) % 256, n % 256)
end

function proto.encode(msg_type, msg_id, body)
    local json = json_encode(body)
    local bytes = json  -- Lua strings are byte arrays

    local total_chunks = math.max(1, math.ceil(#bytes / proto.BODY_MAX))
    if total_chunks > 255 then
        error('message too large: ' .. #bytes .. ' bytes')
    end

    local frames = {}
    for seq = 0, total_chunks - 1 do
        local start  = seq * proto.BODY_MAX + 1
        local finish = math.min(start + proto.BODY_MAX - 1, #bytes)
        local chunk  = bytes:sub(start, finish)
        local more   = (seq < total_chunks - 1) and proto.FLAG_MORE or 0x00
        local header = string.char(
            proto.MAGIC,
            proto.VERSION,
            msg_type,
            more
        ) .. uint16_be_bytes(msg_id) .. string.char(seq, total_chunks)
        frames[#frames + 1] = header .. chunk
    end
    return frames
end

-- ── Frame decode ──────────────────────────────────────────────────────────
-- Parses one raw frame string into a header table + raw body string.
-- Returns nil, err on bad magic/version.

function proto.decode_frame(raw)
    if #raw < proto.HEADER then
        return nil, 'frame too short'
    end
    local b = {raw:byte(1, proto.HEADER)}
    if b[1] ~= proto.MAGIC then
        return nil, string.format('bad magic 0x%02x', b[1])
    end
    if b[2] ~= proto.VERSION then
        return nil, string.format('unsupported version 0x%02x', b[2])
    end
    local frame = {
        msg_type = b[3],
        flags    = b[4],
        msg_id   = b[5] * 256 + b[6],
        seq      = b[7],
        total    = b[8],
        more     = (b[4] % 2 == 1),
        body_raw = raw:sub(proto.HEADER + 1),
    }
    return frame
end

-- ── Reassembler ───────────────────────────────────────────────────────────
-- Collects chunks sharing a msg_id and returns the decoded body table once
-- all `total` chunks have arrived (mirrors TS Reassembler class).
-- Usage: proto.new_reassembler() -> reassembler object
--   reassembler:push(frame) -> body_table or nil

function proto.new_reassembler()
    local r = {
        chunks    = {},
        total     = 0,
        msg_type  = nil,
        msg_id    = nil,
    }

    function r:push(frame)
        self.msg_type = frame.msg_type
        self.msg_id   = frame.msg_id
        self.total    = frame.total
        self.chunks[frame.seq] = frame.body_raw

        -- count how many seq slots we have (0-based)
        local have = 0
        for _ in pairs(self.chunks) do have = have + 1 end
        if have < self.total then return nil end

        -- all chunks present: concatenate in order
        local parts = {}
        for i = 0, self.total - 1 do
            if not self.chunks[i] then return nil end  -- gap; wait
            parts[#parts + 1] = self.chunks[i]
        end
        local full = table.concat(parts)
        return json_decode(full)
    end

    function r:reset()
        self.chunks   = {}
        self.total    = 0
        self.msg_type = nil
        self.msg_id   = nil
    end

    return r
end

return proto
