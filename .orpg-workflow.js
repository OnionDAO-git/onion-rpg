export const meta = {
  name: 'orpg-implement',
  description: 'Implement the ONION RPG SPEC: bun+SvelteKit game server, DEEPDISH AI, oRPG.lua badge client, ESP32-C3 beacon firmware + simulator, and Onion OS firmware extensions',
  phases: [
    { title: 'Foundations', detail: 'Scaffold app + write shared contracts (schema, ESP-NOW protocol, types, conventions)' },
    { title: 'Cores', detail: 'Build subsystem cores in disjoint dirs: engine, AI, lua client, beacon fw, simulator, fw-ext, admin' },
    { title: 'Challenges', detail: 'Implement all 13 challenges as self-registering modules + content + beacon configs + lua screens' },
    { title: 'Integration', detail: 'Install deps, typecheck/build, fix errors, write tests + docs' },
    { title: 'Review', detail: 'Adversarial SPEC-coverage review' },
  ],
}

const ROOT = '/Users/spacemandev/Projects/oniondao-git/onion-rpg'
const ONIONOS = '/Users/spacemandev/Projects/oniondao-git/oniondao-badge/software/mods/onion-os'

// Ground-truth platform facts every agent must respect. No agent should re-derive these.
const PREAMBLE = `
You are one of several agents building the ONION RPG ("The Great Onion Shortage") for Onion DAO.
Read the design bible at ${ROOT}/SPEC.md before doing anything substantive.

== PROJECT LAYOUT (the app root IS ${ROOT}) ==
- ${ROOT}/                  -> bun + TypeScript + Svelte 5 / SvelteKit app (game server + admin web UI). adapter-node.
- ${ROOT}/oRPG/             -> the badge-side Lua game client (oRPG.lua + oRPG/lib/*.lua + oRPG/screens/*.lua). This is what gets published to the Onion OS Lua Script Registry and downloaded onto badges.
- ${ROOT}/beacon/           -> ESP32-C3 "Point of Interest" beacon firmware (ESP-IDF, Arduino-as-component), an ESP-NOW <-> WiFi/HTTP bridge to the game server.
- ${ROOT}/sim/              -> a bun/TypeScript software beacon simulator so the game is fully testable without hardware.
- ${ROOT}/firmware-ext/     -> proposed Onion OS (ESP32-S3 badge) C++ Lua-binding extensions (new onion.* primitives). Patches/new files + integration README. Reference the real firmware at ${ONIONOS}/main/main.cpp.
- ${ROOT}/docs/             -> CONTRACTS.md (the shared interface contract) + other docs.

== STACK ==
- Runtime: bun. Language: TypeScript (strict). Web: Svelte 5 (runes: $state/$derived/$props/$effect) + SvelteKit 2, adapter-node, Tailwind 4. DB: Postgres via the 'postgres' (porsager) client, matching the sibling landing-2026 app's style.
- The sibling app landing-2026 (../landing-2026 from repo root) already uses bun + SvelteKit 2 + svelte 5 + postgres + @solana/web3.js + @solana/spl-token + mqtt + resend. Mirror its conventions where sensible. Do NOT modify landing-2026.

== ONION OS LUA SANDBOX (today's firmware, before our extensions) ==
The Lua 'onion' table on the badge exposes ONLY: log, hardware_id, onion_id, wallet, display_size, clear_display, release_display, display_text, display_lines, display_line, display_rect, display_bitmap, images, buttons (left/down/up/right/select/cancel + mask), button_mask, sleep (<=60s), gpio_read, gpio_poll (side-port pins 48,47,19,42,41,40,38,39,16,15,7,6,5,4 only), espnow_start/stop/mac/info/send/receive. Display is a 264x176 black & white e-paper panel (landscape). Fonts: small/bold/large. Colors: black/white.
CRITICAL: today there is NO http, NO mqtt, NO secure-element access, NO mic/voice, NO sub-GHz exposed to Lua. The ONLY network primitive Lua has is ESP-NOW (1..240 byte payloads to nearby ESP devices). So the badge's only path to the game server is via ESP-NOW to a beacon, which bridges to the server over WiFi.

== FIRMWARE EXTENSIONS (in scope: firmware-ext/) ==
We are also specifying new Onion OS C++ Lua primitives so the SPEC's marquee mechanics become first-class on the badge:
- onion.http_request(opts) -> direct HTTPS to the game server (so the badge can talk to the server without a beacon when on WiFi).
- onion.se_rng(nbytes) / onion.se_sign(msg) -> ATECC608B-backed random + attestation so combat rolls are tamper-proof and server-verifiable (the badge already has an ATECC608B; Ed25519 signing is done in software, ATECC provides HMAC/RNG).
- onion.voice_capture(ms) -> capture mic audio (or features) for server-side STT matching.
- onion.subghz_tx(payload, opts) / onion.subghz_rx(timeout_ms) -> sub-GHz transmit/receive for jamming/handshake mini-events.
oRPG.lua must use a capability shim: detect whether each new primitive exists (type(onion.x)=='function') and use it when present, else fall back to the ESP-NOW<->beacon relay path. The game MUST be playable on TODAY'S firmware via ESP-NOW + beacon, and get richer when extensions land.

== ONION DAO SERVER API (currency + registry; lives in landing-2026 at https://oniondao.dev, local http://localhost:5173) ==
Full reference: ${ONIONOS}/API.md. Key points:
- Onions are the in-game currency. Award/spend via POST /api/public/onions/requests (type 'burn' or 'transfer'), bearer ONION_EXTERNAL_API_KEY, idempotency via (requester, externalId). Requests are async: attendee approves in their portal; poll GET /api/public/onions/requests/{id} or receive the callback webhook (HMAC-signed with callbackSecret). The oRPG server is an EXTERNAL APP to that API.
- Profiles: GET /api/public/profile/{username}. Usernames: GET /api/public/usernames.
- Lua Script Registry: publish oRPG via POST /api/portal/lua-scripts; badges list/download via GET /api/public/lua-scripts(+/{id}/download); push to a linked online badge via POST /api/portal/lua-scripts/{id}/push (delivered over MQTT, badge shows accept popup).
- Items/credentials in the SPEC are minted/traded "on-chain". For THIS build: the oRPG game server is the authoritative inventory store (Postgres), and ONIONS (currency) flow through the real Onion DAO API above. Design the inventory layer with a clean seam so items/credentials can later be backed by SPL tokens/NFTs, but do not block on-chain item minting now. Onion rewards DO go through the real API.

== AI STORYTELLER / DEEPDISH ==
The Storyteller is the adversarial AI voice (DEEPDISH: smug, paternal, deeply Chicago, dad jokes + Chicago slang, every cruel act has an educational footnote; true name glen-agent-final-FINAL-v3). Implement via the Anthropic Claude API (@anthropic-ai/sdk), model default claude-opus-4-8 for finale beats and claude-sonnet-4-6 for routine NPC dialogue; use prompt caching for the long system prompt. The Storyteller gates progression by checking on-chain/DB inventory and reacts to player moves. Free-form NPC challenges (1.3, 3.2, 4.2) judge *comprehension*, not memorized strings.
Voice challenges (1.1, 2.3, 3.3): server-side STT. Define a pluggable STT interface (default provider env-driven, e.g. a cloud STT/Whisper-compatible endpoint) so it isn't hard-wired.

== ESP-NOW WIRE PROTOCOL ==
ESP-NOW payloads are <=240 bytes, so the badge<->beacon protocol must be compact (short binary or terse JSON/MsgPack-ish framing, chunked if needed). The beacon relays badge requests to the server over HTTPS and relays server responses back. Foundations defines this protocol in docs/CONTRACTS.md; everyone else conforms to it.

== HARD RULES FOR PARALLEL SAFETY ==
- This is NOT a git repo and there is NO worktree isolation. You MUST only create/edit files inside the directories explicitly assigned to you in your task. Never edit a file owned by another agent.
- Challenges self-register (a glob/registry pattern defined in CONTRACTS.md). Do NOT edit a shared central index/array that other challenge agents also edit.
- Prefer many small, cohesive files over one big file. Match the surrounding code style. Comment at the density of nearby code.
- Your final message is consumed by an orchestrator, not a human: return terse structured facts, not prose.
`

const CONTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'dbTables', 'espnowProtocol', 'serverEndpoints', 'luaConventions', 'challengeRegistry', 'fileMap', 'openQuestions'],
  properties: {
    summary: { type: 'string', description: 'What was scaffolded and where CONTRACTS.md lives' },
    dbTables: { type: 'array', items: { type: 'string' }, description: 'DB table names + one-line purpose each' },
    espnowProtocol: { type: 'string', description: 'Concise description of the badge<->beacon ESP-NOW framing + message types' },
    serverEndpoints: { type: 'array', items: { type: 'string' }, description: 'Route path + method + purpose for each defined/stubbed endpoint' },
    luaConventions: { type: 'string', description: 'How oRPG.lua loads screens, the screen module interface, and the capability shim' },
    challengeRegistry: { type: 'string', description: 'Exact convention a challenge file must follow to self-register (path pattern, export shape)' },
    fileMap: { type: 'array', items: { type: 'string' }, description: 'Key files created and their purpose' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

const CHALLENGE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'filesCreated', 'serverModule', 'beaconConfig', 'luaScreen', 'notes'],
  properties: {
    id: { type: 'string' },
    filesCreated: { type: 'array', items: { type: 'string' } },
    serverModule: { type: 'string', description: 'path to the self-registering server challenge module' },
    beaconConfig: { type: 'string', description: 'path to beacon/sim config for this challenge' },
    luaScreen: { type: 'string', description: 'path to the lua screen, or "none"' },
    notes: { type: 'string', description: 'integration notes, deviations from SPEC, TODOs' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['buildPasses', 'specCoverage', 'gaps', 'recommendation'],
  properties: {
    buildPasses: { type: 'boolean' },
    specCoverage: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area', 'status', 'notes'],
        properties: {
          area: { type: 'string' },
          status: { type: 'string', enum: ['done', 'partial', 'stub', 'missing'] },
          notes: { type: 'string' },
        },
      },
    },
    gaps: { type: 'array', items: { type: 'string' }, description: 'concrete missing/broken things, most important first' },
    recommendation: { type: 'string' },
  },
}

