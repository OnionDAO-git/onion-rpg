/**
 * POST /api/voice — out-of-band audio upload from the beacon.
 *
 * Audio cannot travel over ESP-NOW (too large). Instead:
 *   1. The beacon captures / receives the audio blob from the badge.
 *   2. The beacon POSTs it here as multipart/form-data.
 *   3. The server stores it under a ref UUID and returns that ref.
 *   4. The beacon puts the ref in a VOICE_CAPTURE_SUBMIT ESP-NOW message
 *      so the server can later transcribe and score it.
 *
 * Alternatively, a WiFi-connected badge (caps.http, via onion.http_post)
 * may POST audio directly here using the same contract.
 *
 * Request: multipart/form-data
 *   audio: Blob/File     — the audio data (wav/ogg/webm/pcm)
 *   challengeId: string  — which challenge this is for (informational)
 *   operativeId?: string — optional, for logging
 *
 * Response:
 * {
 *   ref: string   // UUID to pass in VOICE_CAPTURE_SUBMIT
 * }
 *
 * Auth: Bearer BEACON_API_KEY (or open in dev)
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { storeBlobRef } from '$lib/server/ai/stt';
import { randomUUID } from 'crypto';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data')) {
		error(400, 'Expected multipart/form-data');
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		error(400, 'Failed to parse multipart form data');
	}

	const audioFile = formData.get('audio');
	if (!audioFile || !(audioFile instanceof Blob)) {
		error(400, 'audio field (Blob) is required');
	}

	const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
	if (audioBytes.byteLength === 0) {
		error(400, 'audio blob is empty');
	}

	const ref = randomUUID();
	const mimeType = audioFile.type || 'audio/wav';
	storeBlobRef(ref, audioBytes, mimeType);

	return json({ ref });
};
