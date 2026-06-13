/**
 * POST /api/gear — equip / unequip / open chest / forge (B3).
 *
 * Body: { hardwareId, action, ... }
 *   { action: 'equip',   catalogId }   -> equip owned gear into its slot
 *   { action: 'unequip', slot }        -> clear a loadout slot
 *   { action: 'open',    catalogId }   -> open a chest, roll loot
 *   { action: 'forge',   recipeId }    -> run a forge recipe
 *
 * Thin wrapper over engine/gear.ts; the badge wire-protocol MsgTypes for these
 * are future work (the badge can call this over HTTP today).
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import { equip, unequip, openChest, forge, getLoadout } from '$lib/server/engine/gear';
import type { GearSlot } from '$lib/shared/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as {
		hardwareId?: string;
		action?: string;
		catalogId?: string;
		slot?: GearSlot;
		recipeId?: string;
	};
	if (!body.hardwareId) error(400, 'hardwareId is required');
	const op = await resolveOperative(body.hardwareId);

	try {
		switch (body.action) {
			case 'equip': {
				if (!body.catalogId) error(400, 'catalogId is required');
				return json(await equip(op.id, body.catalogId));
			}
			case 'unequip': {
				if (!body.slot) error(400, 'slot is required');
				return json({ loadout: await unequip(op.id, body.slot) });
			}
			case 'open': {
				if (!body.catalogId) error(400, 'catalogId is required');
				return json(await openChest(op.id, body.catalogId));
			}
			case 'forge': {
				if (!body.recipeId) error(400, 'recipeId is required');
				return json(await forge(op.id, body.recipeId));
			}
			default:
				error(400, `unknown action: ${body.action}`);
		}
	} catch (e) {
		// Domain errors (not owned, no chest, missing inputs) -> 409 with message.
		const msg = e instanceof Error ? e.message : String(e);
		error(409, msg);
	}
};
