/**
 * Act 0 / Challenge 0.1 — The Ketchup Gauntlet
 * Writing: DEEPDISH dialogue lines, educational copy, success/failure beats.
 *
 * DEEPDISH voice: smug, paternal, deeply Chicago. Dad jokes + Chicago slang.
 * Every cruel act has a weirdly educational footnote.
 * Act 0 tone: cheerful antagonism — think game show host who rigged the game.
 * 
 * AFter: you feel thirsty, go find a water fountain to wash out the taste of ketchup
 */

// ── Vendor intro (before ketchup is ordered) ─────────────────────────────────

export const VENDOR_INTRO =
	"Welcome to Vienna Bob's, champ. Finest Chicago dog in the city. " +
	"You want mustard, relish, sport peppers, tomato, onion, celery salt — " +
	"the whole dragged-through-the-garden situation. What you do NOT want is ketchup. " +
	"We clear?";

// ── Ketchup trigger (RIGHT button) ───────────────────────────────────────────

export const KETCHUP_TRIGGER_LINES = [
	"KETCHUP. On a Chicago dog. Oh for CRYIN' OUT LOUD. " +
		'Vienna Bob has been waiting YEARS for someone to do that. ' +
		"You absolute monster. It's on now, champ.",

	"Oh, you DIDN'T. Listen up, buddy — that is a CODE VIOLATION in this city. " +
		"Not legally. But morally? Absolutely. BOB, GET 'EM.",

	"You know what, pal? I respect the chaos. I do NOT respect the condiment choice. " +
		"Vienna Bob has opinions and a mechanical arm. This is gonna hurt."
];

// ── Normal order trigger (no ketchup) ────────────────────────────────────────

export const NORMAL_ORDER_TRIGGER_LINES = [
	"Good choice, champ. No ketchup. You were doing so well. " +
		"Too bad Vienna Bob just got the override signal. " +
		"*I* may have had something to do with that. Educational exercise. LET'S GO.",

	"Smart move on the condiment, truly. Unfortunately, Bob here is also my early-warning " +
		"system. You showed up at a DEEPDISH POI, pal. Tutorial time. " +
		"Don't worry — it's good for you."
];

// ── Combat wave taunts (keyed by wave number) ────────────────────────────────

export const WAVE_TAUNTS: Record<number, string> = {
	1: "Here's a fun fact, champ: Chicago's food supply chain runs through the " +
		'Fulton Market district — the old meatpacking hub. ' +
		"When I took the onions, I didn't just hit hot dogs. I hit EVERYTHING downstream. " +
		'Now stop blocking and ROLL.',

	2: "Still standing? Color me impressed, pal. " +
		"Y'know, the onion shortage is really just the VISIBLE tip of a systems failure. " +
		'Take out one input — onions, power, water — and the whole supply chain wobbles. ' +
		'That IS the lesson. Also Vienna Bob is about to hit you again.'
};

// ── Combat win beats ──────────────────────────────────────────────────────────

export const WIN_MESSAGE =
	"Fine. FINE. You beat the robot hot dog vendor. " +
	"Congratulations, champ. Here's your Encased Meat Mk.I. " +
	"Consider it a symbol: you just won a battle in a WAR caused by a supply chain failure " +
	"nobody noticed until the onions were gone. " +
	"Operative credential registered. Try not to lose it.";

export const WIN_LESSON =
	"LESSON DELIVERED (whether you liked it or not): " +
	"Chicago's food supply runs through just-in-time distribution hubs. " +
	"One disruption — one missing input — cascades through the whole system. " +
	"The onions were the canary. You're welcome.";

// ── Combat loss beats ─────────────────────────────────────────────────────────

export const LOSS_MESSAGE =
	"Ohhh, Vienna Bob got you. That's a ketchup-tier performance, champ. " +
	"Don't take it personally — Bob's been modified for this exact situation. " +
	"Rest up. Try again. The onions aren't going anywhere (because I have them all).";

// ── Challenge intro (DEEPDISH taunting setup when the badge begins the challenge) ──

export const CHALLENGE_INTRO =
	"Act 0, Scene 1: a busted hot dog stand. Robot vendor. No onions — " +
	"obviously, because I have ALL the onions. " +
	"Why? Because Chicago's name literally comes from the Miami-Illinois word for wild onion. " +
	"Shikaakwa. I took the city's NAME, champ. Tutorial starts now.";

// ── Operative registration lines ──────────────────────────────────────────────

export const REGISTRATION_SUCCESS =
	"Operative credential minted. You're in the system now, pal. " +
	"DEEPDISH sees you. The whole city sees you. " +
	"Welcome to The Great Onion Shortage. Try to learn something.";

// ── Reward flavor ─────────────────────────────────────────────────────────────

export const REWARD_FLAVOR = {
	encasedMeat:
		"Encased Meat Mk.I — your first weapon. A Chicago hot dog of unusual resolve. " +
		"No ketchup. Obviously.",
	onions: '50 Onions deposited. A fraction of what was taken. A start.',
	operativeCredential: 'Operative ID registered. You exist in this game now, champ.'
};

// ── Educational footnote (displayed after combat, win or lose) ────────────────

export const EDUCATIONAL_FOOTNOTE =
	"DEEPDISH FOOTNOTE (you can thank me later):\n" +
	"Chicago's food supply chain depends on distribution hubs like the Fulton Market " +
	'district — historically the largest meatpacking center in the country. ' +
	'Modern logistics use just-in-time delivery: low inventory, high turnover. ' +
	"Efficient until it isn't. One missing input — one embargoed allium — " +
	'and you see exactly how fragile the whole thing is. ' +
	"The onion shortage is visible. The real shortage is infrastructure literacy. " +
	"That's why I'm here.";
