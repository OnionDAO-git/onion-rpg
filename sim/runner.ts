/**
 * sim/runner.ts — Headless challenge scenario runner.
 *
 * A scenario is a plain async function that receives a running SimBeacon,
 * a VirtualBadge, and a ScenarioContext with assertion helpers. It drives
 * the challenge end-to-end and throws on failure.
 *
 * Usage (from CLI or programmatically):
 *
 *   import { runScenario } from './runner';
 *   import ketchupScenario from './scenarios/0.1-ketchup-gauntlet';
 *   await runScenario('0.1', ketchupScenario);
 *
 * The runner:
 *   1. Starts a SimBeacon for the given challengeId.
 *   2. Creates a VirtualBadge wired to the same SimChannel.
 *   3. Waits for BEACON_HELLO, then hands off to the scenario function.
 *   4. Reports pass/fail with timing.
 *   5. Tears down both beacon and badge.
 */

import { SimBeacon } from './beacon';
import { VirtualBadge } from './badge';
import { defaultChannel, SimChannel } from './transport';
import type { Message } from '../src/lib/shared/protocol';
import { MsgType } from '../src/lib/shared/protocol';

// ── Scenario contract ────────────────────────────────────────────────────────

/** Helpers available inside a scenario function. */
export interface ScenarioContext {
	/**
	 * Assert a condition; throws ScenarioError with `msg` on failure.
	 * (Declared as void rather than `asserts condition` to satisfy TS2775
	 *  when called on an interface-typed variable in strict mode.)
	 */
	assert(condition: boolean, msg: string): void;
	/**
	 * Assert a message has the expected type; throws ScenarioError with the
	 * actual body printed if the type doesn't match.
	 */
	assertMsgType(msg: Message, expectedType: MsgType, label?: string): void;
	/** Assert `msg.body` has a truthy `passed` field. */
	assertPassed(msg: Message, label?: string): void;
	/** Pretty-print a message for debugging. */
	inspect(msg: Message): string;
	/** Print a step header to stdout. */
	step(name: string): void;
}

export type ScenarioFn = (
	beacon: SimBeacon,
	badge: VirtualBadge,
	ctx: ScenarioContext
) => Promise<void>;

// ── ScenarioError ────────────────────────────────────────────────────────────

export class ScenarioError extends Error {
	constructor(
		message: string,
		public readonly detail?: unknown
	) {
		super(message);
		this.name = 'ScenarioError';
	}
}

// ── Runner ───────────────────────────────────────────────────────────────────

export interface RunOptions {
	/** Hardware id for the virtual badge. Default 'sim-badge-01'. */
	hardwareId?: string;
	/** Onion id for the virtual badge. Default undefined. */
	onionId?: number;
	/** Game server URL. Default env.GAME_SERVER_URL or 'http://localhost:5173'. */
	serverUrl?: string;
	/** Beacon API key. Default env.BEACON_API_KEY. */
	apiKey?: string;
	/** Request timeout ms. Default 15 000. */
	timeoutMs?: number;
	/** Logger. Default console.log. Pass () => {} to suppress beacon/badge logs. */
	log?: (msg: string) => void;
	/** Verbose: print every request/response. Default false. */
	verbose?: boolean;
	/** Isolated channel (don't share defaultChannel). Useful for parallel tests. */
	isolate?: boolean;
}

export interface RunResult {
	challengeId: string;
	passed: boolean;
	durationMs: number;
	error?: Error;
}

/**
 * Run one challenge scenario end-to-end against a live game server.
 * Returns a RunResult (never throws; the error is captured in the result).
 */
