import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	canManageRpgAdmins,
	grantRpgAdmin,
	listRpgAdminGrants,
	revokeRpgAdmin
} from '$lib/server/admin/rpg-admins';

function clean(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length ? trimmed : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!canManageRpgAdmins(locals.user)) {
		error(403, 'Only Onion DAO admins can manage RPG Admin grants.');
	}
	return {
		grants: await listRpgAdminGrants()
	};
};

export const actions: Actions = {
	grant: async ({ locals, request }) => {
		if (!canManageRpgAdmins(locals.user)) {
			error(403, 'Only Onion DAO admins can manage RPG Admin grants.');
		}

		const form = await request.formData();
		const userId = clean(form.get('userId'));
		if (!userId) {
			return fail(400, {
				message: 'Onion DAO user ID is required.',
				values: Object.fromEntries(form)
			});
		}

		await grantRpgAdmin({
			userId,
			email: clean(form.get('email')),
			name: clean(form.get('name')),
			handle: clean(form.get('handle')),
			avatarUrl: clean(form.get('avatarUrl')),
			grantedBy: locals.user
		});
		redirect(303, '/admin/rpg-admins');
	},

	revoke: async ({ locals, request }) => {
		if (!canManageRpgAdmins(locals.user)) {
			error(403, 'Only Onion DAO admins can manage RPG Admin grants.');
		}

		const form = await request.formData();
		const userId = clean(form.get('userId'));
		if (!userId) {
			return fail(400, { message: 'Grant user ID is required.' });
		}

		await revokeRpgAdmin(userId);
		redirect(303, '/admin/rpg-admins');
	}
};
