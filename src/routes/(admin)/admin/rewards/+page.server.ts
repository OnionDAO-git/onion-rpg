/**
 * Reward audit — Onion DAO request ledger + status breakdown.
 * Filters by ?status=<value>. Defaults to all.
 */
import type { PageServerLoad } from './$types';
import { adminListRewards } from '$lib/server/admin/queries';

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status') ?? undefined;
	const rewards = await adminListRewards({ limit: 300, status });
	return { rewards, statusFilter: status ?? '' };
};
