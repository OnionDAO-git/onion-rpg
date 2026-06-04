/**
 * GET /api/state?operativeId=<uuid> — full progression state for a badge.
 * Returns operative, game_state (act, challenge_status, hp, flags), and inventory.
 * Used by badges on reconnect and by the admin UI.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { getOperative, getGameState } from '$lib/server/engine/index';
import { listInventory } from '$lib/server/engine/inventory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const operativeId = url.searchParams.get('operativeId');
	if (!operativeId) error(400, 'operativeId query param required');

	const op = await getOperative(operativeId);
	if (!op) error(404, 'operative not found');

	const [gs, inventory] = await Promise.all([
		getGameState(operativeId),
		listInventory(operativeId)
	]);

	return json({ operative: op, state: gs, inventory });
};
