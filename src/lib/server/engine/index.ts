/**
 * Game engine — orchestration layer between API routes, challenges, inventory,
 * combat, the Onion DAO rewards API, and the DEEPDISH Storyteller.
 *
 * Responsibilities:
 *   - Resolve/upsert operatives from badge identity.
 *   - Build the ChallengeContext for validate() calls.
 *   - Gate challenge begin on `requires` credential list.
 *   - Persist challenge_attempts and apply (inventory) rewards on pass.
 *   - Charge (burn) Onions FROM players via chargeOnions() — economy flip.
 *   - Manage game_state (current_act, challenge_status, flags).
 */
import { sql } from '../db/index';
import { getChallenge, challengesForAct } from '../challenges/registry';
import { grantItem, listCatalogIds, hasAll } from './inventory';
import { findSession } from './combat';
import { createRequest } from '../onion/client';
import type {
	Operative,
	ChallengeContext,
	ChallengeResult,
	RewardSpec
} from '$lib/shared/types';

// ── Operative management ───────────────────────────────────────────────────

/**
 * Resolve or create the operative for a badge identity. Touches last_seen_at
 * on every call so the server can detect offline badges. If `onionId` is
 * supplied and differs from what we have, we update it (badge may not know its
 * onion_id until after first registration).
 */
export async function resolveOperative(
	hardwareId: string,
	onionId?: number
): Promise<Operative> {
	// Upsert on hardware_id.
	const [op] = await sql<Operative[]>`
		INSERT INTO operatives (hardware_id, onion_id, last_seen_at)
		VALUES (
			${hardwareId},
			${onionId ?? null},
			now()
		)
		ON CONFLICT (hardware_id) DO UPDATE
		SET last_seen_at = now(),
		    onion_id     = COALESCE(EXCLUDED.onion_id, operatives.onion_id)
		RETURNING *
	`;

	// Ensure a game_state row exists for this operative.
	await sql`
		INSERT INTO game_state (operative_id)
		VALUES (${op.id})
		ON CONFLICT (operative_id) DO NOTHING
	`;

	return op;
}

/**
 * Register an operative (link onion account, optionally set callsign/attest
 * pubkey). Sets registered=true. Returns the updated row.
 */
export async function registerOperative(
	operativeId: string,
	opts: {
		onionId?: number;
		username?: string;
		callsign?: string;
		attestPubkey?: string;
	}
): Promise<Operative> {
	const [op] = await sql<Operative[]>`
		UPDATE operatives SET
			onion_id     = COALESCE(${opts.onionId ?? null}, onion_id),
			username     = COALESCE(${opts.username ?? null}, username),
			callsign     = COALESCE(${opts.callsign ?? null}, callsign),
			attest_pubkey = COALESCE(${opts.attestPubkey ?? null}, attest_pubkey),
			registered   = TRUE,
			last_seen_at = now()
		WHERE id = ${operativeId}
		RETURNING *
	`;
	if (!op) throw new Error(`operative not found: ${operativeId}`);
	return op;
}

/** Load a full Operative by id. */
export async function getOperative(operativeId: string): Promise<Operative | null> {
	const [row] = await sql<Operative[]>`
		SELECT * FROM operatives WHERE id = ${operativeId}
	`;
	return row ?? null;
}

// ── Context ────────────────────────────────────────────────────────────────

/**
 * Build the ChallengeContext for a validate() call. Loads:
 *   - operative row
 *   - current inventory catalogIds
 *   - latest combat session for the challenge (if any)
 */
export async function buildContext(
	operativeId: string,
	challengeId: string
): Promise<ChallengeContext> {
	const op = await getOperative(operativeId);
	if (!op) throw new Error(`operative not found: ${operativeId}`);

	const inventory = await listCatalogIds(operativeId);
	const combat = (await findSession(operativeId, challengeId)) ?? undefined;

	return {
		operative: op,
		inventory,
		combat,
		now: Date.now()
	};
}

// ── Gating ────────────────────────────────────────────────────────────────

/**
 * Check `requires` credential gating before a challenge may begin. Returns
 * false for unknown challenge ids.
 */
