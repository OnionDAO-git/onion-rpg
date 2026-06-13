/**
 * POST /api/trade — basic item/Cores transfer between two operatives (B7).
 *
 * Body: { fromHardwareId, toHardwareId, catalogId, qty? }
 *
 * Test-grade plumbing: a one-shot transfer with no escrow/confirmation (the
 * reason operatives talk to each other IRL). Sender must hold the full quantity.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import { transferItem } from '$lib/server/engine/inventory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	const body = (await request.json()) as {
		fromHardwareId?: string;
		toHardwareId?: string;
		catalogId?: string;
		qty?: number;
	};
	if (!body.fromHardwareId || !body.toHardwareId) error(400, 'fromHardwareId and toHardwareId are required');
	if (!body.catalogId) error(400, 'catalogId is required');

	const from = await resolveOperative(body.fromHardwareId);
	const to = await resolveOperative(body.toHardwareId);
	try {
		return json(await transferItem(from.id, to.id, body.catalogId, body.qty ?? 1));
	} catch (e) {
		error(409, e instanceof Error ? e.message : String(e));
	}
};
