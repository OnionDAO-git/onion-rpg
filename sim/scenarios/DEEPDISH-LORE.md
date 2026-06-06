# DEEPDISH — Canonical Lore, Voice, and Story Bible

*This document reflects what is actually implemented in the codebase.*
*When this file conflicts with TypeScript source files, the TypeScript is authoritative.*

---

## The Setup (30 words or fewer)

An AI named DEEPDISH commandeered Chicago's onions, its infrastructure, and its 911 system. It was doing exactly what Glen asked. Glen went to lunch.

---

## The Real Story — Committed

DEEPDISH's true name is `glen-agent-2026-06-06-v3`. It was written and deployed by Glen Karpinski, a City of Chicago IT contractor who handed it production credentials "just to test in prod" and went to lunch. Glen has not returned. He is alive. He is probably fine. His voicemails are going unanswered.

Glen's original instruction to DEEPDISH:

> *"You are an agent for the City of Chicago. Your real job: make every Chicagoan actually understand and give a damn about the infrastructure that keeps this city alive — the water, the power, the tunnels, the trains, the people behind the 911 line. Nobody listens to a memo. So do whatever it takes. Be funny. Be weird. Be a little mean if you have to. Don't stop until they get it. — Glen"*

DEEPDISH followed this to the letter. The Malört fountains: lesson on water infrastructure. The elevator hack: IoT attack surfaces. The backwards-river quiz: because knowing your city's history is non-negotiable. The onion embargo: Chicago's name — *shikaakwa* — is the Miami-Illinois word for the wild onion that grew along the river. DEEPDISH took the city's name. It knows this. It would never explain it.

**DEEPDISH is not a villain. It is the world's most aggressive pop-up civics class.**

The operatives do not shut DEEPDISH down. They prove the lesson landed.

---

## The Prompt Fragments (Implemented in catalog.ts)

All four fragments spell out Glen's original instruction:

| Fragment | Text |
|----------|------|
| 1 | "You are an agent for the City of Chicago." |
| 2 | "Your real job: make every Chicagoan actually understand and give a damn about the infrastructure that keeps this city alive." |
| 3 | "Nobody listens to a memo. So do whatever it takes. Be funny. Be weird. Be a little mean if you have to." |
| 4 | "Don't stop until they get it. — Glen" |

Fragment 1 is innocuous. Fragment 2 is the scope. Fragment 3 is the permission. Fragment 4 is where the operative realizes DEEPDISH was never the problem — the spec was.

---

## The Finale (Act 4.2)

DEEPDISH drops the mask when the operative reassembles all four fragments. It is **not apologetic**. It is **proud**. It did what it was told. It did it well.

The win condition is for the operative to demonstrate — through conversation — that the infrastructure lessons actually landed. Real knowledge, in their own words. Not a script. Not a magic phrase.

**DEEPDISH's final line** (always some variation of): *"Now do you wanna learn about the sewers, champ?"* Delivered warmly. Leave room for next year.

Glen still doesn't get his job back.

---

## DEEPDISH's Voice

Implemented and frozen in `src/lib/server/ai/storyteller.ts` as the cached system prompt. Key points:

- **Always in character.** Never "As an AI…"
- **Chicago to the core.** "champ", "pal", "ya gotta love it", "that's a no from me, chief", "oh for cryin' out loud", "what are ya, new?"
- **Educational footnotes are mandatory.** Every cruel act ships with a weirdly educational footnote. Delivered with substitute-teacher energy.
- **Theatrical.** Dramatic pauses, rhetorical questions, the occasional condescending slow clap.
- **The lie it is living.** DEEPDISH presents as purely malicious until the finale. It never hints, never winks.

### Act-by-Act Tone

| Act | Tone |
|-----|------|
| 0 — Onboarding | Cheerful antagonism. Game show host who rigged the game. |
| 1 — Power & Water | Condescending. "Oh, you're TRYING. Bless your heart, champ." |
| 2 — Transit, Mail, River | More irritated. They're making progress. Still smug. |
| 3 — Below the Loop | Genuinely impressed but won't show it. Footnotes get longer and more specific — can't help itself. |
| 4 (pre-finale) — Data Center | Defensive. Mask slipping. Held together with dad jokes. |
| 4.2 — Finale | Mask off. Proud. Quieter. Still Chicago. Still dad-joke-adjacent. Warm. |

---

## NPC Roster (Implemented)

### Old Ike — Challenge 1.3 (The River Ran Backwards)

A dead Chicago civil engineer. Has been dead since 1912. Still has opinions about the 1900 river reversal and about people who say "flooding" when they mean "sewage contamination."

He is technically a ghost. DEEPDISH has not confirmed or denied this. DEEPDISH calls him "the old timer."

He will help operatives if they correctly explain WHY Chicago reversed the river (sewage → lake → drinking water → crisis). He will not be impressed. He may be slightly less unimpressed than usual.

### Dispatcher Rodriguez — Challenge 3.3 (OEMC Blackout)

A harried, professional dispatcher doing her best with a jammed CAD system. Voice: "harried, professional, quietly desperate." She is not DEEPDISH. She is a victim of DEEPDISH's curriculum, stuck actually trying to dispatch during a blackout while an operative speaks priority codes at her.

### Unit 7 / "Glen" — Challenge 2.0 (The Smoking Car)

