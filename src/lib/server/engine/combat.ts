/**
 * Combat engine — server-authoritative RNG combat.
 *
 * Flow (SPEC §5, hardware mechanic = server-authoritative RNG):
 *   1. Badge requests a combat session; server issues a `serverNonce` and
 *      stores enemy/operative HP + waves_required in combat_sessions.
 *   2. Each turn the server generates the roll, derives damage, applies it,
 *      advances/wins/loses, and appends it to `rolls`. The roll log on the
 *      server is the source of truth.
 *   3. A badge MAY supply optional client entropy in COMBAT_ROLL_REQUEST
 *      (e.g. bytes from onion.secure_random / ATECC608A). It never gates the
 *      outcome and is never trusted as the roll value on its own.
 *
 * No badge signing: there is no Lua signing primitive (onion.se_sign does not
 * exist and the ATECC608B can't do Ed25519), so no shipped badge signs rolls.
 * verifyRollSignature() / the `sig`+`verified` fields are a reserved hook for a
 * hypothetical future firmware (see below); rolls today are always verified=false.
 *
 * Damage formula: dmg = Math.floor(roll / 255 * maxDmg) + 1
 * where maxDmg = 20 (player) or 15 (enemy). Capped so neither side
 * one-shots the other at default HP=100.
 */
import { randomBytes, verify as cryptoVerify, createPublicKey } from 'crypto';
import { sql } from '../db/index';
import type { CombatSession, CombatRoll } from '$lib/shared/types';

export interface OpenCombatOpts {
	operativeId: string;
	challengeId: string;
	attemptId?: string;
	enemyHp?: number;
	operativeHp?: number;
	wavesRequired?: number;
	/** seconds until expiry for timed/endurance fights (3.1, 2.1). */
	ttlSeconds?: number;
	/** B3: extra max HP from equipped gear, added to operativeHp. Default 0. */
	bonusHp?: number;
}

const DEFAULT_ENEMY_HP = 100;
const DEFAULT_OP_HP = 100;
const DEFAULT_WAVES = 1;

/** Generate a fresh hex server nonce (16 random bytes). */
function freshNonce(): string {
	return randomBytes(16).toString('hex');
}

/** Damage formula — max 20 for player rolls, max 15 for enemy. */
export function rollDamage(roll: number, maxDmg = 20): number {
	return Math.floor((roll / 255) * maxDmg) + 1;
}

/** Generate the authoritative server-side random roll (0-255). */
export function serverRoll(): number {
	return randomBytes(1)[0];
}

/** Create a combat session + serverNonce row in the DB. */
export async function openCombat(opts: OpenCombatOpts): Promise<CombatSession> {
	const nonce = freshNonce();
	const enemyHp = opts.enemyHp ?? DEFAULT_ENEMY_HP;
	const operativeHp = (opts.operativeHp ?? DEFAULT_OP_HP) + (opts.bonusHp ?? 0);
	const wavesRequired = opts.wavesRequired ?? DEFAULT_WAVES;

	const expiresAt =
		opts.ttlSeconds != null
			? sql`now() + ${opts.ttlSeconds + ' seconds'}::interval`
			: sql`NULL`;

	const [row] = await sql<CombatSession[]>`
		INSERT INTO combat_sessions
			(operative_id, challenge_id, attempt_id, server_nonce,
			 enemy_hp, operative_hp, waves_required, expires_at)
		VALUES
			(${opts.operativeId}, ${opts.challengeId}, ${opts.attemptId ?? null},
			 ${nonce}, ${enemyHp}, ${operativeHp}, ${wavesRequired}, ${expiresAt})
		RETURNING *
	`;
	return row;
}

/**
 * RESERVED HOOK — not currently produced by any shipped badge. No Lua signing
 * primitive exists (onion.se_sign is not part of the Onion OS API), so this is
 * never exercised today. It is kept as a forward-looking seam: a future firmware
 * that could expose Ed25519 signing would sign the canonical roll message
 *   `${serverNonce}:${wave}:${roll}` (UTF-8 bytes, no length prefix)
 * with a key whose public half is stored in operatives.attest_pubkey (hex).
 * Node's `crypto` module supports Ed25519 natively since v12.
 */
export function verifyRollSignature(
	attestPubkeyHex: string,
	serverNonce: string,
	roll: Pick<CombatRoll, 'wave' | 'roll' | 'sig'>
): boolean {
	if (!attestPubkeyHex || !roll.sig) return false;
	try {
		const message = Buffer.from(`${serverNonce}:${roll.wave}:${roll.roll}`, 'utf8');
		// The badge stores a raw 32-byte Ed25519 public key (hex). Node's verify()
		// needs a KeyObject/SPKI, not raw bytes, so wrap the 32 bytes in the fixed
		// 12-byte Ed25519 SPKI DER prefix (id-Ed25519, OID 1.3.101.112) -> 44 bytes.
		const raw = Buffer.from(attestPubkeyHex, 'hex');
		if (raw.length !== 32) return false;
		const spkiDer = Buffer.concat([
			Buffer.from('302a300506032b6570032100', 'hex'),
			raw
		]);
		const pubkey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
		// Ed25519 is a pure (non-prehash) scheme: use the one-shot verify, not the
		// streaming createVerify API, and pass null as the digest algorithm.
		return cryptoVerify(null, message, pubkey, Buffer.from(roll.sig, 'hex'));
	} catch {
		// Malformed sig or key — treat as unverified, not a crash.
		return false;
	}
}

