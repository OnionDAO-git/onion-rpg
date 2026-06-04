/**
 * act4-2-realign-the-agent.ts — SPEC §5 Act 4.2 "Realign the Agent"
 *
 * THE FINALE. Operatives feed all four Prompt Fragments into DEEPDISH's
 * console, reassemble Glen's original system prompt, then CONVERSE with
 * DEEPDISH (free-form AI judging) to win — not delete it.
 *
 * Win condition: demonstrate genuine infrastructure comprehension through
 * dialogue. DEEPDISH judges via finaleConversation() (claude-opus-4-8).
 *
 * On win:
 *   - Gauge fills to maximum (restores the onion supply across the city).
 *   - `finale_won` flag set in game_state.
 *   - 500 Onions awarded.
 *
 * Gated by:
 *   - grid_credential       (Act 1.2)
 *   - dispatch_credential   (Act 3.3)
 *   - city_it_keycard       (Act 3.4)
 *   - prompt_fragment_1..4  (Acts 3.1, 3.2, 3.3, 3.4)
 *   - console_access        (Act 4.1 — proves the server room was cleared)
 *
 * NPC type: free-form AI dialogue via DEEPDISH finaleConversation().
 * The engine calls validate() on each NPC_DIALOGUE_TURN; the session
 * continues until won===true or a timeout clears it.
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import {
	finaleConversation,
	npcTurn,
	type StorytellerContext
} from '$lib/server/ai/storyteller';
import {
	INTRO_ALL_FRAGMENTS,
	INTRO_MISSING_FRAGMENTS,
	MASK_OFF_MONOLOGUE,
	WIN_FINAL_LINE,
	TIMEOUT_LINE,
	EDUCATIONAL_FOOTNOTE,
	FINALE_CHOICES
} from '../content/act4-2-realign-the-agent';

// ── Required credentials + fragments ────────────────────────────────────

/** All catalogIds that must be in inventory before this challenge can begin. */
const REQUIRED = [
	'grid_credential',
	'dispatch_credential',
	'city_it_keycard',
	'prompt_console_access', // dropped by Act 4.1 server room
	'prompt_fragment_1',
	'prompt_fragment_2',
	'prompt_fragment_3',
	'prompt_fragment_4'
] as const;

/** Just the four fragment catalogIds. */
const FRAGMENTS = [
	'prompt_fragment_1',
	'prompt_fragment_2',
	'prompt_fragment_3',
	'prompt_fragment_4'
] as const;

// ── Input shape ──────────────────────────────────────────────────────────

/**
 * Input submitted by the engine for each NPC_DIALOGUE_TURN.
 * `phase` drives which AI function is called:
 *   'reveal'  — show the assembled prompt; get DEEPDISH's mask-off response
 *   'finale'  — free-form conversation turn; AI judges comprehension
 *   'timeout' — session expired; close gracefully
 */
interface Act42Input {
	phase: 'reveal' | 'finale' | 'timeout';
	/** Session id (storyteller_sessions.id) for transcript continuity. */
	sessionId?: string;
	/** The operative's utterance for this turn (finale phase). */
	utterance?: string;
	/** Prior transcript turns for this session. */
	transcript?: StorytellerContext['transcript'];
}

