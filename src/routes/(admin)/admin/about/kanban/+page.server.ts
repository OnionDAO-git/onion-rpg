import type { PageServerLoad, Actions } from './$types';
import { getCategorySummaries, getDevelopers, addDeveloper } from '$lib/server/admin/kanban';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	const [summaries, developers] = await Promise.all([
		getCategorySummaries(),
		getDevelopers(),
	]);
	return { summaries, developers };
};

export const actions: Actions = {
	addDev: async ({ request }) => {
		const fd = await request.formData();
		const name     = String(fd.get('name')     ?? '').trim();
		const initials = String(fd.get('initials') ?? '').trim();
		const color    = String(fd.get('color')    ?? '#8ecf5e').trim();
		if (!name || !initials) return fail(400, { error: 'Name and initials are required.' });
		await addDeveloper(name, initials, color);
		return { ok: true };
	},
};
