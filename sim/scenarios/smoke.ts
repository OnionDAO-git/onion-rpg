/**
 * sim/scenarios/smoke.ts — Generic smoke-test scenario.
 *
 * Tests the basic relay pipeline for any challenge:
 *   OPERATIVE_IDENTIFY → IDENTIFY_ACK
 *   CHALLENGE_BEGIN    → CHALLENGE_INTRO
 *
 * This does NOT complete the challenge (no combat/voice/merchant/NPC step).
 * Run it against any challengeId to verify the beacon<->server pipeline is
 * working before running the full scenario.
 *
 * Usage (CLI):
 *   bun run sim/cli.ts test smoke --challenge 0.1
 */

import type { ScenarioFn } from '../runner';
import { MsgType } from '../../src/lib/shared/protocol';

export const smokeScenario: ScenarioFn = async (beacon, badge, ctx) => {
	// The badge already heard BEACON_HELLO (runner waits for it).
	const beaconInfo = badge.seenBeacons.get(beacon.mac);
	ctx.assert(!!beaconInfo, 'badge should have heard BEACON_HELLO');
	ctx.step('OPERATIVE_IDENTIFY');

	const ackMsg = await badge.identify(beacon.mac);
	ctx.assertMsgType(ackMsg, MsgType.IDENTIFY_ACK, 'IDENTIFY_ACK');

	ctx.step('CHALLENGE_BEGIN');
	const introMsg = await badge.beginChallenge(beacon.mac, beacon.config.challengeId);
	ctx.assertMsgType(introMsg, MsgType.CHALLENGE_INTRO, 'CHALLENGE_INTRO');

	const intro = introMsg.body as { text?: string; content?: unknown };
	ctx.assert(
		typeof intro === 'object' && intro !== null,
		'CHALLENGE_INTRO body should be an object'
	);
};

export default smokeScenario;
