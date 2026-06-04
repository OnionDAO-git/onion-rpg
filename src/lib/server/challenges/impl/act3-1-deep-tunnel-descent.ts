/**
 * act3-1-deep-tunnel-descent — "Descent into the Deep Tunnel" (Act 3, Combat).
 * SPEC §5, Act 3, challenge 3.1.
 *
 * Mechanic: Endurance RNG combat vs "the rising water" — a damage-over-time
 * fight with 3 waves + a session timer. Operatives must reach the beacon before
 * the timer expires; the water deals DOT damage each wave. The combat engine
 * tracks expiry via expiresAt; a timed-out session is status='expired' which
 * maps to a special TIMEOUT failure beat.
 *
 * Requires: none (Act 3 challenges are accessible once Act 2 is cleared, but
 *   this challenge has no explicit credential gate — it's the Act 3 entry
 *   point that awards Prompt Fragment #1).
 *
 * Rewards: sump_pump (utility item) + prompt_fragment_1 + 120 Onions +
 *   gauge bump (750 units — large infrastructure lesson, big win-bar share).
 *
 * validate() calls into the combat engine (engine/combat.ts) and reads the
 * session's status. The ENGINE persists the attempt and applies rewards —
 * this module never grants inventory directly.
 */
import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult } from '$lib/shared/types';
import {
  SUCCESS_MESSAGE,
  FAILURE_MESSAGE,
  TIMEOUT_MESSAGE,
  WATER_RISING_TAUNTS,
  WAVE_CLEARED_TAUNT,
  SCREEN_CONTENT,
} from '../content/act3-1-deep-tunnel-descent';

// ── Challenge constants ────────────────────────────────────────────────────

/** Session TTL in seconds (endurance mechanic: reach beacon before timer). */
const TTL_SECONDS = 180; // 3-minute window per SPEC: "reach the beacon before a timer"

/** Number of combat waves (water surge waves). */
const WAVES_REQUIRED = 3;

/** Enemy HP per wave. "The rising water" is relentless but not instant. */
const ENEMY_HP = 60;

/** Operative starting HP. Slightly lower than default to keep it tense. */
const OP_HP = 90;

// ── Descriptor ────────────────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
  id: '3.1',
  act: 3,
  type: 'combat',
  name: 'Descent into the Deep Tunnel',

  /**
   * No explicit credential gate — Act 3 is unlocked via act progression in
   * game_state.current_act. If you want to soft-gate until Act 2 is cleared,
   * add 'transit_pass' or 'river_access' here.
   */
  requires: [],

  rewards: [
    // Utility item (SPEC: "Sump Pump")
    { kind: 'inventory', catalogId: 'sump_pump' },
    // First prompt fragment (critical for Act 4 finale reassembly)
    { kind: 'inventory', catalogId: 'prompt_fragment_1' },
    // Onions — primary currency reward
    { kind: 'onions', amount: 120 },
    // Shared festival win-bar (large bump — significant infrastructure lesson)
    { kind: 'gauge', amount: 750 },
  ],

  beaconConfig: {
    beaconIdHint: 'b-deep-tunnel',
    landmark: 'TARP Deep Tunnel access point',
    // secRng provides optional client entropy; combat RNG is server-authoritative.
    // No subghz / voice requirements for this challenge.
    requiresCapabilities: ['secRng'],
  },

  /**
   * Static content forwarded to the badge in CHALLENGE_INTRO.
   * Also consumed by the sim (beacon config mirrors these values).
   * Terse to stay inside the ESP-NOW 232-byte/frame budget.
   */
  content: {
    ...SCREEN_CONTENT,
    // Combat tuning hints for the badge archetype runner
    enemy_hp:      ENEMY_HP,
    op_hp:         OP_HP,
    waves_req:     WAVES_REQUIRED,
    ttl_seconds:   TTL_SECONDS,
    // Wave-by-wave DEEPDISH taunts (first line each, for display space)
    wave_taunts:   WATER_RISING_TAUNTS.map((t) => t.split('\n')[0]),
    wave_cleared:  WAVE_CLEARED_TAUNT,
  },

  /**
   * validate(input, ctx) — pure-ish verdict.
   *
   * Called by the engine after each COMBAT_ROLL_REQUEST cycle. The engine has
   * already called combat.applyRoll() and updated the session; we just read
   * combat.status to decide the outcome.
   *
   * Input shape (from the badge COMBAT_ROLL_REQUEST body):
   *   { c: challengeId, roll?: { w, r, d, sig } }
   *
   * ctx.combat is the latest CombatSession row (status already updated by
   * the engine before validate() is called — see engine/index.ts submitChallenge).
   *
   * Result semantics:
   *   continued=true  → active session, fight still in progress
   *   passed=true     → won (all waves cleared within TTL)
   *   passed=false    → lost HP or timer expired
   */
  validate(_input, ctx): ChallengeResult {
    const session = ctx.combat;

    // No active session yet: the engine will open one on the next roll request.
    // Return a "continued" signal so the badge stays in the fight loop.
    if (!session) {
      return {
        passed: false,
        continued: true,
        message: SCREEN_CONTENT.intro,
      };
    }

    switch (session.status) {
      case 'won':
        return {
          passed: true,
          message: SUCCESS_MESSAGE,
          flags: {
            deep_tunnel_cleared: true,
            deep_tunnel_waves_survived: session.wave,
            deep_tunnel_op_hp_remaining: session.operativeHp,
          },
        };

      case 'lost':
        return {
          passed: false,
          message: FAILURE_MESSAGE,
          flags: { deep_tunnel_failed_at_wave: session.wave },
        };

      case 'expired':
        return {
          passed: false,
          message: TIMEOUT_MESSAGE,
          flags: { deep_tunnel_timed_out: true, deep_tunnel_wave_reached: session.wave },
        };

      case 'active': {
        // Fight still ongoing — return a per-wave DEEPDISH taunt.
        // wave is 0-based in the session after the first roll increments it.
        const tauntIdx = Math.min(session.wave - 1, WATER_RISING_TAUNTS.length - 1);
        const waveTaunt = tauntIdx >= 0 ? WATER_RISING_TAUNTS[tauntIdx] : SCREEN_CONTENT.intro;
        return {
          passed: false,
          continued: true,
          message: waveTaunt,
          flags: {
            deep_tunnel_wave: session.wave,
            deep_tunnel_enemy_hp: session.enemyHp,
            deep_tunnel_op_hp: session.operativeHp,
          },
        };
      }

      default:
        // Unexpected status — treat as active (defensive fallback).
        return {
          passed: false,
          continued: true,
          message: SCREEN_CONTENT.intro,
        };
    }
  },
};

// ── Self-register (parallel-safe; no shared index edited) ─────────────────
registerChallenge(challenge);
export default challenge;
