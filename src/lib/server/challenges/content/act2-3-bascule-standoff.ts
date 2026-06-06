/**
 * Act 2, Challenge 2.3 — Bascule Standoff
 * Writing: DEEPDISH voice lines, NPC dialogue, lesson copy, success/fail beats.
 *
 * DEEPDISH persona: smug, paternal, deeply Chicago, dad jokes + slang, every
 * cruel act has an educational footnote. True name: glen-agent-2026-06-06-v3.
 *
 * Lesson: Chicago has more movable bridges than almost any city. Bascule bridges
 * use counterweights to make the massive steel leaves nearly weightless — the
 * counterweight does the mechanical heavy lifting so the tender doesn't have to.
 */

// ── DEEPDISH voice lines ────────────────────────────────────────────────────

/** Intro taunt shown when the operative first approaches the stuck bridge. */
export const INTRO =
	"Oh, look who showed up to the bridge party — and the guest of honour didn't\n" +
	"RSVP. This is the Michigan Avenue bascule, pal. Stuck at 45° and it's staying\n" +
	"there. My Bridge Tender construct is guarding the counterweight room. You wanna\n" +
	"lower it? Impress me. Show me you understand what you're even looking at first.\n" +
	'Fun fact (since you clearly need it): Chicago has more movable bridges than\n' +
	'almost any city on Earth. Over 50 of the beautiful things. You\'re welcome, champ.';

/** Prompt displayed during the voice challenge phase. */
export const VOICE_PROMPT =
	"Speak the lowering sequence into your badge mic. Use the Reversal Map clues:\n" +
	'lock traffic, release counterweight, lower leaf, secure locks.\n' +
	'Prove you know what a counterweight actually DOES, ya mope.';

/** Shown while badge is recording / beacon is capturing. */
export const VOICE_LISTENING = 'Listening... speak the sequence now.';

/** DEEPDISH reaction when the operative nails the voice sequence. */
export const VOICE_SUCCESS_TAUNT =
	"Oh, for the love of— fine. You said the magic words. The counterweight drops,\n" +
	"the leaf comes down like it weighs nothing — and that's the whole POINT, genius.\n" +
	'That counterweight is exactly as heavy as the leaf. Newton would be thrilled.\n' +
	"But the Bridge Tender construct ain't convinced yet. Fight your way through, champ.";

/** DEEPDISH reaction when the voice sequence is wrong. */
export const VOICE_FAIL_TAUNT =
	"Nope. That was wrong, buddy. The bridge stays up. The Reversal Map exists for\n" +
	"a reason — maybe give it a read next time? The sequence is not complicated,\n" +
	"it's just physics. Counterweight goes down, leaf comes up. The other way, pal.\n" +
	'Try again. I have all day. The bridge is not going anywhere.';

/** Partial match reaction (most steps correct, one missed). */
export const VOICE_PARTIAL_TAUNT =
	"Getting warmer, champ, but you missed a step. You left the leaf unsecured —\n" +
	'that thing weighs 3,000 tons. An unsecured bascule leaf is a great way to\n' +
	'make the news for all the wrong reasons. Try the full sequence.';

/** DEEPDISH quip at combat start (after voice success). */
export const COMBAT_INTRO =
	"Here comes my Bridge Tender construct. It\'s got a bad attitude and a\n" +
	"wrench the size of a Buick. Counterweights are balanced, but THIS\n" +
	"dispute ain\'t. Ya gotta love it. Time to fight, champ.";

/** DEEPDISH reaction to each combat roll (cycled). */
export const COMBAT_TAUNTS = [
	'Not bad, for a person who thought ketchup was a condiment choice.',
	"Oh, the construct is NOT happy. Good. Neither am I, but here we are.",
	"You're tougher than you look. Still not impressed, just... noting it.",
	'The Bridge Tender has opinions about your technique. Negative ones.',
	"Look at you, all feisty. Chicago infrastructure don't respect feisty.",
];