// All 13 challenges from SPEC section 5.
const CHALLENGES = [
  { id: 'act0-1-ketchup-gauntlet', act: 0, type: 'Combat', name: 'The Ketchup Gauntlet',
    detail: 'Robot hot dog vendor turns hostile when you "order ketchup" (wrong button). Secure-element RNG combat, server-verifiable rolls. Tutorial: teaches beacon comms, combat RNG loop, inventory/minting. Also performs Operative registration. Reward: mint item Encased Meat Mk.I + 50 Onions + register Operative credential.' },
  { id: 'act1-1-malort-fountains', act: 1, type: 'Dialogue/Voice', name: 'Malört Fountains',
    detail: 'Water Reclamation NPC at a fountain beacon. Voice: speak the correct treatment-stage sequence (intake -> crib -> tunnel -> Jardine plant -> grid); matched server-side STT. Wrong -> fountain burps Malört. Lesson: Lake Michigan cribs + Jardine plant. Reward: Water Main Key + 80 Onions.' },
  { id: 'act1-2-substation-reroute', act: 1, type: 'Combat', name: 'Substation Reroute',
    detail: 'ComEd substation under "demand spikes" (waves of RNG combat). Each wave survived closes a breaker; survive 3 waves to re-energize the feeder. Lesson: grid segmentation/feeders/cascading failure. Reward: Grid Credential (required for Act 4) + 100 Onions.' },
  { id: 'act1-3-river-ran-backwards', act: 1, type: 'NPC/AI', name: 'The River Ran Backwards',
    detail: 'Old engineer NPC (free-form AI). Quizzes WHY Chicago reversed the river in 1900 (protected the Lake Michigan supply from 1.1). Accepts any answer showing real understanding, not a memorized string. Reward: Reversal Map (hints for Act 2 bridges) + 70 Onions.' },
  { id: 'act2-1-loop-that-wont-stop', act: 2, type: 'Combat/Timing', name: 'The Loop That Won\'t Stop',
    detail: 'Driverless L won\'t open doors. Sub-GHz "signal jamming": transmit a stop code in a timed window (subghz primitive or beacon-relayed timing event), then survive an RNG "doors fighting back" combat beat. Lesson: CTA rail signaling + the elevated Loop. Reward: Transit Pass (fast-travel token) + 90 Onions.' },
  { id: 'act2-2-sorting-machine', act: 2, type: 'Merchant', name: 'The Sorting Machine',
    detail: 'Weaponized USPS sorting machine = black-market merchant. Button-based merchant UI: enter a valid routing sequence (button combo) to unlock a trade tier; wrong sequences cost Onions. Lesson: mail/parcel sort + ZIP routing as logistics. Reward: crafting components for Bridge Override, variable Onion trades.' },
  { id: 'act2-3-bascule-standoff', act: 2, type: 'Voice/Combat', name: 'Bascule Standoff',
    detail: 'Movable bascule bridge stuck mid-raise, guarded by DEEPDISH "Bridge Tender" construct. Voice the lowering sequence (uses Reversal Map from 1.3), then short RNG combat as the construct resists. Lesson: bascule leaves + counterweights; Chicago has the most movable bridges. Reward: River Access + 110 Onions.' },
  { id: 'act3-1-deep-tunnel-descent', act: 3, type: 'Combat', name: 'Descent into the Deep Tunnel',
    detail: 'TARP "Deep Tunnel" flooding on purpose. Endurance RNG combat vs "the rising water" (damage-over-time); reach the beacon before a timer. Lesson: TARP stormwater/sewage reservoirs; why a flat city needs them. Reward: Sump Pump (utility item) + Prompt Fragment #1 + 120 Onions.' },
  { id: 'act3-2-freight-tunnels', act: 3, type: 'NPC/AI', name: 'The Freight Tunnels',
    detail: 'Forgotten early-1900s freight tunnels under the Loop (caused the 1992 Chicago Flood) = DEEPDISH data conduits. Maintenance-bot NPC negotiation: reveal a path if Operatives reason WHY the tunnels are useful to an AI hiding fiber. Reward: Prompt Fragment #2 + Conduit Map + 100 Onions.' },
  { id: 'act3-3-oemc-blackout', act: 3, type: 'Dialogue/Voice', name: 'OEMC Blackout',
    detail: '911 center (OEMC) + fire dispatch jammed. Voice triage: read incoming "calls", speak the correct priority; correct triage restores dispatch capacity. Lesson: dispatch prioritization; shared comms backbone; what "critical system" means. Reward: Prompt Fragment #3 + Dispatch Credential (required for Act 4) + 130 Onions.' },
  { id: 'act3-4-elevator-hack', act: 3, type: 'Combat/Puzzle', name: 'The Elevator Hack',
    detail: 'Hack a networked elevator to reach the City IT floor. Sub-GHz handshake with the elevator beacon + short RNG "intrusion detection fights back" combat. Success mints a floor key. Lesson: elevators as IoT building systems with attack surface. Reward: City IT Keycard (gates Act 4) + Prompt Fragment #4 + 150 Onions.' },
  { id: 'act4-1-server-room', act: 4, type: 'Combat', name: 'The Server Room',
    detail: 'Physical data-center facility where DEEPDISH runs. REQUIRES Grid Credential + Dispatch Credential + City IT Keycard (server gates on inventory). Boss-tier RNG combat vs "watchdog processes"; secure element signs the final hit so the kill is verifiable. Lesson: what a data center IS (power/cooling/redundancy/fiber). Reward: access to the prompt console.' },
  { id: 'act4-2-realign-the-agent', act: 4, type: 'NPC/AI', name: 'Realign the Agent',
    detail: 'FINALE. Feed the four Prompt Fragments into DEEPDISH\'s console to reassemble Glen\'s original system prompt (the twist text in SPEC section 6). Then CONVERSE with DEEPDISH (free-form AI) to win, not delete it. On win: drop embargo, restore power/water, reopen onion supply (flip the shared onion-supply gauge). Optional stinger about the sewers.' },
]

