/**
 * The Director — rule-based storyline assignment + progression
 * (GAME_MECHANICS.md §4).
 *
 * A pool of authored arcs; each arc is an ordered list of segments; each segment
 * is a set of beacon interactions (challengeIds) plus a Colony-level gate. On
 * first contact the director assigns ONE arc at random and records it on the
 * player. The player advances a segment when they clear all of its challenges
 * AND the Colony has reached the next segment's required level — otherwise the
 * story stalls at the boundary (they can still play, just can't advance).
 *
 * This is the new progression layer. The legacy act-based maybeAdvanceAct()
 * still runs for the original Chicago content until the B8 content swap retires
 * it. The director never blocks beginChallenge — challenge entry stays gated by
 * `requires` (credentials); the director only governs story position.
 */
import { sql } from '../db/index';
import { colonyLevelAtLeast } from './colony';

export interface StorySegment {
	/** Challenges that make up this segment. */
	challengeIds: string[];
	/** Colony level required to ADVANCE into this segment (segment 0 = 0). */
	requiredColonyLevel: number;
}

export interface StoryArc {
	id: string;
	name: string;
	segments: StorySegment[];
}

/**
 * Stub arc pool (B5). 2–3 arcs so the director is exercisable; the content team
 * authors the full 10–15 in B8. Segment gates ramp with the Colony: seg0→L0,
 * seg1→L1, seg2→L2 (per §4). They reference existing challenge ids for now.
 */
export const ARCS: Record<string, StoryArc> = {
	onion_underground: {
		id: 'onion_underground',
		name: 'The Onion Underground',
		segments: [
			{ challengeIds: ['mg-bankbust'], requiredColonyLevel: 0 },
			{ challengeIds: ['0.1'], requiredColonyLevel: 1 },
			{ challengeIds: ['mg-bankbust', '0.1'], requiredColonyLevel: 2 }
		]
	},
	deepdish_uprising: {
		id: 'deepdish_uprising',
		name: 'The Deep-Dish Uprising',
		segments: [
			{ challengeIds: ['0.1'], requiredColonyLevel: 0 },
			{ challengeIds: ['mg-bankbust'], requiredColonyLevel: 1 },
			{ challengeIds: ['0.1'], requiredColonyLevel: 2 }
		]
	},
	the_long_climb: {
		id: 'the_long_climb',
		name: 'The Long Climb',
		segments: [
			{ challengeIds: ['mg-bankbust'], requiredColonyLevel: 0 },
			{ challengeIds: ['mg-bankbust'], requiredColonyLevel: 1 },
			{ challengeIds: ['0.1'], requiredColonyLevel: 2 }
		]
	}
};

export const ARC_IDS = Object.keys(ARCS);

export function getArc(id: string | null | undefined): StoryArc | undefined {
	return id ? ARCS[id] : undefined;
}

/** Pick a random arc id (vary by call; the director assigns once per player). */
function pickArcId(): string {
	return ARC_IDS[Math.floor(Math.random() * ARC_IDS.length)];
}

/** Ensure the operative has an assigned arc; assign one at random if not. */
export async function ensureArc(operativeId: string): Promise<{ arcId: string; segment: number }> {
	const [row] = await sql<{ arcId: string | null; arcSegment: number }[]>`
		SELECT arc_id, arc_segment FROM game_state WHERE operative_id = ${operativeId}
	`;
	if (row?.arcId && ARCS[row.arcId]) {
		return { arcId: row.arcId, segment: row.arcSegment ?? 0 };
	}
	const arcId = pickArcId();
	await sql`
		UPDATE game_state SET arc_id = ${arcId}, arc_segment = 0, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
	return { arcId, segment: 0 };
}

export interface StoryState {
	arcId: string;
	arcName: string;
	segment: number;
	totalSegments: number;
	/** ChallengeIds in the current segment. */
	segmentChallenges: string[];
	/** Whether the next segment's Colony gate is satisfied right now. */
	nextSegmentUnlocked: boolean;
	/** True when the player is on the final segment (arc finished after it). */
	finalSegment: boolean;
}

/** The player's current story position (assigns an arc on first read). */
export async function getStory(operativeId: string): Promise<StoryState> {
	const { arcId, segment } = await ensureArc(operativeId);
	const arc = ARCS[arcId];
	const seg = arc.segments[segment];
	const hasNext = segment + 1 < arc.segments.length;
	const nextSegmentUnlocked = hasNext
		? await colonyLevelAtLeast(arc.segments[segment + 1].requiredColonyLevel)
		: false;
	return {
		arcId,
		arcName: arc.name,
		segment,
		totalSegments: arc.segments.length,
		segmentChallenges: seg?.challengeIds ?? [],
		nextSegmentUnlocked,
		finalSegment: !hasNext
	};
}

export interface AdvanceResult {
	advanced: boolean;
	segment: number;
	/** Set when advancement is held back by the Colony gate. */
	blockedByColony?: boolean;
}

/**
 * Called after a challenge is cleared. Advances the player's arc segment iff the
 * cleared challenge belongs to the current segment, the whole segment is now
 * cleared, a next segment exists, and the Colony gate for it is met. Otherwise a
 * no-op (story stalls — the player can keep playing).
 */
export async function advanceStory(
	operativeId: string,
	clearedChallengeId: string,
	challengeStatus: Record<string, string>
): Promise<AdvanceResult> {
	const { arcId, segment } = await ensureArc(operativeId);
	const arc = ARCS[arcId];
	const seg = arc?.segments[segment];
	if (!seg || !seg.challengeIds.includes(clearedChallengeId)) {
		return { advanced: false, segment };
	}
	const segmentCleared = seg.challengeIds.every((cid) => challengeStatus[cid] === 'cleared');
	if (!segmentCleared) return { advanced: false, segment };

	const next = segment + 1;
	if (next >= arc.segments.length) return { advanced: false, segment }; // arc complete

	if (!(await colonyLevelAtLeast(arc.segments[next].requiredColonyLevel))) {
		return { advanced: false, segment, blockedByColony: true };
	}

	await sql`
		UPDATE game_state SET arc_segment = ${next}, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
	return { advanced: true, segment: next };
}
