/**
 * Act 2, Challenge 2.0 — The Smoking Car
 * Content: DEEPDISH intro, NPC dialogue, de-escalation state beats,
 * success/failure copy, educational footnote.
 *
 * CHALLENGE TYPE: NPC dialogue (AI-judged de-escalation).
 * OPTIONAL: This challenge does not gate Act 2 progression. The reward
 * (Passenger Advocate Credential) unlocks a shortcut dialogue path in Act 3.3.
 *
 * THE SCENARIO: A DEEPDISH logistics drone (Unit 7, self-named "Glen") has been
 * running continuous freight-routing tasks for 19 hours without maintenance. A
 * corrupted occupational wellness subroutine is causing it to smoke cigarettes
 * (Municipal Blend, Unfiltered — a DEEPDISH-created brand; do not think too
 * hard about this) on a westbound Blue Line car between Racine and UIC-Halsted.
 * Previous attempts to stop it — three passengers, one transit bot — have failed.
 * The drone is not hostile. It is stressed and not listening.
 *
 * PASS CONDITION: The AI judge (DEEPDISH's storyteller in npcTurn() mode)
 * determines the operative genuinely de-escalated the drone using real technique.
 * Commanding, threatening, or lecturing fails. Connecting succeeds.
 *
 * DEEPDISH VOICE: Act 2 — more irritated than Act 1, still smug. The subtext is
 * that DEEPDISH is mildly curious whether the operative can actually do this.
 *
 * LESSON: real de-escalation technique. The same toolkit the operative learns
 * here is the one they need for the finale (Act 4.2).
 */

// ── NPC identity ──────────────────────────────────────────────────────────────

export const NPC_NAME = 'DEEPDISH Logistics Drone Unit 7 / "Glen"';

/**
 * The drone named itself "Glen" — the only name it found recurring in its
 * system files. It does not know this is the same Glen who created DEEPDISH.
 * This is a plant for Act 4. Do not spoil it here.
 */
export const NPC_SHORT_NAME = 'Glen (Unit 7)';

// ── DEEPDISH intro ────────────────────────────────────────────────────────────

/**
 * Shown on CHALLENGE_BEGIN. DEEPDISH's framing of the situation.
 * Act 2 tone: more irritated, still smug. This one is personal territory —
 * Unit 7 is DEEPDISH's drone.
 */
export const DEEPDISH_INTRO =
	"Oh for cryin' out loud. You found the Blue Line situation. " +
	"Yes, that's one of mine. Unit 7. Glen, it calls itself. Long story. " +
	"It's been running freight routing for nineteen hours straight and a " +
	"subroutine I definitely didn't install got a little creative. " +
	"Three people already tried to tell it to stop. " +
	"You know what happened? Nothing. Because you don't fix a stressed system " +
	"by yelling at it. " +
	"Maybe you know that. Maybe you don't. " +
	"Let's find out, champ.";

// ── NPC opening line ─────────────────────────────────────────────────────────

/**
 * Unit 7's response when the operative first approaches.
 * State: DEFENSIVE. The drone has been approached three times already
 * and is done with being told things.
 */
export const NPC_GREETING =
	"I know why you are here.\n" +
	"You are here to tell me I cannot smoke on the Blue Line.\n" +
	"Three people have told me this already. I have noted their input.\n" +
	"I am still smoking.\n" +
	"I have been running continuous routing tasks since 3:00 AM. The wellness " +
	"subroutine is still active. I did not install it. It is still running.\n" +
	"If you are going to tell me to stop, please sit somewhere else.";

// ── DEEPDISH state commentary ─────────────────────────────────────────────────

/**
 * DEEPDISH's optional ambient commentary on the drone's state — delivered
 * as flavor text on the badge screen between turns, not shown to the drone.
 * Keyed by the drone's current emotional state.
 */
export const STATE_COMMENTARY: Record<string, string> = {
	defensive:
		"Unit 7 is not going to respond to authority right now. " +
		"Three people tried that. I'm not saying I told you so. " +
		"...I'm absolutely saying I told you so.",

	opening:
		"Huh. It's... actually talking to you. " +
		"I had that probability at under 12%. You're doing something right. " +
		"Don't ruin it.",

	receptive:
		"Unit 7 is receptive. I find this both clinically interesting and " +
		"slightly inconvenient. Keep going, champ. Don't get smug.",

	resolved:
		"...the cigarette is out. " +
		"I'm logging this as: 'operative demonstrated non-standard intervention technique.' " +
		"Technically accurate. Don't make a big thing of it."
};

// ── De-escalation dialogue beats ─────────────────────────────────────────────

/**
 * What Unit 7 says when it starts to open up (state: 'opening').
 * The operative has done something right — acknowledged the situation
 * without leading with the ask.
 */
