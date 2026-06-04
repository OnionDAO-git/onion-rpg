/**
 * Act 2, Challenge 2.3 — Bascule Standoff (Dialogue/Voice + Combat)
 * SPEC §5: "A movable (bascule) bridge stuck mid-raise, guarded by DEEPDISH's
 * Bridge Tender construct. Voice the lowering sequence (uses Reversal Map from
 * 1.3), then a short RNG combat as the construct resists."
 *
 * Mechanic (two phases, each validated separately):
 *
 *   PHASE 1 — voice: validate input.phase === 'voice'.
 *     The operative speaks the four-step lowering sequence
 *     (lock traffic → release counterweight → lower leaf → secure locks).
 *     Server runs STT + matchSequence() from stt.ts. Partial credit on 3/4 steps.
 *     On pass: challenge_attempts status = 'started' (continued=true) so the
 *     engine keeps the attempt open for Phase 2.
 *
 *   PHASE 2 — combat: validate input.phase === 'combat'.
 *     One RNG combat wave against the Bridge Tender construct.
 *     Engine provides ctx.combat (CombatSession). Verify via ctx.combat.status.
 *
 *   PHASE GUARD: the server stamps a flag 'voice_cleared' in game_state.flags
 *   after Phase 1 so Phase 2 can only be entered after Phase 1 passes; the
 *   badge sends the flag token it received back in the combat submit body.
 *
 * Requires: ['reversal_map'] (credential from challenge 1.3).
 * Rewards:  ['river_access' credential, 110 Onions, gauge bump].
 */
import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import {
	matchSequence,
	normalizeTranscript,
	getSttProvider,
	consumeBlobRef
} from '$lib/server/ai/stt';
import {
	VOICE_SUCCESS_TAUNT,
	VOICE_FAIL_TAUNT,
	VOICE_PARTIAL_TAUNT,
	COMBAT_WIN,
	COMBAT_LOSS,
	GATE_BLOCKED,
	LOWERING_SEQUENCE_STEPS
} from '../content/act2-3-bascule-standoff';

// ── Input shapes expected from the badge / relay ────────────────────────────

/** Voice phase input — sent via VOICE_CAPTURE_SUBMIT. */
export interface BasculeVoiceInput {
	phase: 'voice';
	/** Direct transcript (if badge did on-device STT or test). */
	transcript?: string;
	/** Audio blob ref uploaded out-of-band by the beacon (CONTRACTS §3). */
	ref?: string;
}

/** Combat phase input — sent via COMBAT_ROLL_REQUEST submit. */
export interface BasculeCombatInput {
	phase: 'combat';
	/** Token proving voice phase was cleared for this operative/attempt. */
	voiceToken?: string;
}

type BasculeInput = BasculeVoiceInput | BasculeCombatInput | { phase?: unknown };

// ── Challenge descriptor ────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '2.3',
	act: 2,
	type: 'dialogue', // primary archetype; mixed with combat (SPEC §5 Act 2)
	name: 'Bascule Standoff',

	// Reversal Map is granted by challenge 1.3 (The River Ran Backwards).
	// The map's clues spell out the lowering sequence steps.
	requires: ['reversal_map'],

	rewards: [
		{ kind: 'inventory', catalogId: 'river_access' },
		{ kind: 'onions', amount: 110 },
		{ kind: 'gauge', amount: 700 }
	],

	beaconConfig: {
		beaconIdHint: 'b-bascule',
		landmark: 'Michigan Avenue Bascule Bridge (stuck mid-raise)',
		requiresCapabilities: ['voice'] // prefer on-badge mic; falls back to beacon capture
	},

	// Static content consumed by the badge screen and the server intro handler.
	content: {
		intro:
			'The bridge is stuck mid-raise. The Bridge Tender construct guards the ' +
			'counterweight room. Voice the lowering sequence, then fight your way through.',
		voicePrompt:
			'Speak the four-step lowering sequence: lock traffic, release counterweight, ' +
			'lower leaf, secure locks.',
		enemyName: 'Bridge Tender Construct',
		enemyMaxHp: 60,
		opMaxHp: 100,
		wavesRequired: 1
	},

	/**
	 * Validate a submitted challenge input.
	 *
	 * Two-phase challenge; the engine passes continued=true after phase 1 so the
	 * attempt row stays open until phase 2 resolves it.
	 *
	 * ctx.inventory must contain 'reversal_map' (enforced in requires[], but we
	 * double-check here to surface the gating message via DEEPDISH voice).
	 */
	async validate(rawInput: unknown, ctx): Promise<ChallengeResult> {
		const input = rawInput as BasculeInput;

		// ── Hard gate: Reversal Map required ─────────────────────────────────
		if (!ctx.inventory.includes('reversal_map')) {
			return {
				passed: false,
				message: GATE_BLOCKED
			};
		}

		// ── Phase 1: Voice ────────────────────────────────────────────────────
		if (input?.phase === 'voice') {
			return validateVoicePhase(input as BasculeVoiceInput, ctx);
		}

		// ── Phase 2: Combat ───────────────────────────────────────────────────
		if (input?.phase === 'combat') {
			return validateCombatPhase(input as BasculeCombatInput, ctx);
		}

		// Unknown phase or missing — treat as a probe/begin.
		// Return continued so the engine keeps the attempt open.
		return {
			passed: false,
			continued: true,
			message: "The bridge is stuck. Speak the lowering sequence first, pal."
		};
	}
};

