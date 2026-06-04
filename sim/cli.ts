#!/usr/bin/env bun
/**
 * sim/cli.ts — Software beacon simulator CLI.
 *
 * COMMANDS
 * ────────────────────────────────────────────────────────────────────────────
 *   beacon <challengeId> [options]
 *     Spawn a sim beacon for the given challengeId. Listens on the in-process
 *     SimChannel (or UDP if --transport udp, future) and relays badge frames
 *     to the game server.
 *
 *   beacons <id1,id2,...> [options]
 *     Spawn multiple beacons at once.
 *
 *   test <challengeId|smoke|all> [options]
 *     Run the scenario for the given challengeId end-to-end, or the generic
 *     smoke test, or all registered scenarios.
 *
 *   list
 *     Print all available challenge scenarios registered in this file.
 *
 * OPTIONS
 * ────────────────────────────────────────────────────────────────────────────
 *   --server <url>       Game server URL. Default: GAME_SERVER_URL env or
 *                        http://localhost:5173
 *   --key <apiKey>       BEACON_API_KEY. Default: BEACON_API_KEY env.
 *   --hw <hardwareId>    Virtual badge hardware id. Default: sim-badge-01.
 *   --onion <onionId>    Virtual badge onion id (numeric). Optional.
 *   --timeout <ms>       Request timeout. Default: 15000.
 *   --verbose, -v        Print every request/response frame.
 *   --hello <ms>         Beacon hello period (ms). Default 5000. 0=once.
 *
 * EXAMPLES
 * ────────────────────────────────────────────────────────────────────────────
 *   # Spawn one sim beacon for the Ketchup Gauntlet:
 *   bun run sim/cli.ts beacon 0.1
 *
 *   # Spawn all Act 0 and Act 1 beacons:
 *   bun run sim/cli.ts beacons 0.1,1.1,1.2,1.3
 *
 *   # Run the smoke test against a running server:
 *   bun run sim/cli.ts test smoke --challenge 0.1
 *
 *   # Run the Ketchup Gauntlet full scenario:
 *   bun run sim/cli.ts test 0.1 --verbose
 *
 *   # Run all registered scenarios:
 *   bun run sim/cli.ts test all
 */

import { SimBeacon, spawnBeacons } from './beacon';
import { runScenario, runAll } from './runner';
import smokeScenario from './scenarios/smoke';
import ketchupGauntletScenario from './scenarios/0.1-ketchup-gauntlet';
import type { ScenarioFn } from './runner';

// ── Scenario registry ────────────────────────────────────────────────────────
// Add new scenarios here as challenge agents land. One entry per challenge.

const SCENARIOS: Record<string, ScenarioFn> = {
	'0.1': ketchupGauntletScenario,
	smoke: smokeScenario
};

// ── Argument parsing ─────────────────────────────────────────────────────────

interface ParsedArgs {
	command: string;
	positional: string[];
	server: string;
	key: string | undefined;
	hw: string;
	onion: number | undefined;
	timeout: number;
	verbose: boolean;
	helloMs: number;
	challenge: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.slice(2); // strip 'bun' and script path
	const parsed: ParsedArgs = {
		command: '',
		positional: [],
		server: process.env['GAME_SERVER_URL'] ?? 'http://localhost:5173',
		key: process.env['BEACON_API_KEY'],
		hw: 'sim-badge-01',
		onion: undefined,
		timeout: 15_000,
		verbose: false,
		helloMs: 5_000,
		challenge: undefined
	};

	let i = 0;
	while (i < args.length) {
		const a = args[i];
		if (a === '--server' || a === '-s') {
			parsed.server = args[++i] ?? parsed.server;
		} else if (a === '--key') {
			parsed.key = args[++i];
		} else if (a === '--hw') {
			parsed.hw = args[++i] ?? parsed.hw;
		} else if (a === '--onion') {
			parsed.onion = parseInt(args[++i] ?? '0', 10);
		} else if (a === '--timeout') {
			parsed.timeout = parseInt(args[++i] ?? '15000', 10);
		} else if (a === '--verbose' || a === '-v') {
			parsed.verbose = true;
		} else if (a === '--hello') {
			parsed.helloMs = parseInt(args[++i] ?? '5000', 10);
		} else if (a === '--challenge' || a === '-c') {
			parsed.challenge = args[++i];
		} else if (!a.startsWith('-')) {
			if (!parsed.command) {
				parsed.command = a;
			} else {
				parsed.positional.push(a);
			}
		}
		i++;
	}

