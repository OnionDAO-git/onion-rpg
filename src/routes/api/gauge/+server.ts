/**
 * GET /api/gauge — the shared festival onion-supply win-bar.
 * Public, read-only. Returns { current: number, max: number }.
 * Used by venue dashboards and badges to show collective progress.
 */
import { json } from '@sveltejs/kit';
import { getGauge } from '$lib/server/onion/gauge';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const gauge = await getGauge();
	return json(gauge);
};
