import { MsgType, type BadgeMoveBody } from '$lib/shared/protocol';
import { getChallenge } from '$lib/server/challenges/registry';
import {
	beginChallenge,
	resolveOperative,
	submitChallenge
} from '$lib/server/engine/index';
import { sql } from '$lib/server/db/index';
import {
	beaconReadyFrame,
	challengeIntroFrame,
	errorFrame,
	resultFrame
} from './eink';
import { inputFromIoResult, ioForChallengeStart, ioForResult } from './io';

type RelayEncoder = (type: MsgType, msgId: number, body: unknown) => string[];

async function challengeIdFor(beaconId: string, body: BadgeMoveBody): Promise<string | null> {
	if (body.b?.challengeId) return body.b.challengeId;
	const [row] = await sql<{ challengeId: string | null }[]>`
		SELECT challenge_id FROM beacons WHERE id = ${beaconId}
	`;
	return row?.challengeId ?? null;
}

async function latestAttempt(operativeId: string, challengeId: string): Promise<string | undefined> {
	const [attempt] = await sql<{ id: string }[]>`
		SELECT id FROM challenge_attempts
		WHERE operative_id = ${operativeId}
		  AND challenge_id = ${challengeId}
		  AND status = 'started'
		ORDER BY started_at DESC LIMIT 1
	`;
	return attempt?.id;
}

function buttonFrom(body: BadgeMoveBody): string | undefined {
	const payload = body.p;
	if (payload && typeof payload === 'object' && 'button' in payload) {
		const button = (payload as { button?: unknown }).button;
		return typeof button === 'string' ? button : undefined;
	}
	return undefined;
}

function signed(body: BadgeMoveBody): boolean {
	return Boolean(body.sig?.sig && body.sig?.msg);
}

export async function handleBadgeMove(
	beaconId: string,
	msgId: number,
	body: BadgeMoveBody,
	encodeResponse: RelayEncoder
): Promise<string[]> {
	if (!body?.h) {
		return encodeResponse(MsgType.EINK_FRAME, msgId, errorFrame('hardwareId (h) required'));
	}

	const op = await resolveOperative(body.h, body.o);
	const challengeId = await challengeIdFor(beaconId, body);
	const challenge = challengeId ? getChallenge(challengeId) : undefined;
	const beaconLabel = body.b?.id ?? beaconId;

	if (!challengeId || !challenge) {
		return encodeResponse(
			MsgType.EINK_FRAME,
			msgId,
			beaconReadyFrame({
				beaconLabel,
				challengeId,
				signed: signed(body)
			})
		);
	}

	const button = buttonFrom(body);

	if (body.k === 'io') {
		const attemptId = await latestAttempt(op.id, challengeId);
		const input = inputFromIoResult(challenge, body);
		if (attemptId && input !== undefined) {
			try {
				const result = await submitChallenge(op.id, challengeId, input, attemptId);
				return encodeResponse(
					MsgType.EINK_FRAME,
					msgId,
					resultFrame(
						challenge.name,
						result.message ?? 'Badge hardware input received.',
						result.passed,
						ioForResult(challenge, body, result.passed, result.continued)
					)
				);
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				return encodeResponse(MsgType.EINK_FRAME, msgId, errorFrame(message));
			}
		}

		return encodeResponse(
			MsgType.EINK_FRAME,
			msgId,
			resultFrame(challenge.name, 'Badge hardware input received.')
		);
	}

	if (body.k === 'beacon_ping' || body.k === 'heartbeat' || !button) {
		return encodeResponse(
			MsgType.EINK_FRAME,
			msgId,
			beaconReadyFrame({
				beaconLabel,
				challengeName: challenge.name,
				challengeId,
				signed: signed(body)
			})
		);
	}

	if (button === 'cancel') {
		return encodeResponse(
			MsgType.EINK_FRAME,
			msgId,
			beaconReadyFrame({
				beaconLabel,
				challengeName: challenge.name,
				challengeId,
				signed: signed(body)
			})
		);
	}

	if (button === 'select') {
		const existingAttemptId = await latestAttempt(op.id, challengeId);
		if (!existingAttemptId) {
			try {
				const { attemptId, content } = await beginChallenge(op.id, challengeId, beaconId);
				return encodeResponse(
					MsgType.EINK_FRAME,
					msgId,
					challengeIntroFrame({
						challengeId,
						name: challenge.name,
						content,
						attemptId,
						io: ioForChallengeStart(challenge, body)
					})
				);
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				return encodeResponse(MsgType.EINK_FRAME, msgId, errorFrame(message));
			}
		}

		try {
			const result = await submitChallenge(
				op.id,
				challengeId,
				{
					move: body.k,
					payload: body.p,
					beacon: body.b,
					signed: signed(body),
					signature: body.sig ?? null
				},
				existingAttemptId
			);
			return encodeResponse(
				MsgType.EINK_FRAME,
				msgId,
				resultFrame(
					challenge.name,
					result.message ?? '',
					result.passed,
					ioForResult(challenge, body, result.passed, result.continued)
				)
			);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return encodeResponse(MsgType.EINK_FRAME, msgId, errorFrame(message));
		}
	}

	return encodeResponse(
		MsgType.EINK_FRAME,
		msgId,
		resultFrame(challenge.name, `Move received: ${button}`)
	);
}
