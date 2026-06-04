# oRPG — badge-side Lua game client

The badge game client published to the Onion OS Lua Script Registry.

- `oRPG.lua` — entry point + main loop (loads per-challenge screens).
- `oRPG/lib/*.lua` — shared libs (net/protocol client, capability shim, ui).
- `oRPG/screens/*.lua` — one screen per challenge id, e.g. `screens/0.1.lua`.

See `../docs/CONTRACTS.md` for the screen module interface, the capability
shim, and the ESP-NOW request/response helper conventions.
