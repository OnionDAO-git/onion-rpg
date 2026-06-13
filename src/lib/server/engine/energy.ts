/**
 * Energy — the pacing + monetization gate (GAME_MECHANICS.md §3).
 *
 *   - Max 7 energy. Each interaction (a CHALLENGE_BEGIN) costs 1.
 *   - When energy hits 0, a 30-minute timer starts (energy_exhausted_at). When
 *     it elapses, energy refills to FULL in one shot — not gradual.
 *   - Refill is LAZY: there is no cron. We stamp energy_exhausted_at on the
 *     transition to 0 and compute the refill on the next read/spend.
 *   - Skip: pay ENERGY_SKIP_COST onions for an instant full refill (onion sink).
 *
 * Bosses do NOT cost normal energy (they're gated by the boss window, B6).
 */
import { sql } from '../db/index';
import { chargeOnions } from './index';

/** Tunables — see GAME_MECHANICS.md "Implementation parameters". */
export const MAX_ENERGY = 7;
export const ENERGY_REFILL_MS = 30 * 60 * 1000; // 30 minutes from 0 → full
export const ENERGY_SKIP_COST = 5; // onions for an instant full refill

export interface EnergyState {
	energy: number;
	max: number;
	/** ms until a full refill, or null if already full / no timer running. */
	refillsInMs: number | null;
}

interface RawEnergyRow {
	energy: number;
	energyExhaustedAt: string | Date | null;
}

/**
 * Read the operative's energy, applying a lazy full-refill if the 30-minute
 * timer (started when energy hit 0) has elapsed. Returns null if no game_state.
 */
async function refresh(operativeId: string): Promise<RawEnergyRow | null> {
	const [row] = await sql<RawEnergyRow[]>`
		SELECT energy, energy_exhausted_at FROM game_state WHERE operative_id = ${operativeId}
	`;
	if (!row) return null;

	if (row.energyExhaustedAt != null) {
		const elapsed = Date.now() - new Date(row.energyExhaustedAt).getTime();
		if (elapsed >= ENERGY_REFILL_MS) {
			await sql`
				UPDATE game_state
				SET energy = ${MAX_ENERGY}, energy_exhausted_at = ${null}, updated_at = now()
				WHERE operative_id = ${operativeId}
			`;
			return { energy: MAX_ENERGY, energyExhaustedAt: null };
		}
	}
	return row;
}

function toState(row: RawEnergyRow): EnergyState {
	let refillsInMs: number | null = null;
	if (row.energyExhaustedAt != null && row.energy < MAX_ENERGY) {
		const elapsed = Date.now() - new Date(row.energyExhaustedAt).getTime();
		refillsInMs = Math.max(0, ENERGY_REFILL_MS - elapsed);
	}
	return { energy: row.energy, max: MAX_ENERGY, refillsInMs };
}

/** Current energy (lazy-refilled). Returns null if the operative has no state. */
export async function getEnergy(operativeId: string): Promise<EnergyState | null> {
	const row = await refresh(operativeId);
	return row ? toState(row) : null;
}

export interface SpendResult {
	ok: boolean;
	energy: number;
}

/**
 * Spend `cost` energy (default 1). Returns { ok:false } with no change when the
 * operative is short. Stamps energy_exhausted_at when this spend empties the bar.
 */
export async function spendEnergy(operativeId: string, cost = 1): Promise<SpendResult> {
	const row = await refresh(operativeId);
	if (!row) throw new Error(`operative not found: ${operativeId}`);
	if (row.energy < cost) return { ok: false, energy: row.energy };

	const newEnergy = row.energy - cost;
	const exhaustedAt = newEnergy === 0 ? new Date() : null;

	const [updated] = await sql<{ energy: number }[]>`
		UPDATE game_state
		SET energy = ${newEnergy}, energy_exhausted_at = ${exhaustedAt}, updated_at = now()
		WHERE operative_id = ${operativeId} AND energy >= ${cost}
		RETURNING energy
	`;
	if (!updated) return { ok: false, energy: row.energy }; // lost race
	return { ok: true, energy: updated.energy };
}

/**
 * Instant full refill paid in onions (primary onion sink). `externalId` must be
 * unique per purchase. Charges first (idempotent), then tops energy to full.
 */
export async function skipEnergyWithOnions(
	operativeId: string,
	externalId: string
): Promise<EnergyState> {
	await chargeOnions(operativeId, ENERGY_SKIP_COST, 'energy:skip', externalId);
	await sql`
		UPDATE game_state
		SET energy = ${MAX_ENERGY}, energy_exhausted_at = ${null}, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
	return { energy: MAX_ENERGY, max: MAX_ENERGY, refillsInMs: null };
}
