/**
 * tests/setup.ts — Global test setup loaded via bunfig.toml [test] preload.
 *
 * Sets essential environment variables before any test module is imported so
 * modules that read env at initialization time (e.g. db/index.ts reading
 * DATABASE_URL) get sensible test values.
 *
 * External services (Anthropic, Onion DAO API, Postgres) are mocked via
 * mock.module() calls in each test file. This file only sets env vars.
 */

// Database — point at a test DB if DATABASE_URL is not already set.
// The full E2E tests that actually need Postgres will set this themselves;
// unit-level tests mock the sql client entirely.
if (!process.env['DATABASE_URL']) {
  process.env['DATABASE_URL'] = 'postgres://localhost:5432/onion_rpg_test';
}

// Anthropic — prevent accidental real API calls
if (!process.env['ANTHROPIC_API_KEY']) {
  process.env['ANTHROPIC_API_KEY'] = 'sk-test-fake-key-for-tests-only';
}

// STT — use mock provider so no real STT calls happen
process.env['STT_PROVIDER'] = 'mock';

// Beacon auth — open in test mode
if (!process.env['BEACON_API_KEY']) {
  process.env['BEACON_API_KEY'] = '';
}

// Onion DAO API — point at a non-existent host so any real call fails loudly
if (!process.env['ONION_API_BASE_URL']) {
  process.env['ONION_API_BASE_URL'] = 'http://localhost:0';
}
