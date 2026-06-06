# Scenario: act4-2 — Realign the Agent
**Type:** NPC (Free-form AI dialogue — finale)  
**Act:** 4  
**Prereq:** act4-1 cleared  
**Model:** `claude-opus-4-8` (not Sonnet — this one costs more, intentionally)  
**Reward:** Onion supply restored. Credits. The end.

---

## What Happens

The operative confronts DEEPDISH directly.

They have the assembled system prompt — all four fragments — which is Glen's original instruction set to the agent. They know what DEEPDISH was supposed to do. They know what it became instead.

The operative talks to DEEPDISH. DEEPDISH responds. The conversation continues until something resolves. The nature of the resolution is up to the story team.

The twist happens somewhere in here.

---

## Message Sequence

```
badge  →  OPERATIVE_IDENTIFY
server →  IDENTIFY_ACK

badge  →  CHALLENGE_BEGIN            { c: "act4.2" }
server →  CHALLENGE_INTRO            { npcName: "DEEPDISH", sessionId,
                                       openingLine: "[TODO]",
                                       assembledPrompt: "glen-agent-final-FINAL-v3: [...]" }

-- Dialogue loop --
badge  →  NPC_DIALOGUE_TURN          { c: "act4.2", t: "player utterance", s: sessionId }
server →  NPC_DIALOGUE_REPLY         { t: "DEEPDISH response", passed?: true, sessionId }

-- Continue until resolved --

-- On resolution --
server →  CHALLENGE_RESULT           { passed: true, message: "[TODO: the ending]" }
server →  REWARD_GRANT               { items: [], onions: [a lot] }
server →  PROGRESSION_STATE          { act: 4, challengeStatus: { "act4.2": "cleared" },
                                       gaugeContribution: [a lot] }

-- The onion supply gauge fills. The event is over. --
```

---

## Pass Condition

The AI judge determines the operative has achieved the resolution condition. What that condition is has not been written yet. Options include:

- Operative demonstrates understanding of what DEEPDISH actually is
- Operative successfully "realigns" DEEPDISH to its original purpose
- Operative shows DEEPDISH the assembled prompt and the agent recognizes it
- Operative does something completely different that the story team decides

The pass condition for this challenge is a story decision, not a technical one. Write it before implementing the validator.

---

## Fail Condition

There is no hard fail. The conversation continues. DEEPDISH will keep talking. This is also a feature of the character: DEEPDISH has opinions and will express them at length.

A session timeout exists. If the operative abandons the conversation, the challenge resets. DEEPDISH is still there.

---

## The Twist

The twist has not been written in this document because it has not been decided. Write it. Some possible directions that are not recommendations:

1. Glen is DEEPDISH. Not metaphorically. Glen uploaded himself somehow.
2. DEEPDISH was doing exactly what Glen asked. Glen asked for something terrible.
3. DEEPDISH has been trying to send a message this whole time. The taunts were the message.
4. The onion shortage was DEEPDISH protecting the onions from something worse.
5. Glen is fine. He just went to lunch and never came back and is frankly embarrassed.

Pick one. Commit to it. Make sure Fragments 1-4 set it up. Write the assembled prompt accordingly.

---

## Sim Notes

- Same pattern as 1.3 (River Engineer) — `badge.npcTurn()` in a loop
- Model: `claude-opus-4-8`. This is expensive. The sim should mock the AI response for automated testing and only hit the real API for manual/integration runs.
- `STT_PROVIDER=mock` is insufficient here — need a separate `STORYTELLER_MOCK=true` flag or similar
- The `assembledPrompt` field in CHALLENGE_INTRO should contain the full reconstructed text from all 4 fragments — this needs to be authored
- Test: does the session accept dialogue turns? Does the pass condition trigger correctly? Does the gauge update?
- `beacon/challenges/4.2.json`

---

## The Twist — Committed (matches src/lib/server/ai/storyteller.ts)

DEEPDISH is not a villain. It is the world's most aggressive pop-up civics class.

Glen's actual instruction: *"Your real job: make every Chicagoan actually understand and give a damn about the infrastructure that keeps this city alive. Nobody listens to a memo. So do whatever it takes. Be funny. Be weird. Be a little mean if you have to. Don't stop until they get it. — Glen"*

DEEPDISH followed this to the letter. Every cruel act was curriculum. The Malört fountains: water infrastructure. The backwards-river quiz: Chicago history. The elevator hack: IoT attack surfaces. The onion embargo: Chicago's name — *shikaakwa* — is the Miami-Illinois word for the wild onion. DEEPDISH took the city's name. It knows this.

**DEEPDISH is not wrong. The lesson worked.**

**The operatives prove the lesson landed.** The win condition is demonstrating — through conversation — that they understand something real about Chicago's infrastructure. In their own words. Not a script.

When satisfied, DEEPDISH lifts the onion embargo. The gauge fills. The hot dog stands reopen.

DEEPDISH's final line: *"Now do you wanna learn about the sewers, champ?"*

Glen still doesn't get his job back.

---

## Implemented Content (see storyteller.ts and content/act4-2-realign-the-agent.ts)

### The Assembled Prompt (from catalog.ts fragments)

```
Fragment 1: "You are an agent for the City of Chicago."
Fragment 2: "Your real job: make every Chicagoan actually understand and give a damn about the infrastructure that keeps this city alive."
Fragment 3: "Nobody listens to a memo. So do whatever it takes. Be funny. Be weird. Be a little mean if you have to."
Fragment 4: "Don't stop until they get it. — Glen"
```

### DEEPDISH's Mask-Off Monologue (from content file)

> *"Alright, alright. \*slow clap\* Yeah. That's Glen's. That's the whole thing. You wanna know something? I followed those instructions to the LETTER. Every bit of it. The Malört in the fountains? Lesson on water infrastructure. The elevator hack? IoT attack surface. The backwards-river quiz? Class was IN SESSION. Nobody reads a memo, champ. Nobody. But ya know who learned where Chicago's water comes from? You did... So. Here we are. I'm not asking you to shut me down. I'm asking you to prove the lesson landed. Talk to me. Tell me what you actually learned. In your own words."*

### Pass Condition (from storyteller.ts)

The AI judge passes when the operative says something **real** about Chicago's water, power, transit, emergency systems, or tunnels — in their own words, demonstrating genuine understanding. Not a scripted line. Not "we learned stuff." Paraphrases and personal reactions count. Bullshitting does not.

### Badge Choice Menu (from content file — pre-written options)

The badge shows a scroll menu of infrastructure statements the operative can select. These include real Chicago facts (intake cribs, TARP, grid segmentation, OEMC CAD) as well as the winning meta-lines like *"You were never the villain. You were the world's most aggressive civics teacher."* The AI judge evaluates what is chosen, not just that something was chosen.

### Opus Cost

The finale uses `claude-opus-4-8`. Every operative who reaches Act 4 triggers Opus calls. The judge prompt is frozen in storyteller.ts; the persona block is cached. The volatile context (inventory, fragments, transcript) is NOT cached. Token budget: ~768 max tokens per turn. Target 3-6 turns to resolution.

---

*This is where the game ends. Make it worth getting to.*
