/**
 * Applies src/lib/server/db/schema.sql to DATABASE_URL.
 * Run with: bun run db:init
 *
 * The schema is idempotent (IF NOT EXISTS everywhere), so this is safe to
 * re-run after additive migrations.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'src', 'lib', 'server', 'db', 'schema.sql');

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const schema = readFileSync(schemaPath, 'utf8');
const sql = postgres(url, { max: 1 });

try {
	await sql.unsafe(schema);
	console.log('Schema applied.');
} catch (err) {
	console.error('Schema apply failed:', err);
	process.exitCode = 1;
} finally {
	await sql.end();
}
