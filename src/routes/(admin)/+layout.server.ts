import { error, redirect } from '@sveltejs/kit';
import { onionLoginRedirect } from '$lib/server/onion/login';
import type { LayoutServerLoad } from './$types';

/**
 * Gate the entire ops console behind an Onion RPG admin login.
 *
 *  - logged out          -> bounce to oniondao.dev/login with a return URL; the
 *    shared `.oniondao.dev` cookie brings them straight back here afterward.
 *  - logged in, no access -> 403. Redirecting a valid session to /login just
 *    bounces them to their own portal, which is more confusing than a clear
 *    "admins only".
 *
 * Onion DAO-wide admins always pass this gate. Non-DAO admins pass only when a
 * DAO admin has granted the local RPG Admin role.
 *
 * The public player guide lives in the (public) group and is unaffected.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, onionLoginRedirect(url));
	}
	if (!locals.user.canAdminRpg) {
		error(403, 'RPG Admin access required.');
	}
	return { user: locals.user };
};
