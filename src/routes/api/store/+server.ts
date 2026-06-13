/**
 * /api/store — colony-tiered store (B7).
 *
 *   GET  /api/store?hardwareId=...           -> offers unlocked at the colony level
 *   POST /api/store { hardwareId, offerId, externalId? } -> buy (onion sink)
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import { listStore, buyFromStore } from '$lib/server/engine/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	return json({ offers: await listStore() });
};

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	const body = (await request.json()) as { hardwareId?: string; offerId?: string; externalId?: string };
	if (!body.hardwareId) error(400, 'hardwareId is required');
	if (!body.offerId) error(400, 'offerId is required');
	const op = await resolveOperative(body.hardwareId);
	const externalId = body.externalId ?? `${op.id}:${body.offerId}:${Date.now()}`;
	try {
		return json(await buyFromStore(op.id, body.offerId, externalId));
	} catch (e) {
		error(409, e instanceof Error ? e.message : String(e));
	}
};
