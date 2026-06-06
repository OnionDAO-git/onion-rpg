import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { guideChallenge } from '$lib/server/guide';

/** Per-challenge public hint page. */
export const load: PageServerLoad = async ({ params }) => {
	const challenge = guideChallenge(params.id);
	if (!challenge) {
		error(404, `No challenge "${params.id}" in the guide.`);
	}
	return { challenge };
};
