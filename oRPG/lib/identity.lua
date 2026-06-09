-- oRPG/lib/identity.lua
-- Badge identity, address discovery, and optional move signing.
--
-- Game logic stays server-side. This module owns the local badge boundary:
-- hardware id, linked Onion id, exposed wallet/account addresses, and the
-- optional firmware signing primitive when one exists.

local proto = require('lib.proto')

local identity = {}

local function call0(name)
    local fn = onion[name]
    if type(fn) ~= 'function' then return nil end
    local ok, value = pcall(fn)
    if ok then return value end
    onion.log('identity: ' .. name .. ' failed: ' .. tostring(value))
    return nil
end

local function as_nonempty_string(value)
    if type(value) ~= 'string' or value == '' then return nil end
    return value
end

function identity.hardware_id()
    return as_nonempty_string(call0('hardware_id')) or 'unknown-badge'
end

function identity.onion_id()
    local value = call0('onion_id')
    if type(value) == 'number' and value ~= 0 then return value end
    return nil
end

function identity.addresses()
    local out = {}

    local candidates = {
        wallet = { 'wallet_address', 'solana_address', 'address' },
        publicKey = { 'public_key', 'wallet_public_key', 'solana_public_key' },
    }

    for label, names in pairs(candidates) do
        for _, name in ipairs(names) do
            local value = as_nonempty_string(call0(name))
            if value then
                out[label] = value
                break
            end
        end
    end

    local profile = call0('profile')
    if type(profile) == 'table' then
        for _, key in ipairs({ 'wallet', 'address', 'publicKey', 'username' }) do
            if as_nonempty_string(profile[key]) and not out[key] then
                out[key] = profile[key]
            end
        end
    end

    return out
end

function identity.sign_capability()
    for _, spec in ipairs({
        { name = 'sign_message', alg = 'firmware' },
        { name = 'wallet_sign',  alg = 'solana' },
        { name = 'se_sign',      alg = 'ed25519' },
    }) do
        if type(onion[spec.name]) == 'function' then return spec end
    end
    return nil
end

function identity.can_sign()
    return identity.sign_capability() ~= nil
end

function identity.canonical_move(move)
    return proto.json_encode({
        h = move.h,
        o = move.o,
        a = move.a,
        b = move.b,
        k = move.k,
        p = move.p,
        q = move.q,
        t = move.t,
    })
end

function identity.sign_move(move)
    local spec = identity.sign_capability()
    if not spec then return nil end

    local msg = identity.canonical_move(move)
    local ok, sig = pcall(onion[spec.name], msg)
    if not ok or not sig then
        onion.log('identity: signing failed: ' .. tostring(sig))
        return nil
    end

    local addresses = move.a or {}
    return {
        alg = spec.alg,
        key = addresses.publicKey or addresses.wallet,
        sig = tostring(sig),
        msg = msg,
    }
end

return identity
