/**
 * Bosses — global timed events (GAME_MECHANICS.md §7).
 *
 * v1 model (per fork decision): PERSONAL INSTANCE. A boss window opens
 * periodically; while open, any operative can start their own boss fight at a
 * boss beacon. Bosses do NOT cost energy and are gated by the global Colony
 * level (tougher bosses = better loot). Fights reuse the server-authoritative
 * combat engine (challengeId `boss:<id>`); equipped gear attack/defense apply.
 *
 * Player HP (game_state.hp) is persistent: a boss fight starts at the player's
 * current HP and writes it back after every roll. HP lazily regens to full 30
 * min after dropping (mirrors energy). Potions and revives restore HP for onions
 * (onion sinks #2/#3). True mid-session healing / shared-HP raids are later work.
 */
import { sql } from '../db/index';
import { openCombat, applyRoll } from './combat';
import { getLoadoutStats } from './gear';
import { grantItem } from './inventory';
import { colonyLevelAtLeast } from './colony';
import { chargeOnions } from './index';
import type { CombatSession, CombatRoll } from '$lib/shared/types';

/** Tunables — see GAME_MECHANICS.md "Implementation parameters". */
export const MAX_HP = 100;
export const HP_REGEN_MS = 30 * 60 * 1000; // full regen 30 min after dropping
export const POTION_COST = 3; // onions — full heal
export const REVIVE_COST = 8; // onions — restore HP after a loss
export const BOSS_WINDOW_PERIOD_MS = 60 * 60 * 1000; // a window every hour…
export const BOSS_WINDOW_DURATION_MS = 15 * 60 * 1000; // …open for 15 min

export interface BossDef {
	id: string;
	name: string;
	/** Colony level required to fight this boss. */
	requiredColonyLevel: number;
	enemyHp: number;
	wavesRequired: number;
	/** Catalog id of the chest granted on defeat. */
	loot: string;
}

/** Boss tiers gated by Colony level; tougher = better loot. */
export const BOSSES: Record<string, BossDef> = {
	boss_vienna_titan: {
		id: 'boss_vienna_titan',
		name: 'Vienna Bob, Ascended',
		requiredColonyLevel: 0,
		enemyHp: 60,
		wavesRequired: 1,
		loot: 'scrap_chest'
	},
	boss_deepdish_core: {
		id: 'boss_deepdish_core',
		name: 'The Deep-Dish Core',
		requiredColonyLevel: 1,
		enemyHp: 120,
		wavesRequired: 1,
		loot: 'colony_chest'
	},
	boss_glen_prime: {
		id: 'boss_glen_prime',
		name: 'glen-agent-final-FINAL-v3',
		requiredColonyLevel: 2,
		enemyHp: 220,
		wavesRequired: 1,
		loot: 'colony_chest'
	}
};

export interface BossWindow {
	open: boolean;
	/** ms until the window opens (if closed) or closes (if open). */
	msUntilChange: number;
}

/** Pure: is a boss window open at `now`? Periodic schedule, no cron. */
export function bossWindowState(now: number = Date.now()): BossWindow {
	const phase = ((now % BOSS_WINDOW_PERIOD_MS) + BOSS_WINDOW_PERIOD_MS) % BOSS_WINDOW_PERIOD_MS;
	const open = phase < BOSS_WINDOW_DURATION_MS;
	const msUntilChange = open
		? BOSS_WINDOW_DURATION_MS - phase
		: BOSS_WINDOW_PERIOD_MS - phase;
	return { open, msUntilChange };
}

/** Bosses currently unlocked by the global Colony level. */
export async function availableBosses(): Promise<BossDef[]> {
	const out: BossDef[] = [];
	for (const boss of Object.values(BOSSES)) {
		if (await colonyLevelAtLeast(boss.requiredColonyLevel)) out.push(boss);
	}
	return out;
}

// ── Persistent player HP (lazy regen) ───────────────────────────────────────

interface HpRow {
	hp: number;
	hpRegenAt: string | Date | null;
}

