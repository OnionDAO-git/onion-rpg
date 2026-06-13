/**
 * Gear, chests, and forge (GAME_MECHANICS.md §6).
 *
 * Framework-first: gear items are ordinary `inventory` rows whose catalog entry
 * carries optional `slot`/`rarity`/`stats`; chests carry an optional loot
 * `table`. The equipped loadout lives on `game_state.loadout`
 * ({ slot -> catalogId }); equipped stats are summed into combat (see relay +
 * combat.ts). Forge recipes are a small code registry.
 *
 * Two paths to power: EARN it (play -> chests -> forge) or BUY it (B7 store).
 */
import { randomBytes } from 'crypto';
import { sql } from '../db/index';
import { catalogEntry } from '../challenges/catalog';
import { grantItem, consumeItem } from './inventory';
import type { GearSlot, GearStats, LootEntry } from '$lib/shared/types';

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'head', 'body', 'trinket'];

export type SummedStats = Required<GearStats>;

/** The operative's equipped loadout map ({ slot -> catalogId }). */
export async function getLoadout(operativeId: string): Promise<Partial<Record<GearSlot, string>>> {
	const [row] = await sql<{ loadout: Partial<Record<GearSlot, string>> }[]>`
		SELECT loadout FROM game_state WHERE operative_id = ${operativeId}
	`;
	return row?.loadout ?? {};
}

/** Sum the stats of all equipped gear (zeroes when nothing is equipped). */
export async function getLoadoutStats(operativeId: string): Promise<SummedStats> {
	const loadout = await getLoadout(operativeId);
	const total: SummedStats = { attack: 0, defense: 0, hp: 0 };
	for (const slot of GEAR_SLOTS) {
		const catalogId = loadout[slot];
		if (!catalogId) continue;
		const entry = catalogEntry(catalogId);
		const stats = entry && entry.kind === 'item' ? entry.stats : undefined;
		if (!stats) continue;
		total.attack += stats.attack ?? 0;
		total.defense += stats.defense ?? 0;
		total.hp += stats.hp ?? 0;
	}
	return total;
}

export interface EquipResult {
	slot: GearSlot;
	catalogId: string;
	loadout: Partial<Record<GearSlot, string>>;
}

/** Equip an owned gear item into its slot (replaces whatever was there). */
export async function equip(operativeId: string, catalogId: string): Promise<EquipResult> {
	const entry = catalogEntry(catalogId);
	if (!entry || entry.kind !== 'item' || !entry.slot) {
		throw new Error(`not equippable gear: ${catalogId}`);
	}
	const [owned] = await sql<{ one: number }[]>`
		SELECT 1 AS one FROM inventory WHERE operative_id = ${operativeId} AND catalog_id = ${catalogId}
	`;
	if (!owned) throw new Error(`operative does not own ${catalogId}`);

	// Read-modify-write the loadout map (keeps the SQL trivially mockable).
	const loadout = await getLoadout(operativeId);
	loadout[entry.slot] = catalogId;
	await sql`
		UPDATE game_state SET loadout = ${sql.json(loadout as any)}, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
	return { slot: entry.slot, catalogId, loadout };
}

/** Clear a slot in the loadout. Returns the updated loadout. */
export async function unequip(
	operativeId: string,
	slot: GearSlot
): Promise<Partial<Record<GearSlot, string>>> {
	const loadout = await getLoadout(operativeId);
	delete loadout[slot];
	await sql`
		UPDATE game_state SET loadout = ${sql.json(loadout as any)}, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
	return loadout;
}

/** Weighted random pick from a loot table. Server-authoritative RNG. */
export function weightedPick(table: LootEntry[]): LootEntry {
	if (table.length === 0) throw new Error('empty loot table');
	const total = table.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
	if (total <= 0) return table[0];
	// 4 bytes of entropy -> [0,1) -> scaled to the weight total.
	const r = (randomBytes(4).readUInt32BE(0) / 0x1_0000_0000) * total;
	let acc = 0;
	for (const e of table) {
		acc += Math.max(0, e.weight);
		if (r < acc) return e;
	}
	return table[table.length - 1];
}

export interface ChestResult {
	chest: string;
	granted: string;
}

/** Open one chest: consume it, roll its loot table, grant the result. */
export async function openChest(operativeId: string, chestCatalogId: string): Promise<ChestResult> {
	const entry = catalogEntry(chestCatalogId);
	if (!entry || entry.kind !== 'item' || !entry.chest) {
		throw new Error(`not a chest: ${chestCatalogId}`);
	}
	const consumed = await consumeItem(operativeId, chestCatalogId, 1);
	if (!consumed) throw new Error(`no ${chestCatalogId} to open`);

	const pick = weightedPick(entry.chest.table);
	await grantItem(operativeId, pick.catalogId, { qty: 1 });
	return { chest: chestCatalogId, granted: pick.catalogId };
}

// ── Forge recipes (code registry) ───────────────────────────────────────────

export interface ForgeRecipe {
	id: string;
	inputs: Array<{ catalogId: string; qty: number }>;
	output: string;
}

/**
 * Forge recipes — combine inputs (duplicates and/or Cores, B4) into a higher
 * tier. Keep additive; ids are stable. Content team expands later.
 */
export const FORGE_RECIPES: Record<string, ForgeRecipe> = {
	forged_blade: {
		id: 'forged_blade',
		inputs: [{ catalogId: 'rusty_shiv', qty: 2 }],
		output: 'forged_blade'
	}
};

export interface ForgeResult {
	recipe: string;
	output: string;
}

/** Run a forge recipe: verify + consume all inputs, grant the output. */
export async function forge(operativeId: string, recipeId: string): Promise<ForgeResult> {
	const recipe = FORGE_RECIPES[recipeId];
	if (!recipe) throw new Error(`unknown recipe: ${recipeId}`);

	// Verify the operative holds every input in the required quantity first.
	for (const input of recipe.inputs) {
		const [row] = await sql<{ qty: number }[]>`
			SELECT qty FROM inventory WHERE operative_id = ${operativeId} AND catalog_id = ${input.catalogId}
		`;
		if (!row || row.qty < input.qty) {
			throw new Error(`missing forge input: ${input.catalogId} x${input.qty}`);
		}
	}
	// Consume then grant.
	for (const input of recipe.inputs) {
		await consumeItem(operativeId, input.catalogId, input.qty);
	}
	await grantItem(operativeId, recipe.output, { qty: 1 });
	return { recipe: recipeId, output: recipe.output };
}
