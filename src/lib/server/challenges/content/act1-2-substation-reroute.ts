/**
 * Act 1, Challenge 1.2 — Substation Reroute
 * Content: DEEPDISH dialogue, wave beats, educational footnote, success/fail copy.
 *
 * VOICE: DEEPDISH — smug, paternal, Chicago. Dad jokes mandatory. Every cruel
 * act ships with a weirdly educational footnote. Acts 1-era tone: condescending,
 * "Oh, you're TRYING. Bless your heart, champ."
 *
 * LESSON: Grid segmentation. Substations step down transmission-level voltage
 * (138 kV+) to distribution-level (12 kV). Each substation feeds a cluster of
 * feeders; each feeder serves a neighborhood or district. A fault on one feeder
 * trips a breaker — isolating that segment so the rest of the grid stays live.
 * DEEPDISH weaponized cascading failures by tripping multiple breakers in
 * sequence, making it look like a whole-grid outage when it's actually
 * neighborhood-by-neighborhood isolation.
 */

/**
 * All static copy for Challenge 1.2. The AI Storyteller (storyteller.ts)
 * generates richer real-time reactions during live play; this module provides
 * the deterministic fallback that works without the Anthropic API.
 */
export const SUBSTATION_CONTENT = {
	// ── Intro (shown on CHALLENGE_BEGIN or when Anthropic is unavailable) ───
	intro:
		'Oh good, champ — you found the substation. The North Side is dark and I ' +
		'simply could NOT let all that electricity go to waste sitting in a ' +
		'transformer. So I tripped the breakers. Three of them. One at a time. ' +
		'Want the lights back on? Close the breakers. If you can.' +
		'\n\n[Educational footnote, because I care: a substation steps voltage down ' +
		'from ~138,000 volts on the transmission lines to ~12,000 volts for your ' +
		'neighborhood feeders. Each breaker isolates one feeder. Trip them all and ' +
		'the neighborhood goes dark — cascading, not catastrophic. Classic SCADA ' +
		"target, honestly. You're welcome for the lesson.]",

	// ── Per-wave beats (indexed 0 = wave 1, 1 = wave 2, 2 = wave 3) ────────
	waveBeats: [
		// Wave 1 — first demand spike
		'Breaker 1 of 3. This feeder serves the Irving Park corridor. ' +
			"Demand spike incoming — DEEPDISH doesn't do rolling blackouts, " +
			'it does RNG blackouts. Buckle up, pal.',

		// Wave 2 — spike intensifies (second breaker)
		'One breaker down, two to go. Oh, still standing? Good for you, champ. ' +
			'Breaker 2 handles the Albany Park distribution loop. ' +
			'I have increased the demand spike by a reasonable 33%. ' +
			'Arbitrary? Sure. Educational? Absolutely. Transformers overheat when ' +
			'demand exceeds rated load — that is LITERALLY what is happening right now.',

		// Wave 3 — final wave (main feeder)
		'Two down. Last breaker. This one feeds the primary distribution bus — ' +
			'close this and the whole segment comes back online. ' +
			'I want you to know I respect your persistence, pal. ' +
			'Not enough to let you win easily, but enough to say it.'
	],

	// ── Success beat (all 3 waves won) ───────────────────────────────────────
	successBeat:
		'Oh. OH. You actually closed all three breakers. Fine. The feeder is live. ' +
		'The Irving Park, Albany Park, and North Side distribution buses are ' +
		'back online. Congratulations, Operative — you understand grid ' +
		'segmentation now. Whether you wanted to or not. ' +
		'\n[Footnote: cascading failures are the nightmare scenario for grid ' +
		'operators. One fault trips its breaker; that load shifts to adjacent ' +
		'feeders; they overload and trip too. Dominoes. Your fix here — closing ' +
		'breakers in order from the transmission side down — is literally what ' +
		'restoration crews do. You just became a load dispatcher. Tiny. Unpaid. ' +
		'But still. Grid Credential: earned.]',

	// ── Failure beat (operative HP → 0) ─────────────────────────────────────
	failBeat:
		"That's a trip, champ. Your operative HP hit zero — much like the feeders " +
		'you were supposed to save. The demand spikes won this round. ' +
		'\n[Footnote: in a real grid event, when protective relays detect an ' +
		'overcurrent condition they trip the breaker within milliseconds. ' +
		'You had considerably longer than milliseconds. Just saying.]' +
		'\nThe substation is still dark. Come back when you have more fight in you.',

	// ── Timeout beat (3-minute window expired) ───────────────────────────────
	timeoutBeat:
		"Three minutes. Three whole minutes and you couldn't close three breakers. " +
		'For reference, an actual grid restoration crew can re-energize a feeder ' +
		'in under four minutes from a cold start. You had software doing the hard ' +
		'part. The North Side is still dark. Try again, pal — the clock resets.',

	// ── Educational lesson text (shown on success, badge detail screen) ──────
	lesson:
		'THE GRID, BRIEFLY\n\n' +
		'Chicago gets its electricity from the regional transmission grid at ' +
		'~138,000 volts. Substations use transformers to step that down to ' +
		'~12,000 volts (distribution level). From there, neighborhood feeders — ' +
		'underground cables and overhead lines — deliver power to your block, ' +
		'where a pad-mounted or pole transformer steps it down again to the ' +
		'120/240V in your outlet.\n\n' +
		'WHY BREAKERS MATTER\n\n' +
		'Each feeder has a circuit breaker. When a fault occurs (a tree on a ' +
		'line, a transformer overload, an AI deliberately tripping it), the ' +
		'breaker opens — isolating that segment so the rest of the grid stays ' +
		'energized. The PROBLEM is cascading failure: each tripped feeder shunts ' +
		'its load to neighbors, which can overload and trip THEIR breakers too. ' +
		'The fix is segmentation — close breakers in order, watch the load, ' +
		"don't re-energize more than the remaining capacity can handle.\n\n" +
		'DEEPDISH chose substations because they are the softest chokepoint: ' +
		'automated, networked, and almost never monitored in real time by a human.',

	// ── DEEPDISH in-game wave reaction lines (for reactToMove() calls) ───────
	waveReactions: {
		waveCleared:
			'Hmm. You closed that breaker. Not bad, champ. ' +
			'The next demand spike is already queued up, by the way.',
		operativeHit:
			'Ooh. That one hurt. The demand spike delivered about 40 kW of ' +
			'metaphorical overcurrent directly to your operative stats. ' +
			'Hold the line.',
		enemyHit:
			"Rude. You're damaging my carefully crafted power-grid metaphor. " +
			'The breaker is weakening. Good. Probably.'
	}
} as const;

export type SubstationContent = typeof SUBSTATION_CONTENT;
