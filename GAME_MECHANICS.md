# ONION RPG — Colony (working title)
## Game Mechanics Design Doc · v1

> Fork of OnionDAO `onion-rpg`. This doc explains **how the game plays**.
> The engineering task order is in `REPO_BUILD_PLAN.md`; the formal spec +
> fork kickoff is in `PRD.md`.

---

## 0. One-paragraph pitch

You join free with onions already loaded in your badge wallet. The server
assigns you **one of 10–15 authored storylines** (a sequenced set of beacon
interactions). You roam to beacons, play quick **rand + button** minigames and
challenges to earn **XP, gear, chests, and Cores** (a collective resource). You
**forge** gear to grow your power, fight **shared timed bosses**, and spend
**onions** to buy gear/chests/potions or skip the energy timer. Everyone pushes
one **global Colony** from level to level; each colony level unlocks the next
segment of every player's storyline, higher store tiers, and tougher bosses
with better loot. There are no prize pools and no leaderboards — the pull is
**entertainment + leveling up + the collective climb**.

---

## 1. Currencies & resources (keep these straight)

| Thing | Direction | Earned by | Spent on | Backed |
|---|---|---|---|---|
| **Onions** | player → dev only, **never back** | pre-loaded on badge wallet (event), no in-game faucet | store (gear/chests), energy skip, potions, revives | on-chain (SPL) via `onion/client.ts` |
| **XP** | accrues | playing interactions, winning fights | nothing (drives player level) | DB |
| **Cores** (placeholder name) | accrues | chests, challenge rewards | contributing to the Colony | DB item |
| **Gear / items / chests** | accrues | drops, forge, store | equip / open / forge | DB (`inventory`) |

Hard rule: **onions only ever leave a player.** The award path the original
repo uses (treasury → player) is removed. XP and Cores are the in-game progress
levers; onions are the premium accelerant.

---

## 2. The core loop

```
join free (onions in wallet)
   → assigned a random storyline
   → go to a beacon, spend 1 energy, play a minigame/challenge
       → earn XP + chance at chest/Cores/gear
   → open chests → roll items → forge → equip → stronger
   → contribute Cores to the Colony (be an early contributor → chest)
   → colony level rises (whole community) → unlocks your next storyline
     segment + higher store tiers + tougher bosses
   → during a global boss window, go to the boss beacon, fight the shared boss
   → out of energy? wait 30 min for full refill, or pay onions to skip
   → spend onions in the store for gear/chests/potions when you want power faster
```

A "session" is short and self-contained: one beacon visit = one interaction =
1 energy. The depth lives on the server; the badge is a thin client.

---

## 3. Energy (the pacing + monetization gate)

- **Max 7 energy.** Each interaction (minigame or storyline challenge attempt)
  costs **1 energy**.
- At **0 energy**, a **30-minute** timer starts. When it elapses, energy
  refills to **full (7)** in one shot (not gradual).
