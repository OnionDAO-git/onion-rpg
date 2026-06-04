/**
 * sim/scenarios/0.1-ketchup-gauntlet.ts — full combat scenario for 0.1.
 *
 * Drives a complete Ketchup Gauntlet challenge:
 *   OPERATIVE_IDENTIFY → IDENTIFY_ACK
 *   CHALLENGE_BEGIN    → CHALLENGE_INTRO
 *   COMBAT_ROLL_REQUEST (no roll) → COMBAT_ROLL_RESPONSE (opens session)
 *   COMBAT_ROLL_REQUEST (with server-roll simulation) × N → win
 *   CHALLENGE_RESULT   (passed=true)
 *
 * NOTE: Because the engine stubs are not yet implemented (combat-agent TODO),
 * this scenario will fail at the COMBAT_ROLL_REQUEST step when run against a
 * server with stub engine code. Once the engine lands it should pass.
 *
 * No secure-element on the sim: rolls are generated with Math.random() and the
 * sig field is an empty string. The engine fallback path accepts unsigned rolls
 * when operatives.attest_pubkey is null (today's default for sim operatives).
 *
 * Usage:
 *   bun run sim/cli.ts test 0.1
 */

import type { ScenarioFn } from '../runner';
import { MsgType } from '../../src/lib/shared/protocol';
import type { CombatRollResponseBody } from '../../src/lib/shared/protocol';

/** Simulate a roll (0..255) folded with a nonce. No se_rng on sim. */
function simRoll(serverNonce: string, wave: number): number {
	// XOR hash of nonce bytes + wave as a minimal mixing step.
	let h = wave ^ 0xaa;
	for (let i = 0; i < serverNonce.length; i++) {
		h = ((h << 3) ^ serverNonce.charCodeAt(i)) & 0xff;
	}
	// Sprinkle in some entropy so each roll is different.
	return (h ^ (Math.random() * 256 | 0)) & 0xff;
}

export const ketchupGauntletScenario: ScenarioFn = async (beacon, badge, ctx) => {
	const challengeId = beacon.config.challengeId;

	ctx.step('OPERATIVE_IDENTIFY');
	const ack = await badge.identify(beacon.mac);
	ctx.assertMsgType(ack, MsgType.IDENTIFY_ACK, 'IDENTIFY_ACK');

	ctx.step('CHALLENGE_BEGIN');
	const intro = await badge.beginChallenge(beacon.mac, challengeId);
	ctx.assertMsgType(intro, MsgType.CHALLENGE_INTRO, 'CHALLENGE_INTRO');

	ctx.step('COMBAT open session (no roll)');
	let combatResp = await badge.combatRoll(beacon.mac, challengeId);
	ctx.assertMsgType(combatResp, MsgType.COMBAT_ROLL_RESPONSE, 'initial COMBAT_ROLL_RESPONSE');

	let state = combatResp.body as CombatRollResponseBody;
	ctx.assert(state.st === 'active', `combat session should be active, got: ${state.st}`);

	// Fight until won or lost (max 50 rounds as a safety valve).
	let rounds = 0;
	const MAX_ROUNDS = 50;
	while (state.st === 'active' && rounds < MAX_ROUNDS) {
		rounds++;
		const roll = simRoll(state.n, state.wave);
		const dmg = Math.max(1, Math.floor(roll / 16)); // simple damage formula for sim
		ctx.step(`round ${rounds}: roll=${roll} dmg=${dmg} enemyHp=${state.enemyHp} opHp=${state.opHp}`);

		combatResp = await badge.combatRoll(beacon.mac, challengeId, {
			w: state.wave,
			r: roll,
			d: dmg,
			sig: '' // no se_sign on sim; engine fallback ignores sig when attest_pubkey is null
		});
		ctx.assertMsgType(combatResp, MsgType.COMBAT_ROLL_RESPONSE, `round ${rounds} response`);
		state = combatResp.body as CombatRollResponseBody;
	}

	ctx.assert(
		state.st === 'won',
		`expected combat status 'won' after ${rounds} rounds, got '${state.st}' (enemyHp=${state.enemyHp} opHp=${state.opHp})`
	);

	ctx.step('await CHALLENGE_RESULT');
	// The engine may send a CHALLENGE_RESULT immediately after the final COMBAT_ROLL_RESPONSE,
	// or the badge can explicitly request it. Check if the last combatResp carries a result
	// embedded, otherwise poll once more.
	// For now trust the engine sends CHALLENGE_RESULT as a separate frame after the last roll.
	// (Engine agent defines exact sequencing; this step may be a no-op or need adjustment.)
};

export default ketchupGauntletScenario;
