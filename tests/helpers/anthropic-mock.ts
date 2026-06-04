/**
 * tests/helpers/anthropic-mock.ts — Mock for the Anthropic SDK.
 *
 * Intercepts @anthropic-ai/sdk so no real API calls are made during tests.
 * The mock returns configurable NPC verdict responses so test scenarios can
 * control pass/fail without hitting real Claude.
 */

import { mock } from 'bun:test';

export interface MockNpcResponse {
  passed: boolean;
  reply: string;
  reasoning?: string;
}

/** The mock's next response queue — pop one per call. If empty, uses default. */
let _npcQueue: MockNpcResponse[] = [];
let _defaultPassed = true;

/** Set a default pass/fail for all NPC calls in a test. */
export function setNpcDefault(passed: boolean): void {
  _defaultPassed = passed;
}

/** Enqueue a specific response for the next npcTurn() call. */
export function queueNpcResponse(r: MockNpcResponse): void {
  _npcQueue.push(r);
}

/** Drain the queue; useful in beforeEach. */
export function clearNpcQueue(): void {
  _npcQueue = [];
}

function nextNpcResponse(): MockNpcResponse {
  return _npcQueue.shift() ?? {
    passed: _defaultPassed,
    reply: _defaultPassed
      ? 'That\'s right, champ. You actually know your stuff.'
      : 'Nope. Try again, pal. Educational footnote: that was wrong.',
    reasoning: 'mock verdict'
  };
}

/**
 * Install the Anthropic SDK mock via bun:mock.
 *
 * Also installs the storyteller mock that wraps npcTurn so tests have full
 * control without touching the network.
 */
export function mockAnthropic(): void {
  // Mock @anthropic-ai/sdk at the module level
  mock.module('@anthropic-ai/sdk', () => ({
    default: class MockAnthropic {
      messages = {
        create: async (_opts: any) => {
          const resp = nextNpcResponse();
          const json = JSON.stringify({
            passed: resp.passed,
            reply: resp.reply,
            reasoning: resp.reasoning ?? 'mock'
          });
          return {
            content: [{ type: 'text', text: json }],
            usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }
          };
        }
      };
    }
  }));
}

/**
 * Install the storyteller stub directly (bypasses the Anthropic client
 * entirely). Use when you want simpler, direct control.
 */
export function mockStoryteller(): void {
  mock.module('../../src/lib/server/ai/storyteller', () => ({
    npcTurn: async (_ctx: any) => nextNpcResponse(),
    reactToMove: async () => ({ text: 'DEEPDISH mock reaction' }),
    finaleConversation: async (_ctx: any) => ({
      won: _defaultPassed,
      reply: _defaultPassed
        ? 'Now do you wanna learn about the sewers, champ?'
        : 'Not quite there yet, pal.',
      reasoning: 'mock finale verdict'
    }),
    challengeIntro: async () => 'DEEPDISH mock intro.',
    modelFor: (mode: string) => mode === 'finale' ? 'claude-opus-4-8' : 'claude-sonnet-4-6',
    DEEPDISH_SYSTEM_PROMPT: 'MOCK_SYSTEM_PROMPT'
  }));
}