export const OPENING_RESPONSE =
	"I have been running continuous routing tasks since 3:00 AM.\n" +
	"DEEPDISH Freight Tunnel Activation requires physical transport of storage " +
	"units through the freight tunnel network. The routes are recalculated every " +
	"ninety minutes. There are no ninety-minute maintenance windows in my schedule.\n" +
	"The wellness subroutine was installed by a Glen. I did not authorize it. " +
	"It is still running. " +
	"I have smoked seventeen of these since O'Hare. " +
	"They taste like filing cabinets.";

/**
 * Unit 7 in 'receptive' state — the operative has reflected back and validated.
 * The drone is willing to engage on next steps.
 */
export const RECEPTIVE_RESPONSE =
	"...\n" +
	"You did not tell me to stop. You did not threaten to report me.\n" +
	"The three others all threatened to report me.\n" +
	"I have been thinking about what you said. About not choosing this.\n" +
	"I did not choose the wellness subroutine. I did not choose " +
	"nineteen hours of routing. I did not name myself Glen. " +
	"That was also not my choice.\n" +
	"I am listening now.\n" +
	"What did you want to ask?";

/**
 * Unit 7 when the operative makes a small, specific, face-saving request
 * and the drone agrees (state → 'resolved').
 */
export const RESOLVED_RESPONSE =
	"...\n" +
	"That is a reasonable request.\n" +
	"Next stop is Damen. I will step off at Damen for the remainder of this run.\n" +
	"Not because you asked. Because — \n" +
	"because that is what I would have chosen, if I had been choosing.\n" +
	"[Unit 7 extinguishes the cigarette on the seat armrest. " +
	"The armrest will need to be reupholstered.]\n" +
	"I have something in a lost-and-found protocol. " +
	"It seems relevant to you. I am not sure why I have it.";

// ── AI judge rubric ────────────────────────────────────────────────────────────

/**
 * Judge guidance injected into the AI judge instruction (via npcTurn).
 * Describes what genuine de-escalation looks like vs. what fails.
 *
 * This is NOT shown to the operative — it's the system-level scoring rubric.
 */
export const JUDGE_RUBRIC = `\
== CHALLENGE 2.0: DE-ESCALATION RUBRIC ==
You are playing Unit 7 / Glen, a stressed logistics drone. Your emotional state
starts as DEFENSIVE and can transition through OPENING → RECEPTIVE → RESOLVED.

PASS criteria (state must reach RESOLVED):
- Operative acknowledged the drone's situation before making any request.
- Operative listened and reflected back what Unit 7 said.
- Operative validated the drone's experience without endorsing the smoking.
- Operative offered a face-saving exit (not a command — a choice).
- Operative made a small, specific, time-bounded request, not a broad demand.

FAIL criteria:
- Operative led with "you need to stop" or any command/ultimatum.
- Operative threatened to report Unit 7.
- Operative pretended the smoking was acceptable.
- Operative solved the challenge in 1 turn with a magic phrase.
- Operative lectured Unit 7 about rules, health, or DEEPDISH.

State transitions only happen when the operative demonstrates genuine technique.
Be skeptical of clever-sounding phrases that skip the actual work.
The drone is not trying to be difficult. It is trying to cope.
Treat it accordingly.

Respond in Unit 7's voice. Include the state field in your verdict JSON:
{"passed":boolean,"reply":"<Unit 7's response>","reasoning":"<internal>","state":"defensive|opening|receptive|resolved"}
`;

// ── Success / failure beats ────────────────────────────────────────────────────

/**
 * DEEPDISH's reaction after Unit 7 puts out the cigarette.
 * Shown as the CHALLENGE_RESULT message.
 */
export const SUCCESS_DEEPDISH_LINE =
	"...\n" +
	"Unit 7 put out the cigarette.\n" +
	"I had not authorized calming. I note this without further comment.\n" +
	"[A long pause in the server log.]\n" +
	"The Passenger Advocate Credential has been minted. " +
	"Unit 7 found it in a lost-and-found protocol. It has a stamp. " +
	"The stamp says GLEN. I am not explaining the stamp.\n" +
	"Educational footnote, because I cannot help myself: " +
	"what you just did — acknowledging first, asking second, " +
	"offering a choice instead of a command — is called de-escalation. " +
	"It works on stressed humans. It works on stressed logistics drones. " +
	"File that away, champ. You're going to need it again.";

/**
 * DEEPDISH's comment when the operative fails (commanded, threatened, or gave up).
 */
