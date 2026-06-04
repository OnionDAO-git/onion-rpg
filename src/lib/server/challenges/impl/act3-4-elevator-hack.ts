/**
 * 3.4 — The Elevator Hack (Combat + puzzle). SPEC §5 Act 3.
 *
 * Operatives must hack a networked elevator to reach the City IT floor.
 * Mechanic: sub-GHz handshake with the elevator beacon to open the
 * intrusion-detection fight, then a 2-wave RNG combat against the IDS.
 *
 * Gating: requires dispatch_credential (from 3.3).
 * Rewards: city_it_keycard (gates Act 4) + prompt_fragment_4 + 150 Onions + gauge.
 *
 * Sub-GHz handshake flow (CONTRACTS §3):
 *   1. Badge transmits the elevator access code via onion.subghz_transmit (CC1101).
 *      Fallback: beacon detects no sub-GHz attempt and auto-opens (beacon-relay path).
 *   2. Server validate() checks ctx flags for { subghzHandshakeDone: true }.
 *      The engine sets this flag in game_state after the beacon signals the
 *      handshake succeeded (the beacon posts COMBAT_ROLL_REQUEST which implicitly
 *      means the handshake phase completed; or the subghz flag is set by the engine
 *      relay handler before calling validate).
 *
 * validate() input shapes:
 *   { phase: 'handshake' }       — sub-GHz handshake attempt (pre-combat).
 *   { phase: 'combat', ... }     — combat verdict from the engine after 2 waves.
 *   (anything else)              — treated as a continue-ping; returns continued=true.
 */
import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult, ChallengeContext } from '$lib/shared/types';
import { ELEVATOR_CONTENT } from '../content/act3-4-elevator-hack';

// ── Combat parameters ────────────────────────────────────────────────────────

/** Intrusion Detection System stat block. */
const IDS_HP = 60;
const IDS_WAVES = 2;

// ── Flags key the engine writes into game_state.flags ────────────────────────
const FLAG_HANDSHAKE = 'elevatorHandshakeDone';

// ── Validate ─────────────────────────────────────────────────────────────────

function validate(input: unknown, ctx: ChallengeContext): ChallengeResult {
	const inp = (typeof input === 'object' && input !== null ? input : {}) as Record<
		string,
		unknown
	>;

	const phase = (inp.phase as string) ?? 'unknown';

	// ── Phase 1: sub-GHz handshake ─────────────────────────────────────────
	if (phase === 'handshake') {
		// Badge attempted the subghz handshake. The beacon/relay has already
		// validated the RF signal; we just record the flag so combat can start.
		return {
			passed: false, // not done yet — combat still needed
			continued: true,
			message: ELEVATOR_CONTENT.handshakeAck,
			flags: { [FLAG_HANDSHAKE]: true }
		};
	}

	// ── Phase 2: combat verdict ────────────────────────────────────────────
	if (phase === 'combat') {
		// The engine calls validate() once combat resolves.
		// ctx.combat holds the resolved CombatSession.
		const combat = ctx.combat;
		if (!combat) {
			return {
				passed: false,
				continued: true,
				message: ELEVATOR_CONTENT.combatNotStarted
			};
		}

		// Handshake must have happened (either this session or a prior attempt).
		const handshakeFlag =
			(ctx.combat && Boolean(inp.handshakeDone)) ||
			Boolean((ctx as unknown as Record<string, unknown>)[FLAG_HANDSHAKE]);

		if (combat.status === 'won') {
			return {
				passed: true,
				message: ELEVATOR_CONTENT.successMessage,
				rewards: challenge.rewards,
				flags: { [FLAG_HANDSHAKE]: false } // reset for replay
			};
		}

		if (combat.status === 'lost') {
			return {
				passed: false,
				message: ELEVATOR_CONTENT.defeatMessage,
				flags: handshakeFlag ? { [FLAG_HANDSHAKE]: true } : {}
			};
		}

		if (combat.status === 'expired') {
			return {
				passed: false,
				message: ELEVATOR_CONTENT.expiredMessage
			};
		}

		// Still active — more rolls expected.
		return {
			passed: false,
			continued: true,
			message: `${ELEVATOR_CONTENT.combatInProgress} Wave ${combat.wave}/${combat.wavesRequired}.`
		};
	}

	// ── Unknown / ping ─────────────────────────────────────────────────────
	return {
		passed: false,
		continued: true,
		message: ELEVATOR_CONTENT.intro
	};
}

// ── Descriptor ────────────────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '3.4',
	act: 3,
	// Combat with a puzzle (sub-GHz handshake) preamble — type maps to 'combat'
	// per SPEC §5 ("Combat + puzzle").
	type: 'combat',
	name: 'The Elevator Hack',

	// Requires the OEMC dispatch credential from challenge 3.3.
	requires: ['dispatch_credential'],

	rewards: [
		// Gates Act 4.
		{ kind: 'inventory', catalogId: 'city_it_keycard' },
		// Glen's last prompt fragment — assembled in Act 4.2.
		{ kind: 'inventory', catalogId: 'prompt_fragment_4' },
		// Onion DAO currency reward.
		{ kind: 'onions', amount: 150 },
		// Festival onion-supply win-bar bump.
		{ kind: 'gauge', amount: 800 }
	],

	beaconConfig: {
		beaconIdHint: 'b-elevator',
		landmark: 'City Hall elevator bank, lobby level',
		// sub-GHz for the handshake preamble; secRng for optional client entropy
		// (combat RNG is server-authoritative).
		requiresCapabilities: ['subghz', 'secRng']
	},

	content: {
		// Static content block (also in content/act3-4-elevator-hack.ts).
		// Duplicated here as a compact machine-readable form so the engine/relay
		// can serve it without importing the full content module.
		intro: ELEVATOR_CONTENT.intro,
		handshakePrompt: ELEVATOR_CONTENT.handshakePrompt,
		combatIntro: ELEVATOR_CONTENT.combatIntro,
		successMessage: ELEVATOR_CONTENT.successMessage,
		defeatMessage: ELEVATOR_CONTENT.defeatMessage,
		lesson: ELEVATOR_CONTENT.lesson,

		// Combat parameters consumed by the engine when opening a combat session.
		combat: {
			enemyName: 'Intrusion Detection System v2.3',
			enemyHp: IDS_HP,
			wavesRequired: IDS_WAVES,
			// Timed fight: Operatives have 90 seconds per wave (see beacon config).
			ttlSeconds: 90
		},

		// Sub-GHz parameters (mirrors beacon/challenges/act3-4-elevator-hack.json).
		subghz: {
			// 315 MHz — standard North-American building automation / elevator band.
			freqHz: 315_000_000,
			// The elevator access code the badge must transmit.
			// 4-byte payload: 0xDE 0xAD 0xBE 0xEF (placeholder; real firmware uses
			// a rolling code derived from the server nonce).
			accessCode: 'DEADBEEF',
			symbolMs: 300
		}
	},

	validate
};

// Side effect: registers on module load (parallel-safe, no shared index).
registerChallenge(challenge);
export default challenge;
