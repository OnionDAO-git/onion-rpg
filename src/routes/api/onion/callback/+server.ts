/**
 * POST /api/onion/callback — the Onion DAO async reward webhook.
 *
 * The Onion API POSTs here after a reward request is approved / denied / failed.
 * Header: X-Onion-Signature = hex(hmac_sha256(callbackSecret, rawBody))
 * Body: { id: string, status: OnionRequestStatus, ... }
 *
 * We verify the HMAC and reconcile the onion_rewards ledger row.
 */
import { json, error } from '@sveltejs/kit';
import { verifyCallbackSignature } from '$lib/server/onion/client';
import { sql } from '$lib/server/db/index';
import type { OnionRequestStatus } from '$lib/server/onion/client';
import type { RequestHandler } from './$types';

interface CallbackBody {
	id: string;          // Onion DAO request id
	status: OnionRequestStatus;
	currencyMode?: 'points' | 'tokens' | null;
	solanaSignature?: string | null;
	error?: string | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.text();

	// Verify HMAC if a signature header is present. If ONION_CALLBACK_SECRET is
	// not configured we skip verification (dev mode only).
	const sig = request.headers.get('x-onion-signature');
	if (sig && !verifyCallbackSignature(raw, sig)) {
		error(401, 'bad signature');
	}

	let data: CallbackBody;
	try {
		data = JSON.parse(raw) as CallbackBody;
	} catch {
		error(400, 'invalid JSON body');
	}

	if (!data.id || !data.status) {
		error(400, 'body must include id and status');
	}

	// Reconcile the onion_rewards row. The Onion API request id is stored as
	// onion_request_id on our side.
	const [updated] = await sql<{ id: string }[]>`
		UPDATE onion_rewards SET
			status           = ${data.status},
			currency_mode    = ${data.currencyMode ?? null},
			solana_signature = ${data.solanaSignature ?? null},
			error            = ${data.error ?? null},
			updated_at       = now()
		WHERE onion_request_id = ${data.id}
		RETURNING id
	`;

	if (!updated) {
		// Could be a race where the row hasn't been written yet, or an unknown id.
		// Return 200 so the Onion API doesn't retry indefinitely. Log for ops.
		console.warn(`[onion/callback] no onion_rewards row for request id: ${data.id}`);
	}

	return json({ ok: true });
};
