/**
 * GET /api/rewards?operativeId=<uuid> — list onion reward requests for an operative.
 * Returns recent onion_rewards rows so the badge can poll async status.
 *
 * Also supports POST for direct reward claiming (admin / sim use).
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { sql } from '$lib/server/db/index';
import { getRequest } from '$lib/server/onion/client';
import type { RequestHandler } from './$types';

interface RewardRow {
	id: string;
	operativeId: string;
	challengeId: string | null;
	requestType: string;
	amount: number;
	externalId: string;
	onionRequestId: string | null;
	status: string;
	currencyMode: string | null;
	solanaSignature: string | null;
	error: string | null;
	createdAt: string;
	updatedAt: string;
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const operativeId = url.searchParams.get('operativeId');
	if (!operativeId) error(400, 'operativeId query param required');

	const rows = await sql<RewardRow[]>`
		SELECT * FROM onion_rewards
		WHERE operative_id = ${operativeId}
		ORDER BY created_at DESC
		LIMIT 50
	`;

	return json({ rewards: rows });
};

/**
 * POST /api/rewards/poll — refresh status of a specific reward from the Onion API.
 * Body: { onionRequestId: string }
 * Useful when the callback hasn't arrived yet.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as { onionRequestId?: string };
	if (!body.onionRequestId) error(400, 'onionRequestId required');

	// Fetch live status from Onion DAO.
	const state = await getRequest(body.onionRequestId);

	// Reconcile.
	const [updated] = await sql<{ id: string }[]>`
		UPDATE onion_rewards SET
			status           = ${state.status},
			currency_mode    = ${state.currencyMode},
			solana_signature = ${state.solanaSignature},
			error            = ${state.error},
			updated_at       = now()
		WHERE onion_request_id = ${body.onionRequestId}
		RETURNING id
	`;

	return json({ updated: !!updated, state });
};
