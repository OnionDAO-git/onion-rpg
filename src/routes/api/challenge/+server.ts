/**
 * POST /api/challenge — begin or submit a challenge.
 *
 * Action is determined by the `action` field in the request body:
 *
 *   action='begin':
 *     Body: { action:'begin', operativeId, challengeId, beaconId? }
 *     Response: { attemptId, content }
 *
 *   action='submit':
 *     Body: { action:'submit', operativeId, challengeId, input, attemptId? }
 *     Response: ChallengeResult
 *
 * Used by the admin UI and by badges with direct HTTP capability (caps.http).
 * Beacon relay uses /api/relay for the ESP-NOW path.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { beginChallenge, submitChallenge } from '$lib/server/engine/index';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as {
		action?: string;
		operativeId?: string;
		challengeId?: string;
		beaconId?: string;
		input?: unknown;
		attemptId?: string;
	};

	if (!body.operativeId) error(400, 'operativeId is required');
	if (!body.challengeId) error(400, 'challengeId is required');

	if (body.action === 'begin') {
		const result = await beginChallenge(body.operativeId, body.challengeId, body.beaconId);
		return json(result);
	}

	if (body.action === 'submit') {
		const result = await submitChallenge(
			body.operativeId,
			body.challengeId,
			body.input,
			body.attemptId
		);
		return json(result);
	}

	error(400, "action must be 'begin' or 'submit'");
};
