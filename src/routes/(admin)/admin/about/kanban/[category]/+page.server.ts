import type { PageServerLoad, Actions } from './$types';
import {
	getKanbanItems, getDevelopers,
	claimItem, unclaimItem, moveItem, editItem, addComment,
	CATEGORY_META, type KanbanCategory, type KanbanStatus,
} from '$lib/server/admin/kanban';
import { fail, error } from '@sveltejs/kit';

const VALID_CATEGORIES = Object.keys(CATEGORY_META) as KanbanCategory[];

export const load: PageServerLoad = async ({ params }) => {
	const category = params.category as KanbanCategory;
	if (!VALID_CATEGORIES.includes(category)) error(404, 'Unknown category');

	const [items, developers] = await Promise.all([
		getKanbanItems(category),
		getDevelopers(),
	]);
	return { category, items, developers, meta: CATEGORY_META[category] };
};

export const actions: Actions = {
	claim: async ({ request }) => {
		const fd = await request.formData();
		const itemId     = String(fd.get('itemId')     ?? '');
		const devId      = String(fd.get('devId')      ?? '');
		const dueDate    = String(fd.get('dueDate')    ?? '');
		const commitment = String(fd.get('commitment') ?? '');
		if (!itemId || !devId || !dueDate)
			return fail(400, { claimError: 'Developer, due date and commitment are required.' });
		await claimItem(itemId, devId, commitment, dueDate);
		return { claimed: true };
	},

	unclaim: async ({ request }) => {
		const fd = await request.formData();
		const itemId = String(fd.get('itemId') ?? '');
		if (!itemId) return fail(400, {});
		await unclaimItem(itemId);
		return { unclaimed: true };
	},

	move: async ({ request }) => {
		const fd     = await request.formData();
		const itemId = String(fd.get('itemId') ?? '');
		const status = String(fd.get('status') ?? '') as KanbanStatus;
		const valid: KanbanStatus[] = ['backlog', 'in_progress', 'review', 'done'];
		if (!itemId || !valid.includes(status)) return fail(400, {});
		await moveItem(itemId, status);
		return { moved: true };
	},

	editItem: async ({ request }) => {
		const fd          = await request.formData();
		const itemId      = String(fd.get('itemId')      ?? '');
		const title       = String(fd.get('title')       ?? '').trim();
		const description = String(fd.get('description') ?? '').trim();
		const priority    = String(fd.get('priority')    ?? '').trim();
		if (!itemId) return fail(400, { editError: 'Missing item ID.' });
		if (!title)  return fail(400, { editError: 'Title cannot be empty.' });
		await editItem(itemId, { title, description, priority: priority || undefined });
		return { edited: true };
	},

	comment: async ({ request }) => {
		const fd       = await request.formData();
		const itemId   = String(fd.get('itemId')   ?? '');
		const devId    = String(fd.get('devId')    ?? '') || null;
		const devName  = String(fd.get('devName')  ?? 'Anonymous');
		const devInitials = String(fd.get('devInitials') ?? '?');
		const devColor = String(fd.get('devColor') ?? '#4a4a60');
		const body     = String(fd.get('body')     ?? '').trim();
		if (!itemId || !body) return fail(400, { commentError: 'Comment body is required.' });
		await addComment(itemId, devId, devName, devInitials, devColor, body);
		return { commented: true };
	},
};