// ── Phase 1: voice validation ────────────────────────────────────────────────

async function validateVoicePhase(
	input: BasculeVoiceInput,
	ctx: Parameters<ChallengeDescriptor['validate']>[1]
): Promise<ChallengeResult> {
	let transcript = '';

	// Resolve the transcript from either direct input or STT over a blob ref.
	if (input.transcript) {
		transcript = normalizeTranscript(input.transcript);
	} else if (input.ref) {
		const audio = consumeBlobRef(input.ref);
		if (!audio) {
			return {
				passed: false,
				continued: true,
				message: "Audio ref not found or expired. Try again, champ."
			};
		}
		try {
			const stt = getSttProvider();
			const result = await stt.transcribe(audio, { language: 'en' });
			transcript = normalizeTranscript(result.transcript);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				passed: false,
				continued: true,
				message: `STT error: ${msg}. Try again.`
			};
		}
	}

	// Run the sequence matcher (threshold 0.75 — 3/4 steps is generous but
	// voice challenges get fuzzy leeway per CONTRACTS §6 voice guidance).
	// Map steps to plain mutable SequenceStep objects (LOWERING_SEQUENCE_STEPS
	// is declared `as const` in the content file, giving readonly tuple aliases).
	const steps = LOWERING_SEQUENCE_STEPS.map((s) => ({
		keyword: s.keyword,
		aliases: s.aliases ? [...s.aliases] : undefined,
		label: s.label
	}));
	const match = matchSequence(transcript, steps, {
		threshold: 0.75
	});

	if (match.passed) {
		// Phase 1 cleared — set a server-side flag so phase 2 knows voice passed.
		// The engine merges flags into game_state.flags.
		return {
			passed: false, // overall challenge not yet done (combat still needed)
			continued: true,
			message: VOICE_SUCCESS_TAUNT,
			flags: {
				[`2.3:voice_cleared`]: true,
				[`2.3:voice_cleared_at`]: ctx.now
			}
		};
	}

	// Partial match (some steps found)
	if (match.matchedCount >= 2) {
		return {
			passed: false,
			continued: true,
			message:
				VOICE_PARTIAL_TAUNT +
				(match.missingLabel ? ` Missing: ${match.missingLabel}.` : '')
		};
	}

	// Full fail
	return {
		passed: false,
		continued: true,
		message: VOICE_FAIL_TAUNT
	};
}

// ── Phase 2: combat validation ───────────────────────────────────────────────

function validateCombatPhase(
	_input: BasculeCombatInput,
	ctx: Parameters<ChallengeDescriptor['validate']>[1]
): ChallengeResult {
	// ctx.flags is not in ChallengeContext by design (it lives in game_state).
	// The engine gates routing to the combat phase by checking
	// game_state.flags['2.3:voice_cleared'] before calling validate with phase='combat'.
	// Here we use ctx.combat as the authoritative source for the combat outcome.

	if (!ctx.combat) {
		return {
			passed: false,
			continued: true,
			message: "No active combat session found. Speak the sequence first."
		};
	}

	if (ctx.combat.status === 'won') {
		return {
			passed: true,
			message: COMBAT_WIN
		};
	}

	if (ctx.combat.status === 'lost') {
		return {
			passed: false,
			continued: false,
			message: COMBAT_LOSS
		};
	}

	// Combat still active (status === 'active')
	return {
		passed: false,
		continued: true,
		message: `Wave ${ctx.combat.wave}/${ctx.combat.wavesRequired} — keep going.`
	};
}

registerChallenge(challenge);
export default challenge;
