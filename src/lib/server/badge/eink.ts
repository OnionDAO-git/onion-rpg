import type { BadgeIoRequest, EinkFrameBody, EinkOp } from '$lib/shared/protocol';

const W = 264;
const H = 176;
const LH = 18;

function wrap(text: string, max = 36): string[] {
	const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		if (!current) current = word;
		else if (current.length + 1 + word.length <= max) current += ` ${word}`;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.length ? lines : [''];
}

function textFrom(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(textFrom).join(' ');
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		for (const key of ['intro', 'introText', 'prompt', 'promptText', 'message', 'text', 'npcGreeting']) {
			if (typeof record[key] === 'string') return record[key] as string;
		}
	}
	return '';
}

export function frame(title: string, body: string | string[], footer?: string, id?: string): EinkFrameBody {
	const lines = Array.isArray(body) ? body.flatMap((line) => wrap(line)) : wrap(body);
	const ops: EinkOp[] = [
		{ k: 'clear' },
		{ k: 'rect', x: 2, y: 2, w: W - 4, h: H - 4 },
		{ k: 'text', x: 8, y: 8, f: 'bold', t: title.slice(0, 24) },
		{ k: 'line', x1: 4, y1: 24, x2: W - 4, y2: 24 },
		{ k: 'lines', x: 8, y: 34, lh: LH, lines: lines.slice(0, 7) }
	];
	if (footer) {
		ops.push({ k: 'line', x1: 4, y1: H - 20, x2: W - 4, y2: H - 20 });
		ops.push({ k: 'text', x: 8, y: H - 14, f: 'small', t: footer.slice(0, 36) });
	}
	return { v: 1, id, w: W, h: H, ops };
}

export function beaconReadyFrame(input: {
	beaconLabel?: string;
	challengeName?: string;
	challengeId?: string | null;
	signed?: boolean;
	io?: BadgeIoRequest;
}): EinkFrameBody {
	const name = input.challengeName ?? input.challengeId ?? 'Adventure beacon';
	const signed = input.signed ? 'Signed moves enabled.' : 'Unsigned moves. Server authoritative.';
	return {
		...frame(
			'BEACON READY',
			[
				input.beaconLabel ?? 'Nearby beacon linked.',
				name,
				signed
			],
			'[SELECT] Begin  [CANCEL] Leave',
			`ready:${input.challengeId ?? 'none'}:${input.signed ? 's' : 'u'}`
		),
		io: input.io
	};
}

export function challengeIntroFrame(input: {
	challengeId: string;
	name: string;
	content: Record<string, unknown>;
	attemptId: string;
	io?: BadgeIoRequest;
}): EinkFrameBody {
	const intro = textFrom(input.content) || `Challenge ${input.challengeId} is ready.`;
	return {
		...frame(
			input.name,
			intro,
			'[SELECT] Move  [CANCEL] Leave',
			`intro:${input.challengeId}:${input.attemptId}`
		),
		state: input.attemptId,
		io: input.io
	};
}

export function resultFrame(
	title: string,
	message: string,
	passed?: boolean,
	io?: BadgeIoRequest
): EinkFrameBody {
	return {
		...frame(
			title,
			message || (passed ? 'Challenge cleared.' : 'Move recorded.'),
			passed ? '[SELECT] Continue' : '[SELECT] Retry',
			`result:${title}:${passed ? 'pass' : 'cont'}`
		),
		io
	};
}

export function errorFrame(message: string): EinkFrameBody {
	return frame('SERVER ERROR', message, '[SELECT] Retry', `error:${message.slice(0, 32)}`);
}
