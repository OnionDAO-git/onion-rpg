/**
 * POST /api/ai/finale — Act 4.2 "Realign the Agent" finale conversation.
 *
 * Called when the Operatives are at DEEPDISH's console with (some or all)
 * prompt fragments in their inventory. DEEPDISH's mask is off.
 *
 * The win condition: the Operatives demonstrate — in their own words — that
 * the infrastructure lessons landed. The model judges each turn. When
 * `won === true` is returned, the engine applies the victory (lift embargo,
 * restore onion supply, etc.).
 *
 * Request body:
 * {
 *   sessionId?: string          // existing storyteller session (for history)
 *   operativeId: string         // operative UUID
 *   utterance: string           // what the operative said to DEEPDISH
 *   inventory: string[]         // catalog IDs; must include prompt_fragment_* for reveal
 *   transcript?: StorytellerTurn[]  // prior turns of this finale session
 * }
 *
 * Response:
 * {
 *   reply: string               // DEEPDISH finale reply (mask-off voice)
 *   won: boolean                // true when win condition is satisfied
 *   reasoning?: string          // internal (not shown to player)
 *   sessionId?: string
 * }
 *
 * Auth: Bearer BEACON_API_KEY (or open in dev)
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { finaleConversation } from '$lib/server/ai/storyteller';
import type { RequestHandler } from './$types';
import type { StorytellerTurn } from '$lib/shared/types';

interface FinaleRequestBody {
	sessionId?: string;
	operativeId?: string;
	utterance: string;
	inventory: string[];
	transcript?: StorytellerTurn[];
}

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');

	let body: FinaleRequestBody;
	try {
		body = (await request.json()) as FinaleRequestBody;
	} catch {
		error(400, 'Invalid JSON body');
	}

	if (typeof body.utterance !== 'string' || !body.utterance.trim()) {
		error(400, 'utterance is required');
	}

	const result = await finaleConversation({
		mode: 'finale',
		challengeId: '4.2',
		transcript: body.transcript ?? [],
		inventory: body.inventory ?? [],
		utterance: body.utterance.trim()
	});

	return json({
		reply: result.reply,
		won: result.won,
		reasoning: result.reasoning,
		sessionId: body.sessionId
	});
};
