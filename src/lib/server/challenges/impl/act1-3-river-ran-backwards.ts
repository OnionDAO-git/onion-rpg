/**
 * Act 1, Challenge 1.3 — "The River Ran Backwards" (NPC/AI). SPEC §5 Act 1.
 *
 * Old Ike, a ghost civil engineer from 1900, won't share the Reversal Map until
 * the operative proves they understand WHY Chicago reversed the Chicago River.
 * The AI (DEEPDISH via storyteller.npcTurn) judges comprehension, not rote
 * answers — any framing that shows the sewage-to-drinking-water connection passes.
 *
 * Gating: requires water_main_key (from 1.1 — you fixed the water; now learn
 * how it stays fixed).
 * Rewards: reversal_map (hints for Act 2 bridge challenges), 70 Onions.
 *
 * Type: 'npc' (free-form AI dialogue, judged by storyteller.npcTurn).
 *
 * validate() is called per NPC_DIALOGUE_TURN from the engine. It delegates to
 * npcTurn() and returns { passed, message, continued } so the engine can drive
 * multi-turn sessions without the challenge knowing about session storage.
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeContext, ChallengeResult } from '$lib/shared/types';
import { npcTurn } from '$lib/server/ai/storyteller';
import type { StorytellerContext } from '$lib/server/ai/storyteller';
import {
	NPC_NAME,
	NPC_GREETING,
	BADGE_CHOICES,
	INTRO_LINES,
	SUCCESS_LINES,
	FAILURE_LINES,
	EDUCATIONAL_FOOTNOTE
} from '../content/act1-3-river-ran-backwards';

// ── Input shape ───────────────────────────────────────────────────────────────

/**
 * Input the engine passes to validate() per NPC turn.
 * Mirrors the NPC_DIALOGUE_TURN body from CONTRACTS §3.
 */
interface RiverNpcInput {
	/** The player's utterance (one of BADGE_CHOICES or free-form text). */
	t: string;
	/** Session id (opaque; returned by prior turns and threaded back). */
	s?: string;
	/** Prior turns in this storyteller session, oldest first. */
	transcript?: Array<{ role: 'operative' | 'deepdish' | 'system'; content: string }>;
}

// ── Challenge descriptor ──────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '1.3',
	act: 1,
	type: 'npc',
	name: 'The River Ran Backwards',

	// Gating: prove you fixed the water (1.1) before you learn how it stays fixed.
	requires: ['water_main_key'],

	rewards: [
		// The Reversal Map unlocks Act 2 bridge challenges (2.3 Bascule Standoff).
		{ kind: 'inventory', catalogId: 'reversal_map' },
		// 70 Onions per SPEC §5 Act 1 reward table.
		{ kind: 'onions', amount: 70 },
		// Small gauge bump — restoring civil-engineering knowledge counts.
		{ kind: 'gauge', amount: 350 }
	],

	beaconConfig: {
		beaconIdHint: 'b-river-ike',
		landmark: 'Chicago Riverwalk (near the river reversal plaque)',
		// NPC challenges use standard ESP-NOW; no special hardware primitives needed.
		requiresCapabilities: []
	},

	content: {
		// Static intro lines for CHALLENGE_INTRO response (badge display).
		introLines: INTRO_LINES,
		// Old Ike's opening question (first NPC_DIALOGUE_REPLY turn).
		npcGreeting: NPC_GREETING,
		// Scroll-menu choices surfaced on the badge (NPC archetype).
		choices: BADGE_CHOICES,
		// NPC persona label on the badge.
		npcName: NPC_NAME,
		// Static success/fail copy for fallback if AI is unavailable.
		successLine: SUCCESS_LINES[0],
		failureLine: FAILURE_LINES[0],
		// Educational footnote appended to pass verdict.
		educationalFootnote: EDUCATIONAL_FOOTNOTE
	},

	async validate(input: unknown, ctx: ChallengeContext): Promise<ChallengeResult> {
		// ── Type-narrow the input ──────────────────────────────────────────
		const npcInput = input as Partial<RiverNpcInput>;
		const utterance = typeof npcInput?.t === 'string' ? npcInput.t.trim() : '';

		if (!utterance) {
			// No utterance yet — return the greeting so the badge can display it.
			return {
				passed: false,
				continued: true,
				message: NPC_GREETING
			};
		}

		// ── Build storyteller context ─────────────────────────────────────
		// transcript is threaded in from the engine (stored in storyteller_transcripts).
		const priorTurns: StorytellerContext['transcript'] = Array.isArray(npcInput?.transcript)
			? (npcInput.transcript as StorytellerContext['transcript'])
			: [];

		const stCtx: StorytellerContext = {
			mode: 'npc',
			challengeId: '1.3',
			transcript: priorTurns,
			inventory: ctx.inventory,
			utterance
		};

		// ── Delegate to DEEPDISH / storyteller ───────────────────────────
		let verdict;
		try {
			verdict = await npcTurn(stCtx);
		} catch (err) {
			// AI unavailable — fail gracefully with a static message so the
			// badge doesn't hang. The player can retry; the engine won't
			// record a permanent failure for a service error.
			const errMsg =
				err instanceof Error ? err.message : String(err);
			return {
				passed: false,
				continued: true,
				message:
					"Old Ike's on a coffee break — technical difficulties, champ. " +
					`(${errMsg}) Try again in a moment.`
			};
		}

		if (verdict.passed) {
			// ── Pass: return success message + footnote ───────────────────
			// The ENGINE applies rewards; we just return the verdict.
			const successMsg =
				verdict.reply ||
				SUCCESS_LINES[0] + '\n\n' + EDUCATIONAL_FOOTNOTE;

			return {
				passed: true,
				message: successMsg,
				// Override rewards here only if the AI suggests bonus rewards (none
				// for this challenge — fixed reward set from the descriptor is enough).
				flags: {
					// Record the turn count for analytics / leaderboard flavor.
					riverAnswerTurns: priorTurns.length + 1
				}
			};
		} else {
			// ── Fail (not yet): continued dialogue, show DEEPDISH reply ──
			return {
				passed: false,
				continued: true,
				message:
					verdict.reply ||
					FAILURE_LINES[0]
			};
		}
	}
};

registerChallenge(challenge);
export default challenge;