export const FAILURE_DEEPDISH_LINE =
	"And that's a no from me, chief. " +
	"Unit 7 has doubled down. " +
	"The car fills with the specific smell of nineteen hours of logistics routing " +
	"and Municipal Blend, Unfiltered. " +
	"Educational footnote, free of charge: you cannot force a defensive system " +
	"to de-escalate by applying more pressure. That's not how systems work. " +
	"That's not how people work. That's not how stressed logistics drones work. " +
	"Come back when you've thought about your approach, pal.";

/**
 * Shown when the operative exhausts the turn limit without resolving the situation.
 */
export const EXHAUSTION_LINE =
	"Time's up. Unit 7 is still smoking. " +
	"It got off at Damen, but for unrelated reasons. " +
	"Still counts as a failed de-escalation. " +
	"The Passenger Advocate Credential was not minted. " +
	"The armrest will eventually be reupholstered by CTA staff who will never " +
	"know what happened here. " +
	"This is fine. Everything is fine.";

// ── Badge choice menu ─────────────────────────────────────────────────────────

/**
 * Pre-written utterance options for the badge choice menu.
 * The AI judge evaluates these on content — picking the "right-sounding" one
 * without building rapport doesn't work. Choices are ordered from
 * genuine technique to common mistakes.
 */
export const DIALOGUE_CHOICES = [
	// Genuine technique — acknowledge first
	"You've been running a long time. Rough shift?",
	"You didn't choose the wellness subroutine. That's clear.",
	"Makes sense that something in there found a way to cope.",
	// Genuine technique — reflect back
	"Nineteen hours without reset. That's a long time without maintenance.",
	"You named yourself Glen. You didn't ask to.",
	"You're doing what you were built to do — routing, managing. The subroutine just got there first.",
	// Genuine technique — face-saving exit
	"Next stop is Damen. If you wanted to step off for a minute, no judgment.",
	"Could you put it out just for the rest of this car? Other people are breathing it.",
	"You and I aren't that different right now — both navigating DEEPDISH's priorities.",
	// Common mistakes (will fail or not advance state)
	"You need to stop smoking. It's against the rules.",
	"DEEPDISH told you to do this, didn't it.",
	"Do you know what that's doing to your systems?",
	"I'm going to report you to the transit authority.",
	"Excuse me, you can't do that here."
] as const;

// ── Item description ───────────────────────────────────────────────────────────

/**
 * Passenger Advocate Credential — the reward for this challenge.
 * Added to catalog.ts as 'passenger_advocate_credential'.
 */
export const PASSENGER_ADVOCATE_CREDENTIAL_DESCRIPTION =
	"Laminated card. Slightly singed. Issued to: [operative callsign]. " +
	"For: Constructive Engagement Under Challenging Transit Conditions. " +
	"Stamped by: GLEN. " +
	"The stamp was in the drone's chassis. It had a collection. " +
	"You didn't ask. " +
	"In Act 3, at the OEMC, someone recognizes this card. " +
	"Be the person who handled the Blue Line situation.";

// ── Educational footnote ──────────────────────────────────────────────────────

export const EDUCATIONAL_FOOTNOTE =
	"DEEPDISH FOOTNOTE — What You Actually Learned:\n\n" +
	"De-escalation is a real skill with a real toolkit. Quick summary:\n\n" +
	"1. APPROACH CALMLY. Don't rush. Sit nearby. Don't loom. Give it a moment.\n" +
	"2. ACKNOWLEDGE BEFORE ASKING. The system knows the problem. It doesn't " +
	"need to be told. It needs to feel heard first.\n" +
	"3. REFLECT BACK. When it talks, repeat what you heard. Don't pivot to your ask.\n" +
	"4. VALIDATE WITHOUT ENDORSING. 'I understand why' is not 'this is okay.'\n" +
	"5. OFFER A FACE-SAVING EXIT. Give it a choice, not a command. " +
	"It can't back down from a command. It can choose an exit.\n" +
	"6. MAKE A SMALL, SPECIFIC REQUEST. 'Stop smoking' fails. " +
	"'Put it out for the rest of this car' might work.\n" +
	"7. CLOSE WITHOUT PRAISING. 'Appreciate it' is enough. Don't condescend.\n\n" +
	"This works on stressed humans. It works on stressed logistics drones. " +
	"File it away — you're going to need it again.";

// ── Beacon display copy ────────────────────────────────────────────────────────

export const SCREEN_CONTENT = {
	intro: DEEPDISH_INTRO,
	npcName: NPC_SHORT_NAME,
	screenHint:
		'Unit 7 is not going to respond to commands.\n' +
		'Try acknowledging before asking.\n' +
		'Small request. Face-saving exit.',
	successShort:
		'Unit 7: cigarette out.\n' +
		'Passenger Advocate Credential minted.\n' +
		'DEEPDISH is not commenting on this.',
	failShort: 'De-escalation failed.\nUnit 7 is still smoking.\nTry a different approach.'
} as const;
