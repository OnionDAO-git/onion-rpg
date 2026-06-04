/**
 * POST /api/combat — open or advance a server-authoritative combat session.
 *
 * Actions:
 *   action='open':  Body: { action:'open', operativeId, challengeId, attemptId?,
 *                           enemyHp?, operativeHp?, wavesRequired?, ttlSeconds? }
 *                   Response: CombatSession (includes serverNonce for badge)
 *
 *   action='roll':  Body: { action:'roll', sessionId, roll?: {wave,roll,dmg,sig},
 *                           attestPubkey? }
 *                   Response: updated CombatSession
 *
 * Direct HTTP path (caps.http) — badge can call this without the beacon relay.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { openCombat, applyRoll, getSession } from '$lib/server/engine/combat';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as {
		action?: string;
		operativeId?: string;
		challengeId?: string;
		attemptId?: string;
		enemyHp?: number;
		operativeHp?: number;
		wavesRequired?: number;
		ttlSeconds?: number;
		// roll action
		sessionId?: string;
		roll?: { wave: number; roll: number; dmg: number; sig: string };
		attestPubkey?: string;
	};

	if (body.action === 'open') {
		if (!body.operativeId) error(400, 'operativeId required');
		if (!body.challengeId) error(400, 'challengeId required');
		const session = await openCombat({
			operativeId: body.operativeId,
			challengeId: body.challengeId,
			attemptId: body.attemptId,
			enemyHp: body.enemyHp,
			operativeHp: body.operativeHp,
			wavesRequired: body.wavesRequired,
			ttlSeconds: body.ttlSeconds
		});
		return json(session);
	}

	if (body.action === 'roll') {
		if (!body.sessionId) error(400, 'sessionId required');
		const session = await applyRoll(body.sessionId, body.roll, body.attestPubkey);
		return json(session);
	}

	// GET-style fallback: return session by id.
	if (body.action === 'get') {
		if (!body.sessionId) error(400, 'sessionId required');
		const session = await getSession(body.sessionId);
		if (!session) error(404, 'session not found');
		return json(session);
	}

	error(400, "action must be 'open', 'roll', or 'get'");
};
