import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

const LOGIN_BASE = () => env.ONION_API_BASE_URL || 'https://oniondao.dev';

/**
 * Gate the entire ops console behind an Onion DAO admin login.
 *
 *  - logged out          -> bounce to oniondao.dev/login with a return URL; the
 *    shared `.oniondao.dev` cookie brings them straight back here afterward.
 *  - logged in, not admin -> 403. Redirecting a valid session to /login just
 *    bounces them to their own portal, which is more confusing than a clear
 *    "admins only".
 *
 * The public player guide lives in the (public) group and is unaffected.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const returnTo = encodeURIComponent(url.href);
		redirect(302, `${LOGIN_BASE()}/login?redirectTo=${returnTo}`);
	}
	if (!locals.user.isAdmin) {
		error(403, 'Admin access required — the ops console is for Onion DAO admins only.');
	}
	return { user: locals.user };
};
