/**
 * ONION RPG ESP-NOW wire protocol.
 *
 * The badge's only network primitive on today's firmware is ESP-NOW:
 * 1..240 byte payloads to a nearby ESP device. The beacon (ESP32-C3) is a
 * relay: it receives a badge frame, performs the HTTPS call to the game
 * server, and relays the server's response back to the badge as one or more
 * ESP-NOW frames.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the framing. The Lua client
 * (oRPG/lib/net.lua) and the C3 firmware (beacon/) re-implement the SAME byte
 * layout described here. The sim (sim/) imports this module directly.
 *
 * ── Design goals ──────────────────────────────────────────────────────────
 *   * <=240 byte frames (ESP-NOW hard limit; firmware ONION_ESPNOW_MAX_PAYLOAD).
 *   * Compact: a fixed 8-byte header + a small CBOR-ish body. To avoid pulling
 *     a CBOR dependency onto the badge (Lua) we use a minimal length-prefixed
 *     JSON body for v1 — terse keys, integers where possible. The header is
 *     pure binary. v2 can swap the body codec without touching the header.
 *   * Chunking: large server responses (NPC dialogue, fragment text) are split
 *     across frames sharing one msgId; the receiver reassembles by seq/total.
 *   * Request/response correlation via a 16-bit msgId.
 *
 * ── Frame layout (binary header, then body bytes) ──────────────────────────
 *   byte 0      : MAGIC = 0x4F ('O')
 *   byte 1      : VERSION = 0x01
 *   byte 2      : type    (MsgType, see below)
 *   byte 3      : flags   (bit0 = more-chunks-follow)
 *   byte 4..5   : msgId   (uint16 BE) — correlates request/response + chunks
 *   byte 6      : seq     (uint8) chunk index, 0-based
 *   byte 7      : total   (uint8) total chunk count (>=1)
 *   byte 8..N   : body    (UTF-8 JSON for v1; <= 232 bytes per frame)
 *
 * Header is 8 bytes, so body budget per frame is 240 - 8 = 232 bytes.
 */

export const PROTOCOL_MAGIC = 0x4f;
export const PROTOCOL_VERSION = 0x01;
export const ESPNOW_MAX_FRAME = 240;
export const HEADER_SIZE = 8;
export const MAX_BODY_PER_FRAME = ESPNOW_MAX_FRAME - HEADER_SIZE; // 232

export const FLAG_MORE_CHUNKS = 0x01;

/**
 * Message types. Values are stable wire constants — never renumber; append
 * only. Requests are badge->server (via beacon); responses are server->badge.
 */
export enum MsgType {
	// ── discovery / identity ──
	/** Beacon -> badge broadcast advertising itself + the challenge it hosts. */
	BEACON_HELLO = 0x01,
	/** Badge -> beacon: "I'm here", carries hardwareId/onionId. */
	OPERATIVE_IDENTIFY = 0x02,
	/** Server -> badge: identify ack + current progression snapshot. */
	IDENTIFY_ACK = 0x03,

	// ── challenge lifecycle ──
	/** Badge -> server: begin the challenge this beacon hosts. */
	CHALLENGE_BEGIN = 0x10,
	/** Server -> badge: challenge intro content (prompt, button map, etc.). */
	CHALLENGE_INTRO = 0x11,
	/** Server -> badge: generic challenge result/verdict. */
	CHALLENGE_RESULT = 0x12,

	// ── combat (secure-element RNG) ──
	/** Badge -> server: request to open/continue a combat session. */
	COMBAT_ROLL_REQUEST = 0x20,
	/** Server -> badge: combat state (enemyHp, wave, serverNonce, verdict). */
	COMBAT_ROLL_RESPONSE = 0x21,

	// ── dialogue (voice) ──
	/** Badge -> server: a captured-voice submission (or feature digest). */
	VOICE_CAPTURE_SUBMIT = 0x30,
	/** Server -> badge: STT match verdict + DEEPDISH reaction. */
	VOICE_RESULT = 0x31,

