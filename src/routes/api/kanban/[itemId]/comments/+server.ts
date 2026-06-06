import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getItemComments } from '$lib/server/admin/kanban';

export const GET: RequestHandler = async ({ params }) => {
	const comments = await getItemComments(params.itemId);
	return json(comments);
};
