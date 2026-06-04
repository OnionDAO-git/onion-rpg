/**
 * sim/transport.ts — In-process simulated ESP-NOW transport.
 *
 * Real ESP-NOW: badge unicasts a raw <=240-byte frame to a beacon's MAC
 * address; the beacon unicasts response frames back. Here we replace that
 * radio channel with a Node.js EventEmitter bus where participants are
 * identified by a "MAC-like" string.
 *
 * ─── Channel semantics ─────────────────────────────────────────────────
 *   SimTransport.create(mac)   — create a peer on the channel
 *   peer.send(dstMac, frame)   — deliver frame to dstMac's listener
 *   peer.onReceive(cb)         — register a frame handler
 *   peer.close()               — unregister from the channel
 *
 * A single SimChannel is the broadcast medium. Multiple SimBeacons and
 * VirtualBadges share one channel instance per test run. UDP mode is
 * also available (--transport udp) for cross-process scenarios (e.g.
 * running the sim against a real oRPG.lua in an emulator).
 *
 * Wire compatibility: frames exchanged here are byte-for-byte identical to
 * what a real badge would send over ESP-NOW — this module just replaces the
 * radio with EventEmitter delivery.
 */

import { EventEmitter } from 'events';

export type FrameHandler = (src: string, frame: Uint8Array) => void;

/** One participant on the in-process channel. */
export interface SimPeer {
	readonly mac: string;
	send(dstMac: string, frame: Uint8Array): void;
	onReceive(handler: FrameHandler): void;
	close(): void;
}

/** Shared in-process broadcast channel (one per test session). */
export class SimChannel {
	private readonly bus = new EventEmitter();

	constructor() {
		// Allow many listeners: one per beacon + badge pair.
		this.bus.setMaxListeners(64);
	}

	/** Join the channel as a named peer. */
	create(mac: string): SimPeer {
		const channel = this;
		const handlers: FrameHandler[] = [];

		const BROADCAST = 'ff:ff:ff:ff:ff:ff';
		const listener = (src: string, dst: string, frame: Uint8Array) => {
			// Deliver if addressed to us OR to the broadcast address.
			if (dst !== mac && dst !== BROADCAST) return;
			// Don't deliver a broadcast back to the sender.
			if (dst === BROADCAST && src === mac) return;
			for (const h of handlers) h(src, frame);
		};

		channel.bus.on('frame', listener);

		return {
			mac,
			send(dstMac: string, frame: Uint8Array): void {
				// Copy so sender can't mutate after send.
				const copy = new Uint8Array(frame);
				channel.bus.emit('frame', mac, dstMac, copy);
			},
			onReceive(handler: FrameHandler): void {
				handlers.push(handler);
			},
			close(): void {
				channel.bus.off('frame', listener);
				handlers.length = 0;
			}
		};
	}
}

/** Global singleton channel for single-process sim runs. */
export const defaultChannel = new SimChannel();

/**
 * Generate a fake IEEE-style MAC address string for a sim peer.
 * Format matches the wire body field `m` in BEACON_HELLO.
 * Uses a numeric suffix so MAC is deterministic per id.
 */
export function fakeMac(id: string): string {
	let h = 5381;
	for (let i = 0; i < id.length; i++) {
		h = ((h << 5) + h) ^ id.charCodeAt(i);
		h = h >>> 0;
	}
	const b = [
		0x02, // locally administered unicast bit
		(h >> 24) & 0xff,
		(h >> 16) & 0xff,
		(h >> 8) & 0xff,
		h & 0xff,
		id.length & 0xff
	];
	return b.map((x) => x.toString(16).padStart(2, '0')).join(':');
}
