/**
 * sim/protocol.test.ts — Unit tests for the ESP-NOW wire protocol.
 *
 * These tests import src/lib/shared/protocol.ts directly and verify:
 *   - encode/decode roundtrip for single-frame messages
 *   - encode/decode roundtrip for multi-frame (chunked) messages
 *   - Reassembler handles out-of-order chunks
 *   - fakeMac stability
 *   - SimChannel delivery (in-process transport)
 *   - decodeSingle throws on multi-frame input
 *
 * Run with:
 *   bun test sim/protocol.test.ts
 */

import { describe, it, expect } from 'bun:test';
import {
	encodeMessage,
	decodeFrame,
	decodeSingle,
	Reassembler,
	MsgType,
	PROTOCOL_MAGIC,
	PROTOCOL_VERSION,
	MAX_BODY_PER_FRAME,
	HEADER_SIZE
} from '../src/lib/shared/protocol';
import { fakeMac, SimChannel } from './transport';

// ── protocol unit tests ──────────────────────────────────────────────────────

describe('encodeMessage / decodeFrame', () => {
	it('encodes a small message into a single frame', () => {
		const body = { h: 'hw-abc', o: 42 };
		const frames = encodeMessage(MsgType.OPERATIVE_IDENTIFY, 1, body);
		expect(frames.length).toBe(1);

		const frame = frames[0];
		expect(frame[0]).toBe(PROTOCOL_MAGIC);
		expect(frame[1]).toBe(PROTOCOL_VERSION);
		expect(frame[2]).toBe(MsgType.OPERATIVE_IDENTIFY);
		// flags: no more chunks -> 0
		expect(frame[3] & 0x01).toBe(0);
		// msgId BE
		expect((frame[4] << 8) | frame[5]).toBe(1);
		// seq=0, total=1
		expect(frame[6]).toBe(0);
		expect(frame[7]).toBe(1);
	});

	it('roundtrip: encodeMessage -> decodeSingle', () => {
		const body = { b: 'b-ketchup-01', c: '0.1', m: '02:aa:bb:cc:dd:01' };
		const frames = encodeMessage(MsgType.BEACON_HELLO, 42, body);
		expect(frames.length).toBe(1);
		const msg = decodeSingle(frames[0]);
		expect(msg.type).toBe(MsgType.BEACON_HELLO);
		expect(msg.msgId).toBe(42);
		expect(msg.body).toEqual(body);
	});

	it('chunks a large body across multiple frames', () => {
		// Create a body whose JSON exceeds MAX_BODY_PER_FRAME (232 bytes).
		const bigBody = { data: 'x'.repeat(500) };
		const frames = encodeMessage(MsgType.NPC_DIALOGUE_REPLY, 7, bigBody);
		expect(frames.length).toBeGreaterThan(1);

		// All frames share the same msgId and type.
		for (const f of frames) {
			const parsed = decodeFrame(f);
			expect(parsed.msgId).toBe(7);
			expect(parsed.type).toBe(MsgType.NPC_DIALOGUE_REPLY);
		}

		// Each frame body must be <= MAX_BODY_PER_FRAME.
		for (const f of frames) {
			expect(f.length - HEADER_SIZE).toBeLessThanOrEqual(MAX_BODY_PER_FRAME);
		}

		// Last frame has more=false; all others have more=true.
		for (let i = 0; i < frames.length; i++) {
			const parsed = decodeFrame(frames[i]);
			if (i < frames.length - 1) {
				expect(parsed.more).toBe(true);
			} else {
				expect(parsed.more).toBe(false);
			}
		}
	});

	it('decodeSingle throws on multi-frame input', () => {
		const bigBody = { data: 'y'.repeat(500) };
		const frames = encodeMessage(MsgType.NPC_DIALOGUE_REPLY, 9, bigBody);
		expect(() => decodeSingle(frames[0])).toThrow('multi-frame');
	});

	it('decodeFrame throws on bad magic', () => {
		const bad = new Uint8Array([0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01]);
		expect(() => decodeFrame(bad)).toThrow('bad magic');
	});

	it('decodeFrame throws on short frame', () => {
		expect(() => decodeFrame(new Uint8Array([0x4f]))).toThrow('shorter than header');
	});

	it('encodes empty body as empty string (not "undefined")', () => {
		const frames = encodeMessage(MsgType.ACK, 3, undefined);
		expect(frames.length).toBe(1);
		const msg = decodeSingle(frames[0]);
		expect(msg.body).toBeUndefined();
	});
});

// ── Reassembler ──────────────────────────────────────────────────────────────