/** Current HP with lazy full-regen applied (30 min after dropping). */
export async function getPlayerHp(operativeId: string): Promise<number> {
	const [row] = await sql<HpRow[]>`
		SELECT hp, hp_regen_at FROM game_state WHERE operative_id = ${operativeId}
	`;
	if (!row) return 0;
	if (row.hpRegenAt != null && row.hp < MAX_HP) {
		const elapsed = Date.now() - new Date(row.hpRegenAt).getTime();
		if (elapsed >= HP_REGEN_MS) {
			await sql`
				UPDATE game_state SET hp = ${MAX_HP}, hp_regen_at = ${null}, updated_at = now()
				WHERE operative_id = ${operativeId}
			`;
			return MAX_HP;
		}
	}
	return row.hp;
}

/** Set HP (clamped 0..MAX); stamps the regen timer when below full. */
async function setPlayerHp(operativeId: string, hp: number): Promise<number> {
	const clamped = Math.max(0, Math.min(MAX_HP, hp));
	const regenAt = clamped < MAX_HP ? new Date() : null;
	await sql`
		UPDATE game_state SET hp = ${clamped}, hp_regen_at = ${regenAt}, updated_at = now()
		WHERE operative_id = ${operativeId}
	`;
	return clamped;
}

// ── Boss fights (personal instance, reuse combat engine) ────────────────────

/** Start a personal boss fight: window + colony gate + HP checks, then open combat. */
export async function startBoss(
	operativeId: string,
	bossId: string,
	now: number = Date.now()
): Promise<CombatSession> {
	if (!bossWindowState(now).open) throw new Error('boss window is closed');
	const boss = BOSSES[bossId];
	if (!boss) throw new Error(`unknown boss: ${bossId}`);
	if (!(await colonyLevelAtLeast(boss.requiredColonyLevel))) {
		throw new Error(`boss ${bossId} locked: colony level ${boss.requiredColonyLevel} required`);
	}
	const hp = await getPlayerHp(operativeId);
	if (hp <= 0) throw new Error('no HP — revive or wait for regen');

	return openCombat({
		operativeId,
		challengeId: `boss:${bossId}`,
		enemyHp: boss.enemyHp,
		operativeHp: hp,
		wavesRequired: boss.wavesRequired
	});
}

export interface BossRollResult {
	session: CombatSession;
	hp: number;
	/** Loot chest catalog id granted on defeat. */
	loot?: string;
}

/** Apply one boss combat roll: gear stats apply, HP persists, loot drops on win. */
export async function resolveBossRoll(
	operativeId: string,
	sessionId: string,
	bossId: string,
	roll?: Pick<CombatRoll, 'wave' | 'roll' | 'dmg' | 'sig'>
): Promise<BossRollResult> {
	const stats = await getLoadoutStats(operativeId);
	const session = await applyRoll(sessionId, roll, undefined, {
		attack: stats.attack,
		defense: stats.defense
	});
	const hp = await setPlayerHp(operativeId, session.operativeHp);

	let loot: string | undefined;
	if (session.status === 'won') {
		const boss = BOSSES[bossId];
		if (boss) {
			await grantItem(operativeId, boss.loot, { qty: 1 });
			loot = boss.loot;
		}
	}
	return { session, hp, loot };
}

// ── Heals (onion sinks) ─────────────────────────────────────────────────────

/** Potion: pay onions, full heal. `externalId` must be unique per purchase. */
export async function buyPotion(operativeId: string, externalId: string): Promise<number> {
	await chargeOnions(operativeId, POTION_COST, 'boss:potion', externalId);
	return setPlayerHp(operativeId, MAX_HP);
}

/** Revive: pay onions, restore HP after a loss. Unique `externalId` per use. */
export async function revive(operativeId: string, externalId: string): Promise<number> {
	await chargeOnions(operativeId, REVIVE_COST, 'boss:revive', externalId);
	return setPlayerHp(operativeId, MAX_HP);
}
