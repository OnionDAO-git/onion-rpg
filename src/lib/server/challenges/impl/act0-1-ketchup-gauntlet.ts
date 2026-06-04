/**
 * Act 0 / Challenge 0.1 — The Ketchup Gauntlet (Combat).
 * SPEC §5 Act 0: robot hot dog vendor turns hostile when you "order ketchup."
 *
 * Mechanic: Server-authoritative RNG combat. The server generates and records
 * every roll; secure_random (onion.secure_random / ATECC608A) provides optional
 * client entropy only. No shipped badge can sign rolls.
 *
 * This challenge ALSO performs Operative registration (first-time only):
 * on a passed combat session, if the operative is not yet registered, we call
 * registerOperative() as a one-time side effect. This is the only challenge
 * where registration is a designed narrative beat (SPEC §5 Act 0 reward).
 *
 * Rewards (applied by the engine on pass):
 *   - Inventory: encased_meat_mk1   (first weapon — "Encased Meat Mk.I")
 *   - Onions: 50                    (via real Onion DAO API)
 *   - Gauge: 500                    (shared festival supply win-bar)
 *
 * The challenge descriptor's `content` block is consumed by the relay/engine
 * and forwarded to the badge as the CHALLENGE_INTRO body.
 */

import { registerChallenge } from '../registry';
import { registerOperative } from '$lib/server/engine/index';
import type {
	ChallengeDescriptor,
	ChallengeResult,
	ChallengeContext
} from '$lib/shared/types';
import {
	CHALLENGE_INTRO,
	VENDOR_INTRO,
	WIN_MESSAGE,
	WIN_LESSON,
	LOSS_MESSAGE,
	KETCHUP_TRIGGER_LINES,
	NORMAL_ORDER_TRIGGER_LINES,
	WAVE_TAUNTS,
	EDUCATIONAL_FOOTNOTE,
	REWARD_FLAVOR,
	REGISTRATION_SUCCESS
} from '../content/act0-1-ketchup-gauntlet';

// ── Wave configuration ────────────────────────────────────────────────────────

/** Ketchup Gauntlet is a single-wave tutorial fight. */
const WAVES_REQUIRED = 1;

/** Vienna Bob's stats — tutorial difficulty (lenient). */
const ENEMY_HP = 80;
const OPERATIVE_HP = 100;

// ── Validate function ─────────────────────────────────────────────────────────

/**
 * Validate a submitted combat input for The Ketchup Gauntlet.
 *
 * Input shape (from the badge via COMBAT_ROLL_REQUEST):
 *   { action: 'begin' }                      — open a new combat session
 *   { action: 'roll', ketchup?: boolean }     — submit a roll tick
 *   { action: 'status' }                      — query current session
 *
 * The combat engine (engine/combat.ts) owns session persistence and roll
 * processing. This validate() reads the final session state from ctx.combat
 * and returns a ChallengeResult verdict.
 *
 * For ongoing combat (session still active): return { passed: false, continued: true }
 * so the engine records the tick without marking the attempt failed.
 *
 * When the session resolves to 'won': trigger operative registration as a side
 * effect, then return passed=true so the engine applies rewards.
 */
