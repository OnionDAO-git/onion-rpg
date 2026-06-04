/**
 * sim/beacon.ts — Software beacon simulator.
 *
 * Emulates one ESP32-C3 Point-of-Interest beacon. Responsibilities:
 *
 *   1. Register with the game server (POST /api/relay with BEACON_HELLO) so
 *      the server knows this sim beacon exists (mirrors the real C3 boot
 *      sequence where the beacon does an initial HTTPS registration).
 *
 *   2. Listen on the SimChannel for incoming badge frames (ESP-NOW stand-in).
 *
 *   3. For each badge frame: relay it to the game server via
 *      POST /api/relay  { beaconId, frames:[base64] }
 *      then relay the server's response frames back to the badge over the
 *      SimChannel — exactly what the real C3 firmware does over WiFi.
 *
 *   4. Broadcast periodic BEACON_HELLO frames on the channel (real beacons
 *      do this via ESP-NOW broadcast; badges scan for nearby beacons).
 *
 * Transport: SimPeer from sim/transport.ts (in-process EventEmitter).
 * Protocol: src/lib/shared/protocol.ts (imported directly — same bytes as
 *           a real badge would produce/consume over the radio).
 */

import {
	encodeMessage,
	decodeFrame,
	Reassembler,
	MsgType,
	type BeaconHelloBody
} from '../src/lib/shared/protocol';
import { type SimPeer, defaultChannel, fakeMac } from './transport';
import { loadBeaconConfig, type BeaconChallengeConfig } from './config';

/** Convenience: Uint8Array <-> base64 string (mirrors what real beacon sends). */
function toBase64(u: Uint8Array): string {
	return Buffer.from(u).toString('base64');
}
function fromBase64(s: string): Uint8Array {
	return new Uint8Array(Buffer.from(s, 'base64'));
}

export interface SimBeaconOpts {
	/** Override server URL; default env.GAME_SERVER_URL or 'http://localhost:5173'. */
	serverUrl?: string;
	/** Override beacon API key; default env.BEACON_API_KEY. */
	apiKey?: string;
	/** Override SimChannel; default uses the module-level singleton. */
	channel?: ReturnType<typeof defaultChannel.create> extends SimPeer ? typeof defaultChannel : never;
	/** How often to re-broadcast BEACON_HELLO (ms). 0 = once at start only. */
	helloPeriodMs?: number;
	/** Logger; default console.log. Pass () => {} to silence. */
	log?: (msg: string) => void;
}

export class SimBeacon {
	readonly config: BeaconChallengeConfig;
	readonly mac: string;

	private readonly peer: SimPeer;
	private readonly serverUrl: string;
	private readonly apiKey: string | undefined;
	private readonly helloPeriodMs: number;
	private readonly log: (msg: string) => void;

	/** msgId counter — wraps at 65535. */
	private msgIdSeq = 0;

	/** Per-source reassemblers: srcMac -> Reassembler. */
	private readonly reassemblers = new Map<string, Reassembler>();

	private helloInterval: ReturnType<typeof setInterval> | null = null;
	private running = false;

	constructor(challengeId: string, opts: SimBeaconOpts = {}) {
		this.config = loadBeaconConfig(challengeId);
		this.mac = this.config.espnowMac ?? fakeMac(this.config.id);
		this.serverUrl =
			opts.serverUrl ?? process.env['GAME_SERVER_URL'] ?? 'http://localhost:5173';
		this.apiKey = opts.apiKey ?? process.env['BEACON_API_KEY'];
		this.helloPeriodMs = opts.helloPeriodMs ?? 5000;
		this.log = opts.log ?? ((m) => console.log(`[beacon:${this.config.id}] ${m}`));

		// Create our peer on the default channel (or a provided one).
		const ch = opts.channel ?? defaultChannel;
		this.peer = ch.create(this.mac);
	}

	/** Start listening and broadcasting BEACON_HELLO. */
	start(): void {
		if (this.running) return;
		this.running = true;

		// Handle incoming frames from badges.
		this.peer.onReceive(this.handleFrame.bind(this));

		// Broadcast BEACON_HELLO immediately, then on interval.
		this.broadcastHello();
		if (this.helloPeriodMs > 0) {
			this.helloInterval = setInterval(() => this.broadcastHello(), this.helloPeriodMs);
		}

		this.log(`started (mac=${this.mac}, challenge=${this.config.challengeId})`);
	}

