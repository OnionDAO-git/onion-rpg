/**
 * act1-1 — Malört Fountains (Dialogue / Voice). SPEC §5 Act 1.1.
 *
 * Water Reclamation NPC at a fountain beacon. The player must speak the five
 * Lake Michigan water-treatment stages in order:
 *   intake → crib → tunnel → Jardine plant → distribution grid
 *
 * Voice path (preferred when cap.voice is present on the badge):
 *   - Badge captures audio via the Sound-module mic (onion.sound_mic_*) and
 *     submits VOICE_CAPTURE_SUBMIT { c, t?, ref?, v? } where v={rms,peak} is the
 *     measured audio energy; a transcript/ref may also be supplied out-of-band.
 *   - If a `ref` is present the server resolves the audio blob via STT; if a
 *     `t` transcript is present it is used directly (pre-transcribed on-badge).
 *   - matchSequence() scores the normalised transcript against TREATMENT_SEQUENCE.
 *   - Borderline cases (score 0.6–0.8) are forwarded to the Storyteller for a
 *     comprehension judgment.
 *
 * ESP-NOW fallback (no cap.voice firmware extension):
 *   - The beacon records audio from its own microphone, uploads the blob to
 *     POST /api/voice (out-of-band), and passes the blob ref in the ESP-NOW
 *     VOICE_CAPTURE_SUBMIT message. Logic here is identical — the ref path.
 *
 * Requires: none (Act 1 entry-point challenge; Act 0 completion is soft-gating
 *   in the narrative, not enforced by this module — Act 0 only mints Encased
 *   Meat Mk.I and registers the operative).
 *
 * Rewards on pass: water_main_key credential + 80 Onions + gauge bump.
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import {
	TREATMENT_SEQUENCE,
	DEEPDISH_INTRO,
	SUCCESS_MESSAGE,
	FAIL_REACTIONS,
	FAIL_MESSAGE,
	LESSON_TEXT,
	VOICE_PROMPT,
	VOICE_HINT,
	NPC_GREETING,
	NPC_NAME
} from '../content/act1-1-malort-fountains';
import { getSttProvider, normalizeTranscript, matchSequence } from '$lib/server/ai/stt';
import { npcTurn } from '$lib/server/ai/storyteller';
import type { StorytellerContext } from '$lib/server/ai/storyteller';
import { consumeBlobRef } from '$lib/server/ai/stt';

// ── Sequence matching thresholds ──────────────────────────────────────────

/**
 * A score at or above this threshold counts as a clear pass — no AI needed.
 * 0.8 = 4 out of 5 stages matched (allows one garbled/missing word).
 */
const PASS_THRESHOLD = 0.8;

/**
 * Scores in [BORDERLINE_LOW, PASS_THRESHOLD) are ambiguous and get an AI
 * comprehension judgment rather than an outright fail. This rewards players who
 * used different vocabulary but clearly demonstrated understanding.
 */
const BORDERLINE_LOW = 0.6;

// ── Input type accepted by validate() ────────────────────────────────────

/**
 * The engine passes validate() the decoded body of whatever ESP-NOW message
 * arrived (VOICE_CAPTURE_SUBMIT). We accept either a pre-transcribed string `t`
 * (from on-badge STT) or an audio blob `ref` (from beacon out-of-band upload).
 * Both paths converge to a text transcript for matchSequence().
 *
 * The engine may also pass a plain string for direct API testing.
 */
interface VoiceInput {
	/** challenge id (required by protocol, validated by engine before reaching us) */
	c?: string;
	/** Pre-transcribed text (on-badge STT or direct API test). */
	t?: string;
	/** Audio blob ref (beacon out-of-band upload; server resolves via STT). */
	ref?: string;
}

