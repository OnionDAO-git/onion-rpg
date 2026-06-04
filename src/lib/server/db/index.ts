import postgres from 'postgres';
import { env } from '$env/dynamic/private';

/**
 * Shared Postgres client. Mirrors landing-2026's conventions:
 *   - small pool, sensible timeouts
 *   - postgres.camel transform so snake_case columns become camelCase in TS
 *     (and camelCase fields map back to snake_case on write).
 *
 * Apply the schema with `bun run db:init` (see scripts/db-init.ts).
 *
 * The client is created lazily on first use so that importing this module
 * during build-time analysis (SvelteKit prerender/analyse) does not require
 * DATABASE_URL to be set. The guard still fires the first time a query runs.
 */
let _sql: postgres.Sql | undefined;

function getSql(): postgres.Sql {
	if (_sql) return _sql;
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in the values.');
	}
	_sql = postgres(env.DATABASE_URL, {
		max: 10,
		idle_timeout: 30,
		connect_timeout: 10,
		transform: postgres.camel
	});
	return _sql;
}

/**
 * Proxy that forwards both `sql(...)` template-tag calls and property access
 * (e.g. `sql.begin`, `sql.json`) to the lazily-created client.
 */
export const sql = new Proxy(function () {} as unknown as postgres.Sql, {
	apply(_target, _thisArg, args) {
		// Reflect.apply preserves the tagged-template / function call semantics.
		return Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, undefined, args);
	},
	get(_target, prop) {
		const client = getSql() as unknown as Record<string | symbol, unknown>;
		const value = client[prop];
		return typeof value === 'function' ? value.bind(client) : value;
	}
}) as postgres.Sql;
