/**
 * /api/colony — the global Colony layer (B4).
 *
 *   GET  /api/colony                 -> { level, contributors, needed }
 *   POST /api/colony { hardwareId }  -> contribute Cores at a colony beacon
 *
 * Contributing spends Cores; the Nth distinct contributor tips the Colony to
 * the next level for everyone and hands every contributor a first-mover chest.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import { getColonyStatus, contributeCores } from '$lib/server/engine/colony';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await getColonyStatus());
};

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as { hardwareId?: string };
	if (!body.hardwareId) error(400, 'hardwareId is required');
	const op = await resolveOperative(body.hardwareId);

	try {
		return json(await contributeCores(op.id));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		error(409, msg);
	}
};
