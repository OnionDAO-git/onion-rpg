-- oRPG/lib/hardware.lua
-- Thin hardware IO bridge for badge submodules.
--
-- The server can attach an `io` directive to an EINK_FRAME. The badge executes
-- supported local IO and submits the measured/result payload as BADGE_MOVE
-- kind="io". Unsupported primitives return an availability/error marker so the
-- server can choose a fallback.

local caps = require('lib.caps')

local hardware = {}

local function call(name, ...)
    local fn = onion[name]
    if type(fn) ~= 'function' then return nil, 'missing:' .. name end
    local ok, a, b = pcall(fn, ...)
    if not ok then return nil, tostring(a) end
    return a, b
end

local function hex_to_bytes(hex)
    if type(hex) ~= 'string' then return nil end
    local clean = hex:gsub('[^0-9a-fA-F]', '')
    if #clean == 0 or #clean % 2 ~= 0 then return nil end
    local out = {}
    for i = 1, #clean, 2 do
        out[#out + 1] = string.char(tonumber(clean:sub(i, i + 1), 16))
    end
    return table.concat(out)
end

local function bytes_to_hex(bytes)
    if type(bytes) ~= 'string' then return nil end
    return (bytes:gsub('.', function(c) return string.format('%02x', c:byte()) end))
end

local function int16_le_at(bytes, i)
    local lo = bytes:byte(i) or 0
    local hi = bytes:byte(i + 1) or 0
    local v = lo + hi * 256
    if v >= 32768 then v = v - 65536 end
    return v
end

function hardware.capabilities()
    return {
        gpio = type(onion.gpio_read) == 'function'
            or type(onion.digital_read) == 'function'
            or type(onion.pin_read) == 'function',
        mic = caps.voice == true,
        speaker = caps.speaker == true,
        subghz = caps.subghz == true,
    }
end

function hardware.read_gpio(pins)
    pins = pins or _G.ORPG_GPIO_PINS
    if type(pins) ~= 'table' then return nil end

    local read_fn = onion.gpio_read or onion.digital_read or onion.pin_read
    if type(read_fn) ~= 'function' then
        return { available = false, error = 'no gpio read primitive' }
    end

    local values = {}
    for label, pin in pairs(pins) do
        local mode_fn = onion.gpio_mode or onion.pin_mode
        if type(mode_fn) == 'function' then pcall(mode_fn, pin, 'input') end
        local ok, value = pcall(read_fn, pin)
        values[tostring(label)] = ok and value or false
    end
    return { available = true, values = values }
end

function hardware.capture_mic(opts)
    opts = opts or {}
    if not caps.voice then return { available = false, error = 'mic unavailable' } end

    local sample_rate = opts.sampleRate or opts.sample_rate or 16000
    local ms = math.max(100, math.min(opts.ms or 3000, 8000))

    local ok, err = call('sound_mic_begin', { sample_rate = sample_rate })
    if not ok then return { available = false, error = tostring(err or ok) } end

    local total_rms, total_peak, windows = 0, 0, 0

    if type(onion.sound_mic_level) == 'function' then
        local remaining = ms
        while remaining > 0 do
            local slice = math.min(remaining, 1000)
            local lvl = onion.sound_mic_level(slice)
            if type(lvl) == 'table' then
                total_rms = total_rms + (lvl.rms or 0)
                total_peak = math.max(total_peak, lvl.peak or 0)
                windows = windows + 1
            end
            remaining = remaining - slice
        end
    elseif type(onion.sound_mic_read) == 'function' then
        local samples = math.min(math.floor(sample_rate * ms / 1000), 4096)
        local bytes = onion.sound_mic_read(samples)
        if type(bytes) == 'string' then
            local sum_sq, peak, count = 0, 0, 0
            for i = 1, #bytes - 1, 2 do
                local v = int16_le_at(bytes, i)
                sum_sq = sum_sq + v * v
                peak = math.max(peak, math.abs(v))
                count = count + 1
            end
            if count > 0 then
                total_rms = math.floor(math.sqrt(sum_sq / count))
                total_peak = peak
                windows = 1
            end
        end
    end

    call('sound_mic_end')

    if windows == 0 then return { available = true, rms = 0, peak = 0, samples = 0 } end
    return {
        available = true,
        rms = math.floor(total_rms / windows),
        peak = total_peak,
        sampleRate = sample_rate,
        ms = ms,
    }
end

function hardware.play_speaker(opts)
    opts = opts or {}
    if not caps.speaker then return { available = false, error = 'speaker unavailable' } end

    local ok, err = call('sound_speaker_begin', opts.options or {})
    if not ok then return { available = false, error = tostring(err or ok) } end

    local played = false
    if opts.toneHz or opts.freq then
        local freq = opts.toneHz or opts.freq
        local ms = opts.ms or opts.durationMs or 120
        local tone_ok = call('sound_play_tone', freq, ms)
        played = tone_ok and true or false
    elseif opts.sound then
        local sound_ok = call('sound_play', opts.sound)
        played = sound_ok and true or false
    end

    call('sound_speaker_end')
    return { available = true, played = played }
end

function hardware.subghz_tx(opts)
    opts = opts or {}
    if not caps.subghz then return { available = false, error = 'subghz unavailable' } end

    local payload = opts.payload or opts.bytes
    if opts.hex then payload = hex_to_bytes(opts.hex) end
    if type(payload) ~= 'string' or #payload == 0 then
        return { available = true, sent = false, error = 'empty payload' }
    end

    local begin_opts = {
        freq = opts.freq or opts.freqMhz or opts.frequency,
        modulation = opts.modulation,
    }
    local ok, err = call('subghz_begin', begin_opts)
    if not ok then return { available = false, error = tostring(err or ok) } end

    local sent, txerr = call('subghz_transmit', payload)
    call('subghz_end')

    return {
        available = true,
        sent = sent and true or false,
        error = sent and nil or tostring(txerr),
        len = #payload,
        hex = bytes_to_hex(payload),
    }
end

function hardware.subghz_rx(opts)
    opts = opts or {}
    if not caps.subghz then return { available = false, error = 'subghz unavailable' } end

    local begin_opts = {
        freq = opts.freq or opts.freqMhz or opts.frequency,
        modulation = opts.modulation,
    }
    local ok, err = call('subghz_begin', begin_opts)
    if not ok then return { available = false, error = tostring(err or ok) } end

    local msg = nil
    if type(onion.subghz_receive) == 'function' then
        msg = onion.subghz_receive(opts.timeoutMs or opts.timeout_ms or 1000)
    end
    call('subghz_end')

    if type(msg) ~= 'table' then return { available = true, received = false } end
    local payload = msg.payload or msg.message
    return {
        available = true,
        received = true,
        len = msg.len or (type(payload) == 'string' and #payload or nil),
        rssi = msg.rssi_dbm or msg.rssi,
        hex = bytes_to_hex(payload),
    }
end

function hardware.collect(io)
    if type(io) ~= 'table' then return nil end
    local out = { caps = hardware.capabilities() }

    if io.gpio then out.gpio = hardware.read_gpio(io.gpio.pins) end
    if io.mic then out.mic = hardware.capture_mic(io.mic) end
    if io.speaker then out.speaker = hardware.play_speaker(io.speaker) end
    if io.subghzTx then out.subghzTx = hardware.subghz_tx(io.subghzTx) end
    if io.subghzRx then out.subghzRx = hardware.subghz_rx(io.subghzRx) end

    return out
end

return hardware
