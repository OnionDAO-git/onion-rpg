/**
 * Admin dashboard — loads summary stats + gauge. All reads only.
 */
import type { PageServerLoad } from './$types';
import { adminGetGauge, adminDashboardStats } from '$lib/server/admin/queries';

export const load: PageServerLoad = async () => {
	const [gauge, stats] = await Promise.all([adminGetGauge(), adminDashboardStats()]);
	return { gauge, stats };
};
