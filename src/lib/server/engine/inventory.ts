/**
 * Inventory engine — grants/queries against the `inventory` table.
 *
 * On-chain seam: every grant carries a `backing` value ('db' today). When we
 * later back items with SPL tokens or NFTs the same callers set
 * backing='spl_token'/'nft' and supply a `backingRef` mint address —
 * no other layers change.
 *
 * Uniqueness: (operative_id, catalog_id) is UNIQUE in the schema. Grants are
 * therefore idempotent for kind!='item'. For stackable items we increment qty.
 */
import { sql } from '../db/index';
import { catalogEntry } from '../challenges/catalog';
import type { InventoryRow, InventoryBacking } from '$lib/shared/types';

export interface GrantOpts {
	qty?: number;
	backing?: InventoryBacking;
	backingRef?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Grant an inventory item/credential/fragment by catalogId. Idempotent for
 * credentials and prompt_fragments (qty always 1). For items with qty>1 the
 * row qty is incremented via ON CONFLICT DO UPDATE.
 */
export async function grantItem(
	operativeId: string,
	catalogId: string,
	opts: GrantOpts = {}
): Promise<InventoryRow> {
	const entry = catalogEntry(catalogId);
	if (!entry) throw new Error(`Unknown catalogId: ${catalogId}`);

	const qty = opts.qty ?? 1;
	const backing: InventoryBacking = opts.backing ?? 'db';
	const backingRef: string | null = opts.backingRef ?? null;
	const metadata = opts.metadata ?? {};

	// Credentials and prompt_fragments are always qty=1 singletons; items stack.
	const [row] = await sql<InventoryRow[]>`
		INSERT INTO inventory
			(operative_id, catalog_id, kind, qty, backing, backing_ref, metadata)
		VALUES
			(${operativeId}, ${catalogId}, ${entry.kind}, ${qty},
			 ${backing}, ${backingRef}, ${sql.json(metadata as any)})
		ON CONFLICT (operative_id, catalog_id) DO UPDATE
			SET qty         = CASE
			                    WHEN inventory.kind = 'item'
			                    THEN inventory.qty + EXCLUDED.qty
			                    ELSE 1
			                  END,
			    backing     = EXCLUDED.backing,
			    backing_ref = COALESCE(EXCLUDED.backing_ref, inventory.backing_ref),
			    metadata    = EXCLUDED.metadata
		RETURNING *
	`;
	return row;
}

/** All catalogIds an operative currently holds. */
export async function listCatalogIds(operativeId: string): Promise<string[]> {
	const rows = await sql<{ catalogId: string }[]>`
		SELECT catalog_id FROM inventory WHERE operative_id = ${operativeId}
	`;
	return rows.map((r) => r.catalogId);
}

/** All full inventory rows for an operative. */
export async function listInventory(operativeId: string): Promise<InventoryRow[]> {
	return sql<InventoryRow[]>`
		SELECT * FROM inventory WHERE operative_id = ${operativeId} ORDER BY acquired_at
	`;
}

/** Whether the operative holds every catalogId in `required`. */
export async function hasAll(operativeId: string, required: string[]): Promise<boolean> {
	if (required.length === 0) return true;
	const owned = await listCatalogIds(operativeId);
	const set = new Set(owned);
	return required.every((id) => set.has(id));
}
