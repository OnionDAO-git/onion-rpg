/**
 * Operative roster page. When ?id=<operativeId> is present, also loads that
 * operative's inventory and challenge attempts for the detail panel.
 */
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	adminListOperatives,
	adminGetOperativeInventory,
	adminGetOperativeAttempts,
	adminGetOperativeState
} from '$lib/server/admin/queries';
import {
	adminBypassChallenge,
	adminCreateHint,
	adminGrantCatalogItem,
	adminSetCurrentAct
} from '$lib/server/admin/interventions';
import { CATALOG } from '$lib/server/challenges/catalog';
import { allChallenges } from '$lib/server/challenges/registry';

export const load: PageServerLoad = async ({ url }) => {
	const selected = url.searchParams.get('id');
	const operatives = await adminListOperatives();

	let detail: {
		inventory: Awaited<ReturnType<typeof adminGetOperativeInventory>>;
		attempts: Awaited<ReturnType<typeof adminGetOperativeAttempts>>;
		state: Awaited<ReturnType<typeof adminGetOperativeState>>;
	} | null = null;

	if (selected) {
		const [inventory, attempts, state] = await Promise.all([
			adminGetOperativeInventory(selected),
			adminGetOperativeAttempts(selected),
			adminGetOperativeState(selected)
		]);
		detail = { inventory, attempts, state };
	}

	const catalog = Object.values(CATALOG)
		.map((entry) => ({ id: entry.catalogId, name: entry.name, kind: entry.kind }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const challenges = allChallenges().map((challenge) => ({
		id: challenge.id,
		name: challenge.name,
		act: challenge.act
	}));

	return { operatives, selectedId: selected, detail, catalog, challenges };
};

function requiredString(data: FormData, key: string): string {
	const value = data.get(key);
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`);
	return value.trim();
}

async function runAction(
	request: Request,
	fn: (data: FormData, operativeId: string) => Promise<void>
) {
	const data = await request.formData();
	try {
		const operativeId = requiredString(data, 'operativeId');
		await fn(data, operativeId);
		return { success: true };
	} catch (error) {
		return fail(400, { success: false, message: error instanceof Error ? error.message : 'Action failed' });
	}
}

export const actions: Actions = {
	createHint: ({ request }) =>
		runAction(request, async (data, operativeId) => {
			const text = requiredString(data, 'text');
			const challengeId = String(data.get('challengeId') ?? '').trim() || null;
			await adminCreateHint(operativeId, text, challengeId);
		}),
	grantItem: ({ request }) =>
		runAction(request, async (data, operativeId) => {
			const catalogId = requiredString(data, 'catalogId');
			const qty = Math.max(1, Math.min(99, Number(data.get('qty') ?? 1) || 1));
			await adminGrantCatalogItem(operativeId, catalogId, qty);
		}),
	setAct: ({ request }) =>
		runAction(request, async (data, operativeId) => {
			const act = Number(data.get('act'));
			if (!Number.isInteger(act) || act < 0 || act > 4) throw new Error('Act must be between 0 and 4');
			await adminSetCurrentAct(operativeId, act);
		}),
	bypassChallenge: ({ request }) =>
		runAction(request, async (data, operativeId) => {
			const challengeId = requiredString(data, 'challengeId');
			const reason = requiredString(data, 'reason');
			await adminBypassChallenge(operativeId, challengeId, reason);
		})
};