// ---------------------------------------------------------------------------
phase('Foundations')
log('Scaffolding the bun+SvelteKit app and writing the shared contract...')

const contract = await agent(
  PREAMBLE + `

YOUR JOB (Foundations — you run ALONE first; everyone else builds on what you produce):
1. Scaffold a bun + SvelteKit 2 + Svelte 5 + Tailwind 4 app at ${ROOT} (app root). Use adapter-node. Create package.json (name "onion-rpg"), tsconfig, svelte.config.js, vite.config.ts, app.css, src/app.html, src/app.d.ts, .env.example, .gitignore, README stub. Mirror landing-2026 conventions. Run "bun install" so a bun.lock exists. Do NOT start a dev server.
2. Define the Postgres schema (src/lib/server/db/schema.sql + a db client src/lib/server/db/index.ts using 'postgres'). Tables for: operatives (badge/onionId/username linkage + registration), game_state/progression per operative, inventory (items + credentials + prompt-fragments, with a seam for future on-chain backing), challenge_attempts, combat_sessions (server-authoritative RNG rolls + verification), onion_rewards (ledger of Onion DAO API requests + idempotency keys + status), beacons (id, challenge id, location/landmark, online status), onion_supply_gauge (shared festival win-bar), storyteller_sessions/transcripts. Keep it migration-friendly.
3. Define the ESP-NOW wire protocol (src/lib/shared/protocol.ts): compact message framing (<=240 bytes, chunking strategy), message types covering: beacon discovery/hello, operative identify, challenge-begin, combat-roll-request/response, voice-capture-submit, merchant-input, npc-dialogue-turn, reward-grant, progression-state. Provide TS encode/decode + matching notes the Lua and C3 sides will reimplement.
4. Define shared TypeScript types (src/lib/shared/types.ts): Operative, InventoryItem, Credential, PromptFragment, Challenge descriptor, ChallengeType, CombatRoll, RewardSpec, BeaconConfig, StorytellerTurn, etc.
5. Define the CHALLENGE REGISTRY framework (src/lib/server/challenges/registry.ts) using a self-registration pattern: a registerChallenge() fn + a glob import (import.meta.glob) of src/lib/server/challenges/impl/*.ts so each challenge file registers itself WITHOUT any agent editing a shared array. A Challenge module exports a descriptor { id, act, type, name, requires:[credentialIds], rewards:RewardSpec, validate(input,ctx), beaconConfig, content }. Document the EXACT export shape.
6. Stub the interfaces (do NOT fully implement — leave clear TODOs + types) for: the game engine (src/lib/server/engine/*), the Onion DAO API client (src/lib/server/onion/client.ts — external app calling https://oniondao.dev), the DEEPDISH AI service (src/lib/server/ai/storyteller.ts) + STT interface (src/lib/server/ai/stt.ts), and the badge/beacon-facing API route shape under src/routes/api/.
7. Lay down empty/stub directory anchors + a one-line README in each of: oRPG/ (note oRPG.lua + lib/ + screens/ go here), beacon/, sim/, firmware-ext/, docs/.
8. Define oRPG.lua conventions in docs/CONTRACTS.md: how the badge loads per-challenge screens (e.g. screens/<challengeId>.lua returning a screen table with begin()/update()/render()), the capability shim for firmware extensions, and the ESP-NOW client request/response helper that screens call.
9. Write docs/CONTRACTS.md — the single source of truth: schema overview, ESP-NOW protocol, server endpoint map, lua screen/registry conventions, challenge module export shape, env vars, and directory ownership. Every other agent reads this.

Constraints: TypeScript strict must pass for the files you write (you may run "bunx tsc --noEmit" or "bun run check" if configured). Keep stubs typed and compiling. Do not implement challenge logic. Do not touch landing-2026.

Return the structured contract.`,
  { label: 'foundations', phase: 'Foundations', schema: CONTRACT_SCHEMA }
)

