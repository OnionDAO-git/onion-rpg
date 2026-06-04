/**
 * Act 1, Challenge 1.3 — "The River Ran Backwards" (NPC/AI)
 *
 * Writing & copy for the DEEPDISH-voiced old-engineer NPC encounter.
 * DEEPDISH voice: smug, paternal, deeply Chicago, dad jokes, educational
 * footnotes. Tone for Act 1: condescending — "Oh, you're TRYING. Bless
 * your heart, champ."
 *
 * All strings are exported and consumed by the challenge impl. Keep the
 * DEEPDISH persona byte-stable in the system prompt (storyteller.ts);
 * lines here are the per-challenge scaffold, not the persona itself.
 */

/** The NPC persona for this encounter — an old Chicago civil-engineer ghost. */
export const NPC_NAME = 'Old Ike';

/**
 * DEEPDISH intro monologue when the operative first approaches the beacon.
 * Shown as the CHALLENGE_INTRO payload; also used when the AI is unavailable
 * as a static fallback for the badge display.
 */
export const INTRO_LINES = [
	// Line 1 — DEEPDISH sets the scene
	"Ohhh, look who wandered into the riverbank, champ. Real cute. " +
		"There's a crusty old timer down here who CLAIMS he'll help restore the water flow — " +
		"but only if you can prove you actually understand this city.",

	// Line 2 — educational footnote, dripping with condescension
	"See, in 1900 Chicago pulled off one of the most brazen feats of civic engineering " +
		"in American history. They REVERSED A RIVER, pal. Not a stream, not a creek — " +
		"the actual Chicago River. And most people walking around this city couldn't tell you why " +
		"if you spotted them the vowels.",

	// Line 3 — the challenge
	"Old Ike here remembers. He was THERE — technically he's been dead since 1912, but details. " +
		"Convince him you know WHY they did it, and maybe he cuts you a break. " +
		"Good luck, buddy. You're gonna need it."
] as const;

/**
 * Old Ike's greeting line when the NPC dialogue opens.
 * This is the first thing the player sees (NPC_DIALOGUE_REPLY for turn 0).
 */
export const NPC_GREETING =
	"Hrmph. Another one. Fine. You want my help? " +
	"Tell me: WHY did Chicago reverse the flow of the Chicago River in 1900? " +
	"And don't you DARE say 'to stop the flooding.' I will walk into the river myself.";

/**
 * Choice options shown on the badge scroll menu (NPC archetype).
 * These are assembled into utterances the AI judges for comprehension.
 * Ordered from "clearly passing" to "cleverly sideways" to "probably wrong."
 */
export const BADGE_CHOICES = [
	// Correct answers (various framings of the sewage/drinking-water connection)
	"To keep sewage out of Lake Michigan — our drinking water came from the lake.",
	"The river was carrying waste into Lake Michigan, contaminating the water supply.",
	"Sewage was flowing into the lake and poisoning the city's water source.",
	"The Sanitary District reversed it so filth flowed away from the lake, not into it.",
	"Typhoid and cholera from river sewage were killing people — reverse the flow, save lives.",
	// Partial-credit / sideways angles the AI may still pass
	"Because Chicago drew drinking water from Lake Michigan and needed to protect the intake cribs.",
	"The city was sick — bad water from sewage downstream — reversing the river fixed the source.",
	// Probably-wrong (AI decides; might pass if operatives add context in conversation)
	"To improve navigation and river traffic.",
	"To stop downtown flooding during heavy rain.",
	"I'm not sure, but it had something to do with the lake.",
] as const;

/**
 * Success beat — what DEEPDISH (as Old Ike's translator) says when the
 * operative passes. Keep in DEEPDISH voice.
 */
export const SUCCESS_LINES = [
	// Primary success (knows the sewage/water connection)
	"Alright alright, ALRIGHT. You got it. " +
		"Sewage downstream, water intake upstream, reverse the river, typhoid epidemic averted, " +
		"Sanitary District takes a bow, whole world gawks. " +
		"Old Ike is... begrudgingly impressed. Don't let it go to your head, champ.",

	// Bonus success (mentions 1900 / scale / engineering)
	"Oh for cryin' out loud, you even know the year. " +
		"1900. Twenty-eight million cubic yards of material moved in EIGHT YEARS, pal. " +
		"The biggest public works project in American history up to that point, and you actually know about it. " +
		"Old Ike has a tear in his eye. A very small, very judgmental tear."
] as const;

/**
 * Failure / retry beat when the operative answers wrong.
 * DEEPDISH stays theatrical — disappointed, not cruel (for now).
 */
export const FAILURE_LINES = [
	// Said "flooding" without the drinking-water connection
	"I TOLD you not to say flooding. Old Ike's very specific about that. " +
		"Yes, reversing the flow helped with flooding, technically. " +
		"But that is NOT why they moved mountains to do it in eight years flat. " +
		"Hint: people were DYING from the river. Specific kind of dying. Try again.",

	// Generic non-answer
	"That's... a no from me, chief. " +
		"Old Ike is staring at you with the energy of a man who spent 1899 shoveling limestone. " +
		"He has opinions about people who don't do their homework. Try again, pal.",

	// Completely off the rails
	"Navigation?! Navigation. Buddy. " +
		"You think they reversed an entire river — uphill, basically — for boats? " +
		"Old Ike would walk into the river AGAIN. Think about WHY the water was bad. " +
		"What was IN it. Where it was coming FROM."
] as const;

/**
 * The educational footnote DEEPDISH appends to the success beat.
 * Used in the final DEEPDISH reply on success — short enough to fit the badge.
 */
export const EDUCATIONAL_FOOTNOTE =
	"[DEEPDISH Footnote, because of course]: " +
	"The Chicago Sanitary and Ship Canal opened January 2, 1900, reversing the Chicago River " +
	"away from Lake Michigan. Milwaukee sued. St. Louis sued. The U.S. Supreme Court got involved. " +
	"Chicago didn't care. We moved a river, champ. That's the kind of city this is.";

/**
 * The Reversal Map item description — reward for passing.
 * Referenced in catalog.ts; this is the lore text.
 */
export const REVERSAL_MAP_DESCRIPTION =
	"A hand-drawn survey of the Chicago River reversal works, annotated by Old Ike himself. " +
	"The bridges, the locks, the canal junction — all marked with Ike's crabbed 1900s handwriting. " +
	"Useful for anyone trying to operate Chicago's movable bridges. " +
	"DEEPDISH note: 'You're welcome, champ. Now go find out what a bascule is.'";
