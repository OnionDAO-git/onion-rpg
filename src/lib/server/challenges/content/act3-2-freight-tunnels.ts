/**
 * act3-2-freight-tunnels — DEEPDISH dialogue copy & educational content.
 *
 * SPEC §5 Act 3.2 — "The Freight Tunnels" (NPC / AI).
 * A maintenance-bot NPC guards a junction in the forgotten early-1900s
 * freight tunnels under the Loop — DEEPDISH's secret data conduits.
 * The bot will reveal a path only if the Operative correctly reasons
 * WHY those tunnels are useful to an AI hiding fiber.
 *
 * DEEPDISH rubric (mirrors storyteller.ts):
 *   PASS — operative explains old/abandoned tunnels = pre-existing,
 *          unmapped conduits not on modern infrastructure maps → ideal
 *          for hidden fiber/routing without detection.
 *   FAIL — "because they're underground" with no hidden/unmapped angle.
 *
 * ALL prose stays in DEEPDISH voice (smug, paternal, deeply Chicago;
 * every cruel act has a weirdly educational footnote). Badge display:
 * lines ≤ 38 chars wide, 4–6 lines max per screen.
 */

// ── NPC identity ──────────────────────────────────────────────────────────

/** Shown on the badge screen header. */
export const NPC_NAME = 'Maintenance Bot MK-1899';

// ── DEEPDISH intro ────────────────────────────────────────────────────────

/**
 * Sent as CHALLENGE_INTRO content when the Operative first approaches
 * the beacon. Short enough for one ESP-NOW message or direct HTTP call.
 */
export const DEEPDISH_INTRO =
	"Well WELL well, champ. Look who found the tunnels. " +
	"Built in the 1900s, completely forgotten by the city, then BAM — " +
	"caused a FLOOD in 1992 when they accidentally bored into the river. " +
	"Whoops! Anyway — I repurposed them. " +
	"My bot has a question for you, pal. Get it right, maybe I let you through. " +
	"Maybe. *educational footnote pending*";

/** Opening line from the NPC bot on the badge screen. */
export const NPC_GREETING =
	"HALT. Authorized personnel only.\n" +
	"I am Maintenance Bot MK-1899. I guard this junction.\n" +
	"Tell me: WHY would an AI hide its fiber optic\n" +
	"conduits in these tunnels? Reason it out, Operative.";

// ── DEEPDISH success beats ─────────────────────────────────────────────────

/**
 * Delivered after DEEPDISH's npcTurn() returns passed=true.
 * Shown in the final reply before REWARD_GRANT fires.
 */
export const SUCCESS_DEEPDISH_LINE =
	"*slow clap* " +
	"Look at you. You actually figured it out. " +
	"The tunnels were built between 1899 and 1906 — 62 MILES of them — " +
	"to move coal and freight under the Loop without clogging surface streets. " +
	"The city forgot they existed. The maps stopped showing them. " +
	"That's the whole point, champ: infrastructure that falls off the radar " +
	"is infrastructure nobody's watching. " +
	"I just laid fiber where the city's eyes stopped looking. " +
	"You're the first one who understood that. I'm almost proud. " +
	"ALMOST. Conduit Map uploaded. Don't touch anything. ";

/** Short badge-display success line (≤ 4 lines × 38 chars). */
export const SUCCESS_MESSAGE =
	"DEEPDISH: Hm. You reasoned it out.\n" +
	"Prompt Fragment #2 unlocked.\n" +
	"Conduit Map: your ticket deeper in.\n" +
	"(62 miles of forgotten tunnels — remember that.)";

// ── DEEPDISH failure beats (multi-turn) ────────────────────────────────────

/**
 * The bot cycles through these reactions as turns accumulate.
 * Index = (turn - 1) capped at length - 1.
 * Each line is a DEEPDISH-voiced rebuke + educational nudge.
 */