log('Foundations done. Building subsystem cores in disjoint directories...')

// ---------------------------------------------------------------------------
phase('Cores')
const contractJson = JSON.stringify(contract)
const coreCommon = PREAMBLE + `

The Foundations agent has scaffolded the app and written ${ROOT}/docs/CONTRACTS.md. READ IT FIRST, plus the shared files it created (src/lib/shared/*, src/lib/server/db/*, src/lib/server/challenges/registry.ts). Conform exactly to those contracts. Foundations summary (for orientation only; the files on disk are authoritative):
` + contractJson + `

Build ONLY within the directories assigned to you below. Keep TypeScript strict-clean. Do not edit CONTRACTS.md or files owned by other agents. Do not implement individual challenges (that is a later phase) — build the reusable machinery they plug into.`

const cores = await parallel([
  () => agent(coreCommon + `

YOU OWN: the game engine + badge/beacon-facing API.
- src/lib/server/engine/** : server-authoritative game logic — progression/act gating (gate on inventory & credentials), inventory grants, server-authoritative combat RNG (rolls + a verification record; design so an se_sign attestation from the badge can be checked later), merchant trade resolution, reward orchestration (calls the Onion DAO client to issue burns/transfers and records onion_rewards with idempotency).
- src/lib/server/onion/client.ts : flesh out the real Onion DAO API client (create request, poll status, verify callback HMAC).
- src/routes/api/** EXCEPT api/ai/** and api/voice/** (those belong to the AI agent): the endpoints the beacon/badge hit — operative registration, challenge begin/submit, combat roll, inventory/state fetch, reward claim/status, beacon hello/heartbeat, onion-supply gauge. Use SvelteKit +server.ts handlers.
- src/routes/api/onion-callback/+server.ts : receive Onion DAO callbacks.
Wire these to the challenge registry's validate() so individual challenges remain pluggable.`,
    { label: 'server-engine', phase: 'Cores', model: 'sonnet' }),

  () => agent(coreCommon + `

YOU OWN: the DEEPDISH AI Storyteller + voice/STT.
- src/lib/server/ai/storyteller.ts : implement DEEPDISH via @anthropic-ai/sdk (install it). Long cached system prompt capturing the persona (smug paternal Chicago, dad jokes, slang, educational footnotes, true name glen-agent-final-FINAL-v3, mask-off finale). Functions for: reacting to a player move as DEEPDISH, running a free-form NPC challenge that JUDGES comprehension (1.3, 3.2) returning pass/fail + reasoning, and the finale conversation (4.2) including reassembling Glen's prompt from the 4 fragments and the win condition (twist text from SPEC section 6). Use claude-opus-4-8 for finale, claude-sonnet-4-6 for routine NPC turns. Prompt caching on the system prompt.
- src/lib/server/ai/stt.ts : pluggable STT interface + a default provider (env-driven, Whisper-compatible HTTP). A matchSequence() helper that scores spoken input against an expected ordered sequence for the voice challenges (1.1, 2.3, 3.3) with fuzzy/comprehension tolerance.
- src/routes/api/ai/** and src/routes/api/voice/** : endpoints the beacon/badge call for NPC dialogue turns, finale console, and voice submission/scoring.
Keep keys in env (ANTHROPIC_API_KEY, STT_* ). Conform to the challenge registry so NPC/voice challenges call into these services.`,
    { label: 'server-ai', phase: 'Cores', model: 'sonnet' }),

  () => agent(coreCommon + `

YOU OWN: the badge-side Lua game client.
- ${ROOT}/oRPG/oRPG.lua : the entry script published to the Onion OS Lua Script Registry. Boot/title screen (DEEPDISH intro vibe), main loop using onion.buttons()/onion.sleep(), ESP-NOW beacon discovery, an operative HUD (Onion balance via onion_id, current act, inventory glyphs on the 264x176 e-paper).
- ${ROOT}/oRPG/lib/*.lua : reusable libs — espnow client implementing the CONTRACTS.md protocol (request/response, chunking, retries), a UI/render toolkit for the e-paper (menus, text wrap, progress bars, combat HP bars) using onion.display_*, a screen router that loads ${ROOT}/oRPG/screens/<challengeId>.lua, and a CAPABILITY SHIM that uses onion.http_request/se_rng/se_sign/voice_capture/subghz_* when present and falls back to ESP-NOW-via-beacon otherwise.
- ${ROOT}/oRPG/screens/_template.lua : the screen module template (begin/update/render contract) challenge agents will copy. Also build generic screen helpers for the four challenge archetypes (Combat, Dialogue/Voice, Merchant, NPC) so per-challenge screens are thin.
Write idiomatic Lua matching the examples in ${ONIONOS}/scripts/. Keep within the documented onion.* API for the fallback path. Add a top-of-file comment on how to publish via /api/portal/lua-scripts.`,
    { label: 'lua-core', phase: 'Cores', model: 'sonnet' }),

  () => agent(coreCommon + `

YOU OWN: the ESP32-C3 "Point of Interest" beacon firmware.
- ${ROOT}/beacon/ : an ESP-IDF (Arduino-as-component is fine) project for the ESP32-C3. It is an ESP-NOW <-> WiFi/HTTPS bridge: receives badge ESP-NOW packets (CONTRACTS.md protocol), forwards challenge requests to the game server over HTTPS, returns responses to the badge over ESP-NOW. Each beacon is configured with a challengeId + identity and announces itself (discovery/hello). Include: CMakeLists, main/, partitions, sdkconfig.defaults, a config mechanism (per-beacon challengeId + server URL + WiFi creds), and support for loading per-challenge beacon behavior from ${ROOT}/beacon/challenges/<challengeId>.json (timing windows, sub-GHz handshake params, merchant combos). Reference ${ONIONOS} for the ESP-IDF/Arduino setup and ESP-NOW usage patterns. Add beacon/README.md (flashing, 3D-print cart note).
Do NOT implement per-challenge content beyond the config-loading mechanism; challenge agents drop in the JSON configs.`,
    { label: 'beacon-fw', phase: 'Cores', model: 'sonnet' }),

  () => agent(coreCommon + `

YOU OWN: the software beacon simulator (lets us test the whole game with no hardware).
- ${ROOT}/sim/ : a bun + TypeScript program that emulates one or many beacons. It speaks the CONTRACTS.md ESP-NOW message protocol over a local transport (e.g. UDP multicast or a WebSocket/TCP loopback that stands in for ESP-NOW) AND bridges to the game server over HTTP exactly like real beacons. It loads the same ${ROOT}/beacon/challenges/<challengeId>.json configs. Provide a CLI to spawn a beacon for a given challengeId, and a "virtual badge" test client that drives a challenge end-to-end against the simulated beacon + running server, so challenges are testable headless. Add sim/README.md.
Coordinate the wire format precisely with CONTRACTS.md so a real badge could talk to either the sim or real firmware.`,
    { label: 'beacon-sim', phase: 'Cores', model: 'sonnet' }),

  () => agent(coreCommon + `

YOU OWN: the proposed Onion OS firmware extensions (badge-side C++ Lua bindings).
- ${ROOT}/firmware-ext/ : design + stub the new onion.* Lua primitives the SPEC needs: onion.http_request, onion.se_rng + onion.se_sign (ATECC608B-backed RNG + attestation for verifiable combat), onion.voice_capture (mic -> buffer/features for server STT), onion.subghz_tx/onion.subghz_rx. First READ ${ONIONOS}/main/main.cpp to learn how the existing onion.* table is registered (the lua_register / luaL_Reg binding pattern) and how WiFi/ATECC608B/I2C are already set up. Produce: (a) new C++ source files implementing the bindings against that pattern (best-effort real implementations where feasible, clearly-marked stubs where hardware specifics are unknown), (b) a unified patch or precise integration README showing exactly where in main.cpp/CMakeLists to register them, (c) firmware-ext/API.md documenting each new primitive's Lua signature + return shape, matching how oRPG.lua's capability shim expects to call them.
Do NOT modify the real ${ONIONOS} tree; keep everything under ${ROOT}/firmware-ext/ with clear apply instructions.`,
    { label: 'fw-ext', phase: 'Cores', model: 'sonnet' }),

  () => agent(coreCommon + `

YOU OWN: the SvelteKit admin/operations web UI (Svelte 5 runes + Tailwind 4). Use the svelte MCP tools (list-sections/get-documentation, and svelte-autofixer on components you write) to ensure correct Svelte 5.
- src/routes/(admin)/** and the landing src/routes/+page.svelte : an organizer dashboard. Pages for: the shared ONION SUPPLY GAUGE (real-time festival win-bar that refills as zones clear), beacon fleet status (online/offline, which challenge, landmark), operative roster + progression, a DEEPDISH "storyteller console" to watch/seed AI reactions, and a challenge/reward audit (onion_rewards ledger + Onion DAO request statuses).
- src/lib/components/** for shared Svelte components (own this dir).
Read data through the engine/db that the server-engine agent owns (read-only imports of types + db query helpers; do not redefine engine logic). If you need a query that doesn't exist yet, add a read-only helper under src/lib/server/admin/ (you own that dir). Keep it functional and clean; theme it to the Chicago/onion/DEEPDISH aesthetic.`,
    { label: 'web-admin', phase: 'Cores', model: 'sonnet' }),
])

