/**
 * Act 2, Challenge 2.2 — The Sorting Machine (Merchant/Buttons). SPEC §5 Act 2.
 *
 * Mechanic: A weaponized USPS sorting machine has become a black-market merchant.
 * Players enter "routing sequences" (button combos) to unlock trade tiers.
 * Wrong sequences cost Onions (the machine misroutes their parcel).
 *
 * Trade tiers (in escalating sequence complexity):
 *   Tier 1 — Local route  (3-button combo): "Sorting Sprocket"
 *   Tier 2 — Regional hub (4-button combo): "Conveyor Belt Fragment"
 *   Tier 3 — Bridge Override kit (5-button combo): "Bridge Override Schematic"
 *
 * Lesson: USPS uses a Delivery Barcode Sorter (DBCS) and Automated Flat Sorting
 * Machine (AFSM). ZIP codes map to sectional center facilities (SCFs), then
 * carrier routes. The machine's "trade combos" mirror the hierarchical routing
 * decision tree: local → regional → national dispatch codes.
 *
 * Requires: transit_pass (gated behind Act 2.1 — The Loop).
 * Rewards: sorting_sprocket, conveyor_belt_frag, bridge_override_schematic (per tier),
 *          variable Onions per tier, gauge bump.
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult, ChallengeContext } from '$lib/shared/types';

// ── Routing sequence definitions ───────────────────────────────────────────
// These mirror the combos in beacon/challenges/act2-2-sorting-machine.json and
// must stay in sync. The canonical source for the badge UX is the JSON config;
// this is the server-side truth for validation.

interface TradeTier {
	/** Display name shown to the player. */
	name: string;
	/** The catalogId of the item granted on success. */
	catalogId: string;
	/** Onions paid OUT by the machine (the player receives these). */
	onionPayout: number;
	/** Button combo as an ordered list of button names. */
	sequence: string[];
	/** Onions LOST if the wrong sequence is entered (misrouted parcel). */
	wrongCost: number;
	/** Routing-lesson copy printed on the beacon display when this tier is unlocked. */
	routingLesson: string;
}

const TRADE_TIERS: TradeTier[] = [
	{
		name: 'Local Route',
		catalogId: 'sorting_sprocket',
		onionPayout: 30,
		sequence: ['up', 'up', 'select'],
		wrongCost: 10,
		routingLesson:
			'Local sort: 5-digit ZIP → carrier route. Tray slides to Delivery Unit slot 1-9.'
	},
	{
		name: 'Regional Hub',
		catalogId: 'conveyor_belt_frag',
		onionPayout: 60,
		sequence: ['down', 'right', 'up', 'select'],
		wrongCost: 20,
		routingLesson:
			"Regional sort: ZIP+4 routes via Sectional Center Facility (SCF). Chicago's SCF is the massive O'Hare annex."
	},
	{
		name: 'Bridge Override Kit',
		catalogId: 'bridge_override_schematic',
		onionPayout: 110,
		sequence: ['left', 'up', 'right', 'down', 'select'],
		wrongCost: 30,
		routingLesson:
			'National dispatch: USPS Network Distribution Centers (NDC) are the backbone — automated flat sorting at 35,000 pieces/hour.'
	}
];

/** Maximum wrong attempts before the machine locks for this session. */
const MAX_WRONG_ATTEMPTS = 5;

// ── Input shape ────────────────────────────────────────────────────────────

interface SortingMachineInput {
	/** The button sequence the player entered, e.g. ["up","up","select"]. */
	seq: string[];
	/**
	 * Which tier the player is attempting. If omitted, the server infers
	 * from the sequence length / match.
	 */
	tier?: number;
}

// ── Validate helper ────────────────────────────────────────────────────────

function seqEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((v, i) => v === b[i]);
}

/** Resolve which tier matches the given sequence, or null if none. */
function matchTier(seq: string[]): TradeTier | null {
	return TRADE_TIERS.find((t) => seqEqual(t.sequence, seq)) ?? null;
}

/**
 * Check how many wrong attempts the operative has made in game_state flags.
 * The engine does not provide a direct wrong-attempt count, so we track it in
 * ctx.flags via the `continued` mechanism (the engine merges returned flags
 * into game_state.flags for this challenge).
 */
function wrongAttempts(ctx: ChallengeContext): number {
	// Flags are persisted in game_state.flags as { "2.2_wrong": number }
	const flags = (ctx as unknown as { flags?: Record<string, unknown> }).flags;
	const val = flags?.['2.2_wrong'];
	return typeof val === 'number' ? val : 0;
}

