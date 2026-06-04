/**
 * Bearer auth for the beacon/badge-facing API. Beacons present BEACON_API_KEY.
 * STUB — engine/foundations seam; agents reuse this guard in +server handlers.
 */
import { env } from '$env/dynamic/private';

/** Returns true if the request carries a valid beacon bearer key. */
export function isAuthorizedBeacon(request: Request): boolean {
	const expected = env.BEACON_API_KEY;
	if (!expected) return true; // open in local dev when unset (mirrors landing)
	const header = request.headers.get('authorization') ?? '';
	const token = header.replace(/^Bearer\s+/i, '');
	return token === expected;
}