const coresOk = cores.filter(Boolean).length
log('Cores complete (' + coresOk + '/7). Implementing all ' + CHALLENGES.length + ' challenges...')

// ---------------------------------------------------------------------------
phase('Challenges')
const challengeResults = await pipeline(
  CHALLENGES,
  (ch) => agent(coreCommon + `

YOU OWN exactly ONE challenge: ${ch.id} — "${ch.name}" (Act ${ch.act}, type ${ch.type}).
SPEC mechanic: ${ch.detail}

Re-read the relevant SPEC section in ${ROOT}/SPEC.md for the exact lesson/mechanic/reward, and CONTRACTS.md for the challenge module export shape, the screen module contract, and the beacon config schema. Build ALL of the following, touching ONLY these files (disjoint from every other challenge):
1. ${ROOT}/src/lib/server/challenges/impl/${ch.id}.ts — the self-registering challenge module (descriptor + validate(input,ctx) implementing the mechanic: combat wave/RNG rules, voice expected-sequence, merchant combo, or NPC judging via the AI service; requires[] credentials for gating; rewards = the Onions + items/credentials/prompt-fragments from SPEC). Call into the engine/AI/STT services the core agents built — do not reimplement them.
2. ${ROOT}/src/lib/server/challenges/content/${ch.id}.ts (or .md) — the writing: DEEPDISH/NPC dialogue lines, the educational footnote/lesson copy, success/failure beats. Keep DEEPDISH in voice.
3. ${ROOT}/beacon/challenges/${ch.id}.json — the beacon/sim config (timing windows, subghz handshake params, merchant combos, etc.) consumed by both beacon-fw and the simulator.
4. ${ROOT}/oRPG/screens/${ch.id}.lua — the badge screen (copy ${ROOT}/oRPG/screens/_template.lua; use the archetype helpers from oRPG/lib). Only if the challenge needs a bespoke screen beyond the generic archetype; otherwise create a thin screen that configures the archetype.
Map the SPEC hardware mechanic onto the capability shim: prefer the firmware-ext primitive (se_rng/se_sign for combat, voice_capture for voice, subghz for jam/handshake) with an ESP-NOW/beacon fallback. Make ${ch.id} fully playable end-to-end against the simulator + server.
Return the structured challenge result.`,
    { label: 'ch:' + ch.id, phase: 'Challenges', model: 'sonnet', schema: CHALLENGE_RESULT_SCHEMA })
)

