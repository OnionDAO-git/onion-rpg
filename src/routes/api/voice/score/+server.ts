/**
 * POST /api/voice/score — transcribe and score a voice submission.
 *
 * Called by the relay engine (or directly from a badge with firmware-ext)
 * after audio has been uploaded to /api/voice and a ref returned.
 *
 * This endpoint:
 *   1. Resolves the audio blob from the in-memory ref store.
 *   2. Runs STT via the configured SttProvider.
 *   3. Runs matchSequence() against the challenge's expected voice sequence
 *      (sequence steps are supplied in the request so this endpoint is
 *      challenge-agnostic).
 *   4. Returns transcript + score + passed verdict.
 *
 * For challenges that use the Storyteller for final verdict (free-form or
 * borderline matches), the calling code (engine / challenge validate()) should
 * follow up with /api/ai/npc.
 *
 * Request body:
 * {
 *   ref: string              // blob ref from POST /api/voice
 *   challengeId: string      // e.g. "1.1"
 *   operativeId?: string
 *   language?: string        // BCP-47 language hint (default: "en")
 *   steps: SequenceStep[]    // expected voice sequence for this challenge
 *   threshold?: number       // match threshold 0..1 (default 0.8)
 *   strict?: boolean         // require all steps (overrides threshold)
 * }
 *
 * Response:
 * {
 *   transcript: string
 *   confidence?: number
 *   passed: boolean
 *   matchedCount: number
 *   totalCount: number
 *   score: number
 *   firstMissingIndex: number
 *   missingLabel?: string
 * }
 *
 * Auth: Bearer BEACON_API_KEY (or open in dev)
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import {
	getSttProvider,
	matchSequence,
	consumeBlobRef,
	normalizeTranscript
} from '$lib/server/ai/stt';
import type { SequenceStep } from '$lib/server/ai/stt';
import type { RequestHandler } from './$types';

interface ScoreRequestBody {
	ref: string;
	challengeId: string;
	operativeId?: string;
	language?: string;
	steps: SequenceStep[];
	threshold?: number;
	strict?: boolean;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	let body: ScoreRequestBody;
	try {
		body = (await request.json()) as ScoreRequestBody;
	} catch {
		error(400, 'Invalid JSON body');
	}

	if (!body.ref) error(400, 'ref is required');
	if (!body.challengeId) error(400, 'challengeId is required');
	if (!Array.isArray(body.steps)) error(400, 'steps must be an array');

	// Consume the audio blob (single-use)
	const audio = consumeBlobRef(body.ref);
	if (!audio) {
		error(404, 'Audio ref not found or expired (TTL: 5 minutes)');
	}

	// Transcribe
	const stt = getSttProvider();
	let sttResult;
	try {
		sttResult = await stt.transcribe(audio, { language: body.language ?? 'en' });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		error(502, `STT provider error: ${msg}`);
	}

	// Score the transcript against the expected sequence
	const matchResult = matchSequence(sttResult.transcript, body.steps, {
		threshold: body.threshold,
		strict: body.strict
	});

	return json({
		transcript: sttResult.transcript,
		normalizedTranscript: normalizeTranscript(sttResult.transcript),
		confidence: sttResult.confidence,
		language: sttResult.language,
		passed: matchResult.passed,
		matchedCount: matchResult.matchedCount,
		totalCount: matchResult.totalCount,
		score: matchResult.score,
		firstMissingIndex: matchResult.firstMissingIndex,
		missingLabel: matchResult.missingLabel
	});
};