export async function canBegin(operativeId: string, challengeId: string): Promise<boolean> {
	const challenge = getChallenge(challengeId);
	if (!challenge) return false;
	if (challenge.requires.length === 0) return true;
	return hasAll(operativeId, challenge.requires);
}

// ── Reward application ─────────────────────────────────────────────────────

/**
 * Apply a list of RewardSpec entries for a completed challenge.
 *
 * ECONOMY FLIP (S1): this fork grants INVENTORY only. The legacy 'onions'
 * (player reward) and 'gauge' branches are intentionally retired —
 *   - Onions now flow the OTHER way (player → dev) via chargeOnions().
 *   - The supply gauge is repurposed as the Colony meter (Part B).
 * The RewardSpec union and queueOnionReward() are kept intact for reference and
 * are simply no longer invoked, so any challenge still declaring an 'onions' or
 * 'gauge' reward is now a harmless no-op rather than an onion-award request.
 */
export async function applyRewards(
	operativeId: string,
	challengeId: string,
	attemptId: string,
	rewards: RewardSpec[]
): Promise<void> {
	// challengeId/attemptId were only used to build the retired onion externalId.
	void challengeId;
	void attemptId;
	for (const reward of rewards) {
		if (reward.kind === 'inventory') {
			await grantItem(operativeId, reward.catalogId, { qty: reward.qty });
		} else if (reward.kind === 'xp') {
			await grantXp(operativeId, reward.amount);
		}
	}
}

// ── Player progression (Part B / B1) ───────────────────────────────────────

/** XP needed per level; level = 1 + floor(xp / XP_PER_LEVEL). */
export const XP_PER_LEVEL = 100;