	return parsed;
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdList(): void {
	console.log('Registered scenarios:');
	for (const id of Object.keys(SCENARIOS)) {
		const label = id === 'smoke' ? '(generic smoke test)' : `challenge ${id}`;
		console.log(`  ${id.padEnd(20)}  ${label}`);
	}
}

async function cmdBeacon(challengeId: string, args: ParsedArgs): Promise<void> {
	console.log(`Starting sim beacon for challenge ${challengeId} ...`);
	const beacon = new SimBeacon(challengeId, {
		serverUrl: args.server,
		apiKey: args.key,
		helloPeriodMs: args.helloMs,
		log: (msg) => console.log(`[beacon:${challengeId}] ${msg}`)
	});
	beacon.start();
	console.log(`Beacon ${beacon.config.id} running. Press Ctrl+C to stop.`);
	// Keep process alive.
	await new Promise<void>((resolve) => {
		process.on('SIGINT', () => {
			beacon.stop();
			resolve();
		});
		process.on('SIGTERM', () => {
			beacon.stop();
			resolve();
		});
	});
}

async function cmdBeacons(ids: string[], args: ParsedArgs): Promise<void> {
	console.log(`Starting ${ids.length} sim beacons: ${ids.join(', ')}`);
	const { stop } = spawnBeacons(ids, {
		serverUrl: args.server,
		apiKey: args.key,
		helloPeriodMs: args.helloMs
	});
	console.log('Beacons running. Press Ctrl+C to stop.');
	await new Promise<void>((resolve) => {
		process.on('SIGINT', () => {
			stop();
			resolve();
		});
		process.on('SIGTERM', () => {
			stop();
			resolve();
		});
	});
}

async function cmdTest(target: string, args: ParsedArgs): Promise<void> {
	const runOpts = {
		hardwareId: args.hw,
		onionId: args.onion,
		serverUrl: args.server,
		apiKey: args.key,
		timeoutMs: args.timeout,
		verbose: args.verbose
	};

	if (target === 'all') {
		const list = Object.entries(SCENARIOS).map(([id, fn]) => ({ challengeId: id, scenario: fn }));
		const results = await runAll(list, runOpts);
		const failed = results.filter((r) => !r.passed).length;
		process.exit(failed > 0 ? 1 : 0);
	}

	// smoke test needs a challengeId passed via --challenge or positional.
	if (target === 'smoke') {
		const challengeId = args.challenge ?? args.positional[0];
		if (!challengeId) {
			console.error('smoke test requires --challenge <id> or a positional argument');
			process.exit(1);
		}
		const result = await runScenario(challengeId, smokeScenario, runOpts);
		process.exit(result.passed ? 0 : 1);
	}

	const fn = SCENARIOS[target];
	if (!fn) {
		console.error(`No scenario registered for '${target}'. Run 'list' to see available scenarios.`);
		process.exit(1);
	}

	const result = await runScenario(target, fn, runOpts);
	process.exit(result.passed ? 0 : 1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	if (!args.command || args.command === 'help' || args.command === '--help' || args.command === '-h') {
		printHelp();
		return;
	}

	switch (args.command) {
		case 'list':
			cmdList();
			break;

		case 'beacon': {
			const id = args.positional[0];
			if (!id) {
				console.error('Usage: beacon <challengeId>');
				process.exit(1);
			}
			await cmdBeacon(id, args);
			break;
		}

		case 'beacons': {
			// Accept "0.1,1.1,1.2" or multiple positionals.
			const raw = args.positional.join(',');
			const ids = raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			if (ids.length === 0) {
				console.error('Usage: beacons <id1,id2,...>');
				process.exit(1);
			}
			await cmdBeacons(ids, args);
			break;
		}

		case 'test': {
			const target = args.positional[0];
			if (!target) {
				console.error('Usage: test <challengeId|smoke|all>');
				process.exit(1);
			}
			await cmdTest(target, args);
			break;
		}

		default:
			console.error(`Unknown command: ${args.command}`);
			printHelp();
			process.exit(1);
	}
}

function printHelp(): void {
	console.log(`
ONION RPG — software beacon simulator

USAGE
  bun run sim/cli.ts <command> [options]

COMMANDS
  beacon  <challengeId>         Spawn one sim beacon.
  beacons <id1,id2,...>         Spawn multiple beacons.
  test    <challengeId|smoke|all>  Run challenge scenario(s).
  list                          List available test scenarios.

OPTIONS
  --server <url>     Game server URL [default: http://localhost:5173]
  --key <key>        BEACON_API_KEY bearer token
  --hw <id>          Virtual badge hardware id [default: sim-badge-01]
  --onion <n>        Virtual badge onion id (numeric)
  --timeout <ms>     Request timeout [default: 15000]
  --hello <ms>       Beacon hello broadcast period [default: 5000]
  --challenge <id>   Challenge id for smoke test
  -v, --verbose      Print all request/response frames

EXAMPLES
  bun run sim/cli.ts beacon 0.1
  bun run sim/cli.ts beacons 0.1,1.1,1.2,1.3
  bun run sim/cli.ts test smoke --challenge 0.1
  bun run sim/cli.ts test 0.1 --verbose
  bun run sim/cli.ts test all
  bun run sim/cli.ts list
`.trim());
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
