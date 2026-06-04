/**
 * tests/helpers/onion-mock.ts — Mock for the Onion DAO external API client.
 *
 * Prevents real HTTP calls to oniondao.dev / the Onion rewards API.
 * Returns a canned 'pending' response so the engine can record the ledger row
 * without actually dispatching a reward request.
 */

import { mock } from 'bun:test';

export interface MockRewardRecord {
  externalId: string;
  amount: number;
  username: string | null;
}

const _rewards: MockRewardRecord[] = [];

export function getMockRewards(): MockRewardRecord[] {
  return [..._rewards];
}

export function clearMockRewards(): void {
  _rewards.length = 0;
}

export function mockOnionClient(): void {
  mock.module('../../src/lib/server/onion/client', () => ({
    createRequest: async (req: any) => {
      _rewards.push({
        externalId: req.externalId,
        amount: req.amount,
        username: req.recipientUsername ?? req.username ?? null
      });
      return { id: `mock-reward-${req.externalId}`, status: 'pending' };
    },
    getRequest: async (id: string) => ({
      id,
      requestType: 'transfer',
      status: 'pending',
      amount: 0,
      currencyMode: null,
      solanaSignature: null,
      error: null
    }),
    verifyCallbackSignature: (_body: string, _sig: string) => true,
    getProfile: async () => null
  }));
}