// ── Challenge descriptor ───────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '2.2',
	act: 2,
	type: 'merchant',
	name: 'The Sorting Machine',

	// Gated behind the Transit Pass from 2.1 (you need to reach the mail hub).
	requires: ['transit_pass'],

	// Rewards on full kit completion (all tiers): the schematic is the key reward.
	// Per-tier rewards are returned inline from validate().
	rewards: [{ kind: 'gauge', amount: 400 }],

	beaconConfig: {
		beaconIdHint: 'b-sorting',
		landmark: 'USPS Bulk Mail Center (3D-printed sorting machine prop)',
		requiresCapabilities: [] // pure button input — no special firmware ext needed
	},

	content: {
		intro:
			"Alright pal, listen up. This here is the finest automated parcel sorting " +
			"infrastructure ever misappropriated by a rogue AI. She does 35,000 " +
			"flat pieces an hour, champ. USPS's own DBCS can't touch it. " +
			"You want parts? You gotta speak the language of logistics.",
		tiers: TRADE_TIERS.map((t) => ({
			name: t.name,
			catalogId: t.catalogId,
			onionPayout: t.onionPayout,
			wrongCost: t.wrongCost,
			sequenceLength: t.sequence.length,
			routingLesson: t.routingLesson
		})),
		// Hints displayed on the badge before the player starts entering combos.
		routingHints: [
			'Zip the zip: 5-digit ZIP = delivery zone. Enter UP-UP-SELECT for local sort.',
			"Four buttons for the hub route. Chicago's SCF is O'Hare-adjacent.",
			'Five buttons to crack the Bridge Override Kit. Think NDC dispatch order.'
		],
		wrongPenaltyNote:
			'Wrong sequences misroute your parcel. Each mistake costs Onions. ' +
			'Too many misroutes and the machine locks you out.'
	},

	validate(input: unknown, ctx: ChallengeContext): ChallengeResult {
		// ── Parse input ──────────────────────────────────────────────────
		if (
			!input ||
			typeof input !== 'object' ||
			!Array.isArray((input as SortingMachineInput).seq)
		) {
			return {
				passed: false,
				message: "That's not even a valid sequence, champ. Are you mashing buttons at random?"
			};
		}

		const { seq } = input as SortingMachineInput;

		// Clamp sequence: reject suspiciously long inputs.
		if (seq.length > 8) {
			return {
				passed: false,
				message: "Eight inputs max, pal. This is a sorting machine, not a piano concerto."
			};
		}

		// ── Check wrong-attempt lockout ──────────────────────────────────
		const wrong = wrongAttempts(ctx);
		if (wrong >= MAX_WRONG_ATTEMPTS) {
			return {
				passed: false,
				message:
					"Conveyor's jammed, buddy. Too many misroutes. Come back when you've " +
					"read the Domestic Mail Manual. (Session locked — try again later.)"
			};
		}

		// ── Try to match a tier ─────────────────────────────────────────
		const matched = matchTier(seq);

		if (!matched) {
			// Wrong sequence — penalise Onions and increment counter.
			const newWrong = wrong + 1;
			const remaining = MAX_WRONG_ATTEMPTS - newWrong;

			// Penalty scales with sequence length: longer attempt = higher tier = bigger cost.
			// We use seq.length as a proxy since we couldn't match the tier.
			const wrongCost = seq.length >= 5 ? 30 : seq.length >= 4 ? 20 : 10;

			return {
				passed: false,
				continued: remaining > 0,
				// The Onion penalty is returned as a negative reward; the engine deducts.
				// NOTE: the Onion DAO API only supports transfer/burn of positive amounts.
				// The penalty is modelled as a burn FROM the operative (they approve it
				// in their portal). The engine maps this via onion_rewards with type='burn'.
				rewards: [{ kind: 'onions', amount: -wrongCost }],
				flags: { '2.2_wrong': newWrong },
				message:
					remaining > 0
						? `Nope. That's not even close. Your parcel just ended up in Des Moines. ` +
						  `${wrongCost} Onions misrouted. You've got ${remaining} attempt(s) left, chief.`
						: "That's it. Machine's locked. Ya burned through all your routing credits. " +
						  "ZIP: ZERO. Come back tomorrow, champ."
			};
		}

		// ── Check if already owned ───────────────────────────────────────
		if (ctx.inventory.includes(matched.catalogId)) {
			return {
				passed: true,
				message:
					`You already got the ${matched.name} trade, pal. ` +
					`Don't get greedy — the machine's inventory ain't infinite.`
			};
		}

		// ── Success ──────────────────────────────────────────────────────
		// Check if this completes the full set (all three tiers).
		const otherTierIds = TRADE_TIERS.filter((t) => t.catalogId !== matched.catalogId).map(
			(t) => t.catalogId
		);
		const completesSet = otherTierIds.every((id) => ctx.inventory.includes(id));

		const rewards: ChallengeResult['rewards'] = [
			{ kind: 'inventory', catalogId: matched.catalogId },
			{ kind: 'onions', amount: matched.onionPayout }
		];

		if (completesSet) {
			// Full set bonus — bump the gauge too.
			rewards.push({ kind: 'gauge', amount: 400 });
		}

		const lesson = matched.routingLesson;
		const deepdishLine =
			matched.catalogId === 'bridge_override_schematic'
				? `Well I'll be. You actually know your NDC dispatch codes. ` +
				  `Bridge Override Schematic is yours. Use it wisely, champ. ` +
				  `Educational footnote: ${lesson}`
				: `Routing code confirmed. ${matched.name} released. ` +
				  `Educational footnote: ${lesson}`;

		return {
			passed: true,
			message: deepdishLine,
			rewards,
			// Reset wrong counter on success.
			flags: { '2.2_wrong': 0 }
		};
	}
};

registerChallenge(challenge);
export default challenge;
