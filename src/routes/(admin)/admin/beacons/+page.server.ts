/**
 * Beacon fleet page — loads all beacons with online/offline status.
 */
import type { PageServerLoad } from './$types';
import { adminListBeacons } from '$lib/server/admin/queries';

export const load: PageServerLoad = async () => {
	const beacons = await adminListBeacons();
	return { beacons };
};