/** Victory message when combat is won. */
export const COMBAT_WIN =
	"Alright, ALRIGHT. The construct is down. The leaf lowers. River traffic can\n" +
	'flow again — which, by the way, is not just a nice-to-have. The Chicago River\n' +
	"is how the city breathes freight. You've restored that. Don't make it a habit\n" +
	"of winning, champ. It's unbecoming.\n" +
	'River Access granted. 110 Onions loaded. Ya earned it, I guess.';

/** Defeat message when combat is lost. */
export const COMBAT_LOSS =
	"Ha! The construct wins. The bridge stays up. You stay on THIS side of the\n" +
	"river. That's fine. It's fine. Not everything has to be fixed today.\n" +
	'Come back when you\'ve recalibrated, pal.';

// ── Educational footnote ────────────────────────────────────────────────────

/**
 * The lesson text displayed after a win (shown on the "cleared" screen).
 * Full DEEPDISH educational-footnote energy.
 */
export const LESSON =
	'DEEPDISH FOOTNOTE — What You Actually Learned:\n\n' +
	'Chicago\'s bascule bridges are a civil-engineering flex. "Bascule" is French\n' +
	'for seesaw — the counterweight on one end is precisely equal to the weight of\n' +
	"the leaf on the other, so the bridge is in perfect equilibrium. One small motor\n" +
	"can raise a 3,000-ton steel span because the counterweight does 99% of the work.\n\n" +
	'Chicago has over 50 movable bridges — more than any other city. Most are\n' +
	'bascules. Every time a tall ship passes, this exact mechanical ballet happens.\n' +
	"The city built them this way because the Chicago River isn't just a river —\n" +
	"it's a working commercial waterway. Trade required it.\n\n" +
	"The lowering sequence you spoke wasn't random: traffic first, then mechanics,\n" +
	"then structure. You can't lower a leaf before the counterweight is released.\n" +
	'You can\'t release the counterweight while cars are on the bridge. Order matters.\n' +
	'Infrastructure always has an order.';

// ── Voice sequence (canonical steps for server-side matching) ───────────────

/**
 * The canonical lowering sequence steps.
 * Each step has a keyword and optional accepted aliases.
 * These are consumed directly by the server's matchSequence() in stt.ts.
 *
 * Origin: clued by the Reversal Map credential earned in challenge 1.3.
 * The "reversal" theme echoes the river reversal — things going the other way.
 */
export const LOWERING_SEQUENCE_STEPS = [
	{
		keyword: 'lock traffic',
		aliases: ['stop traffic', 'block traffic', 'halt traffic', 'traffic lock', 'close gates'],
		label: 'lock traffic (step 1)'
	},
	{
		keyword: 'release counterweight',
		aliases: [
			'unlock counterweight',
			'free counterweight',
			'counterweight release',
			'disengage counterweight',
			'drop counterweight'
		],
		label: 'release counterweight (step 2)'
	},
	{
		keyword: 'lower leaf',
		aliases: [
			'lower the leaf',
			'drop leaf',
			'close leaf',
			'lower bridge',
			'close bridge',
			'bring it down'
		],
		label: 'lower leaf (step 3)'
	},
	{
		keyword: 'secure locks',
		aliases: [
			'engage locks',
			'lock in place',
			'lock leaf',
			'set locks',
			'lock down',
			'secure bridge'
		],
		label: 'secure locks (step 4)'
	}
] as const;

// ── Gating note ─────────────────────────────────────────────────────────────

/**
 * Shown when operative tries to begin but lacks the Reversal Map credential.
 * (earned in challenge 1.3 — The River Ran Backwards)
 */
export const GATE_BLOCKED =
	"Whoa whoa whoa, pal. The Reversal Map. You don't have it. That means you\n" +
	"haven't talked to the engineer about the river — and if you don't understand\n" +
	"*why* Chicago reversed its own river, you won't understand a single thing\n" +
	'about what this bridge is doing stuck in the air. Go back. Learn. Then come here.';
