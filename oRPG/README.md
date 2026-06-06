# oRPG — badge-side Lua game client

The badge game client published to the Onion OS Lua Script Registry.

- `oRPG.lua` — entry point + main loop (loads per-challenge screens).
- `oRPG/lib/*.lua` — shared libs (net/protocol client, capability shim, ui).
- `oRPG/screens/*.lua` — one screen per challenge id, e.g. `screens/0.1.lua`.

See `../docs/CONTRACTS.md` for the screen module interface, the capability
shim, and the ESP-NOW request/response helper conventions.

## Bundling for Onion OS

Current badge firmware installs one Lua source blob as `/scripts_<name>.lua`.
The oRPG bundle expects firmware with a 256 KB script limit. Generate the
badge-ready single-file bundle:

```bash
bun run orpg:bundle
```

This writes `oRPG/dist/oRPG.bundle.lua`, containing the entry point, shared
libs, and every challenge screen via `package.preload`. Upload that single file
as the registry `code` field. Per-challenge bundles are still available for
older 64 KB firmware with `bun run orpg:bundle:per-screen`.