	// ── merchant (buttons) ──
	/** Badge -> server: a button/routing sequence input. */
	MERCHANT_INPUT = 0x40,
	/** Server -> badge: merchant verdict / trade tier / cost. */
	MERCHANT_RESULT = 0x41,

	// ── npc (AI) ──
	/** Badge -> server: a free-form NPC dialogue turn (player utterance). */
	NPC_DIALOGUE_TURN = 0x50,
	/** Server -> badge: DEEPDISH's reply (often chunked). */
	NPC_DIALOGUE_REPLY = 0x51,

	// ── rewards / state ──
	/** Server -> badge: a reward was granted (onions queued / item minted). */
	REWARD_GRANT = 0x60,
	/** Server -> badge: full progression-state push. */
	PROGRESSION_STATE = 0x61,

	// ── transport control ──
	/** Either direction: ack a received frame/msgId. */
	ACK = 0x70,
	/** Either direction: signal an error for a msgId. */
	ERROR = 0x71
}

/** Parsed, reassembled message: header fields + decoded JSON body. */
export interface Message<T = unknown> {
	type: MsgType;
	msgId: number;
	body: T;
}

/** A single raw frame on the wire (one ESP-NOW send). */
export interface Frame {
	type: MsgType;
	msgId: number;
	seq: number;
	total: number;
	more: boolean;
	body: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encode the 8-byte binary header into `out` at offset 0. */
function writeHeader(out: Uint8Array, f: Omit<Frame, 'body'>): void {
	out[0] = PROTOCOL_MAGIC;
	out[1] = PROTOCOL_VERSION;
	out[2] = f.type & 0xff;
	out[3] = f.more ? FLAG_MORE_CHUNKS : 0x00;
	out[4] = (f.msgId >> 8) & 0xff;
	out[5] = f.msgId & 0xff;
	out[6] = f.seq & 0xff;
	out[7] = f.total & 0xff;
}

/**
 * Encode a logical message into one or more <=240-byte frames.
 * The body is serialized as UTF-8 JSON and chunked across frames.
 */
export function encodeMessage(type: MsgType, msgId: number, body: unknown): Uint8Array[] {
	const json = body === undefined ? '' : JSON.stringify(body);
	const bytes = encoder.encode(json);

	const total = Math.max(1, Math.ceil(bytes.length / MAX_BODY_PER_FRAME));
	if (total > 255) {
		throw new Error(`message too large to frame: ${bytes.length} bytes (> 255 chunks)`);
	}

	const frames: Uint8Array[] = [];
	for (let seq = 0; seq < total; seq++) {
		const start = seq * MAX_BODY_PER_FRAME;
		const slice = bytes.subarray(start, start + MAX_BODY_PER_FRAME);
		const frame = new Uint8Array(HEADER_SIZE + slice.length);
		writeHeader(frame, {
			type,
			msgId,
			seq,
			total,
			more: seq < total - 1
		});
		frame.set(slice, HEADER_SIZE);
		frames.push(frame);
	}
	return frames;
}

/** Parse one raw ESP-NOW frame. Throws on bad magic/version. */
export function decodeFrame(raw: Uint8Array): Frame {
	if (raw.length < HEADER_SIZE) {
		throw new Error('frame shorter than header');
	}
	if (raw[0] !== PROTOCOL_MAGIC) {
		throw new Error(`bad magic 0x${raw[0].toString(16)}`);
	}
	if (raw[1] !== PROTOCOL_VERSION) {
		throw new Error(`unsupported version 0x${raw[1].toString(16)}`);
	}
	return {
		type: raw[2] as MsgType,
		more: (raw[3] & FLAG_MORE_CHUNKS) !== 0,
		msgId: (raw[4] << 8) | raw[5],
		seq: raw[6],
		total: raw[7],
		body: raw.subarray(HEADER_SIZE)
	};
}

/**
 * Reassemble a complete message from its frames (any order). Returns null
 * until all `total` chunks for the msgId are present.
 *
 * Callers maintain one Reassembler per msgId (or per peer). Simple, allocation
 * -light; mirrors what the Lua/C3 sides do with a small table keyed by seq.
 */
export class Reassembler {
	private chunks = new Map<number, Uint8Array>();
	private total = 0;
	private type: MsgType | null = null;
	private msgId = 0;

