/**
 * Challenge registry — self-registration framework.
 *
 * PARALLEL-SAFE BY DESIGN: there is NO central array that challenge authors
 * edit. Each challenge lives in its own file under `impl/` and registers
 * itself by calling `registerChallenge(descriptor)` at module top level. This
 * module discovers those files with `import.meta.glob` and imports them eagerly
 * once, so every `impl/*.ts` module's top-level `registerChallenge(...)` runs.
 *
 * ── How to add a challenge (the EXACT contract) ────────────────────────────
 * Create `src/lib/server/challenges/impl/<challengeId>.ts`. The file MUST:
 *
 *   import { registerChallenge } from '../registry';
 *   import type { ChallengeDescriptor } from '$lib/shared/types';
 *
 *   const challenge: ChallengeDescriptor = {
 *     id: '0.1',                 // matches SPEC numbering; also the beacon's challengeId
 *     act: 0,
 *     type: 'combat',
 *     name: 'The Ketchup Gauntlet',
 *     requires: [],              // catalogIds gating entry
 *     rewards: [
 *       { kind: 'inventory', catalogId: 'encased_meat_mk1' },
 *       { kind: 'onions', amount: 50 },
 *       { kind: 'gauge', amount: 500 }
 *     ],
 *     beaconConfig: { beaconIdHint: 'b-ketchup', landmark: 'Hot dog stand' },
 *     content: { /* prompts, button maps, voice targets, etc. *\/ },
 *     validate(input, ctx) { /* return ChallengeResult *\/ }
 *   };
 *
 *   registerChallenge(challenge);
 *   export default challenge; // optional; the side-effecting call is what matters
 *
 * RULES:
 *   - `id` MUST be globally unique; duplicate ids throw at load.
 *   - The module's side effect (calling registerChallenge) is REQUIRED.
 *     Returning/exporting a descriptor without registering it does nothing.
 *   - Do NOT import another challenge's file or edit this registry. The glob
 *     finds new files automatically — no shared index to merge-conflict on.
 *   - `validate` must be pure-ish: read `ctx`, return a verdict. The engine
 *     persists the attempt and APPLIES rewards; challenges never grant directly.
 */

import type { ChallengeDescriptor } from '$lib/shared/types';

/**
 * The registry map is reached through a hoisted accessor rather than a
 * module-level `const`. When Vite bundles the eager `import.meta.glob` below,
 * the impl modules' top-level `registerChallenge()` side effects can execute
 * before this module's own top-level bindings finish initializing. Reading the
 * map through a function (which is hoisted) avoids a temporal-dead-zone
 * "Cannot access 'registry' before initialization" crash in that ordering.
 */
// `var` (not `let`/`const`) is deliberate: it is hoisted and initialized to
// `undefined` with no temporal-dead-zone, so the eagerly-globbed impl modules
// can call registerChallenge() even if their initialization is ordered before
// this declaration in the bundled output.
// eslint-disable-next-line no-var
var _registry: Map<string, ChallengeDescriptor> | undefined;
function registry(): Map<string, ChallengeDescriptor> {
	return (_registry ??= new Map<string, ChallengeDescriptor>());
}

/** Called at module top level by each impl/<id>.ts file. */
export function registerChallenge(descriptor: ChallengeDescriptor): void {
	const map = registry();
	if (map.has(descriptor.id)) {
		throw new Error(`Duplicate challenge id registered: ${descriptor.id}`);
	}
	map.set(descriptor.id, descriptor);
}

/**
 * Eagerly import every challenge implementation so its top-level
 * registerChallenge() runs. Vite resolves this glob at build time. The keys of
 * the returned record are the matched module paths; we don't need the modules'
 * exports, only their import side effects, so we just touch the record.
 */
const modules = import.meta.glob('./impl/*.ts', { eager: true });
// Touch the record so bundlers don't tree-shake the eager imports away.
void Object.keys(modules);

/** Look up a challenge by id (e.g. '0.1', '3.4'). */
export function getChallenge(id: string): ChallengeDescriptor | undefined {
	return registry().get(id);
}

/** All registered challenges, sorted by id for stable ordering. */
export function allChallenges(): ChallengeDescriptor[] {
	return [...registry().values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Challenges for a given act. */
export function challengesForAct(act: number): ChallengeDescriptor[] {
	return allChallenges().filter((c) => c.act === act);
}
