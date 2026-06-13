/**
 * Store — buy gear/chests for onions, tiers gated by Colony level
 * (GAME_MECHANICS.md §6). Pay-to-win is allowed: onions flow player -> dev via
 * chargeOnions() (economy flip), then the item is granted. Higher Colony levels
 * unlock rarer offers. (Potions/revives are bought via /api/boss.)
 */
import { grantItem } from './inventory';
import { chargeOnions } from './index';
import { colonyLevelAtLeast } from './colony';

export interface StoreOffer {
	id: string;
	/** Catalog id granted on purchase. */
	catalogId: string;
	priceOnions: number;
	/** Colony level required for this offer to appear / be purchasable. */
	requiredColonyLevel: number;
}

/** Colony-tiered storefront. Additive; ids stable. */
export const STORE: Record<string, StoreOffer> = {
	buy_rusty_shiv: { id: 'buy_rusty_shiv', catalogId: 'rusty_shiv', priceOnions: 2, requiredColonyLevel: 0 },
	buy_scrap_chest: { id: 'buy_scrap_chest', catalogId: 'scrap_chest', priceOnions: 5, requiredColonyLevel: 0 },
	buy_forged_blade: { id: 'buy_forged_blade', catalogId: 'forged_blade', priceOnions: 12, requiredColonyLevel: 1 },
	buy_colony_chest: { id: 'buy_colony_chest', catalogId: 'colony_chest', priceOnions: 20, requiredColonyLevel: 2 }
};

/** Offers currently unlocked by the global Colony level. */
export async function listStore(): Promise<StoreOffer[]> {
	const out: StoreOffer[] = [];
	for (const offer of Object.values(STORE)) {
		if (await colonyLevelAtLeast(offer.requiredColonyLevel)) out.push(offer);
	}
	return out;
}

export interface BuyResult {
	offerId: string;
	granted: string;
	priceOnions: number;
}

/** Buy an offer: colony gate -> charge onions (unique externalId) -> grant item. */
export async function buyFromStore(
	operativeId: string,
	offerId: string,
	externalId: string
): Promise<BuyResult> {
	const offer = STORE[offerId];
	if (!offer) throw new Error(`unknown store offer: ${offerId}`);
	if (!(await colonyLevelAtLeast(offer.requiredColonyLevel))) {
		throw new Error(`offer ${offerId} locked: colony level ${offer.requiredColonyLevel} required`);
	}
	await chargeOnions(operativeId, offer.priceOnions, `store:${offerId}`, externalId);
	await grantItem(operativeId, offer.catalogId, { qty: 1 });
	return { offerId, granted: offer.catalogId, priceOnions: offer.priceOnions };
}
