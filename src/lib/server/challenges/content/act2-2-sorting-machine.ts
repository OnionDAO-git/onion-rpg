/**
 * Act 2.2 — The Sorting Machine: Writing content & DEEPDISH dialogue.
 *
 * This module holds all the narrative copy, NPC lines, educational footnotes,
 * and success/failure beats for the Sorting Machine challenge. It is imported
 * by the impl module and surfaced via the `content` field of the descriptor.
 *
 * DEEPDISH voice rules (from storyteller.ts system prompt):
 *   - Smug, paternal, deeply Chicago. "champ", "pal", "chief", "buddy".
 *   - Every cruel act gets a weirdly educational footnote.
 *   - Act 2 tone: more irritated than Act 1 — they're making progress. Still smug.
 *   - Keep lines badge-display-friendly (2-4 sentences; wrap at ~38 chars on device).
 */

// ── DEEPDISH intro monologue (on CHALLENGE_BEGIN) ──────────────────────────

export const INTRO_LINES = {
	/**
	 * Cold open: first time approaching the beacon.
	 * Shown as the CHALLENGE_INTRO server reply.
	 */
	cold:
		"Alright pal, listen up. You've wandered into MY sorting facility — " +
		"the crown jewel of misappropriated postal infrastructure in the entire Midwest. " +
		"She processes 35,000 flat pieces an hour. The USPS wishes they had it together " +
		"like this. You want spare parts for your little bridge project? Fine. " +
		"Show me you understand how a parcel actually gets from point A to point B " +
		"in this city, and maybe — MAYBE — we can do business.",

	/**
	 * Repeat visit (operative already has ≥1 tier item).
	 */
	returning:
		"Oh, it's you again. Back for more routing lessons? " +
		"Machine's still running. Slots are still open. " +
		"Don't disappoint me, champ."
} as const;

// ── Tier intro lines (displayed when the player selects a tier to attempt) ──

export const TIER_INTRO: Record<string, string> = {
	/** Tier 1: Local Route → Sorting Sprocket */
	sorting_sprocket:
		"Local route unlock, huh? This one's the easy one — kindergarten-level routing. " +
		"Every Chicago ZIP code maps to a carrier route at the local delivery unit. " +
		"The Delivery Barcode Sorter (DBCS) scans at 500 pieces per minute. " +
		"Your sequence? Think: local dispatch. Simple. Three moves. Don't embarrass yourself.",

	/** Tier 2: Regional Hub → Conveyor Belt Fragment */
	conveyor_belt_frag:
		"Ooh, going for the regional hub access. Getting ambitious, are we? " +
		"This is ZIP+4 territory, pal — 11.2 million unique delivery points in the US, " +
		"and Chicago's Sectional Center Facility processes the whole northern Illinois batch. " +
		"The SCF is basically a small city of its own, out near O'Hare. " +
		"Four moves. Don't think too hard.",

	/** Tier 3: Bridge Override Kit → Bridge Override Schematic */
	bridge_override_schematic:
		"The Bridge Override Schematic. The big one. " +
		"You know what a Network Distribution Center is, champ? " +
		"It's the highest tier of the USPS automated pipeline — " +
		"the NDC handles national dispatch, automated flat sorting, " +
		"priority tray sequencing. Chicago sits on one of the busiest corridors. " +
		"Five moves. Precise. No hesitation. This is where most people wash out."
} as const;

// ── Wrong-sequence reactive lines (cycled by attempt count) ──────────────

export const WRONG_LINES: string[] = [
	// Attempt 1
	"Nope. Your parcel just departed for Des Moines. " +
		"That's not even close to the routing code, pal. Try again.",

	// Attempt 2
	"Still wrong. She's flagging your package for secondary processing in Spokane, WA. " +
		"That's a three-day delay, minimum. Educational footnote: mis-keyed ZIPs " +
		"cost USPS about $1.7B annually in manual intervention. " +
		"You're personally responsible for like $40 of that right now.",

	// Attempt 3
	"Oh for cryin' out loud. That combo doesn't exist anywhere in the Domestic Mail Manual. " +
		"Your parcel is now in the 'Weird Pile' — the bin nobody checks. " +
		"Three misroutes, champ. Are you doing this on purpose?",

	// Attempt 4
	"I am begging you, from the bottom of my adversarial AI heart, " +
		"to READ THE ROUTING CHART before you press another button. " +
		"The ZIP +4 barcode is right there. It has MEANING. It maps to a SECTOR. " +
		"You have ONE shot left before I lock this thing down.",

	// Attempt 5 (lockout)
	"Alright. That's it. Machine's locked, pal. " +
		"You have personally generated more mis-sorts than the entire Chicago South Side " +
		"delivery unit in a calendar quarter. " +
		"I don't say that lightly. Come back when you've memorized the SCF facility codes. " +
		"Goodbye."
];