describe('Reassembler', () => {
	it('reassembles a single-frame message', () => {
		const body = { passed: true, message: 'nice job' };
		const frames = encodeMessage(MsgType.CHALLENGE_RESULT, 5, body);
		expect(frames.length).toBe(1);

		const r = new Reassembler();
		const msg = r.push(decodeFrame(frames[0]));
		expect(msg).not.toBeNull();
		expect(msg!.body).toEqual(body);
	});

	it('reassembles a chunked message', () => {
		const bigBody = { t: 'Listen up, champ. '.repeat(30) };
		const frames = encodeMessage(MsgType.NPC_DIALOGUE_REPLY, 11, bigBody);
		expect(frames.length).toBeGreaterThan(1);

		const r = new Reassembler();
		let msg = null;
		for (const f of frames) {
			msg = r.push(decodeFrame(f));
		}
		expect(msg).not.toBeNull();
		expect(msg!.body).toEqual(bigBody);
	});

	it('reassembles out-of-order chunks', () => {
		const bigBody = { t: 'Out-of-order test: ' + 'a'.repeat(600) };
		const frames = encodeMessage(MsgType.NPC_DIALOGUE_REPLY, 13, bigBody);
		expect(frames.length).toBeGreaterThan(1);

		// Feed in reverse order.
		const r = new Reassembler();
		let msg = null;
		for (const f of [...frames].reverse()) {
			msg = r.push(decodeFrame(f));
		}
		expect(msg).not.toBeNull();
		expect(msg!.body).toEqual(bigBody);
	});

	it('returns null until all chunks arrive', () => {
		const bigBody = { t: 'b'.repeat(600) };
		const frames = encodeMessage(MsgType.NPC_DIALOGUE_REPLY, 15, bigBody);
		expect(frames.length).toBeGreaterThan(1);

		const r = new Reassembler();
		// Feed all but the last.
		for (let i = 0; i < frames.length - 1; i++) {
			expect(r.push(decodeFrame(frames[i]))).toBeNull();
		}
		// Feed the last — now it resolves.
		const msg = r.push(decodeFrame(frames[frames.length - 1]));
		expect(msg).not.toBeNull();
	});
});

// ── SimChannel ───────────────────────────────────────────────────────────────

describe('SimChannel', () => {
	it('delivers a frame to the addressed peer only', () => {
		const ch = new SimChannel();
		const alice = ch.create('aa:aa:aa:aa:aa:01');
		const bob = ch.create('bb:bb:bb:bb:bb:02');

		const received: Uint8Array[] = [];
		bob.onReceive((_src, f) => received.push(f));

		// Alice sends to Bob.
		const frames = encodeMessage(MsgType.ACK, 1, {});
		alice.send('bb:bb:bb:bb:bb:02', frames[0]);

		expect(received.length).toBe(1);

		// Alice sends to herself — Bob should NOT receive it.
		alice.send('aa:aa:aa:aa:aa:01', frames[0]);
		expect(received.length).toBe(1); // still 1

		alice.close();
		bob.close();
	});

	it('delivers broadcast frames to all peers', () => {
		const ch = new SimChannel();
		const beacon = ch.create('bc:bc:bc:bc:bc:01');
		const b1 = ch.create('b1:b1:b1:b1:b1:01');
		const b2 = ch.create('b2:b2:b2:b2:b2:02');

		const b1Received: Uint8Array[] = [];
		const b2Received: Uint8Array[] = [];
		b1.onReceive((_src, f) => b1Received.push(f));
		b2.onReceive((_src, f) => b2Received.push(f));

		const frame = encodeMessage(MsgType.BEACON_HELLO, 99, { b: 'bx', c: '0.1', m: 'bc:bc:bc:bc:bc:01' })[0];
		beacon.send('ff:ff:ff:ff:ff:ff', frame);

		expect(b1Received.length).toBe(1);
		expect(b2Received.length).toBe(1);

		beacon.close();
		b1.close();
		b2.close();
	});

	it('close() stops frame delivery', () => {
		const ch = new SimChannel();
		const a = ch.create('a0:a0:a0:a0:a0:01');
		const b = ch.create('b0:b0:b0:b0:b0:02');

		const received: Uint8Array[] = [];
		b.onReceive((_src, f) => received.push(f));

		const frame = encodeMessage(MsgType.ACK, 1, {})[0];
		a.send('b0:b0:b0:b0:b0:02', frame);
		expect(received.length).toBe(1);

		b.close(); // unregister from channel
		a.send('b0:b0:b0:b0:b0:02', frame);
		expect(received.length).toBe(1); // no new delivery
		a.close();
	});
});

// ── fakeMac ──────────────────────────────────────────────────────────────────

describe('fakeMac', () => {
	it('is deterministic for the same id', () => {
		expect(fakeMac('b-ketchup-01')).toBe(fakeMac('b-ketchup-01'));
	});

	it('produces different MACs for different ids', () => {
		expect(fakeMac('b-ketchup-01')).not.toBe(fakeMac('b-malorte-02'));
	});

	it('has the locally-administered bit set (second nibble 2/6/a/e)', () => {
		const mac = fakeMac('test');
		const firstOctet = parseInt(mac.split(':')[0], 16);
		expect(firstOctet & 0x02).toBe(0x02);
	});

	it('is formatted as 6 colon-separated hex octets', () => {
		const mac = fakeMac('anything');
		expect(mac).toMatch(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);
	});
});
