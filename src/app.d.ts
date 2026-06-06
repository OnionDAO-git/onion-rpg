// See https://svelte.dev/docs/kit/types#app.d.ts
// The oRPG server is primarily a machine-facing API (beacon over HTTPS,
// future badge-direct HTTPS). The browser-facing admin UI, if any, is thin.

import type { AuthUser } from '$lib/server/onion/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Populated by hooks for badge/beacon-authenticated requests. */
			operativeId?: string;
			/**
			 * Shared Onion DAO login, resolved by hooks from the `.oniondao.dev`
			 * `session` cookie via the onion API. Null when logged out.
			 */
			user: AuthUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
