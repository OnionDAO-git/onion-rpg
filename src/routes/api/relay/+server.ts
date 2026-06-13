/**
 * POST /api/relay — the beacon<->server bridge.
 *
 * The beacon receives ESP-NOW frame(s) from a badge, base64-encodes the raw
 * bytes, and POSTs them here. The server decodes via the shared protocol,
 * dispatches to the engine by MsgType, and returns response frame(s) (base64)
 * for the beacon to relay back over ESP-NOW.
 *
 * Body: { beaconId: string, frames: string[] }   // base64 frames in
 * Resp: { frames: string[] }                      // base64 frames out
 * Auth: Authorization: Bearer BEACON_API_KEY
 *
 * Each request corresponds to ONE logical message from the badge (potentially
 * chunked across multiple frames). Multiple response messages can be returned.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import {
	MsgType,
	Reassembler,
	encodeMessage,
	decodeFrame
} from '$lib/shared/protocol';
import type {
	OperativeIdentifyBody,
	ChallengeBeginBody,
	CombatRollRequestBody,
	VoiceCaptureSubmitBody,
	MerchantInputBody,
	NpcDialogueTurnBody,
	BeaconHelloBody,
	BadgeMoveBody,
	ErrorBody
} from '$lib/shared/protocol';
import {
	resolveOperative,
	beginChallenge,
	submitChallenge,
	getGameState
} from '$lib/server/engine/index';
import { getChallenge } from '$lib/server/challenges/registry';
import { applyRoll, openCombat } from '$lib/server/engine/combat';
import { getEnergy, MAX_ENERGY } from '$lib/server/engine/energy';
import { listInventory } from '$lib/server/engine/inventory';
import { sql } from '$lib/server/db/index';
import { handleBadgeMove } from '$lib/server/badge/runtime';
import type { RequestHandler } from './$types';

// ── Helpers ───────────────────────────────────────────────────────────────

function encodeError(msgId: number, code: string, msg?: string): string[] {
	const frames = encodeMessage(MsgType.ERROR, msgId, { code, msg } satisfies ErrorBody);
	return frames.map((f) => Buffer.from(f).toString('base64'));
}

function encodeResponse(type: MsgType, msgId: number, body: unknown): string[] {
	const frames = encodeMessage(type, msgId, body);
	return frames.map((f) => Buffer.from(f).toString('base64'));
}

// ── Dispatch ──────────────────────────────────────────────────────────────

async function dispatch(
	beaconId: string,
	type: MsgType,
	msgId: number,
	body: unknown
): Promise<string[]> {
	switch (type) {
		case MsgType.BEACON_HELLO:
			return handleBeaconHello(beaconId, body as BeaconHelloBody);

		case MsgType.OPERATIVE_IDENTIFY:
			return handleIdentify(msgId, body as OperativeIdentifyBody);

		case MsgType.BADGE_MOVE:
			return handleBadgeMove(beaconId, msgId, body as BadgeMoveBody, encodeResponse);

		case MsgType.CHALLENGE_BEGIN:
			return handleChallengeBegin(msgId, body as ChallengeBeginBody);

		case MsgType.COMBAT_ROLL_REQUEST:
			return handleCombatRoll(msgId, body as CombatRollRequestBody);

		case MsgType.VOICE_CAPTURE_SUBMIT:
			return handleVoice(msgId, body as VoiceCaptureSubmitBody);

		case MsgType.MERCHANT_INPUT:
			return handleMerchant(msgId, body as MerchantInputBody);

		case MsgType.NPC_DIALOGUE_TURN:
			return handleNpcDialogue(beaconId, msgId, body as NpcDialogueTurnBody);

		default:
			return encodeError(msgId, 'UNSUPPORTED', `MsgType 0x${type.toString(16)} not handled here`);
	}
}

// ── Message handlers ──────────────────────────────────────────────────────

/**
 * BEACON_HELLO: a beacon announcing itself (fires ~every 30s after it boots and
 * joins WiFi). Upsert the beacons row, mark it online, and log to the server
 * console — but only on the online transition, so we don't spam every heartbeat.
 * No response frames are expected; the firmware ignores them.
 */
async function handleBeaconHello(beaconId: string, body: BeaconHelloBody): Promise<string[]> {
	const id = body?.b || beaconId;
	if (!id) return [];
	const challengeId = body?.c ?? null;
	const mac = body?.m ?? null;

	// Was this beacon already online before this hello? Used to log once.
	const [prev] = await sql<{ online: boolean }[]>`SELECT online FROM beacons WHERE id = ${id}`;
	const wasOnline = prev?.online === true;

	await sql`
		INSERT INTO beacons (id, challenge_id, name, espnow_mac, source, online, last_seen_at)
		VALUES (${id}, ${challengeId}, ${id}, ${mac}, 'hardware', TRUE, now())
		ON CONFLICT (id) DO UPDATE SET
			challenge_id  = COALESCE(EXCLUDED.challenge_id, beacons.challenge_id),
			espnow_mac    = COALESCE(EXCLUDED.espnow_mac, beacons.espnow_mac),
			online        = TRUE,
			last_seen_at  = now()
	`;

	if (!wasOnline) {
		const parts = [`challenge=${challengeId ?? 'none'}`];
		if (mac) parts.push(`mac=${mac}`);
		console.log(`[beacon] ✅ "${id}" connected (${parts.join(', ')})`);
	}

	return [];
}