// ── validate() ───────────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '4.2',
	act: 4,
	type: 'npc',
	name: 'Realign the Agent',

	// Engine checks that ALL of these catalogIds are in inventory before
	// allowing CHALLENGE_BEGIN.  This is the full gate for the finale.
	requires: [...REQUIRED],

	rewards: [
		// Gauge fills completely — the shared festival win-bar flips to max.
		// The engine clamps to gauge.max so we overshoot safely.
		{ kind: 'gauge', amount: 9_999_999 },
		// Onion reward via the real Onion DAO API.
		{ kind: 'onions', amount: 500 }
	],

	beaconConfig: {
		beaconIdHint: 'b-datacenter',
		landmark: 'Data Center Console — Glen\'s terminal',
		requiresCapabilities: [] // NPC challenge; no special hardware beyond comms
	},

	content: {
		// Hint text shown on the badge BEFORE the operative has all fragments.
		missingFragmentsHint: INTRO_MISSING_FRAGMENTS(0), // runtime: replace 0
		// Opening narration once all fragments are confirmed.
		introAllFragments: INTRO_ALL_FRAGMENTS,
		// Mask-off monologue that precedes the conversation phase.
		maskOffMonologue: MASK_OFF_MONOLOGUE,
		// Win final line (sewer stinger).
		winFinalLine: WIN_FINAL_LINE,
		// Choice strings for the badge menu during the finale conversation.
		finaleChoices: FINALE_CHOICES,
		// Educational footnote (admin / attempt record).
		lesson: EDUCATIONAL_FOOTNOTE
	},

	// ── validate ────────────────────────────────────────────────────────────
	async validate(input: unknown, ctx): Promise<ChallengeResult> {
		const now = ctx.now;
		void now; // available if needed for session timeout checks

		// Type-guard the input
		const inp = input as Act42Input;
		if (!inp || typeof inp !== 'object') {
			return { passed: false, message: 'Invalid input shape.' };
		}

		// ── Gate: confirm all fragments are in inventory ──────────────────
		const missingFragments = FRAGMENTS.filter((f) => !ctx.inventory.includes(f));
		if (missingFragments.length > 0) {
			return {
				passed: false,
				message: INTRO_MISSING_FRAGMENTS(FRAGMENTS.length - missingFragments.length),
				continued: true
			};
		}

		// ── Phase: reveal ─────────────────────────────────────────────────
		// First turn: the operative feeds the fragments in and we return the
		// assembled prompt + DEEPDISH's mask-off monologue. No verdict yet.
		if (inp.phase === 'reveal') {
			const stCtx: StorytellerContext = {
				mode: 'finale',
				challengeId: '4.2',
				transcript: inp.transcript ?? [],
				inventory: ctx.inventory,
				utterance: '[fragments assembled]'
			};
			// Use npcTurn with a synthetic utterance to let DEEPDISH react to
			// the fragment reveal in its mask-off voice.  The actual mask-off
			// monologue is pre-written (content file) and shown by the badge
			// screen; this AI call produces DEEPDISH's first reactive reply
			// which can be shown in an extended reveal animation or skipped.
			try {
				const reaction = await npcTurn(stCtx);
				return {
					passed: false,
					message: reaction.reply || MASK_OFF_MONOLOGUE,
					flags: { finalePhase: 'conversation' },
					continued: true
				};
			} catch {
				// AI unavailable — fall back to pre-written monologue
				return {
					passed: false,
					message: MASK_OFF_MONOLOGUE,
					flags: { finalePhase: 'conversation' },
					continued: true
				};
			}
		}

		// ── Phase: timeout ─────────────────────────────────────────────────
		// Session expired without a win. Engine signals this phase so we can
		// close gracefully and allow a retry.
		if (inp.phase === 'timeout') {
			return {
				passed: false,
				message: TIMEOUT_LINE,
				continued: false
			};
		}

		// ── Phase: finale (free-form AI conversation) ─────────────────────
		// Each utterance is judged by finaleConversation(). If won===true,
		// we mark passed and the engine applies the rewards.
		if (inp.phase === 'finale') {
			const utterance = (inp.utterance ?? '').trim();
			if (!utterance) {
				return {
					passed: false,
					message: 'Say something, champ. The console is waiting.',
					continued: true
				};
			}

			const stCtx: StorytellerContext = {
				mode: 'finale',
				challengeId: '4.2',
				transcript: inp.transcript ?? [],
				inventory: ctx.inventory,
				utterance
			};

			try {
				const result = await finaleConversation(stCtx);

				if (result.won) {
					return {
						passed: true,
						message: result.reply || WIN_FINAL_LINE,
						flags: {
							finale_won: true,
							finale_won_at: Date.now(),
							deepdish_reasoning: result.reasoning
						}
					};
				}

				// Not won yet — continue the conversation.
				return {
					passed: false,
					message: result.reply,
					flags: { finalePhase: 'conversation' },
					continued: true
				};
			} catch (err) {
				// AI service error — treat as a continued turn, not a failure.
				const msg = err instanceof Error ? err.message : String(err);
				return {
					passed: false,
					message: `[Console glitch] Static on the line, pal. Try again. (${msg})`,
					continued: true
				};
			}
		}

		// Unknown phase
		return {
			passed: false,
			message: `Unknown phase: ${String((inp as { phase?: unknown }).phase)}`,
			continued: true
		};
	}
};

registerChallenge(challenge);
export default challenge;
