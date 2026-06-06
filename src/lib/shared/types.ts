/**
 * Shared TypeScript types for ONION RPG.
 *
 * These are the vocabulary every layer speaks: server engine, challenge
 * modules, the API routes, the beacon bridge, and (re-implemented by hand) the
 * Lua client and C3 firmware. Keep this file dependency-free so it can be
 * imported from anywhere, including `$lib/shared/*` on both server and client.
 */

// ── Story structure ──────────────────────────────────────────────────────

/** Acts 0..4 per SPEC §4. */
export type Act = 0 | 1 | 2 | 3 | 4;

/** The four hardware-primitive-backed challenge families per SPEC §5. */
export type ChallengeType = 'combat' | 'dialogue' | 'merchant' | 'npc';

// ── Identity ─────────────────────────────────────────────────────────────

export interface Operative {
	id: string;
	hardwareId: string;
	onionId: number | null;
	username: string | null;
	callsign: string | null;
	/**
	 * RESERVED — hex ed25519 public key for a future badge-signed-roll hook.
	 * Not currently produced by any shipped badge (no Lua signing primitive
	 * exists); always null today. Kept as a forward-looking seam.
	 */
	attestPubkey: string | null;
	registered: boolean;
	createdAt: string;
	lastSeenAt: string;
}

// ── Inventory (items / credentials / prompt fragments) ─────────────────────

export type InventoryKind = 'item' | 'credential' | 'prompt_fragment';

/** How an inventory row is backed. On-chain seam — 'db' today. */
export type InventoryBacking = 'db' | 'spl_token' | 'nft';

export interface InventoryRow {
	id: string;
	operativeId: string;
	catalogId: string;
	kind: InventoryKind;
	qty: number;
	metadata: Record<string, unknown>;
	backing: InventoryBacking;
	backingRef: string | null;
	acquiredAt: string;
}

/** A catalog definition (static, code-defined) for an item. */
export interface InventoryItem {
	catalogId: string;
	kind: 'item';
	name: string;
	description: string;
	/** Default backing when granted; overridable per-grant. */
	backing?: InventoryBacking;
}

/** A gating credential (e.g. Grid Credential, City IT Keycard). */
export interface Credential {
	catalogId: string;
	kind: 'credential';
	name: string;
	description: string;
}

/** One of Glen's four prompt fragments reassembled in Act 4. */
export interface PromptFragment {
	catalogId: string;
	kind: 'prompt_fragment';
	/** 1..4 — ordering for reassembly. */
	index: 1 | 2 | 3 | 4;
	name: string;
	/** The fragment text revealed to the player. */
	text: string;
}

export type CatalogEntry = InventoryItem | Credential | PromptFragment;

// ── Rewards ───────────────────────────────────────────────────────────────

/** Onions granted via the real Onion DAO API (currency). */
export interface OnionReward {
	kind: 'onions';
	amount: number;
}

/** An inventory grant (item / credential / fragment) on challenge success. */
export interface ItemReward {
	kind: 'inventory';
	catalogId: string;
	qty?: number;
}

/** A bump to the shared festival supply gauge. */
export interface GaugeReward {
	kind: 'gauge';
	amount: number;
}

export type RewardSpec = OnionReward | ItemReward | GaugeReward;

// ── Combat ────────────────────────────────────────────────────────────────

/**
 * One combat roll, as recorded in the server-authoritative roll log. The server
 * generates the roll value and derives damage; secure_random on the badge may
 * supply optional client entropy but never the authoritative value.
 */
export interface CombatRoll {
	wave: number;
	/** Raw roll value (e.g. 0..255). Authoritatively generated server-side. */
	roll: number;
	/** Derived damage after applying weapon/modifiers. */
	dmg: number;
	/**
	 * RESERVED — hex ed25519 signature over `${serverNonce}:${wave}:${roll}`.
	 * Not currently produced by any shipped badge (no Lua signing primitive);
	 * always empty today. Forward-looking hook only.
	 */
	sig: string;
	/** Always false today; reserved for a future badge-signed-roll hook. */
	verified: boolean;
	ts: number;
}

export interface CombatSession {
	id: string;
	operativeId: string;
	challengeId: string;
	serverNonce: string;
	enemyHp: number;
	operativeHp: number;
	wave: number;
	wavesRequired: number;
	rolls: CombatRoll[];
	status: 'active' | 'won' | 'lost' | 'expired';
	createdAt: string;
	expiresAt: string | null;
	resolvedAt: string | null;
}

// ── Beacons ───────────────────────────────────────────────────────────────

export interface BeaconConfig {
	id: string;
	challengeId: string | null;
	name: string;
	landmark: string | null;
	lat: number | null;
	lon: number | null;
	espnowMac: string | null;
	online: boolean;
	source: 'hardware' | 'sim';
}

// ── Storyteller (DEEPDISH) ─────────────────────────────────────────────────

export type StorytellerRole = 'operative' | 'deepdish' | 'system';
export type StorytellerMode = 'npc' | 'dialogue' | 'finale';

export interface StorytellerTurn {
	role: StorytellerRole;
	content: string;
	meta?: Record<string, unknown>;
}

// ── Challenge descriptor (see registry.ts for the module export shape) ─────

/** Per-challenge beacon hosting hints. */
export interface ChallengeBeaconConfig {
	/** Suggested beacon id prefix, e.g. 'b-ketchup'. */
	beaconIdHint?: string;
	landmark?: string;
	/** Sub-GHz / voice / button capabilities this challenge expects. */
	requiresCapabilities?: string[];
}

/**
 * Context handed to a challenge's validate() implementation. The engine
 * provides authenticated operative state + helpers; challenges stay pure-ish.
 */
export interface ChallengeContext {
	operative: Operative;
	/** catalogIds the operative currently holds (items+creds+fragments). */
	inventory: string[];
	/** Persisted per-operative challenge/story flags. */
	flags: Record<string, unknown>;
	/** Bumps/looks up the active combat session for combat challenges. */
	combat?: CombatSession;
	/** Engine-provided side effects; see engine/index.ts. */
	now: number;
}

/** The verdict a challenge's validate() returns. */
export interface ChallengeResult {
	passed: boolean;
	/** Player-facing message (often DEEPDISH-voiced for npc/dialogue). */
	message?: string;
	/** Rewards to grant when passed (engine applies them, not the challenge). */
	rewards?: RewardSpec[];
	/** Arbitrary state delta for the engine to merge into game_state.flags. */
	flags?: Record<string, unknown>;
	/** For multi-step challenges: whether more input is expected. */
	continued?: boolean;
}

/**
 * Static, code-defined challenge descriptor. The dynamic per-attempt logic
 * lives in validate(). See registry.ts for the exact module export contract.
 */
export interface ChallengeDescriptor {
	id: string;
	act: Act;
	type: ChallengeType;
	name: string;
	/** catalogIds required to begin this challenge (credential gating). */
	requires: string[];
	/** Rewards granted on success. */
	rewards: RewardSpec[];
	/** Beacon hosting hints. */
	beaconConfig?: ChallengeBeaconConfig;
	/**
	 * Validate a submitted input against this challenge. Pure-ish: reads ctx,
	 * returns a verdict. The engine persists attempts and applies rewards.
	 */
	validate(input: unknown, ctx: ChallengeContext): Promise<ChallengeResult> | ChallengeResult;
	/** Static content: prompts, button maps, voice targets, screen hints. */
	content?: Record<string, unknown>;
}
