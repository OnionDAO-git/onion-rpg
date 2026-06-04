/**
 * act4-1 — The Server Room (Act 4, Combat). SPEC §5 Act 4.
 *
 * Physical data-center facility where DEEPDISH actually runs.
 *
 * SPEC mechanic:
 *   - Requires: Grid Credential + Dispatch Credential + City IT Keycard.
 *   - Boss-tier RNG combat vs "watchdog processes" — 3 waves.
 *   - Server-authoritative kill: the server owns and records the final hit, so
 *     the win is verifiable from the server's own roll log.
 *   - Lesson: what a data center IS (power/cooling/redundancy/fiber).
 *   - Reward: access to the prompt console (prompt_console_access item).
 *
 * COMBAT PARAMETERS (boss tier — harder than earlier fights):
 *   - Enemy HP per wave: 150  (vs default 100)
 *   - Operative HP: 120       (slightly more headroom for the climax)
 *   - Waves: 3
 *   - TTL: 10 minutes (600 s)
 *
 * FINAL-KILL RULE (server-authoritative):
 *   - The server generates and records every roll, including the wave-3 killing
 *     blow. There is no badge signing primitive (no shipped firmware exposes
 *     onion.se_sign), so the server's own roll log IS the verification: a 'won'
 *     session that reached wave 3 is, by construction, a legitimate kill.
 *   - secure_random (onion.secure_random / ATECC608A) may supply optional client
 *     entropy, but it never gates the win.
 *
 * validate() is called by the ENGINE after applyRoll(); ctx.combat carries the
 * latest CombatSession state.  We return the verdict; the engine applies rewards.
 */
import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import {
	INTRO,
	VICTORY,
	DEFEAT,
	GATE_DENIED,
	WAVE_INTROS,
	LESSON,
} from '../content/act4-1-server-room';

// ── Combat configuration (boss tier) ─────────────────────────────────────

const BOSS_ENEMY_HP = 150;
const BOSS_OP_HP = 120;
const BOSS_WAVES = 3;
const BOSS_TTL_SECONDS = 600; // 10-minute fight window

// ── Required credentials (SPEC §5 Act 4) ─────────────────────────────────

const REQUIRED_CREDENTIALS = ['grid_credential', 'dispatch_credential', 'city_it_keycard'];

// ── Challenge descriptor ──────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	id: '4.1',
	act: 4,
	type: 'combat',
	name: 'The Server Room',

	// All three Act-1–3 credentials must be in inventory before the fight begins.
	requires: REQUIRED_CREDENTIALS,

	rewards: [
		// "Access to the prompt console" — represented as an inventory item so
		// challenge 4.2 can gate on it.
		{ kind: 'inventory', catalogId: 'prompt_console_access' },
		// Onion reward: the SPEC doesn't specify an explicit amount for Act 4;
		// we give a substantial boss reward (200 Onions).
		{ kind: 'onions', amount: 200 },
		// Gauge bump: clearing the data center is a major festival milestone.
		{ kind: 'gauge', amount: 2000 },
	],

	beaconConfig: {
		beaconIdHint: 'b-server-room',
		// Frame as a node near a real local landmark per SPEC note.
		landmark: 'DEEPDISH Data Center — Loop Colo (Aligned w/ 350 E Cermak)',
		requiresCapabilities: ['secRng'],
	},

	content: {
		intro: INTRO,
		gatedMessage: GATE_DENIED,
		waveIntros: WAVE_INTROS,
		lesson: LESSON.datacenterPrimer,
		victory: VICTORY,
		defeat: DEFEAT,

		// Combat parameters echoed here for beacon/sim consumption.
		combatConfig: {
			enemyHp: BOSS_ENEMY_HP,
			opHp: BOSS_OP_HP,
			wavesRequired: BOSS_WAVES,
			ttlSeconds: BOSS_TTL_SECONDS,
			enemyName: 'DEEPDISH Watchdog v1.0',
			// Combat is server-authoritative: the server owns and records every
			// roll, including the wave-3 killing blow. No badge signing exists, so
			// there is no "signed kill" requirement to satisfy.
		},
	},

	validate(input, ctx): ChallengeResult {
		// ── 1. Credential gate ────────────────────────────────────────────────
		//    The engine already enforces `requires` via canBegin(), but we double-
		//    check here so validate() can return an in-character denial message if
		//    called directly (e.g. via a relay race condition).
		const hasAll = REQUIRED_CREDENTIALS.every((id) => ctx.inventory.includes(id));
		if (!hasAll) {
			return {
				passed: false,
				message: GATE_DENIED,
			};
		}

		// ── 2. Combat verdict ─────────────────────────────────────────────────
		//    The engine's CombatSession in ctx.combat is the authoritative state.
		//    The session must exist and be resolved.
		const session = ctx.combat;

		if (!session) {
			// No combat session yet — player hasn't opened a fight.
			return {
				passed: false,
				message: "No active combat session, champ. Start the fight first.",
				continued: true,
			};
		}

		if (session.status === 'active') {
			// Fight still in progress.
			const waveMsg = WAVE_INTROS[session.wave] ?? `Wave ${session.wave}/${session.wavesRequired}.`;
			return {
				passed: false,
				message: waveMsg,
				continued: true,
			};
		}

		if (session.status === 'expired') {
			return {
				passed: false,
				message:
					"Time's up, pal. The data center's cooling systems ran you out. " +
					"Educational footnote: thermal runaway happens fast. Try again.",
			};
		}

		if (session.status === 'lost') {
			return {
				passed: false,
				message: DEFEAT,
			};
		}

		// session.status === 'won'
		// ── 3. Server-authoritative kill ─────────────────────────────────────
		//    The server generated and recorded every roll in this session,
		//    including the wave-3 killing blow. A 'won' session that reached the
		//    final wave is, by construction, a legitimate kill — there is no badge
		//    signature to check (no shipped firmware exposes onion.se_sign).
		const flags: Record<string, unknown> = {
			'4.1:cleared': true,
			// Record timestamp for potential speed-run analytics.
			'4.1:clearedAt': ctx.now,
		};

		return {
			passed: true,
			message: VICTORY,
			flags,
		};
	},
};

registerChallenge(challenge);
export default challenge;