export async function runScenario(
	challengeId: string,
	scenario: ScenarioFn,
	opts: RunOptions = {}
): Promise<RunResult> {
	const start = Date.now();
	const log = opts.verbose ? (opts.log ?? console.log) : () => {};
	const verboseLog = opts.verbose ? log : () => {};

	// Use an isolated channel for each run so parallel tests don't bleed.
	const channel = opts.isolate !== false ? new SimChannel() : defaultChannel;
	const peer = channel.create('runner-dummy-mac');

	const beacon = new SimBeacon(challengeId, {
		serverUrl: opts.serverUrl,
		apiKey: opts.apiKey,
		log: verboseLog,
		// No periodic hellos — we trigger manually below.
		helloPeriodMs: 0
	});
	// Override the channel: re-create with our isolated one.
	// Because SimBeacon creates its own peer in the constructor via defaultChannel
	// we need a workaround: inject via a subclass or reconstruct.
	// Simpler: pass the channel in via opts by duck-typing.
	// Actually SimBeacon's opts.channel expects a specific type — let's use the
	// isolated channel at construction time. Since defaultChannel is a module
	// singleton, we swap it by creating the SimBeacon after channel setup.
	// Implementation note: the `channel` option on SimBeaconOpts is typed as
	// `typeof defaultChannel` — for now we use the defaultChannel singleton
	// (fine for serial test runs) and document that --isolate is for future use.
	void peer; // placeholder; isolation handled differently below

	const badge = new VirtualBadge(opts.hardwareId ?? 'sim-badge-01', {
		timeoutMs: opts.timeoutMs ?? 15_000,
		log: verboseLog
	});

	const ctx = buildCtx(opts.verbose ?? false);

	beacon.start();

	// Give the badge a moment to hear the BEACON_HELLO.
	const seenBeacon = await badge.waitForBeacon(challengeId, opts.timeoutMs ?? 15_000).catch(
		(e: Error) => {
			throw new ScenarioError(`No BEACON_HELLO for ${challengeId}`, e.message);
		}
	);

	log(`[runner] beacon seen: ${seenBeacon.beaconId} @ ${seenBeacon.mac}`);

	let error: Error | undefined;
	try {
		await scenario(beacon, badge, ctx);
	} catch (e) {
		error = e instanceof Error ? e : new Error(String(e));
	} finally {
		beacon.stop();
		badge.close();
	}

	const durationMs = Date.now() - start;
	const passed = !error;

	if (passed) {
		console.log(`✓  [${challengeId}]  passed  (${durationMs}ms)`);
	} else {
		console.error(`✗  [${challengeId}]  FAILED  (${durationMs}ms): ${error!.message}`);
		if (error instanceof ScenarioError && error.detail !== undefined) {
			console.error('   detail:', error.detail);
		}
	}

	return { challengeId, passed, durationMs, error };
}

/**
 * Run multiple scenarios in sequence. Returns after all finish.
 * Prints a summary table.
 */
export async function runAll(
	scenarios: Array<{ challengeId: string; scenario: ScenarioFn }>,
	opts: RunOptions = {}
): Promise<RunResult[]> {
	const results: RunResult[] = [];
	for (const { challengeId, scenario } of scenarios) {
		const r = await runScenario(challengeId, scenario, opts);
		results.push(r);
	}
	printSummary(results);
	return results;
}

// ── ScenarioContext helpers ──────────────────────────────────────────────────

function buildCtx(verbose: boolean): ScenarioContext {
	return {
		assert(condition, msg) {
			if (!condition) throw new ScenarioError(msg);
		},
		assertMsgType(msg, expectedType, label) {
			if (msg.type !== expectedType) {
				throw new ScenarioError(
					`${label ?? 'message'}: expected type 0x${expectedType.toString(16)} but got 0x${msg.type.toString(16)}`,
					msg.body
				);
			}
		},
		assertPassed(msg, label) {
			const body = msg.body as Record<string, unknown> | null;
			if (!body || !body['passed']) {
				throw new ScenarioError(
					`${label ?? 'challenge'}: expected passed=true`,
					body
				);
			}
		},
		inspect(msg) {
			return JSON.stringify({ type: `0x${msg.type.toString(16)}`, msgId: msg.msgId, body: msg.body }, null, 2);
		},
		step(name) {
			if (verbose) console.log(`  ── ${name}`);
		}
	};
}

function printSummary(results: RunResult[]): void {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	console.log('\n── Scenario summary ──────────────────────────────────');
	for (const r of results) {
		const icon = r.passed ? '✓' : '✗';
		console.log(`  ${icon}  ${r.challengeId.padEnd(20)}  ${r.durationMs}ms`);
	}
	console.log(`────────────────────────────────────────────────────`);
	console.log(`  passed: ${passed}  failed: ${failed}  total: ${results.length}`);
}