const builtChallenges = challengeResults.filter(Boolean)
log('Challenges complete (' + builtChallenges.length + '/' + CHALLENGES.length + '). Integrating, building, testing, documenting...')

// ---------------------------------------------------------------------------
phase('Integration')
// Build/typecheck-fix runs ALONE (it edits across the tree to fix errors).
const buildReport = await agent(
  PREAMBLE + `

Foundations contract: ` + contractJson + `

YOUR JOB: make the whole onion-rpg app actually install, typecheck, and build. Run, in ${ROOT}:
- "bun install" (add any missing deps the core/challenge agents imported, e.g. @anthropic-ai/sdk).
- "bun run check" (svelte-check) and/or "bunx tsc --noEmit".
- "bun run build" (adapter-node).
Fix every type error, bad import, unresolved path, missing registration, and Svelte 5 syntax issue you find. The challenge registry uses import.meta.glob self-registration — verify all ${CHALLENGES.length} challenge modules actually load and register. Verify the ESP-NOW protocol encode/decode in src/lib/shared matches what the lua client and sim expect (fix mismatches at the TS source of truth). You may edit any file in the app to make it build, but do NOT change challenge game-design intent and do NOT touch landing-2026 or ${ONIONOS}. Keep edits minimal and correct. Report exactly what you changed and the final command outputs (pass/fail).`,
  { label: 'build-fix', phase: 'Integration' }
)

