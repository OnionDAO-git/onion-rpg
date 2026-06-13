/**
 * POST /api/energy/skip — pay onions for an instant full energy refill (B2).
 *
 * Body: {
 *   hardwareId: string,    // badge hardware id (resolves the operative)
 *   externalId?: string    // optional idempotency key for the onion burn;
 *                          // defaults to a per-call unique key
 * }
 * Resp: { energy: EnergyState }
 *
 * This is the primary onion sink #1: onions flow player -> dev via
 * chargeOnions() (economy flip), then energy is topped to full.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import { skipEnergyWithOnions } from '$lib/server/engine/energy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as { hardwareId?: string; externalId?: string };
	if (!body.hardwareId) error(400, 'hardwareId is required');

	const op = await resolveOperative(body.hardwareId);
	const externalId = body.externalId ?? `${op.id}:energy:skip:${Date.now()}`;
	const energy = await skipEnergyWithOnions(op.id, externalId);

	return json({ energy });
};