	/** Stop the beacon — drain intervals, remove peer from channel. */
	stop(): void {
		if (!this.running) return;
		this.running = false;
		if (this.helloInterval) {
			clearInterval(this.helloInterval);
			this.helloInterval = null;
		}
		this.peer.close();
		this.log('stopped');
	}

	/** Broadcast BEACON_HELLO to the broadcast address 'ff:ff:ff:ff:ff:ff'. */
	private broadcastHello(): void {
		const body: BeaconHelloBody = {
			b: this.config.id,
			c: this.config.challengeId,
			m: this.mac
		};
		const frames = encodeMessage(MsgType.BEACON_HELLO, this.nextMsgId(), body);
		for (const frame of frames) {
			this.peer.send('ff:ff:ff:ff:ff:ff', frame);
		}
		this.log(`broadcasted BEACON_HELLO for challenge ${this.config.challengeId}`);
	}

	/**
	 * Relay one frame from a badge to the server and send response frames back.
	 * Called for every raw ESP-NOW frame received from a badge.
	 */
	private async handleFrame(srcMac: string, raw: Uint8Array): Promise<void> {
		// Parse the frame header to identify the message stream.
		let frame;
		try {
			frame = decodeFrame(raw);
		} catch (err) {
			this.log(`bad frame from ${srcMac}: ${err}`);
			return;
		}

		// Reassemble multi-chunk messages.
		const key = `${srcMac}:${frame.msgId}`;
		if (!this.reassemblers.has(key)) {
			this.reassemblers.set(key, new Reassembler());
		}
		const reassembler = this.reassemblers.get(key)!;
		const msg = reassembler.push(frame);
		if (!msg) return; // waiting for remaining chunks

		// Full message assembled — clean up reassembler.
		this.reassemblers.delete(key);

		this.log(
			`relay ${srcMac} -> server  type=0x${frame.type.toString(16).padStart(2, '0')} msgId=${frame.msgId}`
		);

		// Relay all raw frames for this msgId to the server.
		const relayBody = {
			beaconId: this.config.id,
			frames: [raw].map(toBase64) // single-frame fast path; multi-frame reassembled above
		};

		// For multi-frame messages: re-encode from the assembled body so we
		// forward a complete logical message as a base64-frame list.
		const outFrames = encodeMessage(msg.type, msg.msgId, msg.body);
		relayBody.frames = outFrames.map(toBase64);

		let responseFrames: Uint8Array[] = [];
		try {
			responseFrames = await this.relayToServer(relayBody);
		} catch (err) {
			this.log(`server relay error: ${err}`);
			// Send an ERROR frame back to the badge.
			const errFrames = encodeMessage(MsgType.ERROR, frame.msgId, {
				code: 'relay_failed',
				msg: String(err)
			});
			for (const f of errFrames) this.peer.send(srcMac, f);
			return;
		}

		// Relay server response frames back to the badge.
		for (const respFrame of responseFrames) {
			this.peer.send(srcMac, respFrame);
		}
		this.log(
			`relay server -> ${srcMac}  ${responseFrames.length} frame(s)`
		);
	}

	/** POST /api/relay and return the decoded response frames. */
	private async relayToServer(body: {
		beaconId: string;
		frames: string[];
	}): Promise<Uint8Array[]> {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

		const res = await fetch(`${this.serverUrl}/api/relay`, {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`HTTP ${res.status}: ${text}`);
		}

		const resp = (await res.json()) as { frames?: string[] };
		return (resp.frames ?? []).map(fromBase64);
	}

	private nextMsgId(): number {
		this.msgIdSeq = (this.msgIdSeq + 1) & 0xffff;
		return this.msgIdSeq;
	}
}

/**
 * Spawn multiple sim beacons from a list of challenge ids, all sharing the
 * default channel. Returns a cleanup function.
 */
export function spawnBeacons(
	challengeIds: string[],
	opts: SimBeaconOpts = {}
): { beacons: SimBeacon[]; stop: () => void } {
	const beacons = challengeIds.map((id) => new SimBeacon(id, opts));
	for (const b of beacons) b.start();
	return {
		beacons,
		stop: () => {
			for (const b of beacons) b.stop();
		}
	};
}
