import { redirect } from '@sveltejs/kit';
import { onionLoginRedirect } from '$lib/server/onion/login';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const redirectTo = url.searchParams.get('redirectTo');

	if (locals.user) {
		redirect(
			303,
			redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'
		);
	}

	redirect(302, onionLoginRedirect(url, redirectTo));
};
