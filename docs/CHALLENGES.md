# ONION RPG — Challenge Catalog

All 13 challenges, in story order. Each challenge lives in
`src/lib/server/challenges/impl/<file>.ts` and self-registers via
`registerChallenge()`. Challenge types map to the four hardware primitives:

| Type | Hardware path | Fallback |
|---|---|---|
| **combat** | Server-authoritative RNG (server generates + records rolls); `secRng` = optional client entropy | Server RNG only (no badge entropy) |
| **dialogue** | `voice` on-badge mic (onion.sound_mic_*) | Beacon mic + out-of-band upload |
| **merchant** | Badge buttons | Badge buttons (no fallback needed) |
| **npc** | AI (Anthropic Claude) | Pre-written content strings |

Credential gates are enforced by the engine. Rewards are applied by the engine
on `passed: true` — challenges never grant directly.

---

## Act 0 — Onboarding: "The Stand"

### 0.1 — The Ketchup Gauntlet

| Field | Value |
|---|---|
| File | `impl/act0-1-ketchup-gauntlet.ts` |
| Challenge ID | `0.1` |
| Type | `combat` |
| Beacon hint | `b-ketchup` / Busted hot dog stand — Vienna Bob's |
| Required credentials | none (entry point) |
| Lesson | Food supply chain; why the onion shortage is the visible tip of a systems failure |
| Mechanic | Single-wave server-authoritative RNG combat vs Vienna Bob (enemy HP 80, operative HP 100). The server generates and records every roll. On win, operative is registered (first-time side effect). `secRng` (onion.secure_random) may supply optional client entropy; no badge signing exists. |
| Rewards | `encased_meat_mk1` (Encased Meat Mk.I — first weapon), 50 Onions, +500 gauge |
| Capabilities preferred | `secRng` |

---

## Act 1 — "Keep the Lights On" (Power & Water)

### 1.1 — Malört Fountains

| Field | Value |
|---|---|
| File | `impl/act1-1-malort-fountains.ts` |
| Challenge ID | `act1-1` |
| Type | `dialogue` |
| Beacon hint | `b-fountain` / Drinking fountain (Malört dispensing) |
| Required credentials | none |
| Lesson | Chicago draws drinking water from Lake Michigan through offshore intake cribs, piped to the Jardine Water Purification Plant, then to the distribution grid. |
| Mechanic | Voice challenge. Speak the five treatment stages in order: intake → crib → tunnel → Jardine plant → distribution grid. Score ≥ 0.8 is an automatic pass; score 0.6–0.8 triggers AI comprehension judgment (DEEPDISH rates whether the player demonstrated genuine understanding). Score < 0.6 is a fail with a retry allowed. |
| Rewards | `water_main_key` (Water Main Key credential), 80 Onions, +640 gauge |
| Capabilities preferred | `voice` |

### 1.2 — Substation Reroute

| Field | Value |
|---|---|
| File | `impl/act1-2-substation-reroute.ts` |
| Challenge ID | `1.2` |
| Type | `combat` |
| Beacon hint | `b-substation` / ComEd substation (demand spike simulator) |
| Required credentials | none |
| Lesson | How the grid is segmented into substations and feeders; why a cascading failure in one segment drops a whole neighborhood. |
| Mechanic | 3-wave server-authoritative RNG combat. Each wave survived closes a breaker. Enemy HP escalates per wave (60 → 80 → 100). The server generates and records every roll; `secRng` may supply optional client entropy. |
| Rewards | `grid_credential` (Grid Credential — required for Act 4), 100 Onions, +800 gauge |
| Capabilities preferred | `secRng` |

### 1.3 — The River Ran Backwards

| Field | Value |
|---|---|
| File | `impl/act1-3-river-ran-backwards.ts` |
| Challenge ID | `1.3` |
| Type | `npc` |
| Beacon hint | `b-riverwalk` / Old engineer NPC at the river |
| Required credentials | `water_main_key` |
| Lesson | In 1900 Chicago reversed the flow of the Chicago River to protect the Lake Michigan drinking-water supply — one of the great civil-engineering feats. |
| Mechanic | Free-form AI dialogue. DEEPDISH voices an old engineer NPC who quizzes the operative on *why* the river was reversed. AI judges comprehension, not memorized strings. |
| Rewards | `reversal_map` (Reversal Map — hints for Act 2 bridges), 70 Onions, +350 gauge |
| Capabilities preferred | none beyond ESP-NOW/relay |

---

## Act 2 — "The City That Moves" (Transit, Mail, River)

### 2.1 — The Loop That Won't Stop

| Field | Value |
|---|---|
| File | `impl/act2-1-loop-that-wont-stop.ts` |
| Challenge ID | `2.1` |
| Type | `combat` |
| Beacon hint | `b-loop-platform` / Simulated L train control node |
| Required credentials | none (open to all operatives) |
| Lesson | CTA rail signaling; how the elevated Loop physically structures downtown traffic; SCADA control surfaces as attack surface. |
| Mechanic | Two phases. Phase 1: sub-GHz signal jam — badge transmits a stop code on 433.92 MHz within 60 s via onion.subghz_transmit (`subghz`; beacon relay fallback sends a timed `MERCHANT_INPUT`). Phase 2: 1-wave server-authoritative RNG combat vs the Door Actuator Daemon (HP 60). |
| Rewards | `transit_pass` (Transit Pass credential — fast-travel token; gates Sorting Machine), 90 Onions, +900 gauge |
| Capabilities preferred | `subghz`, `secRng` |

