import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BASE = () => env.ONION_API_BASE_URL || 'https://oniondao.dev';

/**
 * Sign out of the shared Onion DAO session.
 *
 *  1. Forward the cookie to oniondao.dev's logout so the server-side session
 *     row is destroyed. A browser cross-site POST wouldn't carry the SameSite=
 *     Lax cookie, but a server-to-server fetch with an explicit header does.
 *  2. Clear the `session` cookie under both the apex-domain and host-only
 *     scopes so it's gone from the browser for every *.oniondao.dev app.
 *
 * GET (not POST) so a plain link/navigation can trigger it; it has no
 * destructive effect beyond ending the caller's own session.
 */
export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('session');
	if (token) {
		try {
			await fetch(`${BASE()}/api/auth/logout`, {
				method: 'POST',
				headers: { cookie: `session=${token}` }
			});
		} catch {
			// Best-effort: we still clear the local cookie below.
		}
	}

	const domain = env.AUTH_COOKIE_DOMAIN;
	cookies.delete('session', { path: '/', domain });
	cookies.delete('session', { path: '/' });

	redirect(303, BASE());
};
