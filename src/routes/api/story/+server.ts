/**
 * GET /api/story?hardwareId=... — the player's current storyline position (B5).
 *
 * Assigns an arc on first read (the director picks one at random). Advancement
 * is automatic on challenge completion + Colony gates, so there is no POST.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import { getStory } from '$lib/server/engine/director';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	const hardwareId = url.searchParams.get('hardwareId');
	if (!hardwareId) error(400, 'hardwareId query param is required');
	const op = await resolveOperative(hardwareId);
	return json(await getStory(op.id));
};