// ── Challenge descriptor ──────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '1.1',
	act: 1,
	type: 'dialogue',
	name: 'Malört Fountains',

	// No hard credential gate — any registered operative can attempt.
	// (Act 0's Encased Meat Mk.I is narrative scaffolding, not required here.)
	requires: [],

	rewards: [
		{ kind: 'inventory', catalogId: 'water_main_key' },
		{ kind: 'onions', amount: 80 },
		{ kind: 'gauge', amount: 640 } // ~1/10 of a zone
	],

	beaconConfig: {
		beaconIdHint: 'b-fountain',
		landmark: 'Drinking fountain (Malört dispensing)',
		// Voice capture is the preferred path; ESP-NOW relay is the fallback.
		requiresCapabilities: ['voice']
	},

	content: {
		// Static content consumed by the engine for CHALLENGE_INTRO generation
		// and by the badge screen.
		intro: DEEPDISH_INTRO,
		npcName: NPC_NAME,
		npcGreeting: NPC_GREETING,
		voicePrompt: VOICE_PROMPT,
		voiceHint: VOICE_HINT,
		lesson: LESSON_TEXT,
		// The expected sequence (also consumed by the beacon config for hints).
		expectedSequence: TREATMENT_SEQUENCE.map((s) => s.label)
	},

	async validate(input: unknown, ctx): Promise<ChallengeResult> {
		// ── 1. Resolve the transcript ────────────────────────────────────

		let transcript: string | null = null;

		if (typeof input === 'string') {
			// Direct string (API test / relay engine passes pre-decoded text).
			transcript = input;
		} else if (input && typeof input === 'object') {
			const body = input as VoiceInput;

			if (body.t && typeof body.t === 'string' && body.t.trim().length > 0) {
				// Pre-transcribed by on-badge STT (caps.voice path) or direct input.
				transcript = body.t;
			} else if (body.ref && typeof body.ref === 'string') {
				// Audio blob ref — resolve via STT provider.
				const audio = consumeBlobRef(body.ref);
				if (!audio) {
					return {
						passed: false,
						message: 'Audio upload expired or not found — speak again and try once more, champ.',
						continued: false
					};
				}
				try {
					const provider = getSttProvider();
					const result = await provider.transcribe(audio, { language: 'en' });
					transcript = result.transcript;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					return {
						passed: false,
						message: `STT error — the fountain coughs: ${msg}`,
						continued: false
					};
				}
			}
		}

		if (!transcript || transcript.trim().length === 0) {
			return {
				passed: false,
				message:
					"Couldn't catch that, pal. " +
					'Either speak clearly or press SELECT to try again.',
				continued: true // allow retry without resetting the session
			};
		}

		// ── 2. Score the transcript against the expected sequence ────────

		// Map the const-tuple to mutable SequenceStep objects so the types match.
		const steps = TREATMENT_SEQUENCE.map((s) => ({
			keyword: s.keyword,
			aliases: [...s.aliases] as string[],
			label: s.label
		}));
		const matchResult = matchSequence(transcript, steps, {
			threshold: PASS_THRESHOLD
		});

		// ── 3a. Clear pass ───────────────────────────────────────────────

		if (matchResult.passed) {
			return {
				passed: true,
				message: SUCCESS_MESSAGE + '\n\n' + LESSON_TEXT,
				rewards: challenge.rewards,
				flags: {
					malortFountainRestored: true,
					voiceMatchScore: matchResult.score,
					stagesMatched: matchResult.matchedCount
				}
			};
		}

		// ── 3b. Borderline — ask the Storyteller for comprehension judgment ─

		if (matchResult.score >= BORDERLINE_LOW) {
			try {
				const stCtx: StorytellerContext = {
					mode: 'dialogue',
					challengeId: challenge.id,
					// No prior transcript for voice challenges — each attempt is
					// stateless from the storyteller's perspective.
					transcript: [],
					inventory: ctx.inventory,
					utterance:
						`Operative spoke the water treatment sequence. Transcript: "${normalizeTranscript(transcript)}". ` +
						`They matched ${matchResult.matchedCount} of 5 stages. ` +
						`Missing: ${matchResult.missingLabel ?? 'multiple stages'}. ` +
						`Judge whether they demonstrated genuine understanding of the ` +
						`intake→crib→tunnel→Jardine→grid path. ` +
						`The challenge rubric for 1.1 is: pass if they describe the ` +
						`Lake Michigan water-treatment journey even with imprecise vocabulary; ` +
						`fail if they clearly have no idea what a crib or Jardine is.`
				};

				const verdict = await npcTurn(stCtx);

				if (verdict.passed) {
					return {
						passed: true,
						message: verdict.reply + '\n\n' + LESSON_TEXT,
						rewards: challenge.rewards,
						flags: {
							malortFountainRestored: true,
							voiceMatchScore: matchResult.score,
							stagesMatched: matchResult.matchedCount,
							aiJudged: true
						}
					};
				} else {
					// AI says no — use DEEPDISH's reply as the failure message.
					return {
						passed: false,
						message: verdict.reply,
						continued: true,
						flags: {
							voiceMatchScore: matchResult.score,
							stagesMatched: matchResult.matchedCount,
							aiJudged: true
						}
					};
				}
			} catch {
				// STT AI call failed — fall through to deterministic fail below.
			}
		}

		// ── 3c. Clear fail — pick reaction by stages matched ────────────

		const reactionIdx = Math.min(matchResult.matchedCount, FAIL_REACTIONS.length - 1);
		const reaction = FAIL_REACTIONS[reactionIdx];

		return {
			passed: false,
			message: reaction + '\n' + FAIL_MESSAGE,
			continued: true, // allow retry
			flags: {
				voiceMatchScore: matchResult.score,
				stagesMatched: matchResult.matchedCount
			}
		};
	}
};

registerChallenge(challenge);
export default challenge;
