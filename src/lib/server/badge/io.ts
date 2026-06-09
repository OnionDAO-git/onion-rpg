import type { BadgeIoRequest, BadgeMoveBody } from '$lib/shared/protocol';
import type { ChallengeDescriptor } from '$lib/shared/types';

function contentRecord(challenge: ChallengeDescriptor): Record<string, unknown> {
	return (challenge.content ?? {}) as Record<string, unknown>;
}

function nestedRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hzToMhz(value: unknown): number | undefined {
	const n = asNumber(value);
	if (n === undefined) return undefined;
	return n > 10_000 ? n / 1_000_000 : n;
}

function cleanHex(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const clean = value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
	return clean.length > 0 ? clean : undefined;
}

function badgeHas(body: BadgeMoveBody, cap: string): boolean {
	return body.caps?.[cap] === true;
}

function speakerCue(body: BadgeMoveBody, kind: 'ready' | 'ok' | 'fail'): BadgeIoRequest | undefined {
	if (!badgeHas(body, 'speaker')) return undefined;
	const toneHz = kind === 'ok' ? 880 : kind === 'fail' ? 220 : 660;
	return { speaker: { toneHz, ms: 90 } };
}

function subghzRequest(challenge: ChallengeDescriptor): BadgeIoRequest | undefined {
	const content = contentRecord(challenge);
	const jam = nestedRecord(content.jam);
	const subghz = nestedRecord(content.subghz);
	const src = jam ?? subghz;
	if (!src) return undefined;

	const hex = cleanHex(src.stopCode ?? src.accessCode ?? src.payload ?? src.hex);
	if (!hex) return undefined;

	return {
		subghzTx: {
			hex,
			freqMhz: hzToMhz(src.freqHz ?? src.freqMhz ?? src.freq),
			modulation: typeof src.modulation === 'string' ? src.modulation : 'ook'
		}
	};
}

function micRequest(challenge: ChallengeDescriptor): BadgeIoRequest {
	const content = contentRecord(challenge);
	const screenHint = nestedRecord(content.screenHint);
	const ms =
		asNumber(content.voiceMs) ??
		asNumber(screenHint?.voiceMs) ??
		(challenge.id === '3.3' ? 4000 : 3000);
	return { mic: { ms, sampleRate: 16000 } };
}

export function ioForChallengeStart(
	challenge: ChallengeDescriptor,
	body: BadgeMoveBody
): BadgeIoRequest | undefined {
	const required = challenge.beaconConfig?.requiresCapabilities ?? [];

	if (required.includes('subghz') && badgeHas(body, 'subghz')) {
		return subghzRequest(challenge);
	}

	if (required.includes('voice') && badgeHas(body, 'voice')) {
		return micRequest(challenge);
	}

	return speakerCue(body, 'ready');
}

function ioPayload(body: BadgeMoveBody): Record<string, unknown> {
	return body.p && typeof body.p === 'object' ? (body.p as Record<string, unknown>) : {};
}

function micResult(payload: Record<string, unknown>): Record<string, unknown> | undefined {
	return nestedRecord(payload.mic);
}

function subghzTxResult(payload: Record<string, unknown>): Record<string, unknown> | undefined {
	return nestedRecord(payload.subghzTx);
}

function boolValue(value: unknown): boolean {
	return value === true;
}

export function inputFromIoResult(
	challenge: ChallengeDescriptor,
	body: BadgeMoveBody
): unknown | undefined {
	const payload = ioPayload(body);
	const mic = micResult(payload);
	const subghzTx = subghzTxResult(payload);

	if (subghzTx) {
		const sent = boolValue(subghzTx.sent);
		if (challenge.id === '2.1') {
			return {
				phase: 'jam',
				jammed: sent,
				elapsed_ms: 0,
				relay: false,
				io: subghzTx
			};
		}
		if (challenge.id === '3.4') {
			return {
				phase: 'handshake',
				sent,
				io: subghzTx
			};
		}
		return { phase: 'subghz', sent, io: subghzTx };
	}

	if (mic) {
		const transcript =
			typeof mic.transcript === 'string'
				? mic.transcript
				: typeof payload.transcript === 'string'
					? payload.transcript
					: '';
		const ref =
			typeof mic.ref === 'string'
				? mic.ref
				: typeof payload.ref === 'string'
					? payload.ref
					: undefined;

		if (challenge.id === '2.3') {
			return {
				phase: 'voice',
				transcript,
				ref,
				v: mic
			};
		}

		if (challenge.id === '3.3') {
			return {
				callIndex: typeof payload.callIndex === 'number' ? payload.callIndex : 0,
				transcript,
				ref,
				v: mic
			};
		}

		return {
			t: transcript,
			ref,
			v: mic
		};
	}

	if (payload.gpio) return { phase: 'gpio', gpio: payload.gpio };
	return undefined;
}

export function ioForResult(
	challenge: ChallengeDescriptor,
	body: BadgeMoveBody,
	passed?: boolean,
	continued?: boolean
): BadgeIoRequest | undefined {
	if (continued && challenge.beaconConfig?.requiresCapabilities?.includes('voice') && badgeHas(body, 'voice')) {
		return undefined;
	}
	return speakerCue(body, passed ? 'ok' : 'fail');
}
