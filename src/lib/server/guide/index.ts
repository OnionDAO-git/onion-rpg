/**
 * Public-guide view model: joins the live challenge registry with the curated
 * hint content into a plain, serializable shape safe to send to the browser.
 *
 * The registry descriptors carry a `validate` function and other server-only
 * bits, so we never ship them directly — we project just the player-facing
 * fields here.
 */
import { allChallenges } from '$lib/server/challenges/registry';
import { CATALOG } from '$lib/server/challenges/catalog';
import type { RewardSpec } from '$lib/shared/types';
import { CHALLENGE_HINTS, type ChallengeHint } from './content';

export interface GuideReward {
	label: string;
}

export interface GuideChallenge {
	id: string;
	act: number;
	name: string;
	type: string;
	/** Resolved names of catalog items required to begin (credential gating). */
	requires: string[];
	rewards: GuideReward[];
	lesson: string;
	mechanic: string;
	hint: string;
}

function rewardLabel(r: RewardSpec): GuideReward {
	switch (r.kind) {
		case 'onions':
			return { label: `${r.amount} Onions` };
		case 'gauge':
			return { label: `+${r.amount} to the city supply gauge` };
		case 'inventory': {
			const entry = CATALOG[r.catalogId];
			const name = entry?.name ?? r.catalogId;
			return { label: r.qty && r.qty > 1 ? `${name} ×${r.qty}` : name };
		}
	}
}

/** All challenges, sorted by id, as public guide cards. */
export function buildGuide(): GuideChallenge[] {
	return allChallenges().map((c) => {
		const h: ChallengeHint | undefined = CHALLENGE_HINTS[c.id];
		return {
			id: c.id,
			act: c.act,
			name: c.name,
			type: c.type,
			requires: c.requires.map((id) => CATALOG[id]?.name ?? id),
			rewards: c.rewards.map(rewardLabel),
			lesson: h?.lesson ?? '',
			mechanic: h?.mechanic ?? '',
			hint: h?.hint ?? ''
		};
	});
}

/** A single challenge by id, or null if unknown. */
export function guideChallenge(id: string): GuideChallenge | null {
	return buildGuide().find((c) => c.id === id) ?? null;
}
