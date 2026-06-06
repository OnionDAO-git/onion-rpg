/**
 * Admin read-only query helpers. All functions in this module are read-only
 * (SELECT only) — no writes, no engine side effects. The admin UI imports these
 * directly from +layout.server.ts / +page.server.ts files.
 *
 * Owner: admin-ui agent. Do NOT add write paths here; those belong to
 * src/lib/server/engine/ or src/lib/server/onion/.
 */
import { sql } from '../db/index';

// ── Supply Gauge ──────────────────────────────────────────────────────────────

export interface GaugeRow {
	current: number;
	max: number;
	pct: number; // 0..100
}

/** Read the shared onion supply win-bar. Returns zeros if row missing. */
export async function adminGetGauge(): Promise<GaugeRow> {
	const rows = await sql<{ current: number; max: number }[]>`
    SELECT current, max FROM onion_supply_gauge WHERE id = 1
  `;
	if (!rows.length) return { current: 0, max: 1000, pct: 0 };
	const { current, max } = rows[0];
	return { current, max, pct: max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0 };
}

// ── Beacon Fleet ──────────────────────────────────────────────────────────────

export interface AdminBeacon {
	id: string;
	challengeId: string | null;
	name: string;
	landmark: string | null;
	lat: number | null;
	lon: number | null;
	espnowMac: string | null;
	online: boolean;
	source: 'hardware' | 'sim';
	lastSeenAt: string | null;
}

export async function adminListBeacons(): Promise<AdminBeacon[]> {
	return sql<AdminBeacon[]>`
    SELECT
      id, challenge_id, name, landmark, lat, lon,
      espnow_mac, online, source, last_seen_at
    FROM beacons
    ORDER BY name
  `;
}

// ── Operative Roster ──────────────────────────────────────────────────────────

export interface AdminOperative {
	id: string;
	hardwareId: string;
	onionId: number | null;
	username: string | null;
	callsign: string | null;
	registered: boolean;
	act: number;
	hp: number;
	createdAt: string;
	lastSeenAt: string;
}

export async function adminListOperatives(): Promise<AdminOperative[]> {
	return sql<AdminOperative[]>`
    SELECT
      o.id, o.hardware_id, o.onion_id, o.username, o.callsign,
      o.registered, o.created_at, o.last_seen_at,
      COALESCE(g.current_act, 0)  AS act,
      COALESCE(g.hp, 100)         AS hp
    FROM operatives o
    LEFT JOIN game_state g ON g.operative_id = o.id
    ORDER BY o.last_seen_at DESC
  `;
}

// ── Per-Operative Inventory + Progress (detail view) ──────────────────────────

export interface AdminInventoryRow {
	catalogId: string;
	kind: string;
	qty: number;
	backing: string;
	acquiredAt: string;
}

export async function adminGetOperativeInventory(
	operativeId: string
): Promise<AdminInventoryRow[]> {
	return sql<AdminInventoryRow[]>`
    SELECT catalog_id, kind, qty, backing, acquired_at
    FROM inventory
    WHERE operative_id = ${operativeId}
    ORDER BY acquired_at DESC
  `;
}

export interface AdminChallengeAttempt {
	id: string;
	challengeId: string;
	status: string;
	result: Record<string, unknown> | null;
	createdAt: string;
	resolvedAt: string | null;
}

export async function adminGetOperativeAttempts(
	operativeId: string
): Promise<AdminChallengeAttempt[]> {
	return sql<AdminChallengeAttempt[]>`
    SELECT id, challenge_id, status, result, started_at AS created_at, resolved_at
    FROM challenge_attempts
    WHERE operative_id = ${operativeId}
    ORDER BY started_at DESC
    LIMIT 50
	`;
}

export interface AdminOperativeState {
	currentAct: number;
	challengeStatus: Record<string, string>;
	flags: Record<string, unknown>;
}

export async function adminGetOperativeState(
	operativeId: string
): Promise<AdminOperativeState | null> {
	const [row] = await sql<AdminOperativeState[]>`
		SELECT current_act, challenge_status, flags
		FROM game_state
		WHERE operative_id = ${operativeId}
	`;
	return row ?? null;
}

