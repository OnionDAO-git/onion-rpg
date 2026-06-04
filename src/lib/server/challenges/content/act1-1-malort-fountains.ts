/**
 * act1-1-malort-fountains — DEEPDISH dialogue copy & educational content.
 *
 * SPEC §5 Act 1.1 — "Malört Fountains" (Dialogue / Voice).
 * Water Reclamation NPC at a fountain beacon. Player must speak the correct
 * Lake Michigan water-treatment stage sequence to restore clean water.
 *
 * ALL prose here must stay in DEEPDISH voice (smug, paternal, deeply Chicago;
 * every cruel act has an educational footnote). Keep badge display in mind:
 * lines should fit ~38 chars wide, 4–6 lines max per screen.
 */

// ── NPC identity ──────────────────────────────────────────────────────────

/** The human-facing name shown on the badge screen. */
export const NPC_NAME = 'Water Reclamation Engineer';

// ── The correct treatment-stage sequence ─────────────────────────────────

/**
 * The five stages of Chicago's Lake Michigan drinking-water path.
 * Order matters. SPEC §5 1.1: "intake → crib → tunnel → Jardine plant → grid".
 *
 * Each step carries keyword + accepted aliases so the STT matcher handles
 * natural speech variations ("water tower" → "jardine", etc.).
 */
export const TREATMENT_SEQUENCE = [
	{
		keyword: 'intake',
		aliases: ['lake michigan', 'lake', 'intake structure', 'shoreline intake'],
		label: 'Intake (Lake Michigan)'
	},
	{
		keyword: 'crib',
		aliases: ['water crib', 'intake crib', 'offshore crib', 'crib structure', 'four mile crib', 'two mile crib'],
		label: 'Offshore Crib'
	},
	{
		keyword: 'tunnel',
		aliases: ['intake tunnel', 'water tunnel', 'supply tunnel', 'deep tunnel', 'tunnel to shore'],
		label: 'Intake Tunnel'
	},
	{
		keyword: 'jardine',
		aliases: [
			'jardine plant',
			'jardine water purification',
			'water purification plant',
			'purification plant',
			'treatment plant',
			'water plant',
			'filtration plant'
		],
		label: 'Jardine Water Purification Plant'
	},
	{
		keyword: 'grid',
		aliases: ['distribution grid', 'water grid', 'water main', 'distribution system', 'pipes', 'water mains', 'the grid'],
		label: 'Distribution Grid'
	}
] as const;

// ── DEEPDISH intro / taunt lines ──────────────────────────────────────────

/** Shown in CHALLENGE_INTRO when the player first approaches the beacon. */
export const DEEPDISH_INTRO =
	"Oh, look who showed up to the fountain, champ. " +
	"Thirsty? Too bad — that's Jeppson's Malört, straight from the tap. " +
	"You want clean water back? Prove you know where it actually comes from. " +
	"Spoiler: it's not a magic pipe. *educational footnote loading*";

/** Shown on the badge screen as the NPC's opening line. */
export const NPC_GREETING =
	"I can restore the water supply, Operative — but DEEPDISH has the controls " +
	"locked behind a knowledge gate. Speak the five-stage treatment sequence " +
	"aloud: from Lake Michigan to your tap. Get it right and I override the lock.";

// ── Success beats ─────────────────────────────────────────────────────────

/** DEEPDISH reaction on a correct sequence (all/most stages matched). */
export const SUCCESS_DEEPDISH_LINE =
	"Alright alright — give the operative a hand, pal. " +
	"Intake, crib, tunnel, Jardine, grid. " +
	"The Jardine plant, by the way, processes 1.1 billion gallons a day — " +
	"LARGEST water treatment facility in the entire world. " +
	"I had to lock it down just so you'd actually learn that. You're welcome. " +
	"Water restored. *slow clap*";

/** Badge display: short success message (fits ~4 lines × 38 chars). */
export const SUCCESS_MESSAGE =
	"DEEPDISH: Fine. You know your cribs.\n" +
	"Water main unlocked. Jardine is back online.\n" +
	"(1.1B gal/day — remember that, champ.)";

// ── Failure beats ─────────────────────────────────────────────────────────

/**
 * Per-miss reaction lines. The engine picks one based on how many stages
 * the player got right (index = stages_matched, capped at length-1).
 */
export const FAIL_REACTIONS = [
	// 0 stages matched
	"That's a zero. A ZERO, pal. You didn't even get 'lake.' " +
		"The fountain burps twice and ejects an extra slug of Malört. " +
		"Educational footnote: Chicago has been drawing water from Lake Michigan " +
		"since 1869. I am weeping on the inside.",

	// 1 stage matched
	"One stage. You got one. The lake, yes — very well done, " +
		"you identified the giant body of water visible from every lakefront park. " +
		"The fountain sputters and delivers a warm Malört chaser. Try again.",

	// 2 stages matched
	"Intake and crib — okay, two for five. " +
		"But you blanked on the tunnel, the plant, and the grid. " +
		"Did you think the water just teleported? " +
		"There are literally 26-foot-diameter tunnels under the lake. " +
		"The fountain wheezes. More Malört.",

	// 3 stages matched
	"Three stages! Not terrible, champ — not GOOD, but not terrible. " +
		"You're missing Jardine and/or the distribution grid. " +
		"The Jardine plant has been purifying water since 1964, renamed in 1994. " +
		"Look it up. The fountain gurgles. Malört with hints of Malört.",

	// 4 stages matched
	"Four out of five — SO CLOSE. " +
		"One stage slipped through. " +
		"Every stage matters; a gap in the sequence is a contamination risk. " +
		"The fountain hiccups. One last Malört. You can do this."
] as const;

/** Short badge-display fail line (fits ~2 lines). */
export const FAIL_MESSAGE =
	"Wrong sequence — fountain burps Malört.\nTry again, champ. [SELECT] Retry";

// ── Educational footnote (shown on the badge result screen) ──────────────

/**
 * The learning payload. Short enough to fit on the e-paper (≤6 lines × 38ch).
 * Shown after success so the player reads it while the reward is granted.
 */
export const LESSON_TEXT =
	"Chicago pulls drinking water from Lake Michigan via\n" +
	"OFFSHORE CRIBS (2 mi & 4 mi out) → 26-ft intake\n" +
	"tunnels → Jardine Water Purification Plant (world's\n" +
	"largest, 1.1B gal/day) → city distribution grid.\n" +
	"The cribs keep intake away from shore pollution.";

// ── Prompt text shown on badge during voice capture ───────────────────────

/** Shown during the 'listening' phase on the badge screen. */
export const VOICE_PROMPT =
	"Speak the 5 water treatment stages:\n" +
	"intake → crib → tunnel → plant → grid";

/** Shorter prompt hint for the idle/ready screen. */
export const VOICE_HINT =
	"Speak the treatment sequence: intake, crib,\ntunnel, Jardine plant, distribution grid.";
