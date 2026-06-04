/**
 * POST /api/ai/npc — one turn of NPC (DEEPDISH) dialogue for challenges
 * that use free-form AI judgment (challenges 1.3, 3.2).
 *
 * The beacon/badge sends this after receiving an NPC_DIALOGUE_TURN message
 * from the operative. The engine can also call this directly for inline
 * dialogue flows.
 *
 * Request body:
 * {
 *   sessionId?: string          // existing storyteller session (for history)
 *   challengeId: string         // e.g. "1.3"
 *   operativeId: string         // operative UUID
 *   utterance: string           // what the operative said
 *   inventory?: string[]        // catalog IDs the operative holds
 *   transcript?: StorytellerTurn[]  // prior turns (if no sessionId)
 * }
 *
 * Response:
 * {
 *   reply: string               // DEEPDISH-voiced text for the badge display
 *   passed: boolean             // comprehension verdict
 *   reasoning?: string          // internal (not shown to player)
 *   sessionId?: string          // for stateful multi-turn sessions
 * }
 *
 * Auth: Bearer BEACON_API_KEY (or open in dev)
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { npcTurn } from '$lib/server/ai/storyteller';
import type { RequestHandler } from './$types';
import type { StorytellerTurn, StorytellerMode } from '$lib/shared/types';

interface NpcRequestBody {
	sessionId?: string;
	challengeId: string;
	operativeId?: string;
	utterance: string;
	inventory?: string[];
	transcript?: StorytellerTurn[];
	mode?: StorytellerMode;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	let body: NpcRequestBody;
	try {
		body = (await request.json()) as NpcRequestBody;
	} catch {
		error(400, 'Invalid JSON body');
	}

	if (!body.challengeId) error(400, 'challengeId is required');
	if (typeof body.utterance !== 'string' || !body.utterance.trim()) {
		error(400, 'utterance is required');
	}

	// Determine mode: challenges 1.3, 3.2 are 'npc'; 4.2 uses /api/ai/finale
	const mode: StorytellerMode = body.mode ?? 'npc';

	const verdict = await npcTurn({
		mode,
		challengeId: body.challengeId,
		transcript: body.transcript ?? [],
		inventory: body.inventory ?? [],
		utterance: body.utterance.trim()
	});

	return json({
		reply: verdict.reply,
		passed: verdict.passed,
		reasoning: verdict.reasoning,
		sessionId: body.sessionId
	});
};
