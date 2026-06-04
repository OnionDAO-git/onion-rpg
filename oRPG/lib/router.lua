-- oRPG/lib/router.lua
-- Screen router: loads oRPG/screens/<challengeId>.lua lazily via require
-- and drives the begin/update/render lifecycle.
--
-- Usage:
--   local router = require('lib.router')
--   router.push('0.1', ctx)   -- load and enter a screen
--   router.update(ctx, dt)    -- tick the active screen; returns 'done' or nil
--   router.render(ctx)        -- draw the active screen
--   router.pop()              -- return to the previous screen (stack-based)
--   router.current_id()       -- returns active challengeId or nil

local ui = require('lib.ui')

local router = {}

-- Stack of { id, screen_module, ctx } frames. The top is active.
local _stack = {}

-- Cache of loaded screen modules keyed by challengeId.
local _loaded = {}

-- ── load ─────────────────────────────────────────────────────────────────
-- Lazily require a screen module.  challengeId is the dotted SPEC id, e.g.
-- '0.1' or '4.2'.  Lua's require() treats '.' as a path separator, so the
-- dotted id is mapped to an underscore slug for the module name:
--   '4.2' -> require('screens.4_2') -> screens/4_2.lua
-- This mirrors the beacon firmware's safe_id convention
-- (challenge_id '4.2' -> /spiffs/challenge_4_2.json).
-- Returns the module table or nil, err.

local function load_screen(challenge_id)
    if _loaded[challenge_id] then
        return _loaded[challenge_id]
    end
    local slug = challenge_id:gsub('%.', '_')
    local mod_name = 'screens.' .. slug
    local ok, mod = pcall(require, mod_name)
    if not ok then
        onion.log('router: failed to load screen ' .. mod_name .. ': ' .. tostring(mod))
        return nil, tostring(mod)
    end
    if type(mod) ~= 'table' then
        return nil, 'screen module ' .. mod_name .. ' did not return a table'
    end
    -- validate interface
    if type(mod.begin)  ~= 'function' then return nil, mod_name .. ' missing begin()' end
    if type(mod.update) ~= 'function' then return nil, mod_name .. ' missing update()' end
    if type(mod.render) ~= 'function' then return nil, mod_name .. ' missing render()' end
    _loaded[challenge_id] = mod
    return mod
end

-- ── push ─────────────────────────────────────────────────────────────────
-- Load and enter a challenge screen.  ctx is the shared context table built
-- in oRPG.lua (contains net, ui helpers, operative state, etc.).
-- Returns true or nil, err.

function router.push(challenge_id, ctx)
    local mod, err = load_screen(challenge_id)
    if not mod then
        return nil, err
    end
    -- call begin; let errors propagate to oRPG.lua's top-level handler
    local ok, begin_err = pcall(mod.begin, ctx)
    if not ok then
        return nil, 'screen begin error: ' .. tostring(begin_err)
    end
    _stack[#_stack + 1] = { id = challenge_id, mod = mod, ctx = ctx }
    onion.log('router: entered screen ' .. challenge_id)
    return true
end

-- ── pop ──────────────────────────────────────────────────────────────────
-- Return to the previous screen (or nil if the stack is empty).

function router.pop()
    if #_stack > 0 then
        local top = _stack[#_stack]
        _stack[#_stack] = nil
        onion.log('router: exited screen ' .. top.id)
    end
end

-- ── current_id ───────────────────────────────────────────────────────────

function router.current_id()
    if #_stack == 0 then return nil end
    return _stack[#_stack].id
end

-- ── update ───────────────────────────────────────────────────────────────
-- Tick the active screen.  Returns 'done' to signal the caller to pop(), or
-- nil to keep running.  dt is milliseconds since last tick.

function router.update(ctx, dt)
    if #_stack == 0 then return nil end
    local top = _stack[#_stack]
    local ok, result = pcall(top.mod.update, ctx, dt)
    if not ok then
        onion.log('router: update error in ' .. top.id .. ': ' .. tostring(result))
        return 'error'
    end
    return result
end

-- ── render ───────────────────────────────────────────────────────────────
-- Draw the active screen.  Clears first, then calls screen.render(ctx).

function router.render(ctx)
    if #_stack == 0 then return end
    local top = _stack[#_stack]
    onion.clear_display()
    local ok, err = pcall(top.mod.render, ctx)
    if not ok then
        onion.log('router: render error in ' .. top.id .. ': ' .. tostring(err))
        -- draw an error placeholder rather than showing a stale frame
        onion.display_lines({ 'RENDER ERROR', top.id, tostring(err):sub(1, 30) },
            6, 40, 18, { font = 'small', clear = false })
    end
end

-- ── replace ──────────────────────────────────────────────────────────────
-- Pop the current screen and immediately push a new one.

function router.replace(challenge_id, ctx)
    router.pop()
    return router.push(challenge_id, ctx)
end

return router
