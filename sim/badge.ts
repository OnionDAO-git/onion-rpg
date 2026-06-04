/**
 * sim/badge.ts — Virtual badge client.
 *
 * Emulates a hardware badge in software. The virtual badge:
 *
 *   1. Listens on the SimChannel for BEACON_HELLO broadcasts.
 *   2. Sends OPERATIVE_IDENTIFY to the beacon on first contact.
 *   3. Exposes typed request helpers for every MsgType so test scenarios
 *      can drive a challenge end-to-end:
 *
 *        badge.identify(beaconMac, hardwareId, onionId?)
 *        badge.beginChallenge(beaconMac, challengeId)
 *        badge.combatRoll(beaconMac, challengeId, roll?)
 *        badge.voiceSubmit(beaconMac, challengeId, transcript?, ref?)
 *        badge.merchantInput(beaconMac, challengeId, seq)
 *        badge.npcTurn(beaconMac, challengeId, utterance, sessionId?)
 *        badge.request(beaconMac, type, body) — raw escape hatch
 *
 *   4. All requests go through the SimChannel (in-process ESP-NOW stand-in)
 *      and block until the full response is reassembled (or timeout).
 *
 * Wire format: identical to real ESP-NOW frames per src/lib/shared/protocol.ts.
 * This file NEVER touches the server directly — all traffic goes through the
 * SimBeacon relay, just as it would on real hardware.
 */

import {
	encodeMessage,
	decodeFrame,
	Reassembler,
	MsgType,
	type Message,
	type OperativeIdentifyBody,
	type ChallengeBeginBody,
	type CombatRollRequestBody,
	type VoiceCaptureSubmitBody,
	type MerchantInputBody,
	type NpcDialogueTurnBody
} from '../src/lib/shared/protocol';
import { type SimPeer, defaultChannel, fakeMac } from './transport';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface VirtualBadgeOpts {
	/** MAC for this virtual badge. Default auto-generated from hardwareId. */
	mac?: string;
	/** Channel to use; default = defaultChannel. */
	channel?: typeof defaultChannel;
	/** Response timeout (ms). Default 15 000. */
	timeoutMs?: number;
	/** Logger. Default console.log; pass () => {} to silence. */
	log?: (msg: string) => void;
}

/** A BEACON_HELLO seen by the badge, stored after IDENTIFY for re-use. */
export interface SeenBeacon {
	beaconId: string;
	challengeId: string | null;
	mac: string;
}

export class VirtualBadge {
	readonly hardwareId: string;
	readonly mac: string;

	private readonly peer: SimPeer;
	private readonly timeoutMs: number;
	private readonly log: (msg: string) => void;

	/** msgId counter — wraps at 65535. */
	private msgIdSeq = 0;

	/** beacons heard via BEACON_HELLO. */
	readonly seenBeacons = new Map<string, SeenBeacon>(); // key: beacon mac

	constructor(hardwareId: string, opts: VirtualBadgeOpts = {}) {
		this.hardwareId = hardwareId;
		this.mac = opts.mac ?? fakeMac(hardwareId);
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.log = opts.log ?? ((m) => console.log(`[badge:${hardwareId}] ${m}`));

		const ch = opts.channel ?? defaultChannel;
		this.peer = ch.create(this.mac);

		// Listen passively for BEACON_HELLO broadcasts.
		this.peer.onReceive(this.handlePassiveFrame.bind(this));
	}

	/** Release the channel peer. */
	close(): void {
		this.peer.close();
	}

	// ── Public challenge API ────────────────────────────────────────────────

	/** Send OPERATIVE_IDENTIFY and wait for IDENTIFY_ACK. */
	async identify(beaconMac: string, onionId?: number): Promise<Message> {
		const body: OperativeIdentifyBody = { h: this.hardwareId };
		if (onionId !== undefined) body.o = onionId;
		return this.request(beaconMac, MsgType.OPERATIVE_IDENTIFY, body);
	}

	/** Send CHALLENGE_BEGIN and wait for CHALLENGE_INTRO. */
	async beginChallenge(beaconMac: string, challengeId: string): Promise<Message> {
		const body: ChallengeBeginBody = { c: challengeId, h: this.hardwareId };
		return this.request(beaconMac, MsgType.CHALLENGE_BEGIN, body);
	}

	/**
	 * Send COMBAT_ROLL_REQUEST and wait for COMBAT_ROLL_RESPONSE.
	 * Omit `roll` on the first call (opens the session).
	 */
	async combatRoll(
		beaconMac: string,
		challengeId: string,
		roll?: { w: number; r: number; d: number; sig: string }
	): Promise<Message> {
		const body: CombatRollRequestBody = { c: challengeId };
		if (roll) body.roll = roll;
		return this.request(beaconMac, MsgType.COMBAT_ROLL_REQUEST, body);
	}

