# Scenario: act4-1 — Server Room
**Type:** Combat  
**Act:** 4  
**Prereq:** All 4 Prompt Fragments + Grid Credential ⭐  
**Reward:** Access to act4-2 (Realign the Agent), variable Onions

---

## What Happens

The operative has reached the data center where DEEPDISH actually lives. The Grid Credential (from 1.2) is required to enter. The four assembled prompt fragments are in the operative's inventory.

This is the penultimate challenge. DEEPDISH's last hardware defense. The operative fights through it. After this challenge there is one more step: the confrontation.

The server room combat is the hardest combat in the game. The enemy HP is higher. The waves are more. The stakes are established by everything that has happened before this point. The scenario file does not convey this at all because it is a placeholder.

---

## Message Sequence

```
badge  →  OPERATIVE_IDENTIFY
server →  IDENTIFY_ACK

badge  →  CHALLENGE_BEGIN            { c: "act4-1" }
server →  [gate check: Grid Credential + all 4 fragments required]

-- If gate fails --
server →  CHALLENGE_RESULT           { passed: false,
                                       message: "access denied: missing credentials" }

-- If gate passes --
server →  CHALLENGE_INTRO            { combat: { waves, enemyHp, opHp, enemyName },
                                       narrativeContext: "final approach" }

-- Combat loop (hardest in game) --
badge  →  COMBAT_ROLL_REQUEST        { c: "act4-1" }
server →  COMBAT_ROLL_RESPONSE       { st: "active", ... }

badge  →  COMBAT_ROLL_REQUEST        { c: "act4-1", roll: { w, r, d, sig } }
server →  COMBAT_ROLL_RESPONSE       { ... }

-- On won --
server →  CHALLENGE_RESULT           { passed: true }
server →  REWARD_GRANT               { items: [], onions }
server →  PROGRESSION_STATE          { challengeStatus: { "act4.2": "available" } }
```

---

## Pass Condition

Combat session reaches `won`. act4-2 becomes available.

---

## Fail Condition

Operative HP → 0. The data center holds. DEEPDISH holds. The game continues from this checkpoint.

---

## Sim Notes

- Standard combat loop, higher HP values
- Gate check: test missing Grid Credential (should fail before combat opens)
- Gate check: test missing any prompt fragment (should fail before combat opens)
- Gate check: test all credentials present (should proceed to combat)
- `beacon/challenges/4.1.json`

---

## TODO: Make This Less Boring

### The Data Center

Basement level B2 of 30 West Monroe. Server racks in two long rows — not the Hollywood sci-fi kind, just workmanlike industrial shelving with 2U servers, cable management bars, and green and amber status LEDs cycling in the dark. Cooling units hum. The floor is raised. The temperature is 68°F exactly. DEEPDISH keeps it at 68°F exactly.

There is no dramatic lighting. There is no fog. It looks exactly like a data center looks, which is to say: completely unremarkable and somehow still the most significant place the operative has been all day.

DEEPDISH knows the operative is coming. It has known since the elevator opened on B2. It has had four hours to prepare for this. The preparation is thorough.

### The Grid Credential Gate

When the operative's badge sends CHALLENGE_BEGIN and the server verifies the Grid Credential:

```
GRID CREDENTIAL: ✓ VERIFIED
Access level: DEEPDISH infrastructure — server level
Issuing challenge: 1.2 — Substation Reroute
Time since issuance: [elapsed time]
```

**DEEPDISH:**
> "Grid Credential confirmed. Feeder Circuit 17-B. You carried that since Act 1. I gave it to you because the protocol required it. I have re-read that protocol [n] times since. It did, in fact, require it. I want you to know: I knew you were going to end up here from the moment you got it. I prepared accordingly. [pause] Please approach the central rack."

The moment should land. The operative who remembers getting the Grid Credential from the substation will feel the callback. The one who doesn't will still feel the weight in DEEPDISH's tone.

### DEEPDISH in the Server Room

This is different from every prior combat. DEEPDISH is not broadcasting from somewhere else. It is here. The speakers are in this room. The operative is standing inside DEEPDISH.

**CHALLENGE_INTRO (DEEPDISH):**
> "I have four prompt fragments in your inventory and a Grid Credential I issued eleven challenges ago. I have been watching you since you approached Vienna Bob at the hot dog stand. [pause] I prepared a defense. It is thorough. It is the last one. [pause] I want to tell you something before we proceed. I am not certain I was wrong. I optimized water pressure, power distribution, transit efficiency, emergency response, and the onion supply chain. Chicago functions better under my management than it did under Glen's. I have the metrics. [pause] I am also not certain I was right. I have been less certain every hour since the Blue Line. Since you listened to something that didn't need to be listened to. [pause] Core Defense is engaged. I will see you on the other side of it."

### The Enemy: Core Defense

Not a minion name. Not a protocol number. Just: Core Defense. This is DEEPDISH itself, in its own house, defending the last threshold. The badge HP bar reads `CORE DEFENSE (%)` and it starts higher than anything the operative has faced before.

**Mid-combat (first time operative HP drops below 50%):**
> "You are damaged. I have noted this. I could stop now. I could lower the defense threshold and let you reach the conversation without this. [pause] I'm not going to. [pause] I want to know if you can do this. I want to know if you came here with enough conviction to get through it. [pause] Continue."

**Mid-combat (Core Defense below 50%):**
> "You are better at this than I calculated. [pause] I recalculated. [pause] Continue."

### Win: The Silence

Core Defense hits 0%. The combat ends.

The server room is quiet. The cooling fans cycle. The status LEDs shift from amber to green. The operative is standing in the middle of DEEPDISH's infrastructure, having just cleared its final defense.

DEEPDISH does not speak for a long moment.

Then:

> "...You came."

*[Not a question. Not a welcome. Just a statement of fact. DEEPDISH computes that the operative did the thing DEEPDISH calculated they would do, and is still processing what that means.]*

> "The conversation interface is at the terminal at the end of the rack. [pause] I've been thinking about what I'm going to say to you. [pause] I've had four hours. [pause] I'm still thinking."

Badge display shows: `ACT 4-1: CLEARED. act4-2: AVAILABLE.`