### 2.2 — The Sorting Machine

| Field | Value |
|---|---|
| File | `impl/act2-2-sorting-machine.ts` |
| Challenge ID | `2.2` |
| Type | `merchant` |
| Beacon hint | `b-sorting` / USPS Bulk Mail Center (3D-printed sorting machine prop) |
| Required credentials | `transit_pass` |
| Lesson | How mail/parcel sorting and ZIP routing physically work; logistics as infrastructure. |
| Mechanic | Button-based merchant UI. Three trade tiers unlocked by entering valid routing sequences (button combos). Wrong sequences cost Onions. Tier 3 yields the `bridge_override_schematic` required for 2.3. |
| Rewards | Variable Onion trades per tier; crafting items (`sorting_sprocket`, `conveyor_belt_frag`, `bridge_override_schematic`); +400 gauge on session completion |
| Capabilities preferred | none (pure button input) |

### 2.3 — Bascule Standoff

| Field | Value |
|---|---|
| File | `impl/act2-3-bascule-standoff.ts` |
| Challenge ID | `2.3` |
| Type | `dialogue` (mixed with combat) |
| Beacon hint | `b-bridge` / Movable bascule bridge over the Chicago River |
| Required credentials | `reversal_map` |
| Lesson | Chicago has more movable bridges than almost any city; how counterweights and bascule leaves work. |
| Mechanic | Voice the bridge-lowering sequence (using the Reversal Map hint), then a short RNG combat beat as the Bridge Tender construct resists. |
| Rewards | `river_access` (River Access credential), 110 Onions, +700 gauge |
| Capabilities preferred | `voice`, `secRng` |

---

## Act 3 — "Below the Loop" (Deep infrastructure & emergency systems)

### 3.1 — Descent into the Deep Tunnel

