import { error, redirect } from '@sveltejs/kit';
import { getDevelopers } from '$lib/server/admin/kanban';
import { onionLoginRedirect } from '$lib/server/onion/login';
import type { LayoutServerLoad } from './$types';

/**
 * Gate the ops console behind an Onion DAO admin login, then load the
 * developer context used by the admin Kanban tools.
 */
export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) {
		redirect(302, onionLoginRedirect(url));
	}
	if (!locals.user.isAdmin) {
		error(403, 'Admin access required - the ops console is for Onion DAO admins only.');
	}

	const allDevelopers = await getDevelopers();
	const currentDevId = cookies.get('kanban_dev') ?? null;
	const currentDev = allDevelopers.find((developer) => developer.id === currentDevId) ?? null;

	return { user: locals.user, allDevelopers, currentDev };
};
