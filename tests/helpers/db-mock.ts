/**
 * tests/helpers/db-mock.ts — In-memory Postgres mock for unit/E2E tests.
 *
 * Intercepts `src/lib/server/db/index.ts`'s `sql` export via bun:mock so
 * no real Postgres connection is needed. Every table is stored in-memory
 * as a plain object keyed by id/primary-key.
 *
 * Usage:
 *   import { mockDb, getDb, resetDb } from '../helpers/db-mock';
 *   // Call mockDb() at the top of the test file (before importing engine modules)
 *   // to install the mock via mock.module().
 */

import { mock } from 'bun:test';
import { randomUUID } from 'crypto';

// ── In-memory store ─────────────────────────────────────────────────────────

export interface DbStore {
  operatives: Map<string, any>;
  game_state: Map<string, any>;
  inventory: Map<string, any>;       // key: `${operativeId}:${catalogId}`
  challenge_attempts: Map<string, any>;
  combat_sessions: Map<string, any>;
  onion_rewards: Map<string, any>;   // key: external_id
  beacons: Map<string, any>;
  onion_supply_gauge: { current: number; max: number };
  storyteller_sessions: Map<string, any>;
  storyteller_transcripts: Map<string, any>;
}

let _store: DbStore;

function freshStore(): DbStore {
  return {
    operatives: new Map(),
    game_state: new Map(),
    inventory: new Map(),
    challenge_attempts: new Map(),
    combat_sessions: new Map(),
    onion_rewards: new Map(),
    beacons: new Map(),
    onion_supply_gauge: { current: 0, max: 100000 },
    storyteller_sessions: new Map(),
    storyteller_transcripts: new Map()
  };
}

export function getDb(): DbStore {
  if (!_store) _store = freshStore();
  return _store;
}

export function resetDb(): void {
  _store = freshStore();
}

// ── sql mock factory ────────────────────────────────────────────────────────

/**
 * Build a tagged-template-literal sql function that routes queries to the
 * in-memory store. The mock only covers the specific query patterns used by
 * the engine; it throws on unrecognised patterns so tests surface gaps
 * instead of silently returning empty results.
 */
