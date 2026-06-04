// See https://svelte.dev/docs/kit/types#app.d.ts
// The oRPG server is primarily a machine-facing API (beacon over HTTPS,
// future badge-direct HTTPS). The browser-facing admin UI, if any, is thin.

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Populated by hooks for badge/beacon-authenticated requests. */
			operativeId?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
