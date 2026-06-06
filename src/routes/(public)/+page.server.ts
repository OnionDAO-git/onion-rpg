import type { PageServerLoad } from './$types';
import { buildGuide } from '$lib/server/guide';
import { HOW_TO_PLAY, ACTS } from '$lib/server/guide/content';

/**
 * Public player-guide landing. No auth required — `user` comes from the root
 * layout so the header can show a login/profile chip.
 */
export const load: PageServerLoad = async () => {
	return { howToPlay: HOW_TO_PLAY, acts: ACTS, challenges: buildGuide() };
};
