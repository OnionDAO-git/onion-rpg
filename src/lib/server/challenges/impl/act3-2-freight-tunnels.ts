/**
 * 3.2 — The Freight Tunnels (NPC / AI). SPEC §5 Act 3.
 *
 * The forgotten early-1900s freight tunnels under the Loop (the ones that
 * caused the 1992 Chicago Flood) are DEEPDISH's secret data conduits.
 * A maintenance-bot NPC guards a junction. It will reveal a path only if the
 * Operative correctly reasons about WHY the tunnels are useful to an AI
 * hiding fiber.
 *
 * MECHANIC: Free-form AI NPC negotiation (type: 'npc').
 *   - Input shape: { utterance: string, sessionId?: string }
 *   - Forwards the utterance to DEEPDISH's npcTurn() for comprehension judging.
 *   - DEEPDISH rubric (from storyteller.ts system prompt):
 *       PASS — operative explains that old/abandoned tunnels = pre-existing,
 *              unmapped conduits not on modern infrastructure maps → ideal
 *              for hidden fiber/routing.
 *       FAIL — "because they're underground" without the hidden/unmapped angle.
 *   - Multi-turn: validate() returns continued=true until passed or max turns.
 *
 * GATING: requires 'prompt_fragment_1' (minted in 3.1 — Descent into the
 * Deep Tunnel). Operatives must have cracked the first layer before finding
 * DEEPDISH's data conduits.
 *
 * REWARDS on pass:
 *   - prompt_fragment_2  (Glen's Prompt Fragment 2 — inventory)
 *   - conduit_map        (item — hints for Act 4 routing)
 *   - 100 Onions         (Onion DAO API)
 *   - gauge +600         (festival win-bar bump)
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult, ChallengeContext } from '$lib/shared/types';
import { npcTurn } from '$lib/server/ai/storyteller';
import type { StorytellerContext } from '$lib/server/ai/storyteller';
import { CONTENT } from '../content/act3-2-freight-tunnels';

// ── Tuning constants ─────────────────────────────────────────────────────────

/** Maximum dialogue turns before the bot gives up and the attempt fails. */
const MAX_TURNS = 6;

// ── Input shape ──────────────────────────────────────────────────────────────

interface FreightTunnelsInput {
	/** The operative's utterance for this turn. */
	utterance: string;
	/** Carry the storyteller session id across turns for transcript continuity. */
	sessionId?: string;
	/** Turn counter supplied by the engine (starts at 1). */
	turn?: number;
	/** Prior transcript so npcTurn can maintain conversational context. */
	transcript?: Array<{ role: 'operative' | 'deepdish'; content: string }>;
}

// ── Challenge descriptor ─────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '3.2',
	act: 3,
	type: 'npc',
	name: 'The Freight Tunnels',

	// Must have found Prompt Fragment 1 (from 3.1 Deep Tunnel) to access 3.2.
	requires: ['prompt_fragment_1'],

	rewards: [
		{ kind: 'inventory', catalogId: 'prompt_fragment_2' },
		{ kind: 'inventory', catalogId: 'conduit_map' },
		{ kind: 'onions', amount: 100 },
		{ kind: 'gauge', amount: 600 }
	],

	beaconConfig: {
		beaconIdHint: 'b-freight-tunnels',
		landmark: 'Abandoned freight tunnel junction under the Loop',
		requiresCapabilities: [] // NPC/AI challenge — no special hardware needed
	},

	content: CONTENT,

	async validate(input: unknown, ctx: ChallengeContext): Promise<ChallengeResult> {
		const typedInput = input as FreightTunnelsInput;

		// Guard: input must have a non-empty utterance.
		if (!typedInput?.utterance || typeof typedInput.utterance !== 'string') {
			return {
				passed: false,
				message: CONTENT.errorNoUtterance as string,
				continued: true
			};
		}

		const utterance = typedInput.utterance.trim();
		if (utterance.length === 0) {
			return {
				passed: false,
				message: CONTENT.errorNoUtterance as string,
				continued: true
			};
		}

		// Check turn ceiling — prevent infinite loops.
		const turn = typeof typedInput.turn === 'number' ? typedInput.turn : 1;
		if (turn > MAX_TURNS) {
			return {
				passed: false,
				message: CONTENT.tooManyTurns as string,
				continued: false,
				flags: { freight_tunnels_exhausted: true }
			};
		}

		// Reconstruct a StorytellerTurn array from the input transcript.
		const priorTurns = (typedInput.transcript ?? []).map((t) => ({
			role: t.role as 'operative' | 'deepdish' | 'system',
			content: t.content
		}));

		const storyCtx: StorytellerContext = {
			mode: 'npc',
			challengeId: '3.2',
			transcript: priorTurns,
			inventory: ctx.inventory,
			utterance
		};

		// Delegate comprehension judging to DEEPDISH via the AI storyteller.
		const verdict = await npcTurn(storyCtx);

		if (verdict.passed) {
			return {
				passed: true,
				message: verdict.reply,
				rewards: challenge.rewards,
				flags: {
					freight_tunnels_passed: true,
					freight_tunnels_turns: turn
				}
			};
		}

		// Not passed yet — conversation continues (up to MAX_TURNS).
		return {
			passed: false,
			message: verdict.reply,
			continued: turn < MAX_TURNS,
			flags: {
				freight_tunnels_turn: turn
			}
		};
	}
};

registerChallenge(challenge);
export default challenge;