async function validate(
	input: unknown,
	ctx: ChallengeContext
): Promise<ChallengeResult> {
	const session = ctx.combat;

	// ── No active session: instruct the engine to open one ───────────────────
	// The relay handler calls openCombat() before calling validate(); if there
	// is no session yet, returning continued=true keeps the attempt alive while
	// the engine provisions one on the next COMBAT_ROLL_REQUEST.
	if (!session) {
		return {
			passed: false,
			continued: true,
			message: CHALLENGE_INTRO
		};
	}

	// ── Session expired ───────────────────────────────────────────────────────
	if (session.status === 'expired') {
		return {
			passed: false,
			message:
				"Vienna Bob outlasted you, champ. The beacon timed out. " +
				"That's okay — the dog stand isn't going anywhere. Try again."
		};
	}

	// ── Session lost (operative HP → 0) ──────────────────────────────────────
	if (session.status === 'lost') {
		return {
			passed: false,
			message: LOSS_MESSAGE
		};
	}

	// ── Session still active (combat ongoing) ────────────────────────────────
	if (session.status === 'active') {
		// Look up a wave taunt if we have one for the current wave.
		const taunt = WAVE_TAUNTS[session.wave] ?? '';
		return {
			passed: false,
			continued: true,
			message: taunt || `Wave ${session.wave}/${WAVES_REQUIRED} — keep rolling.`
		};
	}

	// ── Session won ───────────────────────────────────────────────────────────
	if (session.status === 'won') {
		// Operative registration: one-time side effect on first win.
		// If already registered this is a no-op (DB upsert is idempotent).
		try {
			if (!ctx.operative.registered) {
				await registerOperative(ctx.operative.id, {
					// Preserve any onionId/username already on the row.
					onionId:    ctx.operative.onionId    ?? undefined,
					username:   ctx.operative.username   ?? undefined,
					callsign:   ctx.operative.callsign   ?? undefined,
					attestPubkey: ctx.operative.attestPubkey ?? undefined
				});
			}
		} catch {
			// Registration failure is non-fatal for the challenge result;
			// the engine will still apply rewards. Log is sufficient.
			// (The operative row is still in the DB; re-registration can happen
			// via the account-linking flow later.)
		}

		// Did the player order ketchup? Track it in flags for future DEEPDISH flavor.
		const inp = input as Record<string, unknown> | null | undefined;
		const orderedKetchup = Boolean(inp && inp['ketchup']);

		const triggerLine = orderedKetchup
			? KETCHUP_TRIGGER_LINES[0]
			: NORMAL_ORDER_TRIGGER_LINES[0];

		const fullMessage = [
			WIN_MESSAGE,
			'',
			triggerLine,
			'',
			WIN_LESSON,
			'',
			EDUCATIONAL_FOOTNOTE,
			'',
			REWARD_FLAVOR.operativeCredential
		].join('\n');

		return {
			passed: true,
			message: fullMessage,
			flags: {
				ketchup_gauntlet_cleared: true,
				ordered_ketchup: orderedKetchup,
				tutorial_complete: true
			}
		};
	}

	// Unreachable but satisfies TypeScript exhaustiveness.
	return {
		passed: false,
		message: LOSS_MESSAGE
	};
}

// ── Challenge descriptor ──────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
	// id MUST match the beacon's challengeId and CONTRACTS §5 wire constant.
	id: '0.1',
	act: 0,
	type: 'combat',
	name: 'The Ketchup Gauntlet',

	// Act 0 tutorial — no prerequisites.
	requires: [],

	// Engine applies these rewards on pass. engine/inventory.ts reads catalogIds
	// from the static catalog (catalog.ts). operative_credential registration
	// is handled as a side effect in validate() above.
	rewards: [
		{ kind: 'inventory', catalogId: 'encased_meat_mk1' },
		{ kind: 'onions', amount: 50 },
		{ kind: 'gauge', amount: 500 }
	],

	beaconConfig: {
		beaconIdHint: 'b-ketchup',
		landmark: 'Busted hot dog stand — Vienna Bob\'s',
		// secRng provides optional client entropy; combat RNG is server-authoritative.
		requiresCapabilities: ['secRng']
	},

	// `content` is forwarded verbatim to the badge as the CHALLENGE_INTRO body.
	// The Lua screen reads these fields; keep keys stable (wire contract).
	content: {
		intro:         CHALLENGE_INTRO,
		vendorIntro:   VENDOR_INTRO,
		winMessage:    WIN_MESSAGE,
		lossMessage:   LOSS_MESSAGE,
		lesson:        WIN_LESSON,
		footnote:      EDUCATIONAL_FOOTNOTE,
		registration:  REGISTRATION_SUCCESS,

		// Screen hints: which button triggers the ketchup event.
		// The badge screen uses this to set up the vendor menu labels.
		hostileTrigger: 'right',   // RIGHT = "order ketchup" → HOSTILE
		normalTrigger:  'select',  // SELECT/LEFT/UP = "order normally" → also HOSTILE (tutorial)

		// Combat parameters broadcast to the badge for HUD display.
		combat: {
			enemyName:  'Vienna Bob (HOSTILE)',
			enemyHp:    ENEMY_HP,
			operativeHp: OPERATIVE_HP,
			wavesRequired: WAVES_REQUIRED
		},

		// Taunt lines indexed by wave number, mirrored to the badge for offline display.
		waveTaunts: WAVE_TAUNTS,

		// Reward summary for the win screen.
		rewardSummary: [
			REWARD_FLAVOR.encasedMeat,
			REWARD_FLAVOR.onions,
			REWARD_FLAVOR.operativeCredential
		]
	},

	validate
};

// Self-register: this top-level call is what the registry glob picks up.
// Do NOT register from the old 0.1-ketchup-gauntlet.ts stub — that file
// was replaced by this one (see comment in 0.1-ketchup-gauntlet.ts).
registerChallenge(challenge);
export default challenge;