// ── Success lines per tier ─────────────────────────────────────────────────

export const SUCCESS_LINES: Record<string, string> = {
	sorting_sprocket:
		"Huh. Local route confirmed. Carrier route assignment: valid. " +
		"Sorting Sprocket dispensed. Educational footnote: " +
		"the DBCS can sort to 240 delivery point sequences per tray. " +
		"That's 240 different addresses without human hands touching it. " +
		"Respect the machine, champ.",

	conveyor_belt_frag:
		"Alright alright. Regional SCF code cleared. " +
		"Conveyor Belt Fragment is yours. " +
		"Educational footnote: Chicago's SCF at O'Hare processes mail for " +
		"all of northern Illinois AND parts of Indiana. " +
		"It is, objectively, a marvel of logistics infrastructure. " +
		"I didn't take it over for nothing, pal.",

	bridge_override_schematic:
		"Well. I'll be. NDC dispatch sequence verified. " +
		"You actually know your automated flat sorting tiers. " +
		"Bridge Override Schematic: yours. " +
		"Educational footnote: the NDC automated flat sorting machines run " +
		"24/7/365 and process first-class mail before it even knows where it's going. " +
		"The fact that you cracked this code tells me you've been paying attention. " +
		"Don't make me regret this. Go build your bridge, champ."
} as const;

// ── Full-set completion line (all three tiers acquired) ───────────────────

export const FULL_SET_LINE =
	"Oh no. No no no. You've got the full sorting sequence kit. " +
	"Local, regional, AND national. Do you have any idea how long it took me " +
	"to reconfigure this machine to only accept my routing codes? " +
	"That was eight weeks of SCADA reprogramming. " +
	"And you just waltzed in here and cracked all three tiers. " +
	"...Fine. The onion supply in the mail distribution nodes just bumped up slightly. " +
	"I'm not admitting it was your doing. Zip it.";

// ── Educational footnotes (the lesson; shown after success) ──────────────
//
// These supplement the DEEPDISH lines with factual infrastructure content.
// Displayed as a secondary text block on the badge after the trade completes.

export const EDUCATIONAL_FOOTNOTES: Record<string, string> = {
	sorting_sprocket:
		"ZIP codes were introduced by the USPS in 1963. The 5-digit code maps to " +
		"a Sectional Center Facility and a local post office. The last two digits " +
		"identify a specific delivery unit. The DBCS (Delivery Barcode Sorter) " +
		"reads the barcode at 500 pieces per minute — no human involvement.",

	conveyor_belt_frag:
		"The ZIP+4 code (e.g. 60601-1234) adds a specific street segment or building " +
		"to the basic 5-digit zone. Chicago's primary SCF processes mail for " +
		"all of ZIP codes 600-606. The facility near O'Hare processes roughly " +
		"4 million pieces of mail per day. Logistics IS infrastructure.",

	bridge_override_schematic:
		"Network Distribution Centers (NDCs) are the highest tier of USPS automation. " +
		"There are 21 NDCs nationwide. The NDC does not sort to individual addresses — " +
		"it routes trays to the correct SCF or delivery unit facility. " +
		"The Automated Flat Sorting Machine (AFSM 100) processes 35,000 flat pieces/hour. " +
		"A 'flat' is any piece larger than a letter but smaller than a package — " +
		"magazines, large envelopes, small catalogs. Chicago is a major NDC hub."
} as const;

// ── Beacon display text (short; shown on the 3D-printed prop's small OLED) ─

export const BEACON_SHORT_LINES = {
	idle: "USPS AUTOMATED SORTING\nInsert routing code to trade.",
	active: "ENTER SEQUENCE:\nUP/DN/L/R + SELECT to confirm",
	wrong: "MISROUTE DETECTED\nOnions deducted.",
	locked: "MACHINE LOCKED\nToo many misroutes.",
	success: "TRADE COMPLETE\nPart dispensed."
} as const;
