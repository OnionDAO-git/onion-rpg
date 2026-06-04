import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
		// Mirrors landing-2026. The badge/beacon-facing API lives under
		// /api/* and is consumed by non-browser clients (the beacon firmware
		// over HTTPS), so we deliberately keep CSP minimal here; tighten the
		// admin UI separately if/when one is added.
	}
};

export default config;
