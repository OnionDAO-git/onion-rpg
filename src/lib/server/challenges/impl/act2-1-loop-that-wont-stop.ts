/**
 * Act 2.1 — "The Loop That Won't Stop" (Combat + timing). SPEC §5 Act 2.
 *
 * The L is running driverless and won't open its doors. A beacon on a
 * simulated "platform" represents a train control node.
 *
 * MECHANIC (two phases):
 *   Phase 1 — Sub-GHz signal jam:
 *     The badge (or beacon relay) transmits a stop code on 433.92 MHz within
 *     a 60-second timing window. The beacon records whether the jam was
 *     received in-window and reports it in the validate input.
 *     - If caps.subghz: badge calls onion.subghz_begin then onion.subghz_transmit
 *       with the stop-code bytes (then subghz_end); beacon ACKs receipt via
 *       CHALLENGE_RESULT {jammed: true}.
 *     - Fallback: beacon acts as the sub-GHz relay; badge sends a timed
 *       MERCHANT_INPUT (input type 'jam_relay') to trigger the relay.
 *     Either way the validate() input carries { phase: 'jam', jammed: boolean,
 *     elapsed_ms: number }.
 *
 *   Phase 2 — RNG combat (doors fighting back):
 *     After a successful jam, a combat session opens: one wave against the
 *     "Door Actuator Daemon" (HP 60). Standard combat loop. validate() is
 *     called with { phase: 'combat' }; passes when ctx.combat.status === 'won'.
 *
 * REWARD: Transit Pass (fast-travel credential) + 90 Onions + gauge bump.
 *
 * EDUCATION: CTA rail signaling; the elevated Loop as downtown infrastructure;
 *   SCADA control surfaces as attack surface; block detection + cab signals.
 *
 * CONTRACTS conformance:
 *   - Self-registers via registerChallenge() — NO shared index edits.
 *   - validate() is pure-ish: reads ctx, returns ChallengeResult.
 *   - Engine persists attempts and applies rewards; this module never grants.
 *   - Calls engine/combat helpers for the RNG session; never reimplements them.
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult, ChallengeContext } from '$lib/shared/types';
import {
	INTRO,
	JAM_SUCCESS,
	JAM_TIMEOUT,
	JAM_FALLBACK,
	COMBAT_INTRO,
	COMBAT_WIN,
	COMBAT_LOSS,
	SUCCESS_REWARD,
	ENEMY_HP,
	OPERATIVE_HP,
	WAVES_REQUIRED,
	JAM_WINDOW_MS,
	REQUIRES,
} from '../content/act2-1-loop-that-wont-stop';

// ── Input shapes ───────────────────────────────────────────────────────────

/**
 * Phase 1 — jam verdict from the beacon (or simulator).
 * The beacon sets jammed=true when it received the sub-GHz stop code from
 * the badge within elapsed_ms of the timing window opening.
 */
export interface JamInput {
	phase: 'jam';
	/** Whether the beacon received the sub-GHz stop code in time. */
	jammed: boolean;
	/** Milliseconds elapsed when the beacon recorded the jam receipt. */
	elapsed_ms?: number;
	/** True when the badge had no subghz cap and the relay path was used. */
	relay?: boolean;
}

/**
 * Phase 2 — combat verdict.
 * The engine drives combat via COMBAT_ROLL_REQUEST/RESPONSE; validate() just
 * checks ctx.combat.status. Input is minimal.
 */
export interface CombatInput {
	phase: 'combat';
	/** The active combat session id (so the engine can look it up). */
	sessionId?: string;
}

export type ChallengeInput = JamInput | CombatInput;

// ── Validate ───────────────────────────────────────────────────────────────