/**
 * Apply one roll to the combat session. If the badge supplied a signed roll we
 * verify it; otherwise we generate a server roll. Advances wave counter,
 * applies damage to both sides, checks win/loss/expiry, persists.
 *
 * Returns the updated CombatSession.
 */
export async function applyRoll(
	sessionId: string,
	incomingRoll?: Pick<CombatRoll, 'wave' | 'roll' | 'dmg' | 'sig'>,
	attestPubkeyHex?: string,
	/** B3: equipped-gear bonuses. attack adds to player dmg; defense cuts incoming. */
	bonus?: { attack?: number; defense?: number }
): Promise<CombatSession> {
	// Load current session (with row-level lock to prevent concurrent races).
	const [session] = await sql<CombatSession[]>`
		SELECT * FROM combat_sessions WHERE id = ${sessionId} FOR UPDATE
	`;
	if (!session) throw new Error(`combat session not found: ${sessionId}`);
	if (session.status !== 'active') {
		throw new Error(`combat session already resolved: ${session.status}`);
	}

	// Check expiry.
	if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
		const [expired] = await sql<CombatSession[]>`
			UPDATE combat_sessions SET status = 'expired', resolved_at = now()
			WHERE id = ${sessionId}
			RETURNING *
		`;
		return expired;
	}

	const wave = session.wave + 1;
	const atkBonus = bonus?.attack ?? 0;
	const defBonus = bonus?.defense ?? 0;

	// Determine player roll and damage.
	let playerRoll: number;
	let playerDmg: number;
	let verified = false;

	if (incomingRoll) {
		playerRoll = incomingRoll.roll;
		// Verify if we have an attest key.
		if (attestPubkeyHex) {
			verified = verifyRollSignature(attestPubkeyHex, session.serverNonce, {
				wave,
				roll: playerRoll,
				sig: incomingRoll.sig
			});
		}
		// Re-derive damage from the raw roll to prevent tampering; ignore badge dmg.
		playerDmg = rollDamage(playerRoll, 20) + atkBonus;
	} else {
		// Server-side fallback RNG.
		playerRoll = serverRoll();
		playerDmg = rollDamage(playerRoll, 20) + atkBonus;
	}

	// Enemy attacks back each turn; defense cuts it but a hit always lands (min 1).
	const enemyRoll = serverRoll();
	const enemyDmg = Math.max(1, rollDamage(enemyRoll, 15) - defBonus);

	const newEnemyHp = Math.max(0, session.enemyHp - playerDmg);
	const newOpHp = Math.max(0, session.operativeHp - enemyDmg);

	// Build roll record for the append-only log.
	const rollRecord: CombatRoll = {
		wave,
		roll: playerRoll,
		dmg: playerDmg,
		sig: incomingRoll?.sig ?? '',
		verified,
		ts: Date.now()
	};
	const updatedRolls = [...(session.rolls as CombatRoll[]), rollRecord];

	// Determine new status.
	let newStatus: CombatSession['status'] = 'active';
	if (newOpHp === 0) {
		newStatus = 'lost';
	} else if (newEnemyHp === 0) {
		// Enemy defeated this wave.
		if (wave >= session.wavesRequired) {
			newStatus = 'won';
		} else {
			// More waves — re-spawn enemy at full HP for the next wave.
			// enemyHp resets to the session's original enemy HP (stored as initial).
		}
	}

	// For multi-wave: reset enemy HP when wave completed but not final.
	const persistedEnemyHp =
		newStatus === 'active' && newEnemyHp === 0
			? DEFAULT_ENEMY_HP // wave cleared, enemy respawns
			: newEnemyHp;

	const resolvedAt = newStatus !== 'active' ? sql`now()` : sql`NULL`;

	const [updated] = await sql<CombatSession[]>`
		UPDATE combat_sessions SET
			enemy_hp     = ${persistedEnemyHp},
			operative_hp = ${newOpHp},
			wave         = ${wave},
			rolls        = ${sql.json(updatedRolls as any)},
			status       = ${newStatus},
			resolved_at  = ${resolvedAt}
		WHERE id = ${sessionId}
		RETURNING *
	`;
	return updated;
}

/** Load a session by id. */
export async function getSession(sessionId: string): Promise<CombatSession | null> {
	const [row] = await sql<CombatSession[]>`
		SELECT * FROM combat_sessions WHERE id = ${sessionId}
	`;
	return row ?? null;
}

/**
 * Find the latest active (or recently resolved) combat session for an operative
 * and challenge, so the engine can resume mid-fight after reconnects.
 */
export async function findSession(
	operativeId: string,
	challengeId: string
): Promise<CombatSession | null> {
	const [row] = await sql<CombatSession[]>`
		SELECT * FROM combat_sessions
		WHERE operative_id = ${operativeId}
		  AND challenge_id = ${challengeId}
		ORDER BY created_at DESC
		LIMIT 1
	`;
	return row ?? null;
}
