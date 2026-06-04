/**
 * POST /api/operative/register — link a badge identity to an Onion DAO account.
 * Body: {
 *   operativeId: string,    // UUID from the operatives table
 *   onionId?: number,       // Onion DAO numeric account id
 *   username?: string,      // Onion DAO handle (for onion reward transfers)
 *   callsign?: string,      // display name in-game
 *   attestPubkey?: string   // RESERVED hex ed25519 pubkey; future signing hook
 * }
 *
 * Sets registered=true. The `attestPubkey` is a reserved forward-looking seam:
 * no shipped badge can sign rolls (no Lua signing primitive exists), so it is
 * not currently sent or used. Combat is server-authoritative.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { registerOperative, getGameState } from '$lib/server/engine/index';
import { beginChallenge } from '$lib/server/engine/index';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as {
		operativeId?: string;
		onionId?: number;
		username?: string;
		callsign?: string;
		attestPubkey?: string;
	};

	if (!body.operativeId) error(400, 'operativeId is required');

	const op = await registerOperative(body.operativeId, {
		onionId: body.onionId,
		username: body.username,
		callsign: body.callsign,
		attestPubkey: body.attestPubkey
	});

	// Auto-begin Act 0 challenge 0.1 so the badge sees the tutorial right away.
	let firstChallenge = null;
	try {
		firstChallenge = await beginChallenge(op.id, '0.1');
	} catch {
		// Challenge may not be registered yet (test env) — not fatal.
	}

	const gs = await getGameState(op.id);

	return json({
		operative: op,
		state: gs,
		firstChallenge
	});
};
