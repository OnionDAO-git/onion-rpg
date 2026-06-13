/**
 * sim/scenarios/mg-bankbust.ts — end-to-end scenario for the Bank-or-Bust
 * minigame (Part A, S3). Proves our own challenge round-trips the full pipeline:
 *
 *   OPERATIVE_IDENTIFY → IDENTIFY_ACK
 *   CHALLENGE_BEGIN    → CHALLENGE_INTRO
 *   MERCHANT_INPUT     → MERCHANT_RESULT (passed=true)
 *
 * The winning line is push ×3 then bank (pot 3+4+2 = 9, in [target 8, bust 12]).
 *
 * Usage:
 *   bun run sim/cli.ts test mg-bankbust --verbose
 */

import type { ScenarioFn } from '../runner';
import { MsgType } from '../../src/lib/shared/protocol';

export const bankBustScenario: ScenarioFn = async (beacon, badge, ctx) => {
	const challengeId = beacon.config.challengeId;

	ctx.step('OPERATIVE_IDENTIFY');
	const ack = await badge.identify(beacon.mac);
	ctx.assertMsgType(ack, MsgType.IDENTIFY_ACK, 'IDENTIFY_ACK');

	ctx.step('CHALLENGE_BEGIN');
	const intro = await badge.beginChallenge(beacon.mac, challengeId);
	ctx.assertMsgType(intro, MsgType.CHALLENGE_INTRO, 'CHALLENGE_INTRO');

	ctx.step('MERCHANT_INPUT — push ×3 then bank (winning line)');
	const result = await badge.merchantInput(beacon.mac, challengeId, [
		'push',
		'push',
		'push',
		'bank'
	]);
	ctx.assertMsgType(result, MsgType.MERCHANT_RESULT, 'MERCHANT_RESULT');
	ctx.assertPassed(result, 'bank-or-bust');
};

export default bankBustScenario;
