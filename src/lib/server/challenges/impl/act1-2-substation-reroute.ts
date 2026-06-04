/**
 * Act 1, Challenge 1.2 — Substation Reroute (Combat). SPEC §5 Act 1.
 *
 * DEEPDISH has tripped every ComEd substation on the North Side. A beacon
 * at the substation represents incoming "demand spikes" — waves of RNG
 * combat. Each wave survived closes a breaker and re-energizes one feeder
 * segment. Survive all three waves to restore grid power to the neighborhood.
 *
 * LESSON: how the grid is segmented into substations and feeders, and why
 * a cascading failure in one segment drops a whole neighborhood.
 *
 * MECHANIC: 3-wave server-authoritative RNG combat.
 *   - The server generates and records every roll; secRng (onion.secure_random)
 *     provides optional client entropy only. No shipped badge signs rolls.
 *   - validate() is called after the combat session reaches a terminal state
 *     (engine drives the roll loop via COMBAT_ROLL_REQUEST / applyRoll).
 *
 * REWARD: Grid Credential (required for Act 4) + 100 Onions.
 */
import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import { SUBSTATION_CONTENT } from '../content/act1-2-substation-reroute';

/** Per-wave enemy HP — demand spikes get stronger each wave. */
const WAVE_ENEMY_HP = [60, 80, 100] as const;

const challenge: ChallengeDescriptor = {
	id: '1.2',
	act: 1,
	type: 'combat',
	name: 'Substation Reroute',

	// No credential gate — Act 1 is open after Act 0 completion.
	requires: [],

	rewards: [
		// Grid Credential unlocks Act 4 (Server Room + Data Center).
		{ kind: 'inventory', catalogId: 'grid_credential' },
		// 100 Onions awarded on success.
		{ kind: 'onions', amount: 100 },
		// Bump the festival supply gauge (each MW restored = 800 units).
		{ kind: 'gauge', amount: 800 }
	],

	beaconConfig: {
		beaconIdHint: 'b-substation',
		landmark: 'ComEd North Side Substation',
		// secRng provides optional client entropy; combat RNG is server-authoritative.
		requiresCapabilities: ['secRng']
	},

	content: {
		// Static intro / DEEPDISH taunt — AI generates a richer version via
		// challengeIntro() when the badge sends CHALLENGE_BEGIN, but this
		// fallback fires when the Anthropic call is unavailable.
		intro: SUBSTATION_CONTENT.intro,
		// Shown to the player between waves.
		waveBeats: SUBSTATION_CONTENT.waveBeats,
		// Final success / failure beats.
		successBeat: SUBSTATION_CONTENT.successBeat,
		failBeat: SUBSTATION_CONTENT.failBeat,
		// Educational footnote revealed on success.
		lesson: SUBSTATION_CONTENT.lesson,
		// Combat tuning — read by the engine when it calls openCombat().
		combat: {
			wavesRequired: 3,
			operativeHp: 100,
			// Enemy HP escalates per wave; the engine starts at wave-1 HP and
			// re-spawns enemies at wave-2 then wave-3 HP as waves complete.
			// We surface these here so the sim can apply the same ramp.
			enemyHpPerWave: WAVE_ENEMY_HP,
			// 3-minute window for all three waves.
			ttlSeconds: 180
		}
	},

	/**
	 * validate() is called by the engine after each COMBAT_ROLL_REQUEST cycle
	 * (or once at the end of the session). The engine has already applied the
	 * roll via combat.applyRoll() and stored the updated CombatSession in ctx.
	 *
	 * We only need to inspect ctx.combat.status:
	 *   'won'    → all three waves survived → grant Grid Credential + Onions.
	 *   'lost'   → operative HP hit 0 → inform and let them retry.
	 *   'expired'→ timed out (3-minute window) → same failure path.
	 *   'active' → mid-fight → continued: true, no rewards yet.
	 */
	validate(_input: unknown, ctx): ChallengeResult {
		const combat = ctx.combat;

		// No active combat session yet (engine hasn't called openCombat).
		// Return continued so the engine knows to open a session.
		if (!combat) {
			return {
				passed: false,
				continued: true,
				message: SUBSTATION_CONTENT.intro
			};
		}

		switch (combat.status) {
			case 'active':
				// Fight is still in progress — per-wave feedback.
				return {
					passed: false,
					continued: true,
					message: waveMessage(combat.wave, combat.wavesRequired)
				};

			case 'won':
				// All three breakers closed — feeder restored.
				return {
					passed: true,
					message: SUBSTATION_CONTENT.successBeat,
					flags: {
						'1.2:breakers_closed': combat.wave,
						'1.2:grid_restored': true
					}
				};

			case 'lost':
				return {
					passed: false,
					message: SUBSTATION_CONTENT.failBeat
				};

			case 'expired':
				return {
					passed: false,
					message: SUBSTATION_CONTENT.timeoutBeat
				};

			default:
				return {
					passed: false,
					continued: true,
					message: SUBSTATION_CONTENT.intro
				};
		}
	}
};

/**
 * Per-wave in-combat progress message. Called while combat.status === 'active'.
 * The badge HUD already shows HP bars; this is the DEEPDISH flavour text only.
 */
function waveMessage(wave: number, wavesRequired: number): string {
	const beat = SUBSTATION_CONTENT.waveBeats[wave - 1];
	if (beat) return beat;
	// Generic fallback if content array is shorter than expected.
	return `Breaker ${wave}/${wavesRequired} — demand spike incoming, champ.`;
}

registerChallenge(challenge);
export default challenge;
