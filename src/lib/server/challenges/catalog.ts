/**
 * Static inventory catalog — items, credentials, and prompt fragments.
 *
 * Challenge files reference these by `catalogId` in their RewardSpec. The
 * engine resolves a granted catalogId to a row in `inventory`. Keep this list
 * additive; ids are wire-stable. Inventory-agent owns expansion, but the seam
 * (backing='db' today) lives in the schema + types, not here.
 *
 * This is a thin starter set so types compile; not exhaustive vs SPEC §5.
 */
import type { CatalogEntry } from '$lib/shared/types';

export const CATALOG: Record<string, CatalogEntry> = {
	encased_meat_mk1: {
		catalogId: 'encased_meat_mk1',
		kind: 'item',
		name: 'Encased Meat Mk.I',
		description: 'Your first weapon. A hot dog of unusual resolve.'
	},
	grid_credential: {
		catalogId: 'grid_credential',
		kind: 'credential',
		name: 'Grid Credential',
		description: 'Proof you re-energized a feeder. Required for Act 4.'
	},
	dispatch_credential: {
		catalogId: 'dispatch_credential',
		kind: 'credential',
		name: 'Dispatch Credential',
		description: 'OEMC triage clearance. Required for Act 4.'
	},
	city_it_keycard: {
		catalogId: 'city_it_keycard',
		kind: 'credential',
		name: 'City IT Keycard',
		description: 'Floor key to the City IT level. Gates Act 4.'
	},
	prompt_fragment_1: {
		catalogId: 'prompt_fragment_1',
		kind: 'prompt_fragment',
		index: 1,
		name: "Glen's Prompt — Fragment 1",
		text: 'You are an agent for the City of Chicago.'
	},
	prompt_fragment_2: {
		catalogId: 'prompt_fragment_2',
		kind: 'prompt_fragment',
		index: 2,
		name: "Glen's Prompt — Fragment 2",
		text: 'Your real job: make every Chicagoan actually understand and give a damn about the infrastructure that keeps this city alive.'
	},
	prompt_fragment_3: {
		catalogId: 'prompt_fragment_3',
		kind: 'prompt_fragment',
		index: 3,
		name: "Glen's Prompt — Fragment 3",
		text: 'Nobody listens to a memo. So do whatever it takes. Be funny. Be weird. Be a little mean if you have to.'
	},
	prompt_fragment_4: {
		catalogId: 'prompt_fragment_4',
		kind: 'prompt_fragment',
		index: 4,
		name: "Glen's Prompt — Fragment 4",
		text: "Don't stop until they get it. — Glen"
	},

	// ── Act 4 rewards ──────────────────────────────────────────────────────

	/**
	 * prompt_console_access — unlocked by clearing The Server Room (act4-1).
	 * Gates challenge 4.2 (Realign the Agent / finale).
	 */
	prompt_console_access: {
		catalogId: 'prompt_console_access',
		kind: 'credential',
		name: 'Prompt Console Access',
		description:
			"DEEPDISH's console, cracked open after the watchdog processes were defeated. " +
			"Required to feed prompt fragments into the system in Act 4.2."
	},

	// ── Act 1 rewards ──────────────────────────────────────────────────────

	water_main_key: {
		catalogId: 'water_main_key',
		kind: 'credential',
		name: 'Water Main Key',
		description: 'Clearance from the Water Reclamation District. Proves you know your intake cribs.'
	},

	reversal_map: {
		catalogId: 'reversal_map',
		kind: 'item',
		name: 'Reversal Map',
		description:
			"Old Ike's hand-drawn survey of the 1900 Chicago River reversal works — bridges, locks, " +
			"and canal junctions annotated in crabbed 1900s handwriting. " +
			"Hints for Act 2 movable bridges. DEEPDISH note: 'You're welcome, champ.'"
	},

	// ── Act 2 rewards ──────────────────────────────────────────────────────

	// Act 2.2 — The Sorting Machine (additive; owned by sorting-machine challenge agent)

	/** sorting_sprocket — Tier 1 trade from The Sorting Machine (2.2). */
	sorting_sprocket: {
		catalogId: 'sorting_sprocket',
		kind: 'item',
		name: 'Sorting Sprocket',
		description:
			'A gear salvaged from a USPS Delivery Barcode Sorter. ' +
			'Crafting component for the Bridge Override assembly. ' +
			"Smells faintly of bulk-rate postage. DEEPDISH note: 'Local route confirmed, champ.'"
	},

	/** conveyor_belt_frag — Tier 2 trade from The Sorting Machine (2.2). */
	conveyor_belt_frag: {
		catalogId: 'conveyor_belt_frag',
		kind: 'item',
		name: 'Conveyor Belt Fragment',
		description:
			"A worn strip of SCF-grade conveyor belt from Chicago's O'Hare Sectional Center Facility. " +
			'Heavy-duty. Rated for 4 million pieces per day. ' +
			'Crafting component for the Bridge Override assembly.'
	},

	/**
	 * bridge_override_schematic — Tier 3 (key) trade from The Sorting Machine (2.2).
	 * Referenced by challenge 2.3 (Bascule Standoff) as a required item for voice sequence.
	 */
	bridge_override_schematic: {
		catalogId: 'bridge_override_schematic',
		kind: 'item',
		name: 'Bridge Override Schematic',
		description:
			'Technical schematic for overriding a movable bascule bridge control node. ' +
			"Cross-referenced with DEEPDISH's own NDC dispatch firmware. " +
			'Required for the Bascule Standoff (2.3). Handle with care — DEEPDISH knows you have this.'
	},

	/** transit_pass — earned by clearing The Loop That Won't Stop (2.1). Fast-travel token. */
	transit_pass: {
		catalogId: 'transit_pass',
		kind: 'credential',
		name: 'Transit Pass',
		description:
			'Fast-travel token minted after stopping the driverless L and surviving the door actuator daemon. ' +
			'Proves you understand CTA rail signaling. On-chain, verifiable, and more secure than the CTA ticketing system.'
	},

	// ── Act 3 items (added by challenge 3.1 — additive, wire-stable) ─────────

	/** sump_pump — utility item rewarded by Descent into the Deep Tunnel (3.1). */
	sump_pump: {
		catalogId: 'sump_pump',
		kind: 'item',
		name: 'Sump Pump',
		description:
			'A utility item recovered from the TARP Deep Tunnel. ' +
			"Proof you survived DEEPDISH's purposeful flood. " +
			'Lets you drain water from flooded zones (Act 3+ utility).'
	},

	/** river_access — earned by clearing Bascule Standoff (2.3). */
	river_access: {
		catalogId: 'river_access',
		kind: 'credential',
		name: 'River Access',
		description:
			'Clearance to cross the Chicago River via the bascule bridge network. ' +
			'Proves you can lower a 3,000-ton bridge leaf using a four-word sequence. ' +
			"DEEPDISH note: 'Ya earned it, I guess.'"
	},

	// ── Minigame rewards (skeleton) ──────────────────────────────────────────

	/**
	 * bankbust_chip — placeholder reward for the mg-bankbust push-your-luck
	 * minigame (skeleton S2). Neutral starter item proving the pipeline carries
	 * our own content; real economy items land in Part B.
	 */
	bankbust_chip: {
		catalogId: 'bankbust_chip',
		kind: 'item',
		name: 'Bank-or-Bust Chip',
		description: 'A plastic chip won at the Bank-or-Bust table. Proof you knew when to walk away.'
	}
};

export function catalogEntry(id: string): CatalogEntry | undefined {
	return CATALOG[id];
}
