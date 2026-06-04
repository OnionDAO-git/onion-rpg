-- ONION RPG game database schema.
-- Authoritative store for operatives, progression, inventory, combat RNG,
-- challenge attempts, the Onion-reward ledger, beacons, the shared win gauge,
-- and Storyteller transcripts.
--
-- Conventions (match landing-2026):
--   * snake_case columns; the 'postgres' client is configured with
--     transform: postgres.camel so reads/writes are camelCase in TS.
--   * Migration-friendly: every statement is IF NOT EXISTS / idempotent so
--     this file can be re-applied. Additive changes only; never rewrite.
--   * UUID PKs via gen_random_uuid() (pgcrypto).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- operatives: a player. Links the badge identity to the Onion DAO account.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operatives (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Stable per-badge hardware id (onion.hardware_id()).
	hardware_id     TEXT UNIQUE NOT NULL,
	-- Onion DAO numeric account id (onion.onion_id()); null until registered.
	onion_id        BIGINT UNIQUE,
	-- Onion DAO handle/username (resolved via GET /api/public/profile).
	username        TEXT,
	-- Display callsign chosen in oRPG; defaults to username.
	callsign        TEXT,
	-- RESERVED (hex) — ed25519 public key for a future badge-signed-roll hook.
	-- Not currently produced by any shipped badge (no Lua signing primitive);
	-- always null today. Kept as a forward-looking seam.
	attest_pubkey   TEXT,
	registered      BOOLEAN NOT NULL DEFAULT FALSE,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- game_state: per-operative progression. One row per operative.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_state (
	operative_id    UUID PRIMARY KEY REFERENCES operatives(id) ON DELETE CASCADE,
	current_act     INTEGER NOT NULL DEFAULT 0,
	-- challengeId -> 'locked' | 'available' | 'in_progress' | 'cleared'.
	challenge_status JSONB NOT NULL DEFAULT '{}'::jsonb,
	-- Combat health for endurance challenges (3.1 etc.); reset per session.
	hp              INTEGER NOT NULL DEFAULT 100,
	-- Arbitrary flags the engine/storyteller set (e.g. fragments_seen).
	flags           JSONB NOT NULL DEFAULT '{}'::jsonb,
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- inventory: items, credentials, and prompt-fragments an operative owns.
-- The on-chain seam: `backing` + `backing_ref` let us later point a row at an
-- SPL token / NFT mint without changing callers. For now backing='db'.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	operative_id    UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
	-- Catalog id from the shared item catalog, e.g. 'encased_meat_mk1',
	-- 'grid_credential', 'prompt_fragment_1'.
	catalog_id      TEXT NOT NULL,
	-- 'item' | 'credential' | 'prompt_fragment'.
	kind            TEXT NOT NULL,
	qty             INTEGER NOT NULL DEFAULT 1,
	-- Free-form per-instance data (durability, fragment text, etc.).
	metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
	-- On-chain seam: 'db' today; later 'spl_token' | 'nft'.
	backing         TEXT NOT NULL DEFAULT 'db',
	-- Mint address / token account when backing != 'db'.
	backing_ref     TEXT,
	acquired_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (operative_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS inventory_operative_idx ON inventory (operative_id);
CREATE INDEX IF NOT EXISTS inventory_kind_idx ON inventory (operative_id, kind);

-- ─────────────────────────────────────────────────────────────────────────
-- challenge_attempts: every begin/validate cycle, for analytics + idempotency.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_attempts (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	operative_id    UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
	challenge_id    TEXT NOT NULL,
	-- 'combat' | 'dialogue' | 'merchant' | 'npc'.
	challenge_type  TEXT NOT NULL,
	beacon_id       TEXT,
	-- 'started' | 'passed' | 'failed' | 'abandoned'.
	status          TEXT NOT NULL DEFAULT 'started',
	-- The raw input submitted to validate() and the engine's verdict.
	input           JSONB,
	result          JSONB,
	started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS challenge_attempts_op_idx
	ON challenge_attempts (operative_id, challenge_id);

-- ─────────────────────────────────────────────────────────────────────────
-- combat_sessions: server-authoritative RNG combat. The server generates and
-- records every roll; secure_random on the badge (ATECC608A) may supply optional
-- client entropy. No shipped badge signs rolls, so the server roll log is the
-- source of truth (the sig/verified fields are a reserved future hook).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combat_sessions (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	operative_id    UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
	challenge_id    TEXT NOT NULL,
	attempt_id      UUID REFERENCES challenge_attempts(id) ON DELETE SET NULL,
	-- Server-issued nonce the badge must fold into each signed roll.
	server_nonce    TEXT NOT NULL,
	enemy_hp        INTEGER NOT NULL,
	operative_hp    INTEGER NOT NULL,
	wave            INTEGER NOT NULL DEFAULT 0,
	waves_required  INTEGER NOT NULL DEFAULT 1,
	-- Append-only log of rolls: [{ wave, roll, dmg, sig, verified, ts }].
	rolls           JSONB NOT NULL DEFAULT '[]'::jsonb,
	-- 'active' | 'won' | 'lost' | 'expired'.
	status          TEXT NOT NULL DEFAULT 'active',
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	-- Deadline for timed/endurance fights (3.1, 2.1).
	expires_at      TIMESTAMPTZ,
	resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS combat_sessions_op_idx ON combat_sessions (operative_id);

-- ─────────────────────────────────────────────────────────────────────────
-- onion_rewards: ledger of every Onion DAO API request we make, with the
-- (requester, external_id) idempotency pair and the async status machine.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onion_rewards (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	operative_id    UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
	challenge_id    TEXT,
	-- 'burn' | 'transfer' (rewards are typically transfer-to-player or grant).
	request_type    TEXT NOT NULL,
	amount          INTEGER NOT NULL,
	-- Our idempotency key, scoped by ONION_REQUESTER_ID.
	external_id     TEXT NOT NULL,
	-- The request id returned by the Onion API.
	onion_request_id TEXT,
	-- 'pending' | 'awaiting_badge_signature' | 'completed' | 'denied'
	-- | 'failed' | 'processing' (mirrors Onion API statuses).
	status          TEXT NOT NULL DEFAULT 'pending',
	currency_mode   TEXT,
	solana_signature TEXT,
	error           TEXT,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (external_id)
);
CREATE INDEX IF NOT EXISTS onion_rewards_op_idx ON onion_rewards (operative_id);
CREATE INDEX IF NOT EXISTS onion_rewards_req_idx ON onion_rewards (onion_request_id);

-- ─────────────────────────────────────────────────────────────────────────
-- beacons: registered Point-of-Interest beacons. Each hosts one challenge.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beacons (
	id              TEXT PRIMARY KEY,          -- short beacon id, e.g. 'b-ketchup-01'
	challenge_id    TEXT,                       -- challenge this beacon serves
	name            TEXT NOT NULL,
	landmark        TEXT,                       -- real-world anchor (Jardine, OEMC...)
	lat             DOUBLE PRECISION,
	lon             DOUBLE PRECISION,
	-- ESP-NOW MAC the badge addresses (uppercase colon-hex).
	espnow_mac      TEXT,
	online          BOOLEAN NOT NULL DEFAULT FALSE,
	-- 'hardware' | 'sim'.
	source          TEXT NOT NULL DEFAULT 'hardware',
	last_seen_at    TIMESTAMPTZ,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- onion_supply_gauge: the single shared festival win-bar. One row (id=1).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onion_supply_gauge (
	id              INTEGER PRIMARY KEY DEFAULT 1,
	-- 0..max; visibly refills as zones clear.
	current         BIGINT NOT NULL DEFAULT 0,
	max             BIGINT NOT NULL DEFAULT 100000,
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT onion_supply_gauge_singleton CHECK (id = 1)
);
INSERT INTO onion_supply_gauge (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- storyteller_sessions / storyteller_transcripts: DEEPDISH conversations.
-- A session is one NPC/dialogue interaction; transcripts are the turn log
-- (used to rebuild the prompt-cached context window on each turn).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storyteller_sessions (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	operative_id    UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
	challenge_id    TEXT,
	-- 'npc' | 'dialogue' | 'finale'.
	mode            TEXT NOT NULL DEFAULT 'npc',
	model           TEXT,
	-- 'open' | 'resolved' | 'abandoned'.
	status          TEXT NOT NULL DEFAULT 'open',
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storyteller_sessions_op_idx
	ON storyteller_sessions (operative_id);

CREATE TABLE IF NOT EXISTS storyteller_transcripts (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id      UUID NOT NULL REFERENCES storyteller_sessions(id) ON DELETE CASCADE,
	turn            INTEGER NOT NULL,
	-- 'operative' | 'deepdish' | 'system'.
	role            TEXT NOT NULL,
	content         TEXT NOT NULL,
	-- For voice turns: the STT transcript + provider confidence.
	meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storyteller_transcripts_session_idx
	ON storyteller_transcripts (session_id, turn);