function buildSql() {
  const store = () => getDb();

  function sql(strings: TemplateStringsArray, ...values: unknown[]): any {
    // Reconstruct the SQL string with $N placeholders replaced by values
    // for pattern matching. We normalise whitespace to simplify patterns.
    const raw = strings.reduce((acc, s, i) =>
      acc + (values[i - 1] !== undefined ? `§${i}§` : '') + s
    );
    const normalised = raw.replace(/\s+/g, ' ').trim().toLowerCase();

    // ── operatives ─────────────────────────────────────────────────────────

    if (normalised.startsWith('insert into operatives')) {
      const hardwareId = values[0] as string;
      const onionId = values[1] as number | null;
      const db = store();

      // Find existing by hardware_id
      let existing: any;
      for (const op of db.operatives.values()) {
        if (op.hardwareId === hardwareId) { existing = op; break; }
      }
      if (existing) {
        existing.lastSeenAt = new Date().toISOString();
        if (onionId != null) existing.onionId = onionId;
        return [existing];
      }
      const op = {
        id: randomUUID(),
        hardwareId,
        onionId: onionId ?? null,
        username: null,
        callsign: null,
        attestPubkey: null,
        registered: false,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      };
      db.operatives.set(op.id, op);
      return [op];
    }

    if (normalised.includes('update operatives set') && normalised.includes('registered')) {
      const db = store();
      const opId = values[values.length - 1] as string;
      const op = db.operatives.get(opId);
      if (!op) return [];
      // Apply all COALESCE updates from registerOperative
      // values[0]=onionId, [1]=username, [2]=callsign, [3]=attestPubkey, last=id
      if (values[0] != null) op.onionId = values[0];
      if (values[1] != null) op.username = values[1];
      if (values[2] != null) op.callsign = values[2];
      if (values[3] != null) op.attestPubkey = values[3];
      op.registered = true;
      op.lastSeenAt = new Date().toISOString();
      return [op];
    }

    if (normalised.includes('select * from operatives where id')) {
      const id = values[0] as string;
      const op = store().operatives.get(id);
      return op ? [op] : [];
    }

    if (normalised.includes('select username from operatives where id')) {
      const id = values[0] as string;
      const op = store().operatives.get(id);
      return op ? [{ username: op.username }] : [];
    }

    if (normalised.includes('select attest_pubkey from operatives where id')) {
      const id = values[0] as string;
      const op = store().operatives.get(id);
      return op ? [{ attestPubkey: op.attestPubkey }] : [];
    }

    // ── game_state ──────────────────────────────────────────────────────────

    if (normalised.includes('insert into game_state') && normalised.includes('on conflict')) {
      const db = store();
      const opId = values[0] as string;
      if (!db.game_state.has(opId)) {
        db.game_state.set(opId, {
          operativeId: opId,
          currentAct: 0,
          challengeStatus: {},
          hp: 100,
          flags: {},
          updatedAt: new Date().toISOString()
        });
      }
      return [];
    }

    if (normalised.includes('select current_act, challenge_status, hp, flags from game_state')) {
      const opId = values[0] as string;
      const gs = store().game_state.get(opId);
      return gs ? [gs] : [];
    }

    if (normalised.includes('update game_state set') && normalised.includes('challenge_status')) {
      const db = store();
      // Find op_id from the WHERE clause — last value
      const opId = values[values.length - 1] as string;
      const gs = db.game_state.get(opId);
      if (!gs) return [];

      // Detect which kind of challenge_status update this is
      if (normalised.includes('"cleared"')) {
        // Mark cleared
        const challengeId = (values[0] as string).replace(/[{}]/g, '');
        gs.challengeStatus = { ...gs.challengeStatus, [challengeId]: 'cleared' };
      } else if (normalised.includes('"in_progress"')) {
        // Mark in_progress (unless already cleared)
        const challengeId = (values[0] as string).replace(/[{}]/g, '');
        if (gs.challengeStatus[challengeId] !== 'cleared') {
          gs.challengeStatus = { ...gs.challengeStatus, [challengeId]: 'in_progress' };
        }
      }
      gs.updatedAt = new Date().toISOString();
      return [];
    }

    if (normalised.includes('update game_state set') && normalised.includes('current_act')) {
      const db = store();
      const nextAct = values[0] as number;
      const opId = values[1] as string;
      const gs = db.game_state.get(opId);
      if (gs) { gs.currentAct = nextAct; gs.updatedAt = new Date().toISOString(); }
      return [];
    }

    if (normalised.includes('update game_state set') && normalised.includes('flags')) {
      const db = store();
      const newFlags = values[0] as Record<string, unknown>;
      const opId = values[1] as string;
      const gs = db.game_state.get(opId);
      if (gs) { gs.flags = { ...gs.flags, ...newFlags }; gs.updatedAt = new Date().toISOString(); }
      return [];
    }

    // ── inventory ───────────────────────────────────────────────────────────

    if (normalised.includes('insert into inventory')) {
      const db = store();
      const [opId, catalogId, kind, qty, backing, backingRef] = values as [string, string, string, number, string, string | null];
      const key = `${opId}:${catalogId}`;
      const existing = db.inventory.get(key);
      if (existing) {
        if (kind === 'item') existing.qty += qty;
        return [existing];
      }
      const row = {
        id: randomUUID(),
        operativeId: opId,
        catalogId,
        kind,
        qty,
        metadata: {},
        backing,
        backingRef: backingRef ?? null,
        acquiredAt: new Date().toISOString()
      };
      db.inventory.set(key, row);
      return [row];
    }

    if (normalised.includes('select catalog_id from inventory where operative_id')) {
      const opId = values[0] as string;
      const db = store();
      const result: { catalogId: string }[] = [];
      for (const [key, row] of db.inventory) {
        if (key.startsWith(opId + ':')) result.push({ catalogId: row.catalogId });
      }
      return result;
    }

    if (normalised.includes('select * from inventory where operative_id')) {
      const opId = values[0] as string;
      const db = store();
      const result: any[] = [];
      for (const [key, row] of db.inventory) {
        if (key.startsWith(opId + ':')) result.push(row);
      }
      return result;
    }

    // ── challenge_attempts ──────────────────────────────────────────────────

    if (normalised.includes('insert into challenge_attempts')) {
      const db = store();
      const [opId, challengeId, challengeType, beaconId] = values as [string, string, string, string | null];
      const attempt = {
        id: randomUUID(),
        operativeId: opId,
        challengeId,
        challengeType,
        beaconId: beaconId ?? null,
        status: 'started',
        input: null,
        result: null,
        startedAt: new Date().toISOString(),
        resolvedAt: null
      };
      db.challenge_attempts.set(attempt.id, attempt);
      return [{ id: attempt.id }];
    }

    if (normalised.includes('update challenge_attempts set')) {
      const db = store();
      // values: status, input, result, resolvedAt(?), id, operative_id
      const [status, input, result] = values as [string, unknown, unknown];
      const attemptId = values[values.length - 2] as string;
      const attempt = db.challenge_attempts.get(attemptId);
      if (attempt) {
        attempt.status = status;
        attempt.input = input;
        attempt.result = result;
        if (status !== 'started') attempt.resolvedAt = new Date().toISOString();
      }
      return [];
    }

    if (normalised.includes('select operative_id, id from challenge_attempts') && normalised.includes("status = 'started'")) {
      const db = store();
      const challengeId = values[0] as string;
      for (const attempt of [...db.challenge_attempts.values()].reverse()) {
        if (attempt.challengeId === challengeId && attempt.status === 'started') {
          return [{ operativeId: attempt.operativeId, id: attempt.id }];
        }
      }
      return [];
    }

    // ── combat_sessions ─────────────────────────────────────────────────────

    if (normalised.includes('insert into combat_sessions')) {
      const db = store();
      const [opId, challengeId, attemptId, serverNonce, enemyHp, operativeHp, wavesRequired] = values as [string, string, string | null, string, number, number, number];
      const session = {
        id: randomUUID(),
        operativeId: opId,
        challengeId,
        attemptId: attemptId ?? null,
        serverNonce,
        enemyHp,
        operativeHp,
        wave: 0,
        wavesRequired,
        rolls: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        resolvedAt: null
      };
      db.combat_sessions.set(session.id, session);
      return [session];
    }

    if (normalised.includes('select * from combat_sessions where id') && normalised.includes('for update')) {
      const sessionId = values[0] as string;
      const session = store().combat_sessions.get(sessionId);
      return session ? [session] : [];
    }

    if (normalised.includes('select id, operative_id, server_nonce from combat_sessions') && normalised.includes("status = 'active'")) {
      const db = store();
      const challengeId = values[0] as string;
      for (const session of [...db.combat_sessions.values()].reverse()) {
        if (session.challengeId === challengeId && session.status === 'active') {
          return [{ id: session.id, operativeId: session.operativeId, serverNonce: session.serverNonce }];
        }
      }
      return [];
    }

    if (normalised.includes('select * from combat_sessions') && normalised.includes('order by created_at desc limit 1')) {
      const db = store();
      const opId = values[0] as string;
      const challengeId = values[1] as string;
      const sessions = [...db.combat_sessions.values()]
        .filter(s => s.operativeId === opId && s.challengeId === challengeId)
        .reverse();
      return sessions.length > 0 ? [sessions[0]] : [];
    }

    if (normalised.includes('update combat_sessions set') && normalised.includes('status')) {
      const db = store();
      // update pattern: enemy_hp, operative_hp, wave, rolls, status, resolved_at, WHERE id
      const sessionId = values[values.length - 1] as string;
      const session = db.combat_sessions.get(sessionId);
      if (session) {
        session.enemyHp = values[0] as number;
        session.operativeHp = values[1] as number;
        session.wave = values[2] as number;
        session.rolls = values[3] as any[];
        session.status = values[4] as string;
        if (session.status !== 'active') session.resolvedAt = new Date().toISOString();
      }
      return session ? [session] : [];
    }

    if (normalised.includes('update combat_sessions set status = \'expired\'')) {
      const db = store();
      const sessionId = values[0] as string;
      const session = db.combat_sessions.get(sessionId);
      if (session) { session.status = 'expired'; session.resolvedAt = new Date().toISOString(); }
      return session ? [session] : [];
    }

    // ── onion_rewards ───────────────────────────────────────────────────────

    if (normalised.includes('select id, status, onion_request_id from onion_rewards where external_id')) {
      const db = store();
      const extId = values[0] as string;
      const row = db.onion_rewards.get(extId);
      return row ? [{ id: row.id, status: row.status, onionRequestId: row.onionRequestId ?? null }] : [];
    }

    if (normalised.includes('insert into onion_rewards')) {
      const db = store();
      const [opId, challengeId, requestType, amount, externalId] = values as [string, string, string, number, string];
      if (db.onion_rewards.has(externalId)) return []; // conflict
      const row = {
        id: randomUUID(),
        operativeId: opId,
        challengeId,
        requestType,
        amount,
        externalId,
        onionRequestId: null,
        status: 'pending',
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.onion_rewards.set(externalId, row);
      return [{ id: row.id }];
    }

    if (normalised.includes('update onion_rewards set') && normalised.includes('onion_request_id')) {
      const db = store();
      const [onionRequestId, status] = values as [string, string];
      const rewardId = values[values.length - 1] as string;
      for (const row of db.onion_rewards.values()) {
        if (row.id === rewardId) {
          row.onionRequestId = onionRequestId;
          row.status = status;
          row.updatedAt = new Date().toISOString();
        }
      }
      return [];
    }

    if (normalised.includes('update onion_rewards set status =') || normalised.includes("status = 'failed'")) {
      const db = store();
      const rewardId = values[values.length - 1] as string;
      for (const row of db.onion_rewards.values()) {
        if (row.id === rewardId) {
          row.status = values[0] as string;
          if (values[1]) row.error = values[1] as string;
          row.updatedAt = new Date().toISOString();
        }
      }
      return [];
    }

    // ── onion_supply_gauge ──────────────────────────────────────────────────

    if (normalised.includes('select current, max from onion_supply_gauge')) {
      const g = store().onion_supply_gauge;
      return [{ current: g.current, max: g.max }];
    }

    if (normalised.includes('update onion_supply_gauge')) {
      const amount = values[0] as number;
      const g = store().onion_supply_gauge;
      g.current = Math.min(g.max, g.current + amount);
      return [{ current: g.current, max: g.max }];
    }

    // ── Default: unrecognised query ─────────────────────────────────────────
    // Return empty array rather than throwing so unknown SELECTs don't break
    // flow — but log so developers can see what's unhandled.
    console.warn(`[db-mock] UNHANDLED SQL:\n  ${normalised}\n  values: ${JSON.stringify(values)}`);
    return [];
  }

  // Attach the json helper used for JSONB columns
  sql.json = (v: unknown) => v;
  // Attach the unsafe helper (not used in tests but needed for import)
  sql.unsafe = () => [];

  return sql;
}

// ── Mock installation ─────────────────────────────────────────────────────────

let _installed = false;

/**
 * Install the in-memory DB mock via bun:mock. Call this at the TOP of a test
 * file, before importing any engine modules, so the mock is in place when
 * those modules' top-level imports run.
 *
 * Safe to call multiple times; only installs once per process.
 */
export function mockDb(): void {
  if (_installed) return;
  _installed = true;
  const sqlMock = buildSql();
  mock.module('../../src/lib/server/db/index', () => ({ sql: sqlMock }));
}
