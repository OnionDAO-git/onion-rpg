/**
 * sim/config.ts — beacon challenge configuration loader.
 *
 * Sim beacons load their challenge config from:
 *   beacon/challenges/<challengeId>.json
 *
 * This mirrors what the real C3 firmware reads from its spiffs/littlefs
 * partition. The schema is the same JSON object the beacon stores and
 * uses to answer BEACON_HELLO requests. The sim loads it from disk;
 * the real firmware has it baked into flash.
 *
 * JSON schema (all fields optional except id + challengeId):
 *
 *   {
 *     "id": "b-ketchup-01",          // unique beacon id
 *     "challengeId": "0.1",           // challenge this beacon hosts
 *     "name": "Ketchup Gauntlet",     // display name (informational)
 *     "landmark": "Busted hot dog stand",
 *     "lat": null,
 *     "lon": null,
 *     // espnowMac is assigned at runtime by the sim (or the real firmware).
 *     // Override here to fix the MAC (useful for badge pairing in tests).
 *     "espnowMac": null
 *   }
 *
 * For convenience, if no JSON file exists for a challengeId the sim will
 * synthesize a minimal config (useful for ad-hoc test runs).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface BeaconChallengeConfig {
	/** Unique beacon id, e.g. 'b-ketchup-01'. */
	id: string;
	/** Challenge this beacon hosts, e.g. '0.1'. */
	challengeId: string;
	/** Display name. */
	name: string;
	landmark: string | null;
	lat: number | null;
	lon: number | null;
	/** Override ESP-NOW MAC; null = auto-assigned at runtime. */
	espnowMac: string | null;
}

/** Root of the repo (sim lives one level below). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directory where beacon challenge JSON configs live. */
export const BEACON_CHALLENGES_DIR = resolve(REPO_ROOT, 'beacon', 'challenges');

/**
 * Load beacon config for a challengeId from
 * beacon/challenges/<challengeId>.json. Returns a synthesized stub if
 * the file doesn't exist (enables ad-hoc runs without creating a JSON file
 * for every challenge).
 *
 * Tolerant: the beacon-agent may store firmware-specific fields (enemy_hp,
 * timing_window_ms, custom, _comment, etc.) alongside the sim-specific
 * fields. Unknown fields are silently ignored; missing top-level id/name/etc.
 * fall back to sensible defaults derived from challengeId.
 */
export function loadBeaconConfig(challengeId: string): BeaconChallengeConfig {
	const path = resolve(BEACON_CHALLENGES_DIR, `${challengeId}.json`);
	const stub: BeaconChallengeConfig = {
		id: `b-${challengeId}`,
		challengeId,
		name: `Challenge ${challengeId}`,
		landmark: null,
		lat: null,
		lon: null,
		espnowMac: null
	};
	if (!existsSync(path)) return stub;

	const raw = readFileSync(path, 'utf-8');
	// Parse permissively: pick known fields if present, fall back to stub.
	const parsed = JSON.parse(raw) as Partial<BeaconChallengeConfig> & Record<string, unknown>;
	return {
		id: typeof parsed.id === 'string' ? parsed.id : stub.id,
		challengeId: typeof parsed.challengeId === 'string' ? parsed.challengeId : stub.challengeId,
		name: typeof parsed.name === 'string' ? parsed.name : stub.name,
		landmark: typeof parsed.landmark === 'string' ? parsed.landmark : null,
		lat: typeof parsed.lat === 'number' ? parsed.lat : null,
		lon: typeof parsed.lon === 'number' ? parsed.lon : null,
		espnowMac: typeof parsed.espnowMac === 'string' ? parsed.espnowMac : null
	};
}

/**
 * Persist a beacon config to beacon/challenges/<challengeId>.json.
 * Used by the sim's --save-config flag or by setup scripts.
 */
export function saveBeaconConfig(cfg: BeaconChallengeConfig): void {
	const { writeFileSync, mkdirSync } = require('fs') as typeof import('fs');
	mkdirSync(BEACON_CHALLENGES_DIR, { recursive: true });
	const path = resolve(BEACON_CHALLENGES_DIR, `${cfg.challengeId}.json`);
	writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}
