/**
 * Operative roster page. When ?id=<operativeId> is present, also loads that
 * operative's inventory and challenge attempts for the detail panel.
 */
import type { PageServerLoad } from './$types';
import {
	adminListOperatives,
	adminGetOperativeInventory,
	adminGetOperativeAttempts
} from '$lib/server/admin/queries';

export const load: PageServerLoad = async ({ url }) => {
	const selected = url.searchParams.get('id');
	const operatives = await adminListOperatives();

	let detail: {
		inventory: Awaited<ReturnType<typeof adminGetOperativeInventory>>;
		attempts: Awaited<ReturnType<typeof adminGetOperativeAttempts>>;
	} | null = null;

	if (selected) {
		const [inventory, attempts] = await Promise.all([
			adminGetOperativeInventory(selected),
			adminGetOperativeAttempts(selected)
		]);
		detail = { inventory, attempts };
	}

	return { operatives, selectedId: selected, detail };
};