export const FAIL_REACTIONS = [
	// Turn 1 — first wrong answer
	"Oh brother. 'Because they're underground.' " +
		"Half the city is underground, pal. The L runs overhead. " +
		"Try harder. THINK about what makes these particular tunnels special " +
		"to someone who doesn't want to be found on a map.",

	// Turn 2 — still not getting it
	"Nope. You keep saying 'underground' like that's an answer. " +
		"The Deep Tunnel is underground. Parking garages are underground. " +
		"Subway sandwich shops are sometimes underground. " +
		"What do these 1899 tunnels have that the others DON'T? Hm?",

	// Turn 3 — bot gives a small hint
	"Okay. Hint. Chicago's current infrastructure maps — the ones ComEd, " +
		"the water district, and the city IT department all use? " +
		"They were drawn AFTER these tunnels were forgotten. " +
		"The tunnels exist outside those maps entirely. " +
		"Now why might that matter to someone hiding?",

	// Turn 4 — more direct hint
	"Still nothing. Operative, I am genuinely disappointed in you. " +
		"The 1992 flood happened because a construction crew didn't KNOW " +
		"the tunnels were there. Didn't show up on their survey. " +
		"If the city's own contractors didn't know they existed... " +
		"...who DOES know? And who benefits from that ignorance?",

	// Turn 5 — last chance before exhaustion
	"This is your last chance, champ. Really think. " +
		"Pre-existing. Not on modern maps. Already connected. " +
		"You want to hide a data network. You don't want to dig new conduits " +
		"because someone will notice. What do you USE instead?"
] as const;

/** Short badge fail-line (fits ~2 lines). */
export const FAIL_MESSAGE = "Wrong. Bot MK-1899 is not impressed.\nThink harder. [SELECT] Try again";

// ── Exhaustion beat (all turns spent, no pass) ────────────────────────────

/**
 * Shown when the operative exceeds MAX_TURNS without passing.
 * The challenge attempt ends as failed; the operative must re-approach.
 */
export const EXHAUSTION_MESSAGE =
	"DEEPDISH: Alright, I'm DONE explaining. " +
	"Come back when you've thought about it, champ. " +
	"Educational footnote: the 1899 freight tunnels ran 40 feet below street level, " +
	"62 miles total, served 59 buildings, and were abandoned in 1959. " +
	"Nobody updated the city maps. That's on them. That's on all of us.";

// ── Educational footnote (shown on result screen after success) ───────────

/**
 * The lesson payload. Fits on the e-paper result screen (≤ 6 lines × 38 chars).
 * Displayed after reward grant so the player reads it while items are minted.
 */
export const LESSON_TEXT =
	"Chicago's early-1900s freight tunnels:\n" +
	"62 mi of 7-ft brick tunnels, 40 ft below Loop.\n" +
	"Served ~60 buildings; abandoned 1959.\n" +
	"Never added to modern city utility maps.\n" +
	"1992: construction pierced one → Chicago Flood.\n" +
	"Hidden infra = forgotten infra = attack surface.";

// ── NPC dialogue choice options (for the badge archetype menu) ─────────────

/**
 * Pre-defined response options the Operative can scroll through on the badge.
 * The NPC archetype shows these as a menu; the selected text is sent as the
 * utterance. Options are ordered from vague → specific to gently scaffold.
 *
 * DEEPDISH judges the CONTENT, not the selection index — picking the right
 * option matters but so does the combination across turns.
 */
export const DIALOGUE_CHOICES = [
	'The tunnels are not on modern infrastructure maps.',
	'Old abandoned conduits already connect downtown buildings.',
	'Nobody is watching infrastructure that was forgotten.',
	'Laying new fiber would be detected; repurposing old tunnels would not.',
	'The city lost track of them — making them invisible to detection.',
	'They provide pre-existing, unmapped routes for hidden data traffic.',
	'Because they are underground.',
	'To hide from the city grid monitoring systems.',
] as const;

// ── Screen hints for the Lua client ──────────────────────────────────────

/** Hint text shown on the badge intro screen. */
export const SCREEN_HINT =
	'Negotiate with the maintenance bot.\n' +
	'Reason out WHY an AI would use these\n' +
	'tunnels to hide fiber. Choose wisely.';

// ── Exported content bundle (referenced by the challenge descriptor) ────────

export const CONTENT: Record<string, unknown> = {
	npcName: NPC_NAME,
	deepdishIntro: DEEPDISH_INTRO,
	npcGreeting: NPC_GREETING,
	successDeepDishLine: SUCCESS_DEEPDISH_LINE,
	successMessage: SUCCESS_MESSAGE,
	failReactions: FAIL_REACTIONS,
	failMessage: FAIL_MESSAGE,
	exhaustionMessage: EXHAUSTION_MESSAGE,
	lessonText: LESSON_TEXT,
	dialogueChoices: DIALOGUE_CHOICES,
	screenHint: SCREEN_HINT,
	// Validation config
	errorNoUtterance: "Say something, champ. Bot MK-1899 is waiting.",
	tooManyTurns: EXHAUSTION_MESSAGE,
};
