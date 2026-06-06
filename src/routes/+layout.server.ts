import type { LayoutServerLoad } from './$types';

/**
 * Expose the resolved Onion DAO identity (from the shared `session` cookie,
 * populated by hooks) to every page — the public guide renders a login/profile
 * chip and the admin console shows the signed-in user.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};
