/**
 * The Colony — global collective layer (GAME_MECHANICS.md §5).
 *
 * One shared singleton level (colony_state). Players contribute Cores at a
 * colony beacon; each contribution is recorded once per (level, operative) in
 * colony_contributions. When N distinct operatives have contributed at the
 * current level, the Colony advances a level FOR EVERYONE and every contributor
 * of that level gets a first-mover chest (being early pays — the anti-free-rider
 * fix). colonyLevelAtLeast() is the gate later layers use to unlock storyline
 * segments (B5), store tiers (B7), and tougher bosses (B6).
 */
import { sql } from '../db/index';
import { grantItem, consumeItem } from './inventory';

/** Tunables — see GAME_MECHANICS.md "Implementation parameters". */
export const COLONY_CONTRIBUTORS_PER_LEVEL = 5; // N distinct contributors → level up
export const CORES_REQUIRED_PER_CONTRIBUTION = 3; // Cores spent per contribution
export const CORES_CATALOG_ID = 'cores';
export const COLONY_CHEST_CATALOG_ID = 'colony_chest';

/** Current global Colony level (0-based). */
export async function getColonyLevel(): Promise<number> {
	const [row] = await sql<{ level: number }[]>`SELECT level FROM colony_state WHERE id = 1`;
	return row ? Number(row.level) : 0;
}

/** Gate helper: is the Colony at least level `n`? */
export async function colonyLevelAtLeast(n: number): Promise<boolean> {
	return (await getColonyLevel()) >= n;
}

export interface ColonyStatus {
	level: number;
	/** Distinct contributors so far at the current level. */
	contributors: number;
	/** Contributors needed to advance (N). */
	needed: number;
}

/** Public status of the shared Colony (for the badge/guide meter). */
export async function getColonyStatus(): Promise<ColonyStatus> {
	const level = await getColonyLevel();
	const [c] = await sql<{ count: number }[]>`
		SELECT count(*)::int AS count FROM colony_contributions WHERE colony_level = ${level}
	`;
	return { level, contributors: Number(c?.count ?? 0), needed: COLONY_CONTRIBUTORS_PER_LEVEL };
}

export interface ContributeResult {
	/** Colony level AFTER this contribution (incremented if it tipped over). */
	level: number;
	/** Distinct contributors at the level this contribution counted toward. */
	contributors: number;
	leveledUp: boolean;
	/** Whether THIS operative received a first-mover chest. */
	chestGranted: boolean;
}

/**
 * Contribute CORES_REQUIRED_PER_CONTRIBUTION Cores toward the Colony. One
 * counted contribution per operative per level. When the Nth distinct
 * contributor lands, the Colony advances and every contributor of that level
 * (this operative included) is granted a first-mover chest.
 */
export async function contributeCores(operativeId: string): Promise<ContributeResult> {
	const level = await getColonyLevel();

	// One counted contribution per operative per level.
	const [already] = await sql<{ one: number }[]>`
		SELECT 1 AS one FROM colony_contributions
		WHERE colony_level = ${level} AND operative_id = ${operativeId}
	`;
	if (already) throw new Error('already contributed to this colony level');

	// Spend the Cores (fails with no change if the operative is short).
	const paid = await consumeItem(operativeId, CORES_CATALOG_ID, CORES_REQUIRED_PER_CONTRIBUTION);
	if (!paid) throw new Error(`need ${CORES_REQUIRED_PER_CONTRIBUTION} Cores to contribute`);

	await sql`
		INSERT INTO colony_contributions (colony_level, operative_id, cores)
		VALUES (${level}, ${operativeId}, ${CORES_REQUIRED_PER_CONTRIBUTION})
		ON CONFLICT (colony_level, operative_id) DO NOTHING
	`;

	const [c] = await sql<{ count: number }[]>`
		SELECT count(*)::int AS count FROM colony_contributions WHERE colony_level = ${level}
	`;
	const contributors = Number(c?.count ?? 0);

	let leveledUp = false;
	let chestGranted = false;

	if (contributors >= COLONY_CONTRIBUTORS_PER_LEVEL) {
		// Advance, guarded so only one writer wins the transition for this level.
		const [adv] = await sql<{ level: number }[]>`
			UPDATE colony_state SET level = level + 1, updated_at = now()
			WHERE id = 1 AND level = ${level}
			RETURNING level
		`;
		if (adv) {
			leveledUp = true;
			// First-mover chest to every contributor of the level just completed.
			const contribs = await sql<{ operativeId: string }[]>`
				SELECT operative_id FROM colony_contributions WHERE colony_level = ${level}
			`;
			for (const row of contribs) {
				await grantItem(row.operativeId, COLONY_CHEST_CATALOG_ID, { qty: 1 });
			}
			chestGranted = true;
		}
	}

	return { level: await getColonyLevel(), contributors, leveledUp, chestGranted };
}
