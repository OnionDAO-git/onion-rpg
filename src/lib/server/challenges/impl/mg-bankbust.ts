/**
 * mg-bankbust — "Bank or Bust" (Minigame / push-your-luck).
 *
 * SKELETON CONTENT (Part A, S2): the thinnest piece of *our* content that flows
 * the existing badge → beacon → server → engine pipeline. It proves a new
 * self-registering challenge round-trips end-to-end in the sim with an
 * inventory-only reward (no onions, no gauge, no new schema).
 *
 * Mechanic (button-based, so it rides the existing `merchant` MsgType seam):
 *   The badge sends a sequence of button presses — 'push' to draw the next pip,
 *   'bank' to lock in. Each push reveals the next server-authoritative pip from
 *   PIPS (the house's "rolls"). Bank with a pot in [TARGET, BUST_AT] to win;
 *   push past BUST_AT (or run out of draws) and you bust.
 *
 * The pip table is fixed and deterministic so a known line always wins, keeping
 * the sim green: push ×3 → 3+4+2 = 9 (in [8,12]) → bank → pass. A 4th push
 * (→ 14) busts. Part B can swap this for per-attempt server RNG (combat-style
 * session state) once real randomness is wanted.
 *
 * Type note: this is a standalone minigame, not part of the Chicago act arc.
 * `act: 0` only satisfies the Act union; it carries no gating and no requires.
 */

import { registerChallenge } from '../registry';
import type {
	ChallengeDescriptor,
	ChallengeResult,
	ChallengeContext
} from '$lib/shared/types';

// ── Tunables (server-authoritative) ───────────────────────────────────────────

/** Hidden pip drawn on each successive 'push' (the house's deterministic rolls). */
const PIPS = [3, 4, 2, 5, 9, 8];
/** Must bank with a pot at least this high to win. */
const TARGET = 8;
/** Pot strictly above this busts. */
const BUST_AT = 12;

// ── Validate ──────────────────────────────────────────────────────────────────

interface BankBustInput {
	/** Ordered button presses, e.g. ['push','push','push','bank']. */
	seq?: unknown;
}

/**
 * Walk the submitted button sequence, accumulating pips per 'push' until the
 * player 'bank's or busts. Pure: reads only the input + module tunables.
 */
function validate(input: unknown, _ctx: ChallengeContext): ChallengeResult {
	const seq = (input as BankBustInput)?.seq;
	if (!Array.isArray(seq)) {
		return { passed: false, message: 'No button sequence received. Press push/bank, champ.' };
	}

	let pot = 0;
	let pushes = 0;
	let banked = false;
	let busted = false;

	for (const raw of seq) {
		const action = String(raw).toLowerCase();
		if (action === 'bank') {
			banked = true;
			break;
		}
		if (action !== 'push') continue; // ignore stray tokens
		if (pushes >= PIPS.length) {
			busted = true; // out of draws — the table's tapped out, you lose
			break;
		}
		pot += PIPS[pushes];
		pushes++;
		if (pot > BUST_AT) {
			busted = true;
			break;
		}
	}

	if (busted) {
		return { passed: false, message: `Busted at ${pot}. The house thanks you, pal.` };
	}
	if (!banked) {
		return { passed: false, message: 'You never banked. A pot you don\'t lock in is a pot you don\'t keep.' };
	}
	if (pot < TARGET) {
		return { passed: false, message: `Banked too early at ${pot}. Needed ${TARGET}. Greed cuts both ways.` };
	}

	return {
		passed: true,
		message: `Banked ${pot} clean. Smart money, champ — take the chip.`
	};
}

// ── Descriptor ────────────────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: 'mg-bankbust',
	act: 0,
	type: 'merchant',
	name: 'Bank or Bust',
	requires: [],
	rewards: [
		{ kind: 'inventory', catalogId: 'bankbust_chip' },
		{ kind: 'xp', amount: 20 }
	],
	beaconConfig: { beaconIdHint: 'b-bankbust', landmark: 'Back-alley pip table' },
	content: {
		intro: "DEEPDISH's rigged little dice table. Push to draw a pip, bank to walk. Don't get greedy.",
		buttons: ['push', 'bank'],
		// Surfaced to the badge UI; the server stays authoritative on outcome.
		pips: PIPS,
		target: TARGET,
		bustAt: BUST_AT
	},
	validate
};

registerChallenge(challenge);
export default challenge;