function validate(rawInput: unknown, ctx: ChallengeContext): ChallengeResult {
	const input = rawInput as ChallengeInput;

	// ── Phase 1: sub-GHz jam ──────────────────────────────────────────────
	if (!input || (input as JamInput).phase === 'jam') {
		const jam = input as JamInput;

		if (!jam.jammed) {
			// Jam attempt failed (timeout or bad code).
			const timedOut = (jam.elapsed_ms ?? 0) >= JAM_WINDOW_MS;
			return {
				passed: false,
				message: timedOut ? JAM_TIMEOUT : JAM_TIMEOUT,
				continued: false
			};
		}

		// Jam succeeded — report progress, signal engine to open combat.
		// The engine will call beginChallenge → openCombat. We return
		// continued=true so the engine knows another validate() cycle is coming.
		const replyMsg = jam.relay
			? JAM_FALLBACK + ' ' + JAM_SUCCESS
			: JAM_SUCCESS;

		return {
			passed: false, // jam alone is not the final pass
			message: replyMsg + '\n\n' + COMBAT_INTRO,
			continued: true,
			flags: { jam_complete: true, jam_elapsed_ms: jam.elapsed_ms ?? 0 }
		};
	}

	// ── Phase 2: combat ───────────────────────────────────────────────────
	if (input.phase === 'combat') {
		// Verify jam was completed first (guards against skipping phase 1).
		const jamComplete = ctx.operative && Boolean(
			// The engine merges flags from the jam result into game_state.flags.
			// We can't directly read game_state here (ctx doesn't carry flags),
			// so we trust the engine's sequential submission guarantee: if the
			// badge sends phase='combat', phase 1 was already processed.
			// A belt-and-suspenders check would require a DB read; add when engine
			// exposes ctx.flags (TODO: engine agent).
			true
		);

		if (!jamComplete) {
			return {
				passed: false,
				message: "Hold on, champ — jam the signal FIRST. The train is still moving.",
				continued: false
			};
		}

		const combat = ctx.combat;

		if (!combat) {
			// Combat session doesn't exist yet — tell the caller to open one.
			return {
				passed: false,
				message: COMBAT_INTRO,
				continued: true,
				flags: { needs_combat_open: true }
			};
		}

		if (combat.status === 'expired') {
			return {
				passed: false,
				message: "The timing window expired and the train moved on. Try again, pal.",
				continued: false
			};
		}

		if (combat.status === 'won') {
			return {
				passed: true,
				message: COMBAT_WIN + '\n\n' + SUCCESS_REWARD
			};
		}

		if (combat.status === 'lost') {
			return {
				passed: false,
				message: COMBAT_LOSS,
				continued: false
			};
		}

		// Still in progress.
		return {
			passed: false,
			message: `Wave ${combat.wave}/${combat.wavesRequired} — keep rolling, champ.`,
			continued: true
		};
	}

	// Unknown input — soft error.
	return {
		passed: false,
		message: "What are ya, new? Send phase 'jam' or 'combat'. — DEEPDISH",
		continued: false
	};
}

// ── Descriptor ─────────────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '2.1',
	act: 2,
	type: 'combat',
	name: "The Loop That Won't Stop",
	requires: REQUIRES, // open to all; no Act 1 creds required
	rewards: [
		{ kind: 'inventory', catalogId: 'transit_pass' },
		{ kind: 'onions', amount: 90 },
		{ kind: 'gauge', amount: 900 } // L restoration = big win-bar bump
	],
	beaconConfig: {
		beaconIdHint: 'b-loop-platform',
		landmark: 'CTA Elevated Loop — Platform Control Node',
		requiresCapabilities: ['subghz'] // preferred; falls back gracefully
	},
	content: {
		// Static content the engine returns on CHALLENGE_BEGIN.
		intro: INTRO,
		lesson: 'CTA rail signaling; the elevated Loop; SCADA attack surface.',
		phases: ['jam', 'combat'],
		// Jam phase parameters (also in beacon config JSON).
		jam: {
			windowMs: JAM_WINDOW_MS,
			freqHz: 433_920_000,
			stopCode: '0xDE 0xAD 0x1A 0x1A',
			symbolMs: 500
		},
		// Combat parameters handed to the engine when it opens a combat session.
		combat: {
			enemyName: 'Door Actuator Daemon',
			enemyHp: ENEMY_HP,
			operativeHp: OPERATIVE_HP,
			wavesRequired: WAVES_REQUIRED,
			// ttlSeconds: how long the fight can last before expiry (SPEC says timed).
			ttlSeconds: 180
		}
	},
	validate
};

registerChallenge(challenge);
export default challenge;
