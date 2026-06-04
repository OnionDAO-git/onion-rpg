-- oRPG/lib/net.lua
-- ESP-NOW request/response client implementing CONTRACTS §3 protocol.
--
-- Public API:
--   local net = require('lib.net')
--   net.init(beacon_mac)         -- call once after BEACON_HELLO
--   body, err = net.request(msg_type, body_table, timeout_ms?)
--   net.send_frames(frames)      -- fire-and-forget, no reply expected
--
-- For challenges that can reach the server directly (caps.http, i.e. the badge
-- exposes onion.http_get/http_post), callers use net.http_request() instead of
-- the ESP-NOW relay.
--
-- Chunking & retries:
--   Outgoing messages are encoded into <=240-byte frames via proto.encode().
--   All frames are sent before waiting for a reply.
--   Incoming replies are reassembled via proto.new_reassembler().
--   A request retries up to NET_RETRIES times on timeout.

local proto = require('lib.proto')
local caps  = require('lib.caps')

local net = {}

-- ── Configuration ─────────────────────────────────────────────────────────
local NET_TIMEOUT_MS   = 8000   -- per-attempt receive timeout
local NET_RETRIES      = 3      -- total attempts before giving up
local NET_INTER_FRAME_MS = 20   -- small pause between outgoing frames

-- msgId counter: uint16 wrapping counter for request correlation.
local _msg_id_counter = 0
local function next_msg_id()
    _msg_id_counter = (_msg_id_counter + 1) % 65536
    return _msg_id_counter
end

-- Beacon MAC we unicast to (set by net.init, falls back to broadcast).
local _beacon_mac = 'ff:ff:ff:ff:ff:ff'

-- ── init ─────────────────────────────────────────────────────────────────

function net.init(beacon_mac)
    _beacon_mac = beacon_mac or 'ff:ff:ff:ff:ff:ff'
    onion.log('net: target beacon ' .. _beacon_mac)
end

-- ── send_frames ───────────────────────────────────────────────────────────
-- Sends an array of frame strings via ESP-NOW (unicast to beacon).
-- Returns true, or nil, err.

function net.send_frames(frames)
    for i, frame in ipairs(frames) do
        -- espnow_send(payload, mac?) — payload first, optional unicast mac second
        local ok, err = onion.espnow_send(frame, _beacon_mac)
        if not ok then
            return nil, 'send frame ' .. i .. ' failed: ' .. tostring(err)
        end
        if i < #frames then
            onion.sleep(NET_INTER_FRAME_MS)
        end
    end
    return true
end

-- ── request ──────────────────────────────────────────────────────────────
-- Encodes body as per protocol, sends all frames, waits for a complete reply.
-- Returns decoded body table, or nil, error_string on failure.
--
-- timeout_ms: per-attempt receive window (default NET_TIMEOUT_MS).

function net.request(msg_type, body, timeout_ms)
    timeout_ms = timeout_ms or NET_TIMEOUT_MS
    local msg_id = next_msg_id()

    local ok, result = pcall(proto.encode, msg_type, msg_id, body)
    if not ok then
        return nil, 'encode error: ' .. tostring(result)
    end
    local frames = result

    for attempt = 1, NET_RETRIES do
        -- send all outgoing frames
        local sent, send_err = net.send_frames(frames)
        if not sent then
            if attempt == NET_RETRIES then
                return nil, 'send failed: ' .. tostring(send_err)
            end
            onion.sleep(200)
            goto continue
        end

        -- reassemble the reply (may arrive in multiple chunks)
        local reassembler = proto.new_reassembler()
        local deadline = timeout_ms

        while deadline > 0 do
            local slice = math.min(deadline, 2000)
            local msg = onion.espnow_receive(slice)
            if msg then
                local frame, frame_err = proto.decode_frame(msg.message)
                if not frame then
                    onion.log('net: bad frame: ' .. tostring(frame_err))
                elseif frame.msg_id == msg_id then
                    -- this reply correlates with our request
                    local decoded = reassembler:push(frame)
                    if decoded ~= nil then
                        -- handle ERROR responses
                        if frame.msg_type == proto.MsgType.ERROR then
                            local code = (type(decoded) == 'table' and decoded.code) or 'ERR'
                            local emsg = (type(decoded) == 'table' and decoded.msg)  or ''
                            return nil, code .. ': ' .. emsg
                        end
                        return decoded, nil
                    end
                    -- else: still waiting for more chunks
                end
            end
            deadline = deadline - slice
        end

        -- timed out
        if attempt < NET_RETRIES then
            onion.log('net: timeout attempt ' .. attempt .. ', retrying...')
            onion.sleep(300)
        end

        ::continue::
    end

    return nil, 'request timed out after ' .. NET_RETRIES .. ' attempts'
end

-- ── http_request ─────────────────────────────────────────────────────────
-- Uses onion.http_post (caps.http == true) to talk directly to the game
-- server, bypassing the beacon relay.
-- body_table is the same logical shape as net.request() sends over ESP-NOW.
-- Returns decoded response body table, or nil, err.
--
-- The server accepts the same JSON envelopes whether they arrive via beacon
-- relay or direct HTTP (CONTRACTS §4).

function net.http_request(server_url, msg_type, body_table)
    if not caps.http then
        return nil, 'http cap not available'
    end
    -- wrap in the relay envelope format the server expects
    local msg_id = next_msg_id()
    local frames = proto.encode(msg_type, msg_id, body_table)

    -- The direct-HTTP path carries one logical message per POST. Large payloads
    -- must still go through the beacon relay (which chunks over ESP-NOW).
    if #frames > 1 then
        return nil, 'http path: message too large (use beacon relay)'
    end

    local frame_bytes = frames[1]
    -- encode as hex string for transport (no base64 in the Lua sandbox)
    local hex_parts = {}
    for i = 1, #frame_bytes do
        hex_parts[i] = string.format('%02x', frame_bytes:byte(i))
    end
    local frame_hex = table.concat(hex_parts)

    local payload = proto.json_encode({
        direct = true,
        msgType = msg_type,
        msgId = msg_id,
        frameHex = frame_hex,
    })

    -- onion.http_post(url, body, opts) -> { status, body } | nil, err
    local resp, err = onion.http_post(server_url .. '/api/relay', payload, {
        content_type = 'application/json',
        timeout_ms = 15000,
    })

    if not resp then
        return nil, 'http error: ' .. tostring(err)
    end
    if resp.status ~= 200 then
        return nil, 'http error: status ' .. tostring(resp.status)
    end

    local resp_body = proto.json_decode(resp.body)
    if not resp_body then
        return nil, 'http: could not decode response'
    end
    return resp_body, nil
end

return net
