/**
 * POST /api/operative — create/resolve an operative from a badge identity.
 * Body: { hardwareId: string, onionId?: number }
 * Returns: Operative row + initial game state snapshot.
 *
 * Called when a badge first connects (before it knows if it's registered) or
 * when it comes back online. Idempotent.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative, getGameState } from '$lib/server/engine/index';
import { listInventory } from '$lib/server/engine/inventory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as { hardwareId?: string; onionId?: number };
	if (!body.hardwareId) error(400, 'hardwareId is required');

	const op = await resolveOperative(body.hardwareId, body.onionId);
	const gs = await getGameState(op.id);
	const inventory = await listInventory(op.id);

	return json({
		operative: op,
		state: gs,
		inventory
	});
};
