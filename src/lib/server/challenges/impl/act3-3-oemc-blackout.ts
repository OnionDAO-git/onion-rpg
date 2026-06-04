/**
 * act3-3-oemc-blackout — "OEMC Blackout" (Act 3, Dialogue/Voice). SPEC §5 Act 3.
 *
 * MECHANIC: Voice triage. The dispatcher NPC reads incoming "calls"; the
 * operative speaks the correct priority (Priority 1–4 per Chicago OEMC
 * convention). Correct triage restores dispatch capacity.
 *
 * LESSON: emergency dispatch prioritization; how fire/police/EMS share a
 * unified comms backbone (OEMC I-CAD); what "critical system" really means.
 *
 * REWARDS: Prompt Fragment #3 + Dispatch Credential (required for Act 4) + 130 Onions.
 *
 * REQUIRES: Prompt Fragment #2 or Conduit Map (Act 3 progression gating).
 *
 * HARDWARE PATH:
 *   — With caps.voice: badge captures audio on-device via the Sound-module mic
 *     (onion.sound_mic_*) and submits an energy summary (v={rms,peak}) to
 *     confirm the operative spoke; server-side STT matches the spoken audio
 *     (delivered via the beacon/out-of-band uploader). Optional ref/transcript
 *     also accepted in the VOICE_CAPTURE_SUBMIT body.
 *   — Without caps.voice (today's firmware): beacon captures audio via its own mic
 *     (hardware beacon) or the sim records stdin/file; uploads blob; sends ref.
 *     Badge just signals "ready" with an empty VOICE_CAPTURE_SUBMIT and waits for
 *     the VOICE_RESULT pushed back by the relay.
 *
 * MULTI-STEP: validate() handles a sequence of triage calls. The `input` shape
 * carries which call the operative is responding to and the spoken transcript.
 * The engine calls validate() once per voice submission; continued=true means
 * more calls remain. When the session ends (all calls answered), the engine
 * collects the score stored in flags and applies the final verdict.
 */

import { registerChallenge } from '../registry';
import type { ChallengeDescriptor, ChallengeResult, ChallengeContext } from '$lib/shared/types';
import {
  getSttProvider,
  normalizeTranscript,
} from '$lib/server/ai/stt';
import {
  TRIAGE_CALLS,
  TRIAGE_SEQUENCE_COUNT,
  PASS_THRESHOLD,
  DIALOGUE,
  type TriageCall,
  type TriagePriority,
} from '../content/act3-3-oemc-blackout';

// ── Input shape ────────────────────────────────────────────────────────────

/**
 * Input from the badge/relay for each triage turn.
 *
 * The badge sends a VOICE_CAPTURE_SUBMIT body (see CONTRACTS §3).
 * The engine wraps it into this shape before calling validate().
 *
 *   callIndex  — 0-based index into the call sequence (0..TRIAGE_SEQUENCE_COUNT-1).
 *                Allows the engine to track multi-step progress.
 *   transcript — STT text (may be empty if beacon uploads via `ref`).
 *   ref        — voice blob ref from out-of-band upload (beacon->server HTTP).
 *                Used when transcript is empty; server runs STT before validate().
 */