/** Pure helper: derive level from total xp. */
export function levelForXp(xp: number): number {
	return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

/**
 * Add experience to an operative and recompute their derived level in the same
 * UPDATE (RHS references read the pre-update xp). Additive and safe to call
 * repeatedly; the engine is the only writer of xp/level.
 */
export async function grantXp(operativeId: string, amount: number): Promise<void> {
	if (!Number.isFinite(amount) || amount === 0) return;
	await sql`
		UPDATE game_state SET
			xp    = xp + ${amount},
			level = GREATEST(1, 1 + (xp + ${amount}) / ${XP_PER_LEVEL}),
			updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
}

/**
 * Charge (burn) Onions FROM a player to the dev/treasury — the economy-flip
 * inverse of the retired reward path. Used by the store and other player-pays
 * sinks (Part B). Idempotent on `externalId`: a duplicate call is a no-op and
 * never fires a second Onion DAO request. Writes a 'burn' row to the existing
 * onion_rewards ledger.
 *
 *   chargeOnions(opId, 25, 'store:gear_chest', `${opId}:store:gear_chest:1`)
 */
export async function chargeOnions(
	operativeId: string,
	amount: number,
	reason: string,
	externalId: string
): Promise<void> {
	// Idempotency: if we already recorded this externalId, the burn is in flight
	// or settled — do nothing.
	const [existing] = await sql<{ id: string; status: string; onionRequestId: string | null }[]>`
		SELECT id, status, onion_request_id FROM onion_rewards WHERE external_id = ${externalId}
	`;
	if (existing) return;

	// The player is the payer; we need their linked Onion username to burn from.
	const [op] = await sql<{ username: string | null }[]>`
		SELECT username FROM operatives WHERE id = ${operativeId}
	`;
	const username = op?.username;

	// Record the ledger row first so we have a trace even if the API call fails.
	const [ledgerRow] = await sql<{ id: string }[]>`
		INSERT INTO onion_rewards
			(operative_id, challenge_id, request_type, amount, external_id)
		VALUES
			(${operativeId}, ${null}, 'burn', ${amount}, ${externalId})
		ON CONFLICT (external_id) DO NOTHING
		RETURNING id
	`;
	if (!ledgerRow) return; // lost race, skip

	if (!username) {
		await sql`
			UPDATE onion_rewards
			SET status = 'failed', error = 'operative has no linked username',
			    updated_at = now()
			WHERE id = ${ledgerRow.id}
		`;
		return;
	}

	try {
		const { id: onionRequestId, status } = await createRequest({
			type: 'burn',
			username, // the player burns from their own balance
			amount,
			externalId,
			note: `ONION RPG charge — ${reason}`
		});

		await sql`
			UPDATE onion_rewards
			SET onion_request_id = ${onionRequestId},
			    status           = ${status},
			    updated_at       = now()
			WHERE id = ${ledgerRow.id}
		`;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await sql`
			UPDATE onion_rewards
			SET status = 'failed', error = ${msg}, updated_at = now()
			WHERE id = ${ledgerRow.id}
		`;
	}
}

/**
 * Insert an onion_rewards ledger row and call the Onion DAO API. If the row
 * already exists (idempotency) we skip the API call since the request is
 * already in flight or completed.
 */
async function queueOnionReward(
	operativeId: string,
	challengeId: string,
	amount: number,
	externalId: string
): Promise<void> {
	// Check for existing row to avoid duplicate API calls.
	const [existing] = await sql<{ id: string; status: string; onionRequestId: string | null }[]>`
		SELECT id, status, onion_request_id FROM onion_rewards WHERE external_id = ${externalId}
	`;
	if (existing) return; // already created (idempotent)

	// Resolve username for the transfer recipient.
	const [op] = await sql<{ username: string | null }[]>`
		SELECT username FROM operatives WHERE id = ${operativeId}
	`;
	const username = op?.username;

	// Insert the ledger row first so we have a record even if the API call fails.
	const [ledgerRow] = await sql<{ id: string }[]>`
		INSERT INTO onion_rewards
			(operative_id, challenge_id, request_type, amount, external_id)
		VALUES
			(${operativeId}, ${challengeId}, 'transfer', ${amount}, ${externalId})
		ON CONFLICT (external_id) DO NOTHING
		RETURNING id
	`;
	if (!ledgerRow) return; // lost race, skip

	if (!username) {
		// Operative hasn't linked their Onion account yet — reward is in a
		// pending/holdable state until they register. The webhook will never come,
		// so we mark failed with a descriptive error so admins can reconcile.
		await sql`
			UPDATE onion_rewards
			SET status = 'failed', error = 'operative has no linked username',
			    updated_at = now()
			WHERE id = ${ledgerRow.id}
		`;
		return;
	}

	try {
		const { id: onionRequestId, status } = await createRequest({
			type: 'transfer',
			username: username, // treasury/app account — oRPG is the sender
			recipientUsername: username, // reward goes TO the operative
			amount,
			externalId,
			note: `ONION RPG reward — challenge ${challengeId}`
		});

		await sql`
			UPDATE onion_rewards
			SET onion_request_id = ${onionRequestId},
			    status           = ${status},
			    updated_at       = now()
			WHERE id = ${ledgerRow.id}
		`;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await sql`
			UPDATE onion_rewards
			SET status = 'failed', error = ${msg}, updated_at = now()
			WHERE id = ${ledgerRow.id}
		`;
	}
}

// ── Challenge lifecycle ────────────────────────────────────────────────────

/**
 * Begin a challenge: check gating, upsert a challenge_attempts row (status
 * 'started'), return the challenge descriptor's intro content.
 */
export async function beginChallenge(
	operativeId: string,
	challengeId: string,
	beaconId?: string
): Promise<{ attemptId: string; content: Record<string, unknown> }> {
	const challenge = getChallenge(challengeId);
	if (!challenge) throw new Error(`unknown challenge: ${challengeId}`);

	const allowed = await canBegin(operativeId, challengeId);
	if (!allowed) {
		throw new Error(
			`cannot begin ${challengeId}: requires ${challenge.requires.join(', ')}`
		);
	}

	// Insert a new attempt row. Each begin creates a fresh attempt; we don't
	// reuse started attempts — badge can always retry from begin.
	const [attempt] = await sql<{ id: string }[]>`
		INSERT INTO challenge_attempts
			(operative_id, challenge_id, challenge_type, beacon_id, status)
		VALUES
			(${operativeId}, ${challengeId}, ${challenge.type}, ${beaconId ?? null}, 'started')
		RETURNING id
	`;

	// Update game_state challenge_status to 'in_progress' (don't downgrade cleared).
	await sql`
		UPDATE game_state SET
			challenge_status = jsonb_set(
				challenge_status,
				${`{${challengeId}}`}::text[],
				(CASE
					WHEN (challenge_status->>${challengeId}) = 'cleared'
					THEN '"cleared"'
					ELSE '"in_progress"'
				END)::jsonb
			),
			updated_at = now()
		WHERE operative_id = ${operativeId}
	`;

	return {
		attemptId: attempt.id,
		content: (challenge.content ?? {}) as Record<string, unknown>
	};
}

/**
 * Submit/validate a challenge attempt.
 *
 *   1. buildContext() to give validate() live state.
 *   2. challenge.validate(input, ctx)
 *   3. Persist the attempt (status = 'passed'|'failed').
 *   4. On pass: applyRewards(), update game_state act if needed, mark cleared.
 *   5. Return the ChallengeResult.
 */
export async function submitChallenge(
	operativeId: string,
	challengeId: string,
	input: unknown,
	attemptId?: string
): Promise<ChallengeResult> {
	const challenge = getChallenge(challengeId);
	if (!challenge) throw new Error(`unknown challenge: ${challengeId}`);

	const ctx = await buildContext(operativeId, challengeId);
	const result = await challenge.validate(input, ctx);
	const status = result.passed ? 'passed' : result.continued ? 'started' : 'failed';

	if (attemptId) {
		await sql`
			UPDATE challenge_attempts SET
				status      = ${status},
				input       = ${sql.json(input as any)},
				result      = ${sql.json(result as any)},
				resolved_at = CASE WHEN ${status} <> 'started' THEN now() ELSE NULL END
			WHERE id = ${attemptId} AND operative_id = ${operativeId}
		`;
	}

	if (result.passed) {
		// Apply the challenge's declared rewards (plus any per-result overrides).
		const rewards = result.rewards ?? challenge.rewards;
		const aid = attemptId ?? 'noattempt';
		await applyRewards(operativeId, challengeId, aid, rewards);

		// Merge any result flags into game_state.flags.
		if (result.flags && Object.keys(result.flags).length > 0) {
			await mergeFlags(operativeId, result.flags);
		}

		// Mark the challenge as cleared.
		await sql`
			UPDATE game_state SET
				challenge_status = jsonb_set(
					challenge_status,
					${`{${challengeId}}`}::text[],
					'"cleared"'::jsonb
				),
				updated_at = now()
			WHERE operative_id = ${operativeId}
		`;

		// Advance act if all challenges in the current act are cleared.
		await maybeAdvanceAct(operativeId, challenge.act);
	}

	return result;
}

/** Merge arbitrary flags into game_state.flags (non-destructive). */
async function mergeFlags(
	operativeId: string,
	flags: Record<string, unknown>
): Promise<void> {
	await sql`
		UPDATE game_state SET
			flags      = flags || ${sql.json(flags as any)},
			updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
}

/**
 * Advance current_act if every challenge in `act` is now cleared.
 */
async function maybeAdvanceAct(operativeId: string, act: number): Promise<void> {
	const actChallenges = challengesForAct(act);
	if (actChallenges.length === 0) return;

	const [gs] = await sql<{ currentAct: number; challengeStatus: Record<string, string> }[]>`
		SELECT current_act, challenge_status FROM game_state WHERE operative_id = ${operativeId}
	`;
	if (!gs || gs.currentAct !== act) return; // already past this act

	const allCleared = actChallenges.every(
		(c) => gs.challengeStatus[c.id] === 'cleared'
	);
	if (!allCleared) return;

	const nextAct = act + 1;
	if (nextAct > 4) return;

	await sql`
		UPDATE game_state SET current_act = ${nextAct}, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
}

// ── State queries ──────────────────────────────────────────────────────────

/** Full game-state for an operative (act, challenge_status, hp, flags, xp, level). */
export async function getGameState(operativeId: string): Promise<{
	currentAct: number;
	challengeStatus: Record<string, string>;
	hp: number;
	flags: Record<string, unknown>;
	xp: number;
	level: number;
} | null> {
	const [row] = await sql<{
		currentAct: number;
		challengeStatus: Record<string, string>;
		hp: number;
		flags: Record<string, unknown>;
		xp: number;
		level: number;
	}[]>`
		SELECT current_act, challenge_status, hp, flags, xp, level
		FROM game_state WHERE operative_id = ${operativeId}
	`;
	return row ?? null;
}
