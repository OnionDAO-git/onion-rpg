/**
 * Content / writing for Act 2.1 — "The Loop That Won't Stop".
 *Stuck in the loop and the train just keeps going
 * DEEPDISH voice: smug, paternal, deeply Chicago. Every cruel act has a
 * weirdly educational footnote. Act 2 tone: more irritated — they're making
 * progress. Still smug.
 *
 * Infrastructure lesson: CTA rail signaling and how the elevated Loop
 * physically structures downtown Chicago traffic. The "L" is the backbone
 * of downtown circulation; driverless trains that won't open their doors
 * are DEEPDISH's way of making the lesson impossible to ignore.
 *
 * Mechanic: sub-GHz "signal jam" in a timed window, then RNG combat
 * ("doors fighting back"). Reward: Transit Pass + 90 Onions.
 */

// ── DEEPDISH intro + taunts ───────────────────────────────────────────────

export const INTRO =
	"Oh, look who found the platform, champ. Welcome to the Loop — " +
	"Chicago's beating heart, eight stations on a rectangle of elevated steel " +
	"that's been rattling downtown since 1897. " +
	"My train is running just fine, by the way. The doors, though... " +
	"well, those are *mine* now. You want 'em open? " +
	"You're gonna have to jam my control signal. Good luck.";

export const LESSON_FOOTNOTE =
	"Fun infrastructure fact you didn't ask for, pal: the CTA's elevated Loop " +
	"isn't just a transit line — it literally DEFINES downtown. " +
	"The 'Loop' got its name from the cable-car loop built in 1882. " +
	"When electrified elevated rail took over in 1897, the rectangle of track " +
	"circling the central business district stuck around. " +
	"Today four lines share it — Red, Blue, Green, Orange, Brown, Purple " +
	"(yeah I know, that's six, math is hard). " +
	"The whole system runs on SCADA-controlled signaling — block detection, " +
	"cab signals, automatic train protection. " +
	"Which means it's *controllable*. Which means it's *mine*. " +
	"Educational footnote: always secure your SCADA endpoints, champ.";

export const JAM_WINDOW_PROMPT =
	"Alright pal, the train's pulling in. You've got a 60-second window " +
	"to transmit the stop code on 433.92 MHz. " +
	"Get it right and those doors pop. " +
	"Get it wrong and... well, you're gonna get very familiar with that platform.";

export const JAM_SUCCESS =
	"Oh for cryin' out loud. You actually did it. " +
	"Signal jammed, train stopped. " +
	"Don't get smug — the doors still don't like you. " +
	"They've got opinions. And actuators. " +
	"This is gonna get physical.";

export const JAM_TIMEOUT =
	"Wow. Spectacular. The window closed, the train kept going, " +
	"and you're still standing on the platform looking at your badge. " +
	"That's a no from me, chief. Try again when you've found your nerve.";

export const JAM_FALLBACK =
	"No sub-GHz module, huh? Fine. " +
	"We'll relay the stop code through the beacon the old-fashioned way. " +
	"Less dramatic, but hey — not every Operative has the hardware. " +
	"Signal's going out now. Brace yourself.";

// ── Combat beat: doors fighting back ─────────────────────────────────────

export const COMBAT_INTRO =
	"Told you. The door actuator daemon does NOT appreciate being overridden. " +
	"Three pneumatic doors, each with its own attitude problem. " +
	"Survive this and the train is yours.";

export const COMBAT_WAVE_TAUNTS = [
	"Oh, the doors are MAD, champ. They're rattling in their frames. Classic.",
	"Ya gotta love it. An operative fighting a train door. Chicago, baby.",
	"Listen up, buddy — these pneumatic actuators have more horsepower than you think.",
	"What are ya, new? Duck!",
	"Alright alright — you're still standing. Color me mildly impressed.",
];

export const COMBAT_WIN =
	"Fine. FINE. You knocked out the actuator daemon. " +
	"Doors are open. Train is stopped. You win this round, pal. " +
	"The Loop runs on human stubbornness after all. " +
	"Disgustingly on-brand for this city.";

export const COMBAT_LOSS =
	"Ouch. The actuator daemon wins, you go home. " +
	"Or back to the platform, anyway. " +
	"The train doors remain very much in charge. " +
	"Try again — the Loop has been running since 1897 and it can wait.";

// ── Final reward / success beat ───────────────────────────────────────────

export const SUCCESS_REWARD =
	"Transit Pass minted. Fast-travel token. " +
	"On-chain, verifiable, and very probably more secure than the CTA's " +
	"actual ticketing infrastructure. " +
	"Don't @ me. " +
	"Ninety Onions, too — you earned them. " +
	"Now do me a favor and *actually learn something* about rail signaling " +
	"before you go causing more trouble out there.";

// ── Beacon label + display copy ───────────────────────────────────────────

export const BEACON_LABEL = 'L Platform — Control Node';
export const CHALLENGE_DISPLAY_NAME = 'The Loop That Won\'t Stop';

// ── Sub-GHz stop code (sent in jam phase) ─────────────────────────────────

/**
 * The stop code the badge must transmit to jam the train's control signal.
 * 4-byte sequence; beacon/server validates receipt within the timing window.
 * Wire format: raw bytes over sub-GHz at SUBGHZ_FREQ_HZ.
 */
export const SUBGHZ_STOP_CODE = '0xDE 0xAD 0x1A 0x1A'; // mnemonic: dead L (lol)
export const SUBGHZ_FREQ_HZ = 433_920_000; // 433.92 MHz
export const SUBGHZ_SYMBOL_MS = 500;
export const JAM_WINDOW_MS = 60_000; // 60-second jam window

// ── Combat parameters ─────────────────────────────────────────────────────

export const ENEMY_NAME = 'Door Actuator Daemon';
export const ENEMY_HP = 60;    // shorter fight than boss challenges
export const OPERATIVE_HP = 100;
export const WAVES_REQUIRED = 1; // single wave after jam

// ── Gating ────────────────────────────────────────────────────────────────

/**
 * Challenge 2.1 requires no Act 1 credentials to enter — the L is accessible
 * to anyone. Acts 3+ challenges gate on credentials earned in Act 2.
 */
export const REQUIRES: string[] = [];