	/** Feed a frame. Returns the decoded Message once complete, else null. */
	push<T = unknown>(frame: Frame): Message<T> | null {
		this.type = frame.type;
		this.msgId = frame.msgId;
		this.total = frame.total;
		this.chunks.set(frame.seq, frame.body);
		if (this.chunks.size < this.total) return null;

		// All chunks present — concatenate in seq order.
		let len = 0;
		for (let i = 0; i < this.total; i++) {
			const c = this.chunks.get(i);
			if (!c) return null; // gap; wait for retransmit
			len += c.length;
		}
		const joined = new Uint8Array(len);
		let off = 0;
		for (let i = 0; i < this.total; i++) {
			const c = this.chunks.get(i)!;
			joined.set(c, off);
			off += c.length;
		}
		const text = decoder.decode(joined);
		const body = (text.length ? JSON.parse(text) : undefined) as T;
		return { type: this.type, msgId: this.msgId, body };
	}

	reset(): void {
		this.chunks.clear();
		this.total = 0;
		this.type = null;
		this.msgId = 0;
	}
}

/** Convenience: decode a single-frame message in one shot. */
export function decodeSingle<T = unknown>(raw: Uint8Array): Message<T> {
	const frame = decodeFrame(raw);
	if (frame.total !== 1) {
		throw new Error('decodeSingle called on a multi-frame message; use Reassembler');
	}
	const r = new Reassembler();
	const msg = r.push<T>(frame);
	if (!msg) throw new Error('failed to decode single frame');
	return msg;
}

// ── Body shapes (the JSON each MsgType carries) ────────────────────────────
// Terse field names keep frames small. Documented here so Lua/C3 match.

export interface BeaconHelloBody {
	/** beacon id, e.g. 'b-ketchup-01' */
	b: string;
	/** challenge id this beacon hosts */
	c: string | null;
	/** beacon ESP-NOW mac (so badge can unicast back) */
	m: string;
}

export interface OperativeIdentifyBody {
	/** hardware id */
	h: string;
	/** onion id, if known */
	o?: number;
}

export interface ChallengeBeginBody {
	c: string; // challengeId
	h: string; // hardwareId
}

export interface CombatRollRequestBody {
	c: string; // challengeId
	/** signed roll, omitted on the opening request that just creates a session */
	roll?: { w: number; r: number; d: number; sig: string };
}

export interface CombatRollResponseBody {
	/** combat session id */
	s: string;
	/** server nonce the badge folds into the next signed roll */
	n: string;
	enemyHp: number;
	opHp: number;
	wave: number;
	wavesReq: number;
	/** 'active' | 'won' | 'lost' | 'expired' */
	st: string;
}

export interface VoiceCaptureSubmitBody {
	c: string; // challengeId
	/** STT transcript if badge did on-device STT, else empty */
	t?: string;
	/** opaque audio-feature ref the beacon uploaded out-of-band (large audio
	 *  cannot fit ESP-NOW, so beacon POSTs the blob and passes a handle) */
	ref?: string;
}

export interface MerchantInputBody {
	c: string; // challengeId
	/** button sequence, e.g. ['up','up','select'] */
	seq: string[];
}

export interface NpcDialogueTurnBody {
	c: string; // challengeId
	/** storyteller session id (omit to start a new session) */
	s?: string;
	/** player utterance */
	t: string;
}

export interface RewardGrantBody {
	/** 'onions' | 'inventory' | 'gauge' */
	kind: string;
	/** onions amount, or inventory catalogId */
	v: string | number;
	/** async onion-reward status when kind==='onions' */
	st?: string;
}

export interface ErrorBody {
	code: string;
	msg?: string;
}