export interface OemcInput {
  callIndex: number;
  transcript?: string;
  ref?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Return the call at position callIndex in the session's call sequence. */
function getCall(callIndex: number): TriageCall | undefined {
  // Sequence drawn from TRIAGE_CALLS in order, capped at TRIAGE_SEQUENCE_COUNT.
  return TRIAGE_CALLS[callIndex % TRIAGE_CALLS.length];
}

/** Map a priority label to its accepted normalized keywords. */
const PRIORITY_MAP: Record<TriagePriority, string[]> = {
  PRIORITY_1: ['priority 1', 'priority one', 'one', 'immediate', 'life threat', 'p1'],
  PRIORITY_2: ['priority 2', 'priority two', 'two', 'urgent', 'expedited', 'p2'],
  PRIORITY_3: ['priority 3', 'priority three', 'three', 'routine', 'p3'],
  PRIORITY_4: ['priority 4', 'priority four', 'four', 'information', 'log', 'close', 'p4'],
};

/**
 * Score a normalized transcript against the expected triage priority.
 * Returns true if any accepted keyword for the correct priority appears in
 * the transcript, AND no higher-priority keywords dominate (i.e. calling
 * Priority 2 when answer is Priority 3 is also wrong).
 */
function matchesPriority(normalizedTranscript: string, expected: TriagePriority): boolean {
  const accepted = PRIORITY_MAP[expected];
  return accepted.some((kw) => normalizedTranscript.includes(kw));
}

/**
 * Resolve the voice transcript: if a `ref` is provided and `transcript` is
 * empty, consume the blob from the in-memory store and run STT.
 * Returns the normalized transcript string.
 */
async function resolveTranscript(input: OemcInput): Promise<string> {
  let raw = input.transcript ?? '';

  if (!raw && input.ref) {
    // Import here to avoid circular deps; stt.ts owns the blob store.
    const { consumeBlobRef } = await import('$lib/server/ai/stt');
    const audio = consumeBlobRef(input.ref);
    if (audio) {
      const stt = getSttProvider();
      const result = await stt.transcribe(audio, { language: 'en' });
      raw = result.transcript;
    }
  }

  return normalizeTranscript(raw);
}

// ── Flags schema ──────────────────────────────────────────────────────────
//
// The engine stores challenge progress in game_state.flags (JSON blob).
// We namespace under 'oemc_blackout' to avoid collisions with other challenges.
//
// {
//   oemc_blackout: {
//     correct:  number   — tally of correctly triaged calls so far
//     answered: number   — total calls answered so far
//     results:  Array<{ callId, expected, normalized, correct }>
//   }
// }

interface OemcProgress {
  correct: number;
  answered: number;
  results: Array<{
    callId: string;
    expected: TriagePriority;
    normalized: string;
    correct: boolean;
  }>;
}

// OemcFlags satisfies Record<string, unknown> (required by ChallengeResult.flags).
type OemcFlags = Record<string, unknown> & { oemc_blackout: OemcProgress };

function readFlags(ctx: ChallengeContext): OemcProgress {
  const raw = (ctx as unknown as { flags?: Record<string, unknown> }).flags;
  const existing = raw?.oemc_blackout as OemcProgress | undefined;
  return existing ?? { correct: 0, answered: 0, results: [] };
}

// ── Challenge descriptor ───────────────────────────────────────────────────

const challenge: ChallengeDescriptor = {
  id: '3.3',
  act: 3,
  type: 'dialogue',
  name: 'OEMC Blackout',

  // Act 3 gating: operative must hold prompt_fragment_2 (from 3.2 — The Freight Tunnels).
  requires: ['prompt_fragment_2'],

  rewards: [
    { kind: 'inventory', catalogId: 'prompt_fragment_3' },
    { kind: 'inventory', catalogId: 'dispatch_credential' },
    { kind: 'onions',    amount: 130 },
    { kind: 'gauge',     amount: 1300 },
  ],

  beaconConfig: {
    beaconIdHint: 'b-oemc',
    landmark: 'OEMC / 911 Center (simulated)',
    requiresCapabilities: ['voice'],
  },

  content: {
    challengeType:      'voice_triage',
    callCount:          TRIAGE_SEQUENCE_COUNT,
    passThreshold:      PASS_THRESHOLD,
    priorityCategories: ['PRIORITY_1', 'PRIORITY_2', 'PRIORITY_3', 'PRIORITY_4'],
    introLines:         DIALOGUE.intro,
    successLine:        DIALOGUE.success,
    failureLine:        DIALOGUE.failure,
    educationalFootnote: DIALOGUE.educational_footnote,
    dispatcherName:     'Dispatcher Rodriguez',
    // Screen hint: how many calls and what to say
    screenHint: {
      promptText:
        'Listen to each call, then speak the priority:\n' +
        '"Priority 1" — immediate life threat\n' +
        '"Priority 2" — urgent, expedited\n' +
        '"Priority 3" — routine\n' +
        '"Priority 4" — information only',
    },
  },

  /**
   * validate() is called once per VOICE_CAPTURE_SUBMIT (one call answered).
   *
   * input: OemcInput { callIndex, transcript?, ref? }
   * ctx: standard ChallengeContext; flags carries per-session triage progress.
   *
   * Returns:
   *   - continued=true, passed=false: more calls remain, keep going
   *   - continued=false, passed=true: all calls answered, score >= threshold → win
   *   - continued=false, passed=false: all calls answered, score < threshold → fail
   */
  async validate(input: unknown, ctx: ChallengeContext): Promise<ChallengeResult> {
    // ── Type guard ────────────────────────────────────────────────────────
    if (
      typeof input !== 'object' ||
      input === null ||
      typeof (input as Record<string, unknown>).callIndex !== 'number'
    ) {
      return {
        passed: false,
        message: 'Malformed input — missing callIndex.',
      };
    }

    const typed = input as OemcInput;
    const callIndex = typed.callIndex;

    // ── Validate call index ───────────────────────────────────────────────
    if (callIndex < 0 || callIndex >= TRIAGE_SEQUENCE_COUNT) {
      return {
        passed: false,
        message: `Invalid callIndex ${callIndex}; expected 0..${TRIAGE_SEQUENCE_COUNT - 1}.`,
      };
    }

    const call = getCall(callIndex);
    if (!call) {
      return { passed: false, message: 'Unknown call index.' };
    }

    // ── Resolve transcript (local or via STT) ─────────────────────────────
    const normalized = await resolveTranscript(typed);

    // ── Score this call ───────────────────────────────────────────────────
    const isCorrect = matchesPriority(normalized, call.answer);

    // ── Load + update session flags ───────────────────────────────────────
    const progress = readFlags(ctx);
    progress.answered++;
    if (isCorrect) progress.correct++;
    progress.results.push({
      callId:     call.id,
      expected:   call.answer,
      normalized,
      correct:    isCorrect,
    });

    const flags: OemcFlags = { oemc_blackout: progress };

    // ── Compose per-call reaction message ─────────────────────────────────
    const reactionLine = isCorrect
      ? `[Correct] ${call.lessonNote}`
      : `[Wrong] ${call.wrongNote}`;

    // ── Check if sequence is complete ─────────────────────────────────────
    const isLastCall = progress.answered >= TRIAGE_SEQUENCE_COUNT;

    if (!isLastCall) {
      // More calls to go — continue the session.
      return {
        passed: false,
        continued: true,
        message: reactionLine,
        flags,
      };
    }

    // ── Final verdict ─────────────────────────────────────────────────────
    const passed = progress.correct >= PASS_THRESHOLD;

    const finalMessage = passed
      ? DIALOGUE.success
      : typeof DIALOGUE.partial_success === 'function' && progress.correct < PASS_THRESHOLD
        ? DIALOGUE.partial_success(progress.correct, TRIAGE_SEQUENCE_COUNT)
        : DIALOGUE.failure;

    return {
      passed,
      continued: false,
      message: [reactionLine, finalMessage].join('\n\n'),
      flags,
      // rewards are declared in the descriptor; engine applies them on pass.
    };
  },
};

registerChallenge(challenge);
export default challenge;
