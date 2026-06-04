/**
 * Onion DAO API client — the oRPG server as an EXTERNAL APP to the real
 * currency + registry server (landing-2026 at https://oniondao.dev).
 *
 * Reward flow is ASYNC:
 *   1. createRequest() -> { id, status:'pending' }
 *   2. Attendee approves in their portal.
 *   3. Onion DAO POSTs our callbackUrl (HMAC-signed) or we poll getRequest().
 *   4. verifyCallbackSignature() guards the inbound webhook.
 *
 * Idempotency pair: (ONION_REQUESTER_ID, externalId). Duplicate requests
 * return the existing record instead of creating a new one.
 *
 * See /Users/spacemandev/Projects/oniondao-git/oniondao-badge/software/mods/onion-os/API.md
 */
import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'crypto';

const BASE = () => env.ONION_API_BASE_URL || 'https://oniondao.dev';
const REQUESTER = () => env.ONION_REQUESTER_ID || 'onion-rpg';

export interface OnionProfile {
	name: string;
	handle: string;
	avatarUrl: string | null;
	onionId: number | null;
	solanaWalletAddress: string | null;
	balanceType: 'tokens' | 'points';
	currentOnionPoints: number | null;
	currentOnionTokens: number | null;
}

export type OnionRequestStatus =
	| 'pending'
	| 'awaiting_badge_signature'
	| 'completed'
	| 'denied'
	| 'failed'
	| 'processing';

export interface CreateBurnRequest {
	type: 'burn';
	username: string;
	amount: number;
	externalId: string;
	note?: string;
	metadata?: Record<string, unknown>;
}

export interface CreateTransferRequest {
	type: 'transfer';
	username: string;
	recipientUsername: string;
	amount: number;
	externalId: string;
	note?: string;
	metadata?: Record<string, unknown>;
}

export type CreateOnionRequest = CreateBurnRequest | CreateTransferRequest;

export interface OnionRequestState {
	id: string;
	requestType: 'burn' | 'transfer';
	status: OnionRequestStatus;
	amount: number;
	currencyMode: 'points' | 'tokens' | null;
	solanaSignature: string | null;
	error: string | null;
}

function authHeaders(): Record<string, string> {
	const h: Record<string, string> = { 'Content-Type': 'application/json' };
	if (env.ONION_EXTERNAL_API_KEY) h['Authorization'] = `Bearer ${env.ONION_EXTERNAL_API_KEY}`;
	return h;
}

/** GET /api/public/profile/{username}. Returns null on 404. */
export async function getProfile(username: string): Promise<OnionProfile | null> {
	const res = await fetch(`${BASE()}/api/public/profile/${encodeURIComponent(username)}`, {
		headers: authHeaders()
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`getProfile HTTP ${res.status}: ${await res.text()}`);
	return (await res.json()) as OnionProfile;
}

/**
 * POST /api/public/onions/requests.
 * Always attaches requester, callbackUrl, and callbackSecret from env.
 * On idempotency hit (externalId already exists) the API returns the
 * existing record; we return it unchanged.
 */
export async function createRequest(
	req: CreateOnionRequest
): Promise<{ id: string; status: OnionRequestStatus }> {
	const body: Record<string, unknown> = {
		...req,
		requester: REQUESTER()
	};
	if (env.ONION_CALLBACK_URL) body['callbackUrl'] = env.ONION_CALLBACK_URL;
	if (env.ONION_CALLBACK_SECRET) body['callbackSecret'] = env.ONION_CALLBACK_SECRET;

	const res = await fetch(`${BASE()}/api/public/onions/requests`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`createRequest HTTP ${res.status}: ${text}`);
	}

	const data = (await res.json()) as { id: string; status: OnionRequestStatus };
	return { id: data.id, status: data.status };
}

/** GET /api/public/onions/requests/{id} — poll for async status. */
export async function getRequest(id: string): Promise<OnionRequestState> {
	const res = await fetch(`${BASE()}/api/public/onions/requests/${encodeURIComponent(id)}`, {
		headers: authHeaders()
	});
	if (!res.ok) throw new Error(`getRequest HTTP ${res.status}: ${await res.text()}`);
	return (await res.json()) as OnionRequestState;
}

/**
 * Verify an inbound Onion DAO callback HMAC.
 * Signature = hex( hmac_sha256( ONION_CALLBACK_SECRET, rawBody ) ).
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyCallbackSignature(rawBody: string, signatureHex: string): boolean {
	const secret = env.ONION_CALLBACK_SECRET;
	if (!secret) return false; // secret not configured -> reject all signed callbacks
	const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
	// Both must be the same length for timingSafeEqual.
	if (expected.length !== signatureHex.length) return false;
	return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signatureHex, 'utf8'));
}
