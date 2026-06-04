/**
 * Shared festival "onion supply" win-bar (SPEC §7).
 * Single row: onion_supply_gauge (id=1, current BIGINT, max BIGINT).
 * bumpGauge uses a Postgres UPDATE so all concurrent writers converge.
 */
import { sql } from '../db/index';

export interface SupplyGauge {
	current: number;
	max: number;
}

/** Read the current gauge. */
export async function getGauge(): Promise<SupplyGauge> {
	const [row] = await sql<{ current: number; max: number }[]>`
		SELECT current, max FROM onion_supply_gauge WHERE id = 1
	`;
	if (!row) throw new Error('onion_supply_gauge singleton missing; run db:init');
	return { current: Number(row.current), max: Number(row.max) };
}

/** Atomically add to the gauge (clamped to max). Returns the new value. */
export async function bumpGauge(amount: number): Promise<SupplyGauge> {
	const [row] = await sql<{ current: number; max: number }[]>`
		UPDATE onion_supply_gauge
		SET current    = LEAST(max, current + ${amount}),
		    updated_at = now()
		WHERE id = 1
		RETURNING current, max
	`;
	if (!row) throw new Error('onion_supply_gauge singleton missing; run db:init');
	return { current: Number(row.current), max: Number(row.max) };
}
