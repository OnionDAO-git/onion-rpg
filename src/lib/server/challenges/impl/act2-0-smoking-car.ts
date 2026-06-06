/**
 * Act 2, Challenge 2.0 — The Smoking Car (NPC / AI de-escalation).
 *
 * OPTIONAL challenge — does not gate Act 2 progression. Reward is a bonus
 * credential (Passenger Advocate Credential) that opens a shortcut dialogue
 * path at the OEMC in Act 3.3.
 *
 * MECHANIC: Free-form NPC dialogue judged by DEEPDISH storyteller (npcTurn).
 * The operative must de-escalate Unit 7 / "Glen" — a stressed logistics drone
 * smoking on the Blue Line — using genuine de-escalation technique. Commanding
 * or threatening fails. Patient, empathetic engagement succeeds.
 *
 * The AI judge tracks Unit 7's emotional state:
 *   defensive → opening → receptive → resolved
 *
 * The challenge passes only when state reaches 'resolved'.
 *
 * REQUIRES: no prerequisites — Blue Line is accessible to anyone.
 * REWARDS: passenger_advocate_credential (bonus item) + 60 Onions.
 *
 * Max turns before timeout: 8 (generous; this challenge rewards patience).
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import { npcTurn, type StorytellerContext } from '$lib/server/ai/storyteller';
import {
	DEEPDISH_INTRO,
	NPC_GREETING,
	JUDGE_RUBRIC,
	SUCCESS_DEEPDISH_LINE,
	FAILURE_DEEPDISH_LINE,
	EXHAUSTION_LINE,
	EDUCATIONAL_FOOTNOTE,
	DIALOGUE_CHOICES,
	SCREEN_CONTENT,
	NPC_NAME,
	STATE_COMMENTARY
} from '../content/act2-0-smoking-car';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum dialogue turns before the session times out. */
const MAX_TURNS = 8;

// ── Input shape ──────────────────────────────────────────────────────────────

interface SmokingCarInput {
	/** Free-form utterance from the operative. */
	utterance?: string;
	/** Session id for transcript continuity. */
	sessionId?: string;
	/** Prior turns in this session. */
	transcript?: StorytellerContext['transcript'];
	/** Turn number (0-indexed). Supplied by the engine. */
	turn?: number;
}

// ── Challenge descriptor ─────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '2.0',
	act: 2,
	type: 'npc',
	name: 'The Smoking Car',

	// No prerequisites — optional challenge, open to all Act 2 operatives.
	requires: [],

	rewards: [
		// Bonus credential unlocking OEMC shortcut path in 3.3.
		{ kind: 'inventory', catalogId: 'passenger_advocate_credential' },
		// 60 Onions — modest for an optional challenge.
		{ kind: 'onions', amount: 60 },
		{ kind: 'gauge', amount: 600 }
	],

	beaconConfig: {
		beaconIdHint: 'b-blue-line',
		landmark: 'CTA Blue Line — westbound between Racine and UIC-Halsted',
		requiresCapabilities: [] // NPC dialogue only; no special hardware.
	},

	content: {
		npcName: NPC_NAME,
		intro: DEEPDISH_INTRO,
		npcGreeting: NPC_GREETING,
		dialogueChoices: DIALOGUE_CHOICES,
		screenContent: SCREEN_CONTENT,
		successLine: SUCCESS_DEEPDISH_LINE,
		failureLine: FAILURE_DEEPDISH_LINE,
		exhaustionLine: EXHAUSTION_LINE,
		lesson: EDUCATIONAL_FOOTNOTE,
		stateCommentary: STATE_COMMENTARY,
		maxTurns: MAX_TURNS,
		// Flag shown on badge intro: this challenge is optional.
		optional: true
	},

	// ── validate ─────────────────────────────────────────────────────────────

	async validate(input: unknown, ctx): Promise<ChallengeResult> {
		const inp = input as SmokingCarInput;

		// Type guard
		if (!inp || typeof inp !== 'object') {
			return { passed: false, message: 'Invalid input.' };
		}

		const utterance = (inp.utterance ?? '').trim();
		const turn = typeof inp.turn === 'number' ? inp.turn : 0;
		const transcript = inp.transcript ?? [];

		// Opening turn (no utterance yet): return NPC greeting + DEEPDISH intro.
		if (!utterance && turn === 0) {
			return {
				passed: false,
				continued: true,
				message: [DEEPDISH_INTRO, '\n\n', NPC_GREETING].join(''),
				flags: { 'smoking_car:state': 'defensive', 'smoking_car:turn': 0 }
			};
		}

		// No utterance on a mid-session turn: prompt for input.
		if (!utterance) {
			return {
				passed: false,
				continued: true,
				message: 'Unit 7 is waiting. Say something.',
				flags: { 'smoking_car:turn': turn }
			};
		}

		// Exhaustion check — turn limit exceeded.
		if (turn >= MAX_TURNS) {
			return {
				passed: false,
				continued: false,
				message: EXHAUSTION_LINE
			};
		}

		// ── AI judge: one NPC turn ────────────────────────────────────────────

		const stCtx: StorytellerContext = {
			mode: 'npc',
			challengeId: '2.0',
			transcript,
			inventory: ctx.inventory,
			// Inject the de-escalation rubric + current turn context into utterance
			// so the AI has the right scoring criteria without modifying the frozen
			// system prompt.
			utterance: [
				JUDGE_RUBRIC,
				`[Current turn: ${turn + 1} of ${MAX_TURNS}]`,
				`[Operative says]: ${utterance}`
			].join('\n\n')
		};

		let reply: string;
		let passed = false;
		let state = 'defensive';

		try {
			const verdict = await npcTurn(stCtx);
			passed = verdict.passed;
			reply = verdict.reply;

			// Extract state from verdict reasoning if available.
			// The rubric asks the model to include state in the JSON verdict.
			const stateMatch = verdict.reasoning?.match(/"state"\s*:\s*"(\w+)"/);
			if (stateMatch) state = stateMatch[1];
		} catch (err) {
			// AI unavailable — continue the session, don't fail the operative.
			const msg = err instanceof Error ? err.message : String(err);
			return {
				passed: false,
				continued: true,
				message:
					`[Static on the line — Unit 7 doesn't respond. Try again. (${msg})]`,
				flags: { 'smoking_car:turn': turn }
			};
		}

		// ── Win path ──────────────────────────────────────────────────────────

		if (passed) {
			return {
				passed: true,
				message: [reply, '\n\n', SUCCESS_DEEPDISH_LINE].join(''),
				flags: {
					'smoking_car:state': 'resolved',
					'smoking_car:turn': turn,
					'smoking_car:won': true
				}
			};
		}

		// ── Continue path ──────────────────────────────────────────────────────

		// Add state commentary for the badge side-bar (if badge supports it).
		const stateNote =
			state !== 'defensive' ? (STATE_COMMENTARY[state] ?? '') : '';

		const turnsLeft = MAX_TURNS - turn - 1;
		const progressNote = turnsLeft <= 2 && turnsLeft > 0
			? `[${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} remaining]`
			: '';

		return {
			passed: false,
			continued: true,
			message: [
				reply,
				stateNote ? `\n\n${stateNote}` : '',
				progressNote ? `\n${progressNote}` : ''
			]
				.filter(Boolean)
				.join(''),
			flags: {
				'smoking_car:state': state,
				'smoking_car:turn': turn + 1
			}
		};
	}
};

registerChallenge(challenge);
export default challenge;
