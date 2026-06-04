/**
 * /api/beacon — beacon registration and heartbeat.
 *
 * POST — register or upsert a beacon (beacon hello / sim setup).
 * Body: {
 *   id: string,           // beacon id, e.g. 'b-ketchup-01'
 *   challengeId?: string,
 *   name: string,
 *   landmark?: string,
 *   lat?: number, lon?: number,
 *   espnowMac?: string,
 *   source?: 'hardware' | 'sim'
 * }
 *
 * PATCH — heartbeat / mark online.
 * Body: { id: string, online: boolean }
 *
 * GET — list all beacons (admin / sim).
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { sql } from '$lib/server/db/index';
import type { RequestHandler } from './$types';

interface BeaconRow {
	id: string;
	challengeId: string | null;
	name: string;
	landmark: string | null;
	lat: number | null;
	lon: number | null;
	espnowMac: string | null;
	online: boolean;
	source: string;
	lastSeenAt: string | null;
	createdAt: string;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	const beacons = await sql<BeaconRow[]>`SELECT * FROM beacons ORDER BY id`;
	return json({ beacons });
};

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as {
		id?: string;
		challengeId?: string;
		name?: string;
		landmark?: string;
		lat?: number;
		lon?: number;
		espnowMac?: string;
		source?: string;
	};

	if (!body.id) error(400, 'id is required');
	if (!body.name) error(400, 'name is required');

	const [row] = await sql<BeaconRow[]>`
		INSERT INTO beacons
			(id, challenge_id, name, landmark, lat, lon, espnow_mac, source, online, last_seen_at)
		VALUES (
			${body.id},
			${body.challengeId ?? null},
			${body.name},
			${body.landmark ?? null},
			${body.lat ?? null},
			${body.lon ?? null},
			${body.espnowMac ?? null},
			${body.source ?? 'hardware'},
			TRUE,
			now()
		)
		ON CONFLICT (id) DO UPDATE SET
			challenge_id  = COALESCE(EXCLUDED.challenge_id, beacons.challenge_id),
			name          = EXCLUDED.name,
			landmark      = COALESCE(EXCLUDED.landmark, beacons.landmark),
			lat           = COALESCE(EXCLUDED.lat, beacons.lat),
			lon           = COALESCE(EXCLUDED.lon, beacons.lon),
			espnow_mac    = COALESCE(EXCLUDED.espnow_mac, beacons.espnow_mac),
			source        = EXCLUDED.source,
			online        = TRUE,
			last_seen_at  = now()
		RETURNING *
	`;

	return json({ beacon: row });
};

export const PATCH: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as { id?: string; online?: boolean };
	if (!body.id) error(400, 'id is required');

	const online = body.online ?? true;
	const [row] = await sql<BeaconRow[]>`
		UPDATE beacons SET online = ${online}, last_seen_at = now()
		WHERE id = ${body.id}
		RETURNING *
	`;

	if (!row) error(404, 'beacon not found');
	return json({ beacon: row });
};