	/** Send VOICE_CAPTURE_SUBMIT and wait for VOICE_RESULT. */
	async voiceSubmit(
		beaconMac: string,
		challengeId: string,
		transcript?: string,
		ref?: string
	): Promise<Message> {
		const body: VoiceCaptureSubmitBody = { c: challengeId };
		if (transcript !== undefined) body.t = transcript;
		if (ref !== undefined) body.ref = ref;
		return this.request(beaconMac, MsgType.VOICE_CAPTURE_SUBMIT, body);
	}

	/** Send MERCHANT_INPUT and wait for MERCHANT_RESULT. */
	async merchantInput(
		beaconMac: string,
		challengeId: string,
		seq: string[]
	): Promise<Message> {
		const body: MerchantInputBody = { c: challengeId, seq };
		return this.request(beaconMac, MsgType.MERCHANT_INPUT, body);
	}

	/**
	 * Send NPC_DIALOGUE_TURN and wait for NPC_DIALOGUE_REPLY.
	 * Pass `sessionId` to continue an existing storyteller session.
	 */
	async npcTurn(
		beaconMac: string,
		challengeId: string,
		utterance: string,
		sessionId?: string
	): Promise<Message> {
		const body: NpcDialogueTurnBody = { c: challengeId, t: utterance };
		if (sessionId) body.s = sessionId;
		return this.request(beaconMac, MsgType.NPC_DIALOGUE_TURN, body);
	}

	/**
	 * Raw request: encode `body` as the given MsgType, send to `dstMac`,
	 * and wait for the first complete response message. The response is
	 * whatever the beacon relays back from the server.
	 *
	 * If timeout elapses before a complete response, throws an Error.
	 */
	async request(dstMac: string, type: MsgType, body: unknown): Promise<Message> {
		const msgId = this.nextMsgId();
		const frames = encodeMessage(type, msgId, body);

		this.log(
			`→ 0x${type.toString(16).padStart(2, '0')} msgId=${msgId} to ${dstMac}`
		);

		return new Promise<Message>((resolve, reject) => {
			const reassembler = new Reassembler();

			// Timer for timeout.
			const timer = setTimeout(() => {
				this.peer.onReceive(() => {}); // unregister doesn't work cleanly here;
				// use a flag instead
				reject(new Error(`timeout waiting for response to msgId=${msgId} type=0x${type.toString(16)}`));
			}, this.timeoutMs);

			// Response handler — wired up before we send so we don't miss a fast reply.
			let resolved = false;
			const handler = (_srcMac: string, raw: Uint8Array) => {
				if (resolved) return;
				let frame;
				try {
					frame = decodeFrame(raw);
				} catch {
					return; // not our protocol
				}
				// Reassemble any msgId response; the server always replies with the
				// same msgId for correlation.
				if (frame.msgId !== msgId) return;

				const msg = reassembler.push(frame);
				if (!msg) return; // still waiting for chunks

				resolved = true;
				clearTimeout(timer);
				this.log(
					`← 0x${frame.type.toString(16).padStart(2, '0')} msgId=${msgId} from ${_srcMac}`
				);
				resolve(msg);
			};

			this.peer.onReceive(handler);

			// Send request frames.
			for (const f of frames) {
				this.peer.send(dstMac, f);
			}
		});
	}

	// ── Passive listener ────────────────────────────────────────────────────

	/** Record BEACON_HELLO broadcasts; skip anything else (not addressed to us). */
	private handlePassiveFrame(_src: string, raw: Uint8Array): void {
		let frame;
		try {
			frame = decodeFrame(raw);
		} catch {
			return;
		}
		if (frame.type !== MsgType.BEACON_HELLO) return;
		// Single-frame hello — parse directly.
		if (frame.total !== 1) return; // ignore chunked hellos for simplicity
		const r = new Reassembler();
		const msg = r.push(frame);
		if (!msg) return;
		const body = msg.body as { b: string; c: string | null; m: string };
		const info: SeenBeacon = {
			beaconId: body.b,
			challengeId: body.c,
			mac: body.m
		};
		this.seenBeacons.set(body.m, info);
		this.log(`heard BEACON_HELLO from ${body.m} (challenge=${body.c ?? 'none'})`);
	}

	/**
	 * Wait until a BEACON_HELLO for a specific challengeId is heard, or until
	 * timeout. Returns the SeenBeacon. Useful in scenario scripts that start
	 * before the beacon's first broadcast.
	 */
	async waitForBeacon(challengeId: string, timeoutMs?: number): Promise<SeenBeacon> {
		const deadline = Date.now() + (timeoutMs ?? this.timeoutMs);
		while (Date.now() < deadline) {
			for (const b of this.seenBeacons.values()) {
				if (b.challengeId === challengeId) return b;
			}
			await new Promise((r) => setTimeout(r, 50));
		}
		throw new Error(`timeout: no beacon seen for challenge ${challengeId}`);
	}

	private nextMsgId(): number {
		this.msgIdSeq = (this.msgIdSeq + 1) & 0xffff;
		return this.msgIdSeq;
	}
}