- **Skip:** pay **X onions** any time for an instant full refill. (Primary
  onion sink #1.)
- **Bosses do NOT cost normal energy** — they're gated by the global boss
  window instead. *(Open decision — easy to flip.)*
- Implementation note: **lazy refill** — store `energy` + `energyExhaustedAt`
  in `game_state`; compute current energy on read. No cron needed.

This is the heartbeat: it caps grind, creates the "come back later" rhythm, and
gives impatient players a reason to spend.

---

## 4. Storylines & the director

- A **pool of 10–15 authored arcs.** Each arc is an ordered list of
  **segments**; each segment is a set of beacon interactions (challenges, NPC
  talks, minigames).
- On first registration the **director** assigns one arc **at random** and
  records it on the player. The player plays *that* arc start → finish.
- **Segment gating by Colony level:**
  - Segment 1 → playable at Colony **L0**
  - Segment 2 → requires Colony **L1**
  - Segment 3 (final) → requires Colony **L2**
- A player blocked at a segment boundary **can still play minigames** and grind
  — they just can't advance their story, buy the next store tier, or fight the
  harder bosses until the Colony catches up.
- The "director" is **rule-based**, not a live-AI author: pick an arc, track
  position, enforce gear/credential + colony gates. (DEEPDISH/storyteller stays
  available for NPC flavor inside arcs, optional in v1.)

This is the cheap trick that gives 10–15 arcs the feel of a per-player story
without authoring one per person.

---

## 5. The Colony (global collective layer)

- **One global Colony** shared by all players, with discrete **levels**
  (L0 → L1 → L2 → final).
- **How it levels:** each level has a contribution requirement. When **5
  distinct players** (configurable `N`) each contribute the required amount of
  **Cores** at a colony beacon, the Colony advances a level **for everyone**.
- **First-mover reward (anti-free-rider):** the players who push a level over
  the line get a **chest**. This is the fix for the public-goods problem — being
  early pays, so people race to contribute instead of waiting for others.
- A colony level-up unlocks, globally: the next **storyline segment**, the next
  **store tier** (rarer items), and tougher **bosses** (better chests).
- Implementation: repurpose the existing single-row shared meter
  (`onion_supply_gauge`) or add a `colony_state` row; track per-level
  contributors in a `colony_contributions` ledger to detect the Nth contributor
  and to reward the early ones.

This is the psychological engine: players recruit and nudge each other ("we're
2 Cores from L2") because everyone benefits from the unlock and the early
birds get loot.

---

## 6. Inventory, gear, chests, forge (framework now, categories later)

> You explicitly deferred exact categories — so v1 builds the **framework + a
> few basic items**, and you fill the catalog later.

- **Items** live in the existing `inventory` table (already supports stacking,
  per-instance `metadata`, idempotent grants, and `(operative, catalog)`
  uniqueness).
- **Gear** = catalog entries extended with `slot` (e.g. weapon / helmet /
  body), `rarity` tier, and `stats` (attack / defense / hp / etc.).
- **Equip / loadout:** equipped gear per slot recorded on the player; equipped
  stats are summed into combat.
- **Chests:** a chest is an item that, when opened, rolls from a
  **rarity-weighted loot table** and grants the result. Chest quality scales
  with boss difficulty / colony level.
- **Forge:** combine inputs per a **recipe** (duplicates and/or Cores and/or
  base mats) → produce a higher-tier item. Forging is how you climb without
  paying.
- **Store** sells gear / chests / potions for onions (pay-to-win is allowed),
  with tiers **gated by colony level**.

Power has two paths: **earn it** (play → chests → forge) or **buy it** (onions
→ store). Both feed the same gear that decides boss fights.

---

## 7. Combat & bosses

- **Engine:** reuse the repo's server-authoritative wave RNG (`engine/combat.ts`).
  The server rolls everything and is the sole source of truth — no client can
  cheat. Damage today is `floor(roll/255 * maxDmg)+1`; v1 extends it so
  **equipped gear stats modify the roll/damage** (your attack vs enemy defense).
- **Regular fights:** part of minigames/challenges, cost energy, use a normal
  combat session.
- **Bosses = global timed events:**
  - A boss **window opens periodically**; a designated **boss beacon** shows a
    "fight boss" option during the window.
  - **Shared boss (raid):** one shared HP pool that all participating players
    damage during the window. On defeat (or window close) loot is distributed —
    chests scaled by damage contribution and colony level.
  - **v1 fallback** if shared-HP aggregation is too heavy for the skeleton:
    same boss spec, **personal instance** per player during the window,
    individual loot. Upgrade to true shared-HP later. *(Open decision.)*
  - Tougher bosses (better chests) are **gated by colony level**.
- **Player HP** (`game_state.hp`) **regenerates fully after X time** (TBD), or
  buy **potions** (onions) to heal mid-fight, and **revives** (onions) to
  continue. (Onion sinks #2 and #3.)

---

## 8. Social layer (isolated PvE, but connected)

- The game is **single-player PvE** — no head-to-head.
- Players are connected through:
  - **The Colony** (shared global climb — the main social hook).
  - **Trading** — v1 ships a **basic item/Cores trade** between two operatives,
    just to test the plumbing; it's the reason players talk to each other IRL.
- **No player-to-player interaction inside a session** except, potentially,
  within a future multiplayer minigame/challenge. Not in v1.

---

## 9. Minigame design principles (for the content you'll author)

- Built on **rand + buttons**; module use (mic/speaker/subghz) stays minimal so
  games are easy to build, quick to play, and easy to debug.
- Short rounds, server-authoritative, e-ink-friendly (state → state, no
  animation needed).
- A strong reusable spine is **push-your-luck**: repeated rand events with a
  "push or bank" decision; skill = risk judgment, not reflexes. Skins: bank-or-
  bust dice, hi-lo ladder, hold & re-roll, door-picker. Each maps cleanly onto
  the existing wave-combat session and feeds chests/XP/Cores.

---

## 10. What stays true to the original repo (so the fork is cheap)

- Server is authoritative for **all** RNG and outcomes → anti-cheat is free.
- **One file per challenge**, self-registering → adding content never touches
  shared code.
- Inventory **gates progression** (`requires` + `hasAll`) → "need gear/level to
  fight boss" is the pattern that already exists.
- The **sim** runs the whole loop with zero hardware → build and CI-test
  everything before touching badges.

---

## Implementation parameters (fork defaults — adjust freely)

These pin the "X / TBD" knobs above for the fork build. Each is a single
constant in code so it can be retuned without structural change.

| Knob | Default | Where |
|---|---|---|
| Max energy | 7 | `engine/energy.ts` `MAX_ENERGY` |
| Energy per interaction (begin) | 1 | `beginChallenge()` |
| Energy refill delay (from 0) | 30 min | `ENERGY_REFILL_MS` |
| Energy skip price (onions) | 5 | `ENERGY_SKIP_COST` |
| XP per level | 100 (level = 1 + ⌊xp/100⌋) | `engine/index.ts` `XP_PER_LEVEL` |
| Colony contributors per level (`N`) | 5 | `engine/colony.ts` `COLONY_CONTRIBUTORS_PER_LEVEL` |
| Cores per contribution | 3 | `engine/colony.ts` `CORES_REQUIRED_PER_CONTRIBUTION` |
| Max player HP | 100 | `engine/boss.ts` `MAX_HP` |
| Player HP full-regen delay | 30 min (lazy) | `engine/boss.ts` `HP_REGEN_MS` |
| Potion / revive price (onions) | 3 / 8 | `engine/boss.ts` `POTION_COST` / `REVIVE_COST` |
| Boss window period / duration | 1 h / 15 min | `engine/boss.ts` `BOSS_WINDOW_*` |

**Boss model (B6 decision):** PERSONAL INSTANCE (the spec's v1 fallback) — each
player fights their own boss instance during the global window; individual loot.
Bosses don't cost energy; gated by the boss window + Colony level. Fights reuse
the combat engine (`challengeId = boss:<id>`); equipped attack/defense apply.
Player HP is persistent (`game_state.hp`, max 100) with 30-min lazy regen;
potions/revives restore it for onions. Shared-HP raids + true mid-session
healing are deferred.

**Colony meter location (B4 decision):** a dedicated `colony_state` singleton +
`colony_contributions` ledger is the source of truth (cleanest for discrete
levels + the distinct-contributor / first-mover rules). `onion_supply_gauge` is
left dormant rather than repurposed. Cores are a stackable `inventory` item
(`cores`); the first-mover reward is `colony_chest` (reuses the B3 chest loot
framework).
