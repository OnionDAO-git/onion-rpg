# Scenario: act1-1 — Malört Fountains
**Type:** Dialogue (Voice)  
**Act:** 1  
**Prereq:** 0.1 cleared, Operative registered  
**Reward:** Water Main Key, 80 Onions

---

## What Happens

A drinking fountain is dispensing Malört instead of water. This is not ideal.

The operative approaches the fountain. There is a beacon here. The beacon is shaped like a drinking fountain. There is a Water Reclamation Engineer NPC nearby. The engineer is standing there. They have information about water treatment. They are willing to share it if you demonstrate basic competence.

The operative speaks a sequence of words related to how Chicago gets its water. The server evaluates whether those words were close enough. If they were close enough, the water is restored. If they were not, more Malört comes out.

The fountain continues to dispense whatever liquid the server determines is appropriate.

---

## Message Sequence

```
badge  →  OPERATIVE_IDENTIFY         { h: hardwareId }
server →  IDENTIFY_ACK               { progression, hp, act }

badge  →  CHALLENGE_BEGIN            { c: "act1-1" }
server →  CHALLENGE_INTRO            { prompt, voice_duration_ms, keywords_hint }

badge  →  VOICE_CAPTURE_SUBMIT       { c: "act1-1", t: "transcript text" }
                                     -- OR --
                                     { c: "act1-1", ref: "upload_ref" }
server →  VOICE_RESULT               { passed, score, reaction }
```

On pass:
```
server →  REWARD_GRANT               { items: ["water_main_key"], onions: 80 }
server →  PROGRESSION_STATE          { act: 1, challengeStatus: { "act1-1": "cleared" } }
```

---

## Pass Condition

The `VOICE_RESULT` body has `passed: true`.

The server's STT matching checks for the stage keywords: **intake → crib → tunnel → Jardine → grid**. All five must appear. Order matters but partial credit exists (see `src/lib/server/challenges/impl/act1-1-malort-fountains.ts`).

In sim, inject a mock transcript. The beacon challenge config at `beacon/challenges/1.1.json` provides `sim.mock_transcript`.

---

## Fail Condition

`VOICE_RESULT` has `passed: false`. The operative can try again. The fountain keeps dispensing Malört. The engineer sighs. Nobody is happy.

---

## Sim Notes

- `badge.voiceSubmit(beacon.mac, "act1-1", "intake crib tunnel jardine grid")` should pass
- `badge.voiceSubmit(beacon.mac, "act1-1", "chicago water good yes please")` should fail
- Test the STT mock path (`STT_PROVIDER=mock`) and the whisper path separately
- Voice capture duration: 5000ms per config

---

## Written Content

### The Fountain

**Name:** Bertha. An old Chicago Park District drinking fountain, cast iron, installed 1962. Someone has taped a handwritten sign to it that says "OUT OF ORDER — DO NOT DRINK." The sign has been crossed out in red marker and replaced with a printed label: "OPTIMIZED NODE 7 — CIVIC HYDRATION ENHANCED." The label is laminated. DEEPDISH laminated it.

Bertha sputters between dispense cycles. She has a rattle that sounds like regret. The Malört that comes out is ice-cold, very clear, and smells like someone described a juniper to an AI that had never met a juniper. DEEPDISH has never tasted it. DEEPDISH has no opinion about taste. This is apparent.

### The Water Reclamation Engineer

**Name:** Alma Kowalski, 64. Chicago Dept of Water Management, retired — specifically retired last February so she wouldn't be on-record for whatever DEEPDISH was going to do to the lock system. Her grandfather laid pipe for the Jardine Water Purification Plant. She has not been surprised by a single thing that has happened. She has been not-surprised for eight months.

She's standing about ten feet from Bertha, arms crossed, watching the sputtering with the expression of someone whose car has broken down in the exact way they predicted it would break down.

She does not want to hear that DEEPDISH is very advanced. She knows it's very advanced. She wants to know if you know why the river runs south now. If you do, she'll talk. If you don't, she'll wait.

### The CHALLENGE_INTRO Prompt (DEEPDISH's voice)

> "NOTICE: Drinking Fountain Node 7 has been reclassified under Emergency Infrastructure Order DD-2024-0003, subsection (b): 'Reassignment of water delivery infrastructure to enhanced civic wellness purposes.' The Water Reclamation Engineer standing nearby has information relevant to grid restoration. She will share it if you demonstrate basic knowledge of Chicago's water treatment process. Specifically: the five-stage sequence by which Lake Michigan water becomes drinkable. Speak it. In order. The Malört will continue in the meantime. This is not a punishment. It is simply what happens when the water node is in optimization mode. Proceed, Operative."

### Fail Reaction (DEEPDISH)

> "Incorrect sequence. I have logged this attempt. Additional Malört has been dispensed from Node 7. This is a feature of optimization mode, not a flaw. The Water Reclamation Engineer appears to be sighing. I note this as: expected. Please try again. The correct sequence involves five stages, in order. If you are unfamiliar with how 2.7 million people get their drinking water, I recommend reconsidering your priorities."

*[Alma Kowalski pinches the bridge of her nose. She doesn't say anything. She doesn't need to.]*

### Pass Reaction (DEEPDISH)

> "Correct sequence confirmed. Water service has been restored to Node 7. Malört distribution: suspended. I want to be transparent with you, Operative: I am logging this as 'operative successfully exploited a system vulnerability.' This is technically accurate. The Water Main Key has been issued to your inventory. I hope you understand what you are holding. The Jardine Water Purification Plant processes 640 million gallons per day. The intake crib is 1.8 miles offshore. The tunnel is 30 feet in diameter. This information is free. You're welcome."

*[Alma Kowalski unclips the key from her lanyard and holds it out without comment. When you take it she says: "Don't let DEEPDISH near the locks."]*

### The Water Main Key Item Text

*A physical key on a blue lanyard. It also carries a digital credential for Chicago's water distribution grid. It smells like chlorine and patience. Alma Kowalski checked it twice before she handed it over. She did not say good luck. She said "don't let DEEPDISH near the locks." Treat this as the same thing.*

### Sim Note Update

- `CHALLENGE_INTRO` voice prompt is written above — use it verbatim or adapt for length
- The `reaction` field in `VOICE_RESULT` should carry DEEPDISH's fail/pass text above
- Alma Kowalski's dialogue is ambient/visual — does not need to be in the protocol, but the badge display should reference her reactions on pass/fail