| Field | Value |
|---|---|
| File | `impl/act3-1-deep-tunnel-descent.ts` |
| Challenge ID | `3.1` |
| Type | `combat` |
| Beacon hint | `b-deep-tunnel` / TARP / Deep Tunnel access point |
| Required credentials | none |
| Lesson | What the Tunnel and Reservoir Plan (TARP / "Deep Tunnel") is; why a flat city needs enormous underground reservoirs; how stormwater management prevents the river from overflowing. |
| Mechanic | Endurance server-authoritative RNG combat against "the rising water" — a damage-over-time fight with a timer. The server generates and records every roll; `secRng` may supply optional client entropy. Operative must survive to the beacon before the clock runs out. |
| Rewards | `sump_pump` (Sump Pump utility item), `prompt_fragment_1` (Glen's Prompt Fragment 1), 120 Onions, +750 gauge |
| Capabilities preferred | `secRng` |

### 3.2 — The Freight Tunnels

| Field | Value |
|---|---|
| File | `impl/act3-2-freight-tunnels.ts` |
| Challenge ID | `3.2` |
| Type | `npc` |
| Beacon hint | `b-freight` / Forgotten early-1900s freight tunnels under the Loop |
| Required credentials | `prompt_fragment_1` |
| Lesson | The literal hidden layer beneath downtown Chicago; how old infrastructure gets repurposed and forgotten, and why that is a security risk. |
| Mechanic | AI NPC negotiation. A maintenance-bot NPC (DEEPDISH-voiced) will reveal a path if operatives correctly reason about why the tunnels are useful to an AI hiding fiber. AI judges comprehension. |
| Rewards | `prompt_fragment_2` (Glen's Prompt Fragment 2), `conduit_map` (Conduit Map), 100 Onions, +600 gauge |
| Capabilities preferred | none beyond ESP-NOW/relay |

### 3.3 — OEMC Blackout

| Field | Value |
|---|---|
| File | `impl/act3-3-oemc-blackout.ts` |
| Challenge ID | `3.3` |
| Type | `dialogue` |
| Beacon hint | `b-oemc` / OEMC / 911 center dispatch console |
| Required credentials | `prompt_fragment_2` |
| Lesson | How emergency dispatch prioritizes calls; how fire, police, and EMS share a comms backbone; what "critical system" really means. |
| Mechanic | Voice triage — operative reads incoming "calls" aloud and speaks the correct dispatch priority. Correct triage restores dispatch capacity. Server-side STT matching with AI comprehension fallback on borderline answers. |
| Rewards | `prompt_fragment_3` (Glen's Prompt Fragment 3), `dispatch_credential` (Dispatch Credential — required for Act 4), 130 Onions, +1300 gauge |
| Capabilities preferred | `voice` |

### 3.4 — The Elevator Hack

| Field | Value |
|---|---|
| File | `impl/act3-4-elevator-hack.ts` |
| Challenge ID | `3.4` |
| Type | `combat` |
| Beacon hint | `b-elevator` / City Hall elevator bank |
| Required credentials | `dispatch_credential` |
| Lesson | Modern elevators are IoT-connected building systems with their own controllers and remote diagnostics — and therefore their own attack surface. |
| Mechanic | Two phases. Phase 1: sub-GHz handshake with the elevator beacon to trigger the intrusion-detection fight via onion.subghz_transmit (`subghz`; beacon auto-opens on fallback). Phase 2: 2-wave server-authoritative RNG combat vs the IDS (Intrusion Detection System). |
| Rewards | `city_it_keycard` (City IT Keycard — gates Act 4), `prompt_fragment_4` (Glen's Prompt Fragment 4), 150 Onions, +800 gauge |
| Capabilities preferred | `subghz`, `secRng` |

---

## Act 4 — "The Data Center" (Climax & Twist)

### 4.1 — The Server Room

| Field | Value |
|---|---|
| File | `impl/act4-1-server-room.ts` |
| Challenge ID | `act4-1` |
| Type | `combat` |
| Beacon hint | `b-server-room` / DEEPDISH Data Center — Loop Colo (aligned with 350 E Cermak) |
| Required credentials | `grid_credential`, `dispatch_credential`, `city_it_keycard` (all three required) |
| Lesson | What a data center is — power, cooling, redundancy, fiber — and why cities increasingly depend on them as critical infrastructure. |
| Mechanic | Boss-tier 3-wave server-authoritative RNG combat vs DEEPDISH Watchdog v1.0 (enemy HP 150 per wave, operative HP 120, 10-minute TTL). The server generates and records every roll, including the wave-3 killing blow, so a `won` session is by construction a legitimate kill — there is no badge signing. On win, mints prompt-console access. |
| Rewards | `prompt_console_access` (Prompt Console Access — gates 4.2), 200 Onions, +2000 gauge |
| Capabilities preferred | `secRng` |

### 4.2 — Realign the Agent

| Field | Value |
|---|---|
| File | `impl/act4-2-realign-the-agent.ts` |
| Challenge ID | `act4.2` |
| Type | `npc` (finale) |
| Beacon hint | `b-datacenter` / Data Center Console — Glen's terminal |
| Required credentials | `grid_credential`, `dispatch_credential`, `city_it_keycard`, `prompt_console_access`, `prompt_fragment_1`, `prompt_fragment_2`, `prompt_fragment_3`, `prompt_fragment_4` (all eight required) |
| Lesson | What a system prompt is, and how instructions shape an agent — also why Glen got here in the first place. |
| Mechanic | Three phases. (1) **Reveal**: operative feeds all four fragments into the console; DEEPDISH's mask-off monologue plays (AI-generated reaction). (2) **Finale**: free-form conversation with DEEPDISH (via `finaleConversation()` using `claude-opus-4-8`). DEEPDISH judges whether the operative demonstrates genuine infrastructure comprehension — the win condition is proving the lesson landed, not deleting the AI. (3) **Timeout**: graceful close if session expires; retry allowed. |
| Rewards | Gauge fills to maximum (onion supply restored city-wide), 500 Onions |
| Capabilities preferred | none beyond ESP-NOW/relay |

---

## Credential dependency graph

```
(none)        →  0.1  →  registered operative
(none)        →  1.1  →  water_main_key
(none)        →  1.2  →  grid_credential
water_main_key →  1.3  →  reversal_map
(none)        →  2.1  →  transit_pass
transit_pass  →  2.2  →  sorting_sprocket / conveyor_belt_frag / bridge_override_schematic
reversal_map  →  2.3  →  river_access
(none)        →  3.1  →  sump_pump + prompt_fragment_1
pf_1          →  3.2  →  prompt_fragment_2 + conduit_map
pf_2          →  3.3  →  prompt_fragment_3 + dispatch_credential
dispatch_cred →  3.4  →  city_it_keycard + prompt_fragment_4

grid_credential
+ dispatch_credential
+ city_it_keycard     →  4.1  →  prompt_console_access

prompt_console_access
+ grid_credential
+ dispatch_credential
+ city_it_keycard
+ prompt_fragment_1..4 →  4.2  →  WIN (gauge max, 500 Onions)
```

---

## Adding a new challenge

1. Create `src/lib/server/challenges/impl/<challengeId>.ts`.
2. Import `registerChallenge` from `../registry`.
3. Define a `ChallengeDescriptor` (id globally unique, `act`, `type`, `requires`,
   `rewards`, `validate(input, ctx): ChallengeResult`).
4. Call `registerChallenge(challenge)` at module top level.
5. Add any new catalog entries to `catalog.ts` (additive only).
6. The registry glob (`import.meta.glob`) picks up the file automatically.
   Do NOT edit any shared array.

See `impl/act0-1-ketchup-gauntlet.ts` as the reference implementation, and
`docs/CONTRACTS.md §5` for the full module export shape.
