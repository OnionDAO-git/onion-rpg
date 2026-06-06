import type { Handle } from '@sveltejs/kit';
import { fetchSessionUser } from '$lib/server/onion/session';

/**
 * Resolve the shared Onion DAO login on every request so both the public player
 * guide and the admin console know who is visiting. The `session` cookie is
 * issued by oniondao.dev and shared across `.oniondao.dev`; we validate it via
 * the onion API because this app has a separate database.
 *
 * Hooks only POPULATES identity — route protection lives in
 * `src/routes/(admin)/+layout.server.ts`. The beacon/badge API guard is
 * separate (per-endpoint bearer key in `$lib/server/api/auth.ts`).
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await fetchSessionUser(event.cookies.get('session'));
	return resolve(event);
};
