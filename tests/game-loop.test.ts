/**
 * tests/game-loop.test.ts — End-to-end game loop tests.
 *
 * Coverage (per task brief):
 *   1. Operative registration + Act 0 Ketchup Gauntlet combat E2E
 *      (badge sim → beacon sim relay → server engine → reward recorded)
 *   2. Voice challenge (mocked STT) — 1.1 Malört Fountains
 *   3. NPC challenge (mocked Claude) — act1-3 River Ran Backwards
 *   4. Progression gating — Act 4 blocked without 3 credentials,
 *      allowed with all 3
 *
 * External services (Postgres, Anthropic API, Onion DAO API) are mocked.
 * mock.module() uses absolute paths so bun intercepts relative imports
 * within the server modules correctly.
 */

import { mock, describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

// Project root, needed to build absolute mock paths
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — Install all mocks (synchronous, before any dynamic imports)
// ═══════════════════════════════════════════════════════════════════════════

// ── $env/dynamic/private (SvelteKit virtual module) ──────────────────────
mock.module('$env/dynamic/private', () => ({
  env: new Proxy({} as Record<string, string | undefined>, {
    get(_t, p: string) { return process.env[p]; }
  })
}));

// ── In-memory database ────────────────────────────────────────────────────
let _db = freshStore();
function freshStore() {
  return {
    operatives: new Map<string, any>(),
    game_state: new Map<string, any>(),
    inventory: new Map<string, any>(),      // key: `${opId}:${catalogId}`
    challenge_attempts: new Map<string, any>(),
    combat_sessions: new Map<string, any>(),
    onion_rewards: new Map<string, any>(),  // key: externalId
    gauge: { current: 0, max: 100000 }
  };
}
function resetDb() { _db = freshStore(); }

// Sentinel values returned by sql`NULL` and sql`now()` sub-expressions
const SQL_NULL = null;
const SQL_NOW = () => new Date().toISOString();

function buildSql() {
  function sql(strings: TemplateStringsArray, ...values: unknown[]): any {
    const raw = strings.raw.reduce((a, s, i) => a + (i > 0 ? `§${i - 1}§` : '') + s);
    const n = raw.replace(/\s+/g, ' ').trim().toLowerCase();

    // sql`NULL` and sql`now()` — raw SQL sub-expressions used as values
    if (n === 'null') return SQL_NULL;
    if (n.startsWith('now()')) return SQL_NOW();

    // operatives
    if (n.startsWith('insert into operatives')) {
      const [hw, onionId] = values as [string, number | null];
      for (const op of _db.operatives.values()) {
        if (op.hardwareId === hw) { op.lastSeenAt = new Date().toISOString(); if (onionId != null) op.onionId = onionId; return [op]; }
      }
      const op = { id: randomUUID(), hardwareId: hw, onionId: onionId ?? null, username: null, callsign: null, attestPubkey: null, registered: false, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
      _db.operatives.set(op.id, op); return [op];
    }
    if (n.includes('update operatives set') && n.includes('registered')) {
      const id = values[values.length - 1] as string; const op = _db.operatives.get(id); if (!op) return [];
      if (values[0] != null) op.onionId = values[0]; if (values[1] != null) op.username = values[1]; if (values[2] != null) op.callsign = values[2]; if (values[3] != null) op.attestPubkey = values[3];
      op.registered = true; op.lastSeenAt = new Date().toISOString(); return [op];
    }
    if (n.includes('select * from operatives where id')) { return [_db.operatives.get(values[0] as string) ?? null].filter(Boolean); }
    if (n.includes('select username from operatives where id')) { const op = _db.operatives.get(values[0] as string); return op ? [{ username: op.username }] : []; }
    if (n.includes('select attest_pubkey from operatives where id')) { const op = _db.operatives.get(values[0] as string); return op ? [{ attestPubkey: op.attestPubkey }] : []; }

    // game_state
    if (n.includes('insert into game_state') && n.includes('on conflict')) {
      const id = values[0] as string;
      if (!_db.game_state.has(id)) _db.game_state.set(id, { operativeId: id, currentAct: 0, challengeStatus: {}, hp: 100, flags: {}, xp: 0, level: 1, energy: 7, energyExhaustedAt: null, loadout: {}, updatedAt: new Date().toISOString() }); return [];
    }
    // Both the full select (with hp/flags) and the act-only select (maybeAdvanceAct)
    if (n.includes('select current_act') && n.includes('game_state') && n.includes('operative_id')) {
      return [_db.game_state.get(values[0] as string) ?? null].filter(Boolean);
    }
    if (n.includes('update game_state set') && n.includes('challenge_status')) {
      const id = values[values.length - 1] as string; const gs = _db.game_state.get(id); if (!gs) return [];
      const cid = (values[0] as string).replace(/[{}]/g, '');
      if (n.includes('"cleared"')) gs.challengeStatus = { ...gs.challengeStatus, [cid]: 'cleared' };
      else if (gs.challengeStatus[cid] !== 'cleared') gs.challengeStatus = { ...gs.challengeStatus, [cid]: 'in_progress' };
      gs.updatedAt = new Date().toISOString(); return [];
    }
    if (n.includes('update game_state set') && n.includes('current_act')) {
      const gs = _db.game_state.get(values[1] as string); if (gs) { gs.currentAct = values[0]; gs.updatedAt = new Date().toISOString(); } return [];
    }
    if (n.includes('update game_state set') && n.includes('flags')) {
      const gs = _db.game_state.get(values[1] as string); if (gs) { gs.flags = { ...gs.flags, ...(values[0] as any) }; gs.updatedAt = new Date().toISOString(); } return [];
    }
    if (n.includes('update game_state set') && n.includes('xp =')) {
      const id = values[values.length - 1] as string; const amount = values[0] as number; const gs = _db.game_state.get(id);
      if (gs) { gs.xp = (gs.xp ?? 0) + amount; gs.level = Math.max(1, 1 + Math.floor(gs.xp / 100)); gs.updatedAt = new Date().toISOString(); } return [];
    }
    // energy: SELECT energy, energy_exhausted_at; and UPDATE ... energy = $, energy_exhausted_at = $
    if (n.includes('select energy, energy_exhausted_at from game_state')) {
      const gs = _db.game_state.get(values[0] as string);
      return gs ? [{ energy: gs.energy ?? 7, energyExhaustedAt: gs.energyExhaustedAt ?? null }] : [];
    }
    if (n.includes('update game_state') && n.includes('energy_exhausted_at')) {
      // values = [energy, exhaustedAt, operativeId, (cost?)] — operativeId is always values[2].
      const id = values[2] as string; const gs = _db.game_state.get(id);
      if (gs) { gs.energy = values[0] as number; gs.energyExhaustedAt = (values[1] as any) ?? null; gs.updatedAt = new Date().toISOString(); }
      return gs ? [{ energy: gs.energy }] : [];
    }
    // loadout (B3)
    if (n.includes('select loadout from game_state')) {
      const gs = _db.game_state.get(values[0] as string);
      return gs ? [{ loadout: gs.loadout ?? {} }] : [];
    }
    if (n.includes('update game_state set loadout')) {
      const gs = _db.game_state.get(values[1] as string);
      if (gs) { gs.loadout = (values[0] as any) ?? {}; gs.updatedAt = new Date().toISOString(); }
      return [];
    }

    // inventory
    if (n.includes('insert into inventory')) {
      const [opId, catalogId, kind, qty, backing, backingRef] = values as [string, string, string, number, string, string | null];
      const key = `${opId}:${catalogId}`; const ex = _db.inventory.get(key);
      if (ex) { if (kind === 'item') ex.qty += qty; return [ex]; }
      const row = { id: randomUUID(), operativeId: opId, catalogId, kind, qty, metadata: {}, backing, backingRef: backingRef ?? null, acquiredAt: new Date().toISOString() };
      _db.inventory.set(key, row); return [row];
    }
    if (n.includes('select catalog_id from inventory where operative_id')) {
      return [..._db.inventory.entries()].filter(([k]) => k.startsWith((values[0] as string) + ':')).map(([, r]) => ({ catalogId: r.catalogId }));
    }
    if (n.includes('select * from inventory where operative_id')) {
      return [..._db.inventory.entries()].filter(([k]) => k.startsWith((values[0] as string) + ':')).map(([, r]) => r);
    }
    // B3: gear/chest/forge inventory ops (keyed by `${opId}:${catalogId}`)
    if (n.includes('select qty from inventory where operative_id')) {
      const r = _db.inventory.get(`${values[0]}:${values[1]}`); return r ? [{ qty: r.qty }] : [];
    }
    if (n.includes('select 1 as one from inventory where operative_id')) {
      const r = _db.inventory.get(`${values[0]}:${values[1]}`); return r ? [{ one: 1 }] : [];
    }
    if (n.includes('delete from inventory where operative_id')) {
      _db.inventory.delete(`${values[0]}:${values[1]}`); return [];
    }
    if (n.includes('update inventory set qty = qty -')) {
      const r = _db.inventory.get(`${values[1]}:${values[2]}`); if (r) r.qty -= values[0] as number; return [];
    }

    // challenge_attempts
    if (n.includes('insert into challenge_attempts')) {
      const [opId, challengeId, challengeType, beaconId] = values as [string, string, string, string | null];
      const a = { id: randomUUID(), operativeId: opId, challengeId, challengeType, beaconId: beaconId ?? null, status: 'started', input: null, result: null, startedAt: new Date().toISOString(), resolvedAt: null };
      _db.challenge_attempts.set(a.id, a); return [{ id: a.id }];
    }
    if (n.includes('update challenge_attempts set')) {
      const id = values[values.length - 2] as string; const a = _db.challenge_attempts.get(id);
      if (a) { a.status = values[0]; a.input = values[1]; a.result = values[2]; if (a.status !== 'started') a.resolvedAt = new Date().toISOString(); } return [];
    }
    if (n.includes('select operative_id, id from challenge_attempts') && n.includes("'started'")) {
      for (const a of [..._db.challenge_attempts.values()].reverse()) { if (a.challengeId === (values[0] as string) && a.status === 'started') return [{ operativeId: a.operativeId, id: a.id }]; }
      return [];
    }

    // combat_sessions
    if (n.includes('insert into combat_sessions')) {
      const [opId, cid, attemptId, nonce, eHp, oHp, waves] = values as [string, string, string | null, string, number, number, number];
      const s = { id: randomUUID(), operativeId: opId, challengeId: cid, attemptId: attemptId ?? null, serverNonce: nonce, enemyHp: eHp, operativeHp: oHp, wave: 0, wavesRequired: waves, rolls: [], status: 'active', createdAt: new Date().toISOString(), expiresAt: null, resolvedAt: null };
      _db.combat_sessions.set(s.id, s); return [s];
    }
    if (n.includes('select * from combat_sessions where id') && n.includes('for update')) { return [_db.combat_sessions.get(values[0] as string) ?? null].filter(Boolean); }
    if (n.includes('select id, operative_id, server_nonce from combat_sessions') && n.includes("'active'")) {
      for (const s of [..._db.combat_sessions.values()].reverse()) { if (s.challengeId === (values[0] as string) && s.status === 'active') return [{ id: s.id, operativeId: s.operativeId, serverNonce: s.serverNonce }]; }
      return [];
    }
    if (n.includes('select * from combat_sessions') && n.includes('order by created_at desc limit 1')) {
      const all = [..._db.combat_sessions.values()].filter(s => s.operativeId === (values[0] as string) && s.challengeId === (values[1] as string)).reverse();
      return all.length > 0 ? [all[0]] : [];
    }
    if (n.includes('update combat_sessions set') && n.includes('status') && !n.includes("'expired'")) {
      const id = values[values.length - 1] as string; const s = _db.combat_sessions.get(id);
      if (s) { s.enemyHp = values[0]; s.operativeHp = values[1]; s.wave = values[2]; s.rolls = values[3]; s.status = values[4]; if (s.status !== 'active') s.resolvedAt = new Date().toISOString(); }
      return s ? [s] : [];
    }
    if (n.includes("status = 'expired'")) {
      const s = _db.combat_sessions.get(values[0] as string); if (s) { s.status = 'expired'; s.resolvedAt = new Date().toISOString(); } return s ? [s] : [];
    }

    // onion_rewards
    if (n.includes('select id, status, onion_request_id from onion_rewards where external_id')) {
      const r = _db.onion_rewards.get(values[0] as string); return r ? [{ id: r.id, status: r.status, onionRequestId: r.onionRequestId ?? null }] : [];
    }
    if (n.includes('insert into onion_rewards')) {
      // request_type is an inline SQL literal ('burn'/'transfer'), so it is NOT
      // an interpolated value: values = [operativeId, challengeId, amount, externalId].
      const [opId, cid, amount, extId] = values as [string, string | null, number, string];
      const rt = n.includes("'burn'") ? 'burn' : 'transfer';
      if (_db.onion_rewards.has(extId)) return [];
      const row = { id: randomUUID(), operativeId: opId, challengeId: cid ?? null, requestType: rt, amount, externalId: extId, onionRequestId: null, status: 'pending', error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      _db.onion_rewards.set(extId, row); return [{ id: row.id }];
    }
    if (n.includes('update onion_rewards set') && n.includes('onion_request_id')) {
      const id = values[values.length - 1] as string;
      for (const r of _db.onion_rewards.values()) { if (r.id === id) { r.onionRequestId = values[0]; r.status = values[1]; r.updatedAt = new Date().toISOString(); } } return [];
    }
    if (n.includes('update onion_rewards')) {
      const id = values[values.length - 1] as string;
      for (const r of _db.onion_rewards.values()) { if (r.id === id) { r.status = values[0]; if (values[1]) r.error = values[1]; r.updatedAt = new Date().toISOString(); } } return [];
    }

    // onion_supply_gauge
    if (n.includes('select current, max from onion_supply_gauge')) { return [{ current: _db.gauge.current, max: _db.gauge.max }]; }
    if (n.includes('update onion_supply_gauge')) { _db.gauge.current = Math.min(_db.gauge.max, _db.gauge.current + (values[0] as number)); return [{ current: _db.gauge.current, max: _db.gauge.max }]; }

    console.warn(`[db-mock] unhandled: ${n.slice(0, 120)}`);
    return [];
  }
  sql.json = (v: unknown) => v;
  sql.unsafe = () => [];
  return sql;
}

// Use absolute paths so bun intercepts relative imports from server modules
mock.module(`${ROOT}/src/lib/server/db/index`, () => ({ sql: buildSql() }));

// ── Challenge registry (no import.meta.glob) ──────────────────────────────
let _regMap = new Map<string, any>();
mock.module(`${ROOT}/src/lib/server/challenges/registry`, () => ({
  registerChallenge(d: any) { if (!_regMap.has(d.id)) _regMap.set(d.id, d); },
  getChallenge(id: string) { return _regMap.get(id); },
  allChallenges() { return [..._regMap.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })); },
  challengesForAct(act: number) { return [..._regMap.values()].filter((c: any) => c.act === act); }
}));

// ── Onion DAO client mock ─────────────────────────────────────────────────
const _mockRewards: Array<{ externalId: string; amount: number }> = [];
function getMockRewards() { return [..._mockRewards]; }
function clearMockRewards() { _mockRewards.length = 0; }

mock.module(`${ROOT}/src/lib/server/onion/client`, () => ({
  createRequest: async (req: any) => { _mockRewards.push({ externalId: req.externalId, amount: req.amount }); return { id: `mock-${req.externalId}`, status: 'pending' }; },
  getRequest: async (id: string) => ({ id, status: 'pending', amount: 0, requestType: 'transfer', currencyMode: null, solanaSignature: null, error: null }),
  verifyCallbackSignature: () => true,
  getProfile: async () => null
}));

// ── Storyteller mock ──────────────────────────────────────────────────────
let _npcQueue: Array<{ passed: boolean; reply: string; reasoning?: string }> = [];
let _npcDefault = true;
function queueNpcResponse(r: { passed: boolean; reply: string; reasoning?: string }) { _npcQueue.push(r); }
function clearNpcQueue() { _npcQueue.length = 0; }
function setNpcDefault(v: boolean) { _npcDefault = v; }
function nextNpc() { return _npcQueue.shift() ?? { passed: _npcDefault, reply: _npcDefault ? 'Correct, champ.' : 'Nope, pal.', reasoning: 'mock' }; }

mock.module(`${ROOT}/src/lib/server/ai/storyteller`, () => ({
  npcTurn: async () => nextNpc(),
  reactToMove: async () => ({ text: 'mock reaction' }),
  finaleConversation: async () => ({ won: _npcDefault, reply: 'Now do you wanna learn about the sewers, champ?', reasoning: 'mock' }),
  challengeIntro: async () => 'DEEPDISH mock intro.',
  modelFor: (mode: string) => mode === 'finale' ? 'claude-opus-4-8' : 'claude-sonnet-4-6',
  DEEPDISH_SYSTEM_PROMPT: 'MOCK'
}));

// ── STT mock ──────────────────────────────────────────────────────────────
const _blobStore = new Map<string, Uint8Array>();

mock.module(`${ROOT}/src/lib/server/ai/stt`, () => ({
  getSttProvider: () => ({ name: 'mock', transcribe: async () => ({ transcript: process.env['STT_MOCK_TRANSCRIPT'] ?? '', confidence: 1, language: 'en' }) }),
  normalizeTranscript: (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
  matchSequence: (transcript: string, steps: any[], opts?: { threshold?: number }) => {
    const thr = opts?.threshold ?? 0.8;
    const norm = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    let cursor = 0, matchedCount = 0, firstMissingIndex = -1;
    for (let i = 0; i < steps.length; i++) {
      const cands = [steps[i].keyword, ...(steps[i].aliases ?? [])].map((s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim());
      let bp = -1;
      for (const c of cands) { if (!c) continue; const p = norm.indexOf(c, cursor); if (p !== -1 && (bp === -1 || p < bp)) bp = p; }
      if (bp !== -1) { const m = cands.find((c: string) => norm.indexOf(c, cursor) === bp)!; cursor = bp + m.length; matchedCount++; }
      else if (firstMissingIndex === -1) firstMissingIndex = i;
    }
    const score = steps.length > 0 ? matchedCount / steps.length : 1;
    return { passed: score >= thr, matchedCount, totalCount: steps.length, score, firstMissingIndex: matchedCount === steps.length ? -1 : firstMissingIndex, missingLabel: undefined };
  },
  storeBlobRef: (ref: string, audio: Uint8Array) => { _blobStore.set(ref, audio); },
  consumeBlobRef: (ref: string) => { const b = _blobStore.get(ref); _blobStore.delete(ref); return b ?? null; }
}));

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — Dynamic imports after mocks (resolved module paths)
// ═══════════════════════════════════════════════════════════════════════════

let resolveOperative: any, beginChallenge: any, submitChallenge: any,
    canBegin: any, getGameState: any, applyRewards: any, chargeOnions: any;
let openCombat: any, applyRoll: any;
let grantItem: any, listCatalogIds: any;
let getGauge: any;
let getEnergy: any, spendEnergy: any, skipEnergyWithOnions: any, ENERGY_SKIP_COST: any, MAX_ENERGY: any;
let equip: any, getLoadout: any, getLoadoutStats: any, openChest: any, forge: any, weightedPick: any;
let getChallenge: any;
let encodeMessage: any, decodeFrame: any, Reassembler: any, MsgType: any;
let SimChannel: any, VirtualBadge: any;

beforeAll(async () => {
  // Engine modules (use relative imports internally; mocked by absolute paths above)
  ({ resolveOperative, beginChallenge, submitChallenge, canBegin, getGameState, applyRewards, chargeOnions } =
    await import(`${ROOT}/src/lib/server/engine/index`));
  ({ openCombat, applyRoll } = await import(`${ROOT}/src/lib/server/engine/combat`));
  ({ grantItem, listCatalogIds } = await import(`${ROOT}/src/lib/server/engine/inventory`));
  ({ getGauge } = await import(`${ROOT}/src/lib/server/onion/gauge`));
  ({ getEnergy, spendEnergy, skipEnergyWithOnions, ENERGY_SKIP_COST, MAX_ENERGY } =
    await import(`${ROOT}/src/lib/server/engine/energy`));
  ({ equip, getLoadout, getLoadoutStats, openChest, forge, weightedPick } =
    await import(`${ROOT}/src/lib/server/engine/gear`));
  ({ getChallenge } = await import(`${ROOT}/src/lib/server/challenges/registry`));

  // Load challenge impls — each calls registerChallenge() as a side effect
  await import(`${ROOT}/src/lib/server/challenges/impl/act0-1-ketchup-gauntlet`);
  await import(`${ROOT}/src/lib/server/challenges/impl/act1-1-malort-fountains`);
  await import(`${ROOT}/src/lib/server/challenges/impl/act1-3-river-ran-backwards`);
  await import(`${ROOT}/src/lib/server/challenges/impl/act4-1-server-room`);

  // Protocol + sim (no SvelteKit deps — safe to import directly)
  ({ encodeMessage, decodeFrame, Reassembler, MsgType } =
    await import(`${ROOT}/src/lib/shared/protocol`));
  ({ SimChannel } = await import(`${ROOT}/sim/transport`));
  ({ VirtualBadge } = await import(`${ROOT}/sim/badge`));
});

// ═══════════════════════════════════════════════════════════════════════════
// IN-PROCESS RELAY (mirrors /api/relay dispatch)
// ═══════════════════════════════════════════════════════════════════════════

async function inProcessRelay(beaconId: string, frames: string[]): Promise<string[]> {
  const out: string[] = [];
  const asms = new Map<number, any>();
  // Encode using the SAME msgId as the request for proper request/response correlation
  const enc = (t: any, id: number, body: unknown) =>
    encodeMessage(t, id, body).map((f: any) => Buffer.from(f).toString('base64'));
  const err = (id: number, code: string, msg?: string) => enc(MsgType.ERROR, id, { code, msg });

  async function dispatch(type: any, msgId: number, body: unknown): Promise<string[]> {
    if (type === MsgType.OPERATIVE_IDENTIFY) {
      const b = body as any;
      if (!b?.h) return err(msgId, 'BAD_REQUEST');
      const op = await resolveOperative(b.h, b.o);
      const gs = await getGameState(op.id);
      const inv = [..._db.inventory.entries()].filter(([k]) => k.startsWith(op.id + ':')).map(([, r]) => r);
      return enc(MsgType.IDENTIFY_ACK, msgId, { id: op.id, registered: op.registered, callsign: op.callsign, act: gs?.currentAct ?? 0, hp: gs?.hp ?? 100, challengeStatus: gs?.challengeStatus ?? {}, flags: gs?.flags ?? {}, inventory: inv.map((i: any) => ({ id: i.catalogId, k: i.kind, q: i.qty })) });
    }
    if (type === MsgType.CHALLENGE_BEGIN) {
      const b = body as any;
      if (!b?.c || !b?.h) return err(msgId, 'BAD_REQUEST');
      const op = await resolveOperative(b.h);
      try {
        const { attemptId, content } = await beginChallenge(op.id, b.c, beaconId);
        return enc(MsgType.CHALLENGE_INTRO, msgId, { attemptId, challengeId: b.c, content });
      } catch (e) { return err(msgId, 'GATED', e instanceof Error ? e.message : String(e)); }
    }
    if (type === MsgType.COMBAT_ROLL_REQUEST) {
      const b = body as any;
      if (!b?.c) return err(msgId, 'BAD_REQUEST');
      let srow: any = null;
      for (const s of [..._db.combat_sessions.values()].reverse()) { if (s.challengeId === b.c && s.status === 'active') { srow = s; break; } }
      if (!srow) {
        let attempt: any = null;
        for (const a of [..._db.challenge_attempts.values()].reverse()) { if (a.challengeId === b.c && a.status === 'started') { attempt = a; break; } }
        if (!attempt) return err(msgId, 'NO_SESSION');
        const challenge = getChallenge(b.c);
        if (!challenge || challenge.type !== 'combat') return err(msgId, 'BAD_REQUEST');
        const combat = challenge.content?.combat ?? {};
        const opened = await openCombat({
          operativeId: attempt.operativeId,
          challengeId: b.c,
          attemptId: attempt.id,
          enemyHp: combat.enemyHp ?? combat.enemyHpPerWave?.[0],
          operativeHp: combat.operativeHp,
          wavesRequired: combat.wavesRequired,
          ttlSeconds: combat.ttlSeconds
        });
        return enc(MsgType.COMBAT_ROLL_RESPONSE, msgId, { s: opened.id, n: opened.serverNonce, enemyHp: opened.enemyHp, opHp: opened.operativeHp, wave: opened.wave, wavesReq: opened.wavesRequired, st: opened.status });
      }
      const op = _db.operatives.get(srow.operativeId);
      const inRoll = b.roll ? { wave: b.roll.w, roll: b.roll.r, dmg: b.roll.d, sig: b.roll.sig } : undefined;
      const session = await applyRoll(srow.id, inRoll, op?.attestPubkey ?? undefined);
      if (session.status !== 'active') {
        await submitChallenge(srow.operativeId, b.c, { action: 'roll', ketchup: Boolean(b.ketchup) }, srow.attemptId ?? undefined);
      }
      return enc(MsgType.COMBAT_ROLL_RESPONSE, msgId, { s: session.id, n: session.serverNonce, enemyHp: session.enemyHp, opHp: session.operativeHp, wave: session.wave, wavesReq: session.wavesRequired, st: session.status });
    }
    if (type === MsgType.VOICE_CAPTURE_SUBMIT) {
      const b = body as any;
      if (!b?.c) return err(msgId, 'BAD_REQUEST');
      let attempt: any = null;
      for (const a of [..._db.challenge_attempts.values()].reverse()) { if (a.challengeId === b.c && a.status === 'started') { attempt = a; break; } }
      if (!attempt) return err(msgId, 'NO_SESSION');
      const input = b.t ? { t: b.t } : b.ref ? { ref: b.ref } : {};
      const result = await submitChallenge(attempt.operativeId, b.c, input, attempt.id);
      return enc(MsgType.CHALLENGE_RESULT, msgId, { passed: result.passed, message: result.message, continued: result.continued ?? false });
    }
    if (type === MsgType.NPC_DIALOGUE_TURN) {
      const b = body as any;
      if (!b?.c || !b?.t) return err(msgId, 'BAD_REQUEST');
      let attempt: any = null;
      for (const a of [..._db.challenge_attempts.values()].reverse()) { if (a.challengeId === b.c && a.status === 'started') { attempt = a; break; } }
      if (!attempt) return err(msgId, 'NO_SESSION');
      const result = await submitChallenge(attempt.operativeId, b.c, { t: b.t, s: b.s, transcript: [] }, attempt.id);
      return enc(MsgType.NPC_DIALOGUE_REPLY, msgId, { reply: result.message, done: result.passed || !result.continued, passed: result.passed });
    }
    return err(msgId, 'UNSUPPORTED');
  }

  for (const b64 of frames) {
    let frame;
    try { frame = decodeFrame(Buffer.from(b64, 'base64')); } catch { out.push(...err(0, 'DECODE_ERROR')); continue; }
    let asm = asms.get(frame.msgId);
    if (!asm) { asm = new Reassembler(); asms.set(frame.msgId, asm); }
    const msg = asm.push(frame);
    if (msg) {
      asms.delete(frame.msgId);
      try { out.push(...await dispatch(msg.type, msg.msgId, msg.body)); }
      catch (e) { out.push(...err(msg.msgId, 'ENGINE_ERROR', String(e))); }
    }
  }
  return out;
}

// ── Fetch interceptor (SimBeacon's relayToServer → inProcessRelay) ────────
const _origFetch = global.fetch;
(global as any).fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  if (url.includes('/api/relay')) {
    const body = JSON.parse(init?.body ?? '{}') as any;
    const frames = await inProcessRelay(body.beaconId, body.frames);
    return new Response(JSON.stringify({ frames }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return _origFetch(input, init);
};

// ── Sim beacon helper ─────────────────────────────────────────────────────
function makeRelayBeacon(channel: any, beaconMac: string, beaconId: string, challengeId: string) {
  const peer = channel.create(beaconMac);
  for (const f of encodeMessage(MsgType.BEACON_HELLO, 1, { b: beaconId, c: challengeId, m: beaconMac })) {
    peer.send('ff:ff:ff:ff:ff:ff', f);
  }
  peer.onReceive(async (srcMac: string, rawFrame: Uint8Array) => {
    const respFrames = await inProcessRelay(beaconId, [Buffer.from(rawFrame).toString('base64')]);
    for (const b64 of respFrames) peer.send(srcMac, Buffer.from(b64, 'base64'));
  });
  return peer;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1 — Registration + Act 0 Ketchup Gauntlet combat
// ═══════════════════════════════════════════════════════════════════════════

describe('Act 0 — Ketchup Gauntlet (registration + combat)', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); clearNpcQueue(); setNpcDefault(true); });

  it('resolveOperative creates a new operative row', async () => {
    const op = await resolveOperative('hw-001');
    expect(op.hardwareId).toBe('hw-001');
    expect(op.registered).toBe(false);
    expect(op.id).toBeTruthy();
  });

  it('resolveOperative is idempotent', async () => {
    const a = await resolveOperative('hw-idem');
    const b = await resolveOperative('hw-idem');
    expect(a.id).toBe(b.id);
  });

  it('canBegin=true for 0.1 (no prerequisites)', async () => {
    const op = await resolveOperative('hw-begin');
    expect(await canBegin(op.id, '0.1')).toBe(true);
  });

  it('beginChallenge 0.1 returns attemptId + content with intro text', async () => {
    const op = await resolveOperative('hw-begin2');
    const { attemptId, content } = await beginChallenge(op.id, '0.1');
    expect(attemptId).toBeTruthy();
    expect((content as any).intro).toBeTruthy();
  });

  it('combat: open → first roll → won → inventory granted + operative registered, zero onion awards (economy flip)', async () => {
    const op = await resolveOperative('hw-combat');
    // Even with a linked username, the economy flip means NO onion award fires.
    _db.operatives.get(op.id)!.username = 'test-operative';
    const { attemptId } = await beginChallenge(op.id, '0.1');
    // enemyHp=1 → first roll wins
    const session = await openCombat({ operativeId: op.id, challengeId: '0.1', attemptId, enemyHp: 1, operativeHp: 100, wavesRequired: 1 });
    expect(session.status).toBe('active');
    const updated = await applyRoll(session.id);
    expect(updated.status).toBe('won');
    const result = await submitChallenge(op.id, '0.1', { action: 'roll' }, attemptId);
    expect(result.passed).toBe(true);
    // Inventory: encased_meat_mk1
    expect(await listCatalogIds(op.id)).toContain('encased_meat_mk1');
    // Operative marked registered on first win
    expect(_db.operatives.get(op.id)?.registered).toBe(true);
    // Economy flip: the retired onions/gauge reward branches fire nothing.
    expect(getMockRewards().length).toBe(0);
    expect(_db.gauge.current).toBe(0);
  });

  it('combat lost (op hp→0) returns passed=false', async () => {
    const op = await resolveOperative('hw-combat-lose');
    const { attemptId } = await beginChallenge(op.id, '0.1');
    const session = await openCombat({ operativeId: op.id, challengeId: '0.1', attemptId, enemyHp: 1000, operativeHp: 1, wavesRequired: 1 });
    await applyRoll(session.id); // enemy deals ≥1 dmg; op hp 1 → op dies
    const result = await submitChallenge(op.id, '0.1', { action: 'roll' }, attemptId);
    expect(result.passed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2 — Badge sim → beacon relay → engine E2E
// ═══════════════════════════════════════════════════════════════════════════

describe('Badge sim → relay protocol E2E', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); });

  it('IDENTIFY → CHALLENGE_BEGIN → COMBAT_ROLL_REQUEST through SimChannel + relay', async () => {
    const channel = new SimChannel();
    const badge = new VirtualBadge('hw-sim-001', { channel, log: () => {}, timeoutMs: 5000 });
    const beaconMac = '02:aa:bb:cc:dd:01';
    const beaconPeer = makeRelayBeacon(channel, beaconMac, 'b-ketchup-sim', '0.1');

    // Badge discovers beacon via BEACON_HELLO
    const seen = await badge.waitForBeacon('0.1', 1000);
    expect(seen.beaconId).toBe('b-ketchup-sim');

    // OPERATIVE_IDENTIFY
    const ack = await badge.identify(beaconMac);
    expect(ack.type).toBe(MsgType.IDENTIFY_ACK);
    const opId = (ack.body as any).id as string;
    expect(opId).toBeTruthy();

    // CHALLENGE_BEGIN
    const intro = await badge.beginChallenge(beaconMac, '0.1');
    expect(intro.type).toBe(MsgType.CHALLENGE_INTRO);

    // Open a combat session server-side (relay handler needs an existing active session)
    await openCombat({ operativeId: opId, challengeId: '0.1', enemyHp: 1, operativeHp: 100, wavesRequired: 1 });

    // COMBAT_ROLL_REQUEST → server applies roll → COMBAT_ROLL_RESPONSE
    const rollResp = await badge.combatRoll(beaconMac, '0.1');
    expect(rollResp.type).toBe(MsgType.COMBAT_ROLL_RESPONSE);
    expect((rollResp.body as any).st).toBe('won');
    expect(_db.operatives.get(opId)?.registered).toBe(true);

    badge.close();
    beaconPeer.close();
  });

  it('unknown challenge CHALLENGE_BEGIN returns ERROR frame', async () => {
    const op = await resolveOperative('hw-unk');
    const frames = encodeMessage(MsgType.CHALLENGE_BEGIN, 1, { c: 'nonexistent-999', h: op.hardwareId })
      .map((f: any) => Buffer.from(f).toString('base64'));
    const respFrames = await inProcessRelay('b-test', frames);
    const r = new Reassembler(); let msg: any = null;
    for (const b64 of respFrames) { msg = r.push(decodeFrame(Buffer.from(b64, 'base64'))); if (msg) break; }
    expect(msg?.type).toBe(MsgType.ERROR);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3 — Voice challenge (mocked STT)
// ═══════════════════════════════════════════════════════════════════════════

describe('Act 1.1 — Malört Fountains (voice/STT)', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); delete process.env['STT_MOCK_TRANSCRIPT']; });

  it('1.1 registered as type=dialogue', () => {
    const c = getChallenge('1.1');
    expect(c).toBeTruthy();
    expect(c!.type).toBe('dialogue');
    expect(c!.act).toBe(1);
  });

  it('passes with correct treatment-sequence transcript', async () => {
    const op = await resolveOperative('hw-voice-pass');
    _db.operatives.get(op.id)!.username = 'test-voice-player';
    const { attemptId } = await beginChallenge(op.id, '1.1');
    const result = await submitChallenge(op.id, '1.1', { t: 'intake crib tunnel jardine grid' }, attemptId);
    expect(result.passed).toBe(true);
    expect(await listCatalogIds(op.id)).toContain('water_main_key');
    expect(getMockRewards().length).toBe(0); // economy flip: no onion award
  });

  it('fails with completely wrong transcript', async () => {
    const op = await resolveOperative('hw-voice-fail');
    const { attemptId } = await beginChallenge(op.id, '1.1');
    const result = await submitChallenge(op.id, '1.1', { t: 'pizza donuts hot chocolate nachos' }, attemptId);
    expect(result.passed).toBe(false);
    expect(await listCatalogIds(op.id)).not.toContain('water_main_key');
  });

  it('passes via audio blob ref path (mocked STT provider)', async () => {
    process.env['STT_MOCK_TRANSCRIPT'] = 'intake crib tunnel jardine grid';
    _blobStore.set('ref-audio-001', new Uint8Array([0x01, 0x02]));
    const op = await resolveOperative('hw-voice-blob');
    const { attemptId } = await beginChallenge(op.id, '1.1');
    const result = await submitChallenge(op.id, '1.1', { ref: 'ref-audio-001' }, attemptId);
    expect(result.passed).toBe(true);
  });

  it('VOICE_CAPTURE_SUBMIT via SimChannel relay passes + grants water_main_key', async () => {
    const channel = new SimChannel();
    const badge = new VirtualBadge('hw-voice-relay', { channel, log: () => {}, timeoutMs: 5000 });
    const beaconMac = '02:bb:cc:dd:ee:02';
    const beaconPeer = makeRelayBeacon(channel, beaconMac, 'b-fountain-sim', '1.1');

    await badge.waitForBeacon('1.1', 1000);
    const ack = await badge.identify(beaconMac);
    const opId = (ack.body as any).id as string;
    // Give username so onion reward path fires
    _db.operatives.get(opId)!.username = 'test-voice-relay-player';
    await badge.beginChallenge(beaconMac, '1.1');

    // voiceSubmit sends VOICE_CAPTURE_SUBMIT with pre-transcribed text
    const voiceResp = await badge.voiceSubmit(beaconMac, '1.1', 'intake crib tunnel jardine grid');
    expect(voiceResp.type).toBe(MsgType.CHALLENGE_RESULT);
    expect((voiceResp.body as any).passed).toBe(true);
    expect(await listCatalogIds(opId)).toContain('water_main_key');

    badge.close();
    beaconPeer.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 4 — NPC challenge (mocked Claude)
// ═══════════════════════════════════════════════════════════════════════════

describe('Act 1.3 — River Ran Backwards (NPC/AI)', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); clearNpcQueue(); setNpcDefault(true); });

  it('1.3 registered as type=npc, requires water_main_key', () => {
    const c = getChallenge('1.3');
    expect(c).toBeTruthy();
    expect(c!.type).toBe('npc');
    expect(c!.requires).toContain('water_main_key');
  });

  it('canBegin=false without water_main_key', async () => {
    const op = await resolveOperative('hw-npc-nokey');
    expect(await canBegin(op.id, '1.3')).toBe(false);
  });

  it('canBegin=true after granting water_main_key', async () => {
    const op = await resolveOperative('hw-npc-key');
    await grantItem(op.id, 'water_main_key');
    expect(await canBegin(op.id, '1.3')).toBe(true);
  });

  it('passes when mocked Claude returns passed=true', async () => {
    const op = await resolveOperative('hw-npc-pass');
    _db.operatives.get(op.id)!.username = 'test-npc-player';
    await grantItem(op.id, 'water_main_key');
    queueNpcResponse({ passed: true, reply: 'Correct, champ! Sewage → Lake Michigan.', reasoning: 'correct' });
    const { attemptId } = await beginChallenge(op.id, '1.3');
    const result = await submitChallenge(op.id, '1.3', { t: 'Chicago reversed the river in 1900 to stop sewage contaminating Lake Michigan' }, attemptId);
    expect(result.passed).toBe(true);
    expect(await listCatalogIds(op.id)).toContain('reversal_map');
    expect(getMockRewards().length).toBe(0); // economy flip: no onion award
  });

  it('continues when mocked Claude returns passed=false', async () => {
    const op = await resolveOperative('hw-npc-fail');
    await grantItem(op.id, 'water_main_key');
    queueNpcResponse({ passed: false, reply: "That's a no, pal.", reasoning: 'wrong' });
    const { attemptId } = await beginChallenge(op.id, '1.3');
    const result = await submitChallenge(op.id, '1.3', { t: 'it reversed because of floods' }, attemptId);
    expect(result.passed).toBe(false);
    expect(result.continued).toBe(true);
    expect(await listCatalogIds(op.id)).not.toContain('reversal_map');
  });

  it('returns greeting/continued when utterance is empty', async () => {
    const op = await resolveOperative('hw-npc-empty');
    await grantItem(op.id, 'water_main_key');
    const { attemptId } = await beginChallenge(op.id, '1.3');
    const result = await submitChallenge(op.id, '1.3', { t: '' }, attemptId);
    expect(result.passed).toBe(false);
    expect(result.continued).toBe(true);
  });

  it('NPC_DIALOGUE_TURN via SimChannel relay → passes + grants reversal_map', async () => {
    const channel = new SimChannel();
    const badge = new VirtualBadge('hw-npc-relay', { channel, log: () => {}, timeoutMs: 5000 });
    const beaconMac = '02:cc:dd:ee:ff:03';
    const beaconPeer = makeRelayBeacon(channel, beaconMac, 'b-river-sim', '1.3');

    await badge.waitForBeacon('1.3', 1000);
    const ack = await badge.identify(beaconMac);
    const opId = (ack.body as any).id as string;
    // Grant key directly (simulating prior 1.1 completion)
    await grantItem(opId, 'water_main_key');
    await badge.beginChallenge(beaconMac, '1.3');

    queueNpcResponse({ passed: true, reply: 'You got it, champ!', reasoning: 'correct' });
    const npcResp = await badge.npcTurn(beaconMac, '1.3', 'Chicago reversed the Chicago River in 1900 to stop sewage contaminating Lake Michigan');
    expect(npcResp.type).toBe(MsgType.NPC_DIALOGUE_REPLY);
    expect((npcResp.body as any).passed).toBe(true);
    expect(await listCatalogIds(opId)).toContain('reversal_map');

    badge.close();
    beaconPeer.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 5 — Progression gating (Act 4 requires 3 credentials)
// ═══════════════════════════════════════════════════════════════════════════

describe('Act 4 progression gating', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); });

  it('4.1 requires grid_credential + dispatch_credential + city_it_keycard', () => {
    const c = getChallenge('4.1');
    expect(c).toBeTruthy();
    expect(c!.requires).toContain('grid_credential');
    expect(c!.requires).toContain('dispatch_credential');
    expect(c!.requires).toContain('city_it_keycard');
    expect(c!.requires.length).toBe(3);
  });

  it('canBegin=false with no credentials', async () => {
    const op = await resolveOperative('hw-a4-none');
    expect(await canBegin(op.id, '4.1')).toBe(false);
  });

  it('canBegin=false with 1 of 3 credentials', async () => {
    const op = await resolveOperative('hw-a4-1of3');
    await grantItem(op.id, 'grid_credential');
    expect(await canBegin(op.id, '4.1')).toBe(false);
  });

  it('canBegin=false with 2 of 3 credentials', async () => {
    const op = await resolveOperative('hw-a4-2of3');
    await grantItem(op.id, 'grid_credential');
    await grantItem(op.id, 'dispatch_credential');
    expect(await canBegin(op.id, '4.1')).toBe(false);
  });

  it('canBegin=true with all 3 credentials', async () => {
    const op = await resolveOperative('hw-a4-3of3');
    await grantItem(op.id, 'grid_credential');
    await grantItem(op.id, 'dispatch_credential');
    await grantItem(op.id, 'city_it_keycard');
    expect(await canBegin(op.id, '4.1')).toBe(true);
  });

  it('beginChallenge throws GATED error without credentials', async () => {
    const op = await resolveOperative('hw-a4-gated');
    await expect(beginChallenge(op.id, '4.1')).rejects.toThrow(/requires/i);
  });

  it('validate() returns passed=false with empty inventory', async () => {
    const c = getChallenge('4.1')!;
    const op = await resolveOperative('hw-a4-validate');
    const r = c.validate({}, { operative: op, inventory: [], combat: undefined, now: Date.now() });
    const result = r instanceof Promise ? await r : r;
    expect(result.passed).toBe(false);
  });

  it('full Act 4 combat: begin + open + roll → win → prompt_console_access, zero onion awards (economy flip)', async () => {
    const op = await resolveOperative('hw-a4-full');
    _db.operatives.get(op.id)!.username = 'test-act4-player';
    await grantItem(op.id, 'grid_credential');
    await grantItem(op.id, 'dispatch_credential');
    await grantItem(op.id, 'city_it_keycard');
    const { attemptId } = await beginChallenge(op.id, '4.1');
    const session = await openCombat({ operativeId: op.id, challengeId: '4.1', attemptId, enemyHp: 1, operativeHp: 200, wavesRequired: 1 });
    await applyRoll(session.id);
    const result = await submitChallenge(op.id, '4.1', {}, attemptId);
    expect(result.passed).toBe(true);
    expect(await listCatalogIds(op.id)).toContain('prompt_console_access');
    expect(getMockRewards().length).toBe(0); // economy flip: no onion award
  });

  it('relay CHALLENGE_BEGIN → GATED error without credentials', async () => {
    const op = await resolveOperative('hw-a4-relay');
    const frames = encodeMessage(MsgType.CHALLENGE_BEGIN, 1, { c: '4.1', h: op.hardwareId })
      .map((f: any) => Buffer.from(f).toString('base64'));
    const respFrames = await inProcessRelay('b-server-room', frames);
    const r = new Reassembler(); let msg: any = null;
    for (const b64 of respFrames) { msg = r.push(decodeFrame(Buffer.from(b64, 'base64'))); if (msg) break; }
    expect(msg?.type).toBe(MsgType.ERROR);
    expect((msg?.body as any).code).toBe('GATED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 6 — Reward ledger idempotency
// ═══════════════════════════════════════════════════════════════════════════

describe('Reward ledger idempotency', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); });

  it('economy flip: onions/gauge reward kinds are inert no-ops', async () => {
    const op = await resolveOperative('hw-flip');
    _db.operatives.get(op.id)!.username = 'test-player';
    await applyRewards(op.id, '0.1', 'a1', [{ kind: 'gauge', amount: 500 }]);
    await applyRewards(op.id, '0.1', 'a2', [{ kind: 'onions', amount: 50 }]);
    // No gauge bump, no Onion DAO request — onions only flow the other way now.
    expect(_db.gauge.current).toBe(0);
    expect(getMockRewards().length).toBe(0);
  });

  it('chargeOnions burns once per externalId (idempotent)', async () => {
    const op = await resolveOperative('hw-charge');
    _db.operatives.get(op.id)!.username = 'test-payer';
    const extId = `${op.id}:store:gear_chest:1`;
    await chargeOnions(op.id, 25, 'store:gear_chest', extId);
    await chargeOnions(op.id, 25, 'store:gear_chest', extId);
    // Exactly one burn request fired, one ledger row written.
    expect(getMockRewards().filter((r: any) => r.externalId === extId).length).toBe(1);
    expect(_db.onion_rewards.get(extId)?.requestType).toBe('burn');
  });

  it('xp reward grants xp and bumps derived level (B1)', async () => {
    const op = await resolveOperative('hw-xp');
    await applyRewards(op.id, 'mg-bankbust', 'a1', [{ kind: 'xp', amount: 150 }]);
    const gs = await getGameState(op.id);
    expect(gs.xp).toBe(150);
    expect(gs.level).toBe(2); // 1 + floor(150/100)
    // Accumulates across grants.
    await applyRewards(op.id, 'mg-bankbust', 'a2', [{ kind: 'xp', amount: 60 }]);
    const gs2 = await getGameState(op.id);
    expect(gs2.xp).toBe(210);
    expect(gs2.level).toBe(3); // 1 + floor(210/100)
  });

  it('inventory grant is idempotent for credentials', async () => {
    const op = await resolveOperative('hw-inv-idem');
    await grantItem(op.id, 'grid_credential');
    await grantItem(op.id, 'grid_credential');
    const ids = await listCatalogIds(op.id);
    expect(ids.filter((id: string) => id === 'grid_credential').length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 7 — Energy (B2)
// ═══════════════════════════════════════════════════════════════════════════

describe('Energy — pacing gate (B2)', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); });

  it('new operative starts at full energy', async () => {
    const op = await resolveOperative('hw-en-new');
    const e = await getEnergy(op.id);
    expect(e.energy).toBe(MAX_ENERGY);
    expect(e.max).toBe(7);
    expect(e.refillsInMs).toBeNull();
  });

  it('spendEnergy decrements and reports ok', async () => {
    const op = await resolveOperative('hw-en-spend');
    const r = await spendEnergy(op.id, 2);
    expect(r.ok).toBe(true);
    expect(r.energy).toBe(5);
    expect((await getEnergy(op.id)).energy).toBe(5);
  });

  it('spendEnergy refuses when short (no change)', async () => {
    const op = await resolveOperative('hw-en-short');
    _db.game_state.get(op.id)!.energy = 1;
    const r = await spendEnergy(op.id, 2);
    expect(r.ok).toBe(false);
    expect(r.energy).toBe(1);
    expect((await getEnergy(op.id)).energy).toBe(1);
  });

  it('beginChallenge costs 1 energy', async () => {
    const op = await resolveOperative('hw-en-begin');
    await beginChallenge(op.id, '0.1');
    expect((await getEnergy(op.id)).energy).toBe(MAX_ENERGY - 1);
  });

  it('beginChallenge is blocked when out of energy', async () => {
    const op = await resolveOperative('hw-en-empty');
    _db.game_state.get(op.id)!.energy = 0;
    await expect(beginChallenge(op.id, '0.1')).rejects.toThrow(/out of energy/i);
  });

  it('lazy refill: full again 30 min after hitting 0', async () => {
    const op = await resolveOperative('hw-en-refill');
    const gs = _db.game_state.get(op.id)!;
    gs.energy = 0;
    gs.energyExhaustedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString(); // 31 min ago
    const e = await getEnergy(op.id);
    expect(e.energy).toBe(MAX_ENERGY);
    expect(e.refillsInMs).toBeNull();
  });

  it('onion skip refills to full and burns exactly ENERGY_SKIP_COST once', async () => {
    const op = await resolveOperative('hw-en-skip');
    _db.operatives.get(op.id)!.username = 'test-skip';
    _db.game_state.get(op.id)!.energy = 0;
    const e = await skipEnergyWithOnions(op.id, `${op.id}:energy:skip:1`);
    expect(e.energy).toBe(MAX_ENERGY);
    const burns = getMockRewards().filter((r: any) => r.externalId === `${op.id}:energy:skip:1`);
    expect(burns.length).toBe(1);
    expect(burns[0].amount).toBe(ENERGY_SKIP_COST);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 8 — Gear / chests / forge (B3)
// ═══════════════════════════════════════════════════════════════════════════

describe('Gear / chests / forge (B3)', () => {
  beforeEach(() => { resetDb(); clearMockRewards(); });

  it('equip sets the slot and contributes stats', async () => {
    const op = await resolveOperative('hw-gear-equip');
    await grantItem(op.id, 'rusty_shiv');
    const r = await equip(op.id, 'rusty_shiv');
    expect(r.slot).toBe('weapon');
    expect((await getLoadout(op.id)).weapon).toBe('rusty_shiv');
    expect((await getLoadoutStats(op.id)).attack).toBe(3);
  });

  it('equip rejects unowned and non-gear', async () => {
    const op = await resolveOperative('hw-gear-bad');
    await expect(equip(op.id, 'rusty_shiv')).rejects.toThrow(/does not own/i);
    await grantItem(op.id, 'grid_credential');
    await expect(equip(op.id, 'grid_credential')).rejects.toThrow(/not equippable/i);
  });

  it('getLoadoutStats sums across slots', async () => {
    const op = await resolveOperative('hw-gear-sum');
    for (const id of ['rusty_shiv', 'tin_pot_helm', 'kevlar_apron']) { await grantItem(op.id, id); await equip(op.id, id); }
    expect(await getLoadoutStats(op.id)).toEqual({ attack: 3, defense: 2, hp: 10 });
  });

  it('openChest consumes the chest and grants a table item', async () => {
    const op = await resolveOperative('hw-chest');
    await grantItem(op.id, 'scrap_chest');
    const r = await openChest(op.id, 'scrap_chest');
    expect(['rusty_shiv', 'tin_pot_helm', 'kevlar_apron']).toContain(r.granted);
    const ids = await listCatalogIds(op.id);
    expect(ids).not.toContain('scrap_chest'); // consumed
    expect(ids).toContain(r.granted);         // granted
  });

  it('openChest fails when none held', async () => {
    const op = await resolveOperative('hw-chest-none');
    await expect(openChest(op.id, 'scrap_chest')).rejects.toThrow(/no scrap_chest/i);
  });

  it('forge consumes inputs and grants the output', async () => {
    const op = await resolveOperative('hw-forge');
    await grantItem(op.id, 'rusty_shiv', { qty: 2 });
    const r = await forge(op.id, 'forged_blade');
    expect(r.output).toBe('forged_blade');
    const ids = await listCatalogIds(op.id);
    expect(ids).toContain('forged_blade');
    expect(ids).not.toContain('rusty_shiv'); // both inputs consumed
  });

  it('forge fails without enough inputs', async () => {
    const op = await resolveOperative('hw-forge-short');
    await grantItem(op.id, 'rusty_shiv', { qty: 1 });
    await expect(forge(op.id, 'forged_blade')).rejects.toThrow(/missing forge input/i);
  });

  it('weightedPick returns the only entry of a single-entry table', () => {
    expect(weightedPick([{ catalogId: 'rusty_shiv', weight: 1 }]).catalogId).toBe('rusty_shiv');
  });

  it('equipped hp raises starting combat HP', async () => {
    const op = await resolveOperative('hw-gear-hp');
    await grantItem(op.id, 'kevlar_apron'); await equip(op.id, 'kevlar_apron');
    const { hp } = await getLoadoutStats(op.id);
    const session = await openCombat({ operativeId: op.id, challengeId: '0.1', enemyHp: 1000, operativeHp: 100, wavesRequired: 1, bonusHp: hp });
    expect(session.operativeHp).toBe(110);
  });

  it('attack bonus increases player damage in combat', async () => {
    const op = await resolveOperative('hw-gear-atk');
    const session = await openCombat({ operativeId: op.id, challengeId: '0.1', enemyHp: 5, operativeHp: 100, wavesRequired: 1 });
    // roll 0 → base dmg 1; +100 attack = 101 > 5 enemyHp → won this wave.
    const after = await applyRoll(session.id, { wave: 1, roll: 0, dmg: 0, sig: '' }, undefined, { attack: 100, defense: 0 });
    expect(after.status).toBe('won');
  });
});