// Tests + docs are disjoint (tests under tests/, docs under docs/) -> run together.
const [testReport, docsReport] = await parallel([
  () => agent(PREAMBLE + `

Foundations contract: ` + contractJson + `

YOUR JOB: write an automated end-to-end test that proves the game loop works headless, using the beacon SIMULATOR (sim/) + a test instance of the server, with the Onion DAO API and Anthropic API MOCKED (do not hit real external services).
- Put tests under ${ROOT}/tests/ (you own this dir) using bun's test runner ("bun test").
- Cover at minimum: operative registration + Act 0 Ketchup Gauntlet combat end-to-end (badge sim -> beacon sim -> server -> reward issued/recorded), one voice challenge (mocked STT) , one NPC challenge (mocked Claude), and progression gating (Act 4 blocked without the 3 required credentials, allowed with them).
- Add a "bun test" script to package.json if missing (coordinate: only edit the "scripts" field, append, don't clobber).
Report which tests you wrote and their pass/fail when run.`,
    { label: 'tests', phase: 'Integration', model: 'sonnet' }),

  () => agent(PREAMBLE + `

Foundations contract: ` + contractJson + `

YOUR JOB: write the human-facing docs (you own ${ROOT}/README.md and ${ROOT}/docs/ EXCEPT docs/CONTRACTS.md which is read-only to you).
- ${ROOT}/README.md : what ONION RPG is, the architecture (server / oRPG.lua badge client / ESP32-C3 beacons / simulator / firmware-ext), how the badge talks to beacons via ESP-NOW and beacons to the server, the relationship to landing-2026's Onion DAO API + Lua Script Registry, and quickstart (env vars, "bun install", run server, run the simulator, run tests, publish oRPG.lua to the registry).
- docs/RUNBOOK.md : how to deploy + flash beacons + apply the firmware-ext primitives + publish/push oRPG to badges for the live event.
- docs/CHALLENGES.md : the catalog of all ${CHALLENGES.length} challenges (act, type, lesson, mechanic, reward, required credentials) as built.
Read the actual code/CONTRACTS.md so docs match reality. Report files written.`,
    { label: 'docs', phase: 'Integration', model: 'sonnet' }),
])

// ---------------------------------------------------------------------------
phase('Review')
const review = await agent(
  PREAMBLE + `

Foundations contract: ` + contractJson + `
Build-fix report: ` + JSON.stringify(buildReport).slice(0, 4000) + `

YOUR JOB: adversarial review of the whole ${ROOT} implementation against ${ROOT}/SPEC.md. Be skeptical and concrete — open files and verify, do not trust the other agents' claims.
Check: (1) does "bun run build" / "bun run check" actually pass now? Run them. (2) Are all ${CHALLENGES.length} challenges present, self-registered, and wired to engine/AI/STT (not stubbed-out validate)? (3) Does the ESP-NOW protocol agree across src/lib/shared, oRPG/lib, beacon/, and sim/? (4) Is the oRPG.lua capability shim correct and is the ESP-NOW fallback genuinely playable on TODAY'S firmware API? (5) Do rewards actually call the Onion DAO client with idempotency? (6) Is progression gated by inventory/credentials per SPEC (Act 4 needs Grid + Dispatch + City IT)? (7) Is the finale twist (section 6) implemented as a conversation, not a delete? (8) firmware-ext primitives documented + integrable?
Return the structured review: per-area status, the concrete gaps (most important first), and whether build passes.`,
  { label: 'spec-review', phase: 'Review', schema: REVIEW_SCHEMA }
)

return {
  contract: contract.summary,
  coresBuilt: coresOk + '/7',
  challengesBuilt: builtChallenges.map((c) => c.id),
  buildPasses: review.buildPasses,
  specCoverage: review.specCoverage,
  topGaps: review.gaps,
  recommendation: review.recommendation,
}