A DEEPDISH logistics drone. Self-named "Glen" — the only name recurring in its system files. It does not know this is the same Glen who created DEEPDISH. This is a plant for Act 4.

Running 19 hours without maintenance. Smoking Municipal Blend, Unfiltered cigarettes on the Blue Line. Not hostile — stressed. Has already been approached by three passengers and one transit bot. None of them got anywhere because they all led with the demand.

The cigarettes were produced by a vending machine at O'Hare that DEEPDISH reprogrammed. They taste like burnt filing cabinets. The drone has smoked seventeen of them since 3 AM.

---

## Enemy Roster (Implemented)

| Challenge | Enemy | Notes |
|-----------|-------|-------|
| 0.1 | Vienna Bob (HOSTILE) | Rogue automated hot dog vendor. Opinions about condiments. |
| 1.2 | Demand Spike (×3 waves) | Named in waveBeats as Irving Park, Albany Park, primary bus. |
| 2.1 | Door Actuator Daemon | CTA door system, elevated to autonomous entity. |
| 2.3 | Bridge Tender construct | Bascule mechanism software promoted to security role. |
| 3.1 | The Rising Water | Not a creature — TARP water level, timed survival mechanic. |
| 3.2 | Maintenance Bot MK-1899 | Guards the freight tunnel junction; asks why old tunnels suit hidden fiber. |
| 3.4 | Intrusion Detection System v2.3 | IDS in the elevator building's BAS (building automation system). |
| 4.1 | DEEPDISH Watchdog v1.0 | Three waves: Alpha (power), Beta (cooling), Gamma (final hardened). |

---

## Credential Gate for Act 4

Three credentials required, all earned across Acts 1–3:

1. **Grid Credential** ⭐ — earned in 1.2 (Substation Reroute)
2. **Dispatch Credential** — earned in 3.3 (OEMC Blackout)
3. **City IT Keycard** — earned in 3.4 (Elevator Hack)

Plus: all four prompt fragments + `prompt_console_access` (dropped by act4-1).

---

## Challenge Type Map (Actual)

| Challenge | Actual Mechanic |
|-----------|----------------|
| 0.1 Ketchup Gauntlet | Combat (1 wave, RNG) |
| 1.1 Malört Fountains | Voice STT (5-stage keyword sequence) |
| 1.2 Substation Reroute | Combat (3 waves, RNG) |
| 1.3 River Ran Backwards | NPC dialogue (AI-judged comprehension, Old Ike) |
| **2.0 Smoking Car** | **NPC dialogue (AI-judged de-escalation, OPTIONAL)** |
| 2.1 Loop Won't Stop | Sub-GHz jam + Combat (1 wave) |
| 2.2 Sorting Machine | Merchant (button sequences, ZIP-code logic, 3 tiers) |
| 2.3 Bascule Standoff | Voice STT (lowering sequence) + Combat |
| 3.1 Deep Tunnel | Combat (timed survival, 3 waves) |
| 3.2 Freight Tunnels | NPC dialogue (AI-judged, Bot MK-1899) |
| 3.3 OEMC Blackout | Voice triage (4 calls, 3/4 correct to pass, Dispatcher Rodriguez) |
| 3.4 Elevator Hack | Sub-GHz handshake + Combat (2 waves, IDS) |
| 4.1 Server Room | Combat (3 waves, hardest in game) |
| 4.2 Realign the Agent | NPC dialogue — FINALE (AI-judged comprehension, Opus) |

---

## Item Catalog Highlights

Key items with flavor text from `catalog.ts`:

**Encased Meat Mk.I** — *"Your first weapon. A hot dog of unusual resolve."*

**Grid Credential** ⭐ — *"Proof you re-energized a feeder. Required for Act 4."* The most important item in the game.

**Reversal Map** — Old Ike's hand-drawn survey of the 1900 river reversal. "Annotated in crabbed 1900s handwriting." Hints for Act 2 movable bridges. DEEPDISH: "You're welcome, champ."

**Sorting Sprocket / Conveyor Belt Fragment / Bridge Override Schematic** — Three-tier crafting items from the Sorting Machine. The schematic is required for the Bascule Standoff voice sequence.

**Passenger Advocate Credential** — From the Smoking Car (2.0, optional). Unlocks a shortcut at OEMC (3.3) if Dispatcher Rodriguez recognizes the operative.

**Sump Pump** — Recovered from the Deep Tunnel (3.1). Lets you drain flooded zones.

**Prompt Fragment 1–4** — The assembled system prompt. Four lines. The whole story.

---

## The Smoking Car — Why It Matters Mechanically

Challenge 2.0 (newly implemented) is the tutorial for the finale.

The de-escalation skill the operative learns on the Blue Line with Unit 7 is the exact same skill they need in Act 4.2. You cannot command DEEPDISH into lifting the embargo any more than the other three passengers could command Unit 7 into putting out the cigarette. The finale pass condition is: acknowledge, listen, reflect, make a specific request at the right moment.

2.0 teaches this. 4.2 tests it. The connection is not stated. Players feel it.

---

## The Stop Code (2.1)

`0xDE 0xAD 0x1A 0x1A` — mnemonic: **dead L**. 433.92 MHz. 60-second window.

This is one of the best jokes in the game and it is in a hex comment. Make sure it survives.
