import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { devId } = await request.json() as { devId: string };
	if (devId) {
		cookies.set('kanban_dev', devId, {
			path: '/',
			maxAge: 60 * 60 * 24 * 90,
			httpOnly: false,
			sameSite: 'lax',
		});
	} else {
		cookies.delete('kanban_dev', { path: '/' });
	}
	return json({ ok: true });
};