/** OPERATIVE_IDENTIFY: upsert operative, return IDENTIFY_ACK with state snapshot. */
async function handleIdentify(
	msgId: number,
	body: OperativeIdentifyBody
): Promise<string[]> {
	if (!body?.h) return encodeError(msgId, 'BAD_REQUEST', 'hardwareId (h) required');
	const op = await resolveOperative(body.h, body.o);
	const gs = await getGameState(op.id);
	const en = await getEnergy(op.id);
	const inventory = await listInventory(op.id);
	return encodeResponse(MsgType.IDENTIFY_ACK, msgId, {
		id: op.id,
		registered: op.registered,
		callsign: op.callsign,
		act: gs?.currentAct ?? 0,
		hp: gs?.hp ?? 100,
		xp: gs?.xp ?? 0,
		level: gs?.level ?? 1,
		energy: en?.energy ?? MAX_ENERGY,
		energyMax: MAX_ENERGY,
		challengeStatus: gs?.challengeStatus ?? {},
		flags: gs?.flags ?? {},
		inventory: inventory.map((i) => ({ id: i.catalogId, k: i.kind, q: i.qty }))
	});
}

/** CHALLENGE_BEGIN: gate on requires, open attempt, return CHALLENGE_INTRO. */
async function handleChallengeBegin(
	msgId: number,
	body: ChallengeBeginBody
): Promise<string[]> {
	if (!body?.c || !body?.h) {
		return encodeError(msgId, 'BAD_REQUEST', 'challengeId (c) and hardwareId (h) required');
	}
	const op = await resolveOperative(body.h);
	try {
		const { attemptId, content } = await beginChallenge(op.id, body.c);
		return encodeResponse(MsgType.CHALLENGE_INTRO, msgId, {
			attemptId,
			challengeId: body.c,
			content
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return encodeError(msgId, 'GATED', msg);
	}
}

/** COMBAT_ROLL_REQUEST: open or continue a combat session. */
async function handleCombatRoll(
	msgId: number,
	body: CombatRollRequestBody
): Promise<string[]> {
	if (!body?.c) return encodeError(msgId, 'BAD_REQUEST', 'challengeId (c) required');

	// We need an operative to find the session. Combat requests arrive with a
	// challengeId; for now we look up the session by challenge. In the full flow
	// the badge sends its hardware_id in the CHALLENGE_BEGIN, and the session is
	// already open. Here we find it by challenge_id.
	// The full flow: badge does CHALLENGE_BEGIN first which creates the attempt;
	// then COMBAT_ROLL_REQUEST comes after. We look up the latest active session.
	let [sessionRow] = await sql<{ id: string; operativeId: string; attemptId: string | null; serverNonce: string }[]>`
		SELECT id, operative_id, attempt_id, server_nonce FROM combat_sessions
		WHERE challenge_id = ${body.c} AND status = 'active'
		ORDER BY created_at DESC LIMIT 1
	`;

	if (!sessionRow) {
		const [attempt] = await sql<{ id: string; operativeId: string }[]>`
			SELECT id, operative_id FROM challenge_attempts
			WHERE challenge_id = ${body.c} AND status = 'started'
			ORDER BY started_at DESC LIMIT 1
		`;
		if (!attempt) {
			return encodeError(msgId, 'NO_SESSION', 'begin the challenge first (CHALLENGE_BEGIN)');
		}

		const challenge = getChallenge(body.c);
		if (!challenge || challenge.type !== 'combat') {
			return encodeError(msgId, 'BAD_REQUEST', `challenge ${body.c} is not combat`);
		}
		const combat = (challenge.content?.combat ?? {}) as {
			enemyHp?: number;
			enemyHpPerWave?: number[];
			operativeHp?: number;
			wavesRequired?: number;
			ttlSeconds?: number;
		};
		const opened = await openCombat({
			operativeId: attempt.operativeId,
			challengeId: body.c,
			attemptId: attempt.id,
			enemyHp: combat.enemyHp ?? combat.enemyHpPerWave?.[0],
			operativeHp: combat.operativeHp,
			wavesRequired: combat.wavesRequired,
			ttlSeconds: combat.ttlSeconds
		});
		return encodeResponse(MsgType.COMBAT_ROLL_RESPONSE, msgId, {
			s: opened.id,
			n: opened.serverNonce,
			enemyHp: opened.enemyHp,
			opHp: opened.operativeHp,
			wave: opened.wave,
			wavesReq: opened.wavesRequired,
			st: opened.status
		});
	}

	const op = await sql<{ attestPubkey: string | null }[]>`
		SELECT attest_pubkey FROM operatives WHERE id = ${sessionRow.operativeId}
	`;
	const attestPubkey = op[0]?.attestPubkey ?? undefined;

	const inRoll = body.roll
		? { wave: body.roll.w, roll: body.roll.r, dmg: body.roll.d, sig: body.roll.sig }
		: undefined;

	const session = await applyRoll(sessionRow.id, inRoll, attestPubkey ?? undefined);
	if (session.status !== 'active') {
		await submitChallenge(
			sessionRow.operativeId,
			body.c,
			{ action: 'roll', ketchup: Boolean((body as unknown as Record<string, unknown>).ketchup) },
			sessionRow.attemptId ?? undefined
		);
	}

	return encodeResponse(MsgType.COMBAT_ROLL_RESPONSE, msgId, {
		s: session.id,
		n: session.serverNonce,
		enemyHp: session.enemyHp,
		opHp: session.operativeHp,
		wave: session.wave,
		wavesReq: session.wavesRequired,
		st: session.status
	});
}

/** VOICE_CAPTURE_SUBMIT: delegate to the /api/voice route (AI agent owns voice). */
async function handleVoice(
	msgId: number,
	body: VoiceCaptureSubmitBody
): Promise<string[]> {
	// Voice processing lives in /api/voice (AI agent territory). Here we forward
	// the ref/transcript to a local HTTP call or return a delegation token.
	// For now: acknowledge receipt and tell the badge to poll /api/voice directly
	// (badges with the http capability via onion.http_post) or await the response via the relay.
	return encodeError(
		msgId,
		'ROUTE_ELSEWHERE',
		'voice submissions handled at /api/voice — use ref returned by beacon blob upload'
	);
}

/** MERCHANT_INPUT: submit a button sequence to the challenge validator. */
async function handleMerchant(
	msgId: number,
	body: MerchantInputBody
): Promise<string[]> {
	if (!body?.c || !Array.isArray(body?.seq)) {
		return encodeError(msgId, 'BAD_REQUEST', 'challengeId (c) and seq[] required');
	}

	// Without a per-request operative id we need to find the operative by active
	// challenge attempt. Look up the most recent in_progress attempt.
	const [attempt] = await sql<{ operativeId: string; id: string }[]>`
		SELECT operative_id, id FROM challenge_attempts
		WHERE challenge_id = ${body.c} AND status = 'started'
		ORDER BY started_at DESC LIMIT 1
	`;
	if (!attempt) {
		return encodeError(msgId, 'NO_SESSION', 'begin the challenge first');
	}

	const result = await submitChallenge(attempt.operativeId, body.c, { seq: body.seq }, attempt.id);
	return encodeResponse(MsgType.MERCHANT_RESULT, msgId, {
		passed: result.passed,
		message: result.message,
		continued: result.continued ?? false
	});
}

/** NPC_DIALOGUE_TURN: forward to DEEPDISH (AI agent's /api/ai/npc endpoint). */
async function handleNpcDialogue(
	_beaconId: string,
	msgId: number,
	body: NpcDialogueTurnBody
): Promise<string[]> {
	// NPC/AI responses are handled by the AI agent at /api/ai/npc. This relay
	// just proxies the body there and returns the reply frames.
	if (!body?.c || !body?.t) {
		return encodeError(msgId, 'BAD_REQUEST', 'challengeId (c) and utterance (t) required');
	}

	try {
		// Internal call to the AI handler — same process, different route.
		// We use fetch to the loopback URL so routing stays clean and the AI
		// agent's endpoint stays autonomous.
		const origin = `http://localhost:${process.env.PORT || 3000}`;
		const res = await fetch(`${origin}/api/ai/npc`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ challengeId: body.c, sessionId: body.s, utterance: body.t })
		});
		const data = (await res.json()) as { reply: string; sessionId: string; done?: boolean };
		return encodeResponse(MsgType.NPC_DIALOGUE_REPLY, msgId, {
			reply: data.reply,
			sessionId: data.sessionId,
			done: data.done ?? false
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return encodeError(msgId, 'AI_ERROR', msg);
	}
}

// ── Main handler ──────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	const body = (await request.json()) as { beaconId?: string; frames?: string[] };
	if (!body.beaconId || !Array.isArray(body.frames) || body.frames.length === 0) {
		error(400, 'expected { beaconId: string, frames: string[] }');
	}

	// Decode all incoming frames, reassemble chunked messages by msgId.
	const reassemblers = new Map<number, Reassembler>();
	const responseFrames: string[] = [];

	for (const b64 of body.frames) {
		let frame;
		try {
			const raw = Buffer.from(b64, 'base64');
			frame = decodeFrame(raw);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'bad frame';
			responseFrames.push(...encodeError(0, 'DECODE_ERROR', msg));
			continue;
		}

		let asm = reassemblers.get(frame.msgId);
		if (!asm) {
			asm = new Reassembler();
			reassemblers.set(frame.msgId, asm);
		}

		const msg = asm.push(frame);
		if (msg) {
			reassemblers.delete(frame.msgId);
			try {
				const outFrames = await dispatch(body.beaconId!, msg.type, msg.msgId, msg.body);
				responseFrames.push(...outFrames);
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : String(e);
				responseFrames.push(...encodeError(msg.msgId, 'ENGINE_ERROR', errMsg));
			}
		}
	}

	return json({ frames: responseFrames });
};