// ── Storyteller Sessions ──────────────────────────────────────────────────────

export interface AdminStorytellerSession {
	id: string;
	operativeId: string;
	username: string | null;
	challengeId: string;
	mode: string;
	model: string;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export async function adminListStortellerSessions(): Promise<AdminStorytellerSession[]> {
	return sql<AdminStorytellerSession[]>`
    SELECT
      ss.id, ss.operative_id, o.username,
      ss.challenge_id, ss.mode, ss.model, ss.status,
      ss.created_at, ss.updated_at
    FROM storyteller_sessions ss
    LEFT JOIN operatives o ON o.id = ss.operative_id
    ORDER BY ss.updated_at DESC
    LIMIT 100
  `;
}

export interface AdminTranscriptTurn {
	id: string;
	sessionId: string;
	turn: number;
	role: string;
	content: string;
	meta: Record<string, unknown> | null;
	createdAt: string;
}

export async function adminGetSessionTranscript(
	sessionId: string
): Promise<AdminTranscriptTurn[]> {
	return sql<AdminTranscriptTurn[]>`
    SELECT id, session_id, turn, role, content, meta, created_at
    FROM storyteller_transcripts
    WHERE session_id = ${sessionId}
    ORDER BY turn ASC
  `;
}

// ── Onion Rewards Ledger ──────────────────────────────────────────────────────

export interface AdminRewardRow {
	id: string;
	operativeId: string;
	username: string | null;
	externalId: string;
	type: string;
	amount: number;
	status: string;
	onionRequestId: string | null;
	createdAt: string;
	updatedAt: string | null;
}

export async function adminListRewards(opts?: {
	limit?: number;
	status?: string;
}): Promise<AdminRewardRow[]> {
	const limit = opts?.limit ?? 200;
	if (opts?.status) {
		return sql<AdminRewardRow[]>`
      SELECT
        r.id, r.operative_id, o.username,
        r.external_id, r.request_type AS type, r.amount, r.status,
        r.onion_request_id, r.created_at, r.updated_at
      FROM onion_rewards r
      LEFT JOIN operatives o ON o.id = r.operative_id
      WHERE r.status = ${opts.status}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `;
	}
	return sql<AdminRewardRow[]>`
    SELECT
      r.id, r.operative_id, o.username,
      r.external_id, r.request_type AS type, r.amount, r.status,
      r.onion_request_id, r.created_at, r.updated_at
    FROM onion_rewards r
    LEFT JOIN operatives o ON o.id = r.operative_id
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `;
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export interface AdminDashboardStats {
	totalOperatives: number;
	registeredOperatives: number;
	onlineBeacons: number;
	totalBeacons: number;
	pendingRewards: number;
	totalOnionsAwarded: number;
}

export async function adminDashboardStats(): Promise<AdminDashboardStats> {
	const [ops, beacons, rewards] = await Promise.all([
		sql<{ total: number; registered: number }[]>`
      SELECT
        COUNT(*)                                   AS total,
        COUNT(*) FILTER (WHERE registered = TRUE)  AS registered
      FROM operatives
    `,
		sql<{ total: number; online: number }[]>`
      SELECT
        COUNT(*)                                AS total,
        COUNT(*) FILTER (WHERE online = TRUE)   AS online
      FROM beacons
    `,
		sql<{ pending: number; totalAwarded: number }[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE status IN ('pending', 'processing', 'awaiting_badge_signature')
        ) AS pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS total_awarded
      FROM onion_rewards
    `
	]);
	return {
		totalOperatives: Number(ops[0]?.total ?? 0),
		registeredOperatives: Number(ops[0]?.registered ?? 0),
		onlineBeacons: Number(beacons[0]?.online ?? 0),
		totalBeacons: Number(beacons[0]?.total ?? 0),
		pendingRewards: Number(rewards[0]?.pending ?? 0),
		totalOnionsAwarded: Number(rewards[0]?.totalAwarded ?? 0)
	};
}
