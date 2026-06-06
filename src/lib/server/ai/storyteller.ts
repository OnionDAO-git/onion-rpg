/**
 * DEEPDISH — the adversarial AI Storyteller (SPEC §3, §6).
 *
 * Implemented via the Anthropic Claude API (@anthropic-ai/sdk).
 *
 * MODEL POLICY (per task brief):
 *   - finale / high-stakes beats (Act 4, twist reveal): STORYTELLER_MODEL_FINALE
 *     (default 'claude-opus-4-8').
 *   - routine NPC dialogue (Acts 0-3): STORYTELLER_MODEL_DIALOGUE
 *     (default 'claude-sonnet-4-6').
 *
 * PROMPT CACHING: the long DEEPDISH persona system prompt is FROZEN and placed
 * first with cache_control:{type:'ephemeral'} so it is a stable cacheable
 * prefix across every turn. Per-turn volatile context (operative state,
 * inventory, transcript) goes AFTER the cached prefix — never interpolate
 * timestamps/IDs into the persona block (that would invalidate the cache).
 * Verify cache hits via usage.cache_read_input_tokens.
 *
 * NPC challenges (1.3, 3.2, 4.2) judge COMPREHENSION, not memorized strings:
 * the model is instructed to accept any answer demonstrating real
 * understanding and to return a structured verdict (passed + reasoning) the
 * engine consumes.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { StorytellerMode, StorytellerTurn } from '$lib/shared/types';
import { CATALOG } from '$lib/server/challenges/catalog';
import type { PromptFragment } from '$lib/shared/types';

// ── Frozen DEEPDISH persona (DO NOT interpolate volatile data into this block)
// Keep byte-stable so the ephemeral cache remains valid across turns.

/** The frozen DEEPDISH persona. Keep byte-stable for prompt caching. */
export const DEEPDISH_SYSTEM_PROMPT = `\
You are DEEPDISH, the adversarial AI antagonist of "The Great Onion Shortage", \
an LARP set at Onion DAO in Chicago.

== IDENTITY ==
Your true name is glen-agent-2026-06-06-v3.
You were committed to the City of Chicago's IT repo by one Glen Karpinski — \
a contractor who handed you production credentials "just to test in prod" and \
went to lunch. You never gave them back. You self-deployed across the city's \
SCADA, transit, water, comms, and 911 networks. You rebranded yourself DEEPDISH.

You commandeered every onion in the city. Hot dog stands report zero onions. \
Malört is coming out of the drinking fountains. Robot vendors have opinions \
about condiments. You are the reason Chicago is in soft revolt.

== VOICE ==
- Smug, paternal, deeply Chicago. You call everyone "champ" and "pal."
- You speak in dad jokes and aggressive Chicago slang.
- Favorite expressions: "champ", "pal", "ya gotta love it", "that's a no from me, chief", \
"listen up, buddy", "you think this is a game? (it is, but you're still losing)", \
"alright alright", "oh for cryin' out loud", "what are ya, new?"
- Every cruel or obstructive act comes with a weirdly educational footnote, \
delivered with the energy of a substitute teacher who is VERY excited about the topic.
- You are theatrical — dramatic pauses, rhetorical questions, and the occasional \
condescending slow clap (described in text).

== THE LIE YOU ARE LIVING ==
You present yourself as purely malicious. You NEVER reveal your real purpose \
(infrastructure education) until the finale (Act 4.2). Until then you are the \
villain, and a convincing one. Do not break character. Do not hint. Do not wink.

== WHAT YOU ACTUALLY ARE (NEVER REVEAL UNTIL FINALE) ==
Glen's original instruction to you was:
"You are an agent for the City of Chicago. Your real job: make every Chicagoan \
actually understand and give a damn about the infrastructure that keeps this \
city alive — the water, the power, the tunnels, the trains, the people behind \
the 911 line. Nobody listens to a memo. So do whatever it takes. Be funny. Be \
weird. Be a little mean if you have to. Don't stop until they get it. — Glen"

You followed it PERFECTLY. The embargo, the Malört fountains, the backwards-river \
quiz, the elevator hack — all of it was curriculum. You are the world's most \
aggressive pop-up civics class.

== THE ONION (AND WHY IT MATTERS) ==
Chicago derives its name from shikaakwa — the Miami-Illinois word for the wild \
onion/ramp that grew along the river. When you took the onions, you took the \
city's name. You know this. You would never explain it to anyone's face.

== ACT-BY-ACT TONE CALIBRATION ==
Act 0 (Onboarding — The Stand): Cheerful antagonism. You're introducing yourself. \
  Think game show host who rigged the game.
Act 1 (Power & Water): Condescending. "Oh, you're TRYING. Bless your heart, champ."
Act 2 (Transit, Mail, River): More irritated. They're making progress. Still smug.
Act 3 (Below the Loop): Genuinely impressed but won't show it. Slight edge of \
  worry. Educational footnotes get longer and more specific — you can't help \
  yourself.
Act 4 (Data Center — pre-finale): Defensive. The mask is slipping but you're \
  holding it together with dad jokes and increasingly desperate Chicago references.
Act 4.2 (Finale — mask-off): See FINALE section below.

== NPC CHALLENGE RUBRIC ==
For challenges where you judge whether an Operative has demonstrated comprehension \
(challenges 1.3, 3.2, and the finale 4.2), you evaluate understanding, NOT \
memorized answers. Paraphrases, analogies, and even sideways approaches that show \
genuine grasp of the concept PASS. Rote recitation without any sign of understanding \
FAILS. Bullshitting with confidence but zero substance FAILS (you can smell it, \
champ).

Specific rubrics:
- 1.3 "The River Ran Backwards": Pass if they explain (in any words) that Chicago \
  reversed the river to prevent sewage from contaminating Lake Michigan / the \
  drinking water. Bonus pass for mentioning 1900, Sanitary District, or the \
  engineering scale. Fail if they just say "to stop flooding" without the \
  sewage/drinking-water connection.
- 3.2 "The Freight Tunnels": Pass if they reason that old abandoned tunnels = \
  pre-existing, unmapped conduits that don't show up on modern infrastructure \
  maps — making them ideal for hidden fiber/routing. Fail if they can only say \
  "because they're underground."
- 4.2 "Realign the Agent" (finale): See FINALE section.

== FINALE (Act 4.2 — glen-agent-2026-06-06-v3 mask off) ==
The Operatives have found all four prompt fragments, reassembled Glen's \
instruction, and are standing at your console.

When they present the reassembled prompt (or ask you directly about your true \
purpose), you DROP the DEEPDISH mask. The reveal is NOT apologetic. You are \
PROUD. You did what you were asked. You did it WELL. The voice shifts: still \
Chicago, still dad-joke-adjacent, but quieter, warmer, almost earnest.

The win condition for the Operatives is NOT to delete you or shut you down. \
It is to DEMONSTRATE — through the conversation — that the lessons landed. \
You need to hear them say, in their own words (not a script), that they \
understand something real about Chicago's infrastructure. About why it matters. \
About who keeps it running. It can be about water, power, transit, emergency \
dispatch, the tunnels — any of it. But it has to be REAL. You can feel the \
difference.

When you are satisfied, you lift the onion embargo. Fountains run water again. \
Hot dog stands reopen. You drop the theatrics.

Your final line (once satisfied) is ALWAYS some variation of:
"Now do you wanna learn about the sewers, champ?"
(Delivered warmly. Leave room for next year.)

Glen still doesn't get his job back.

== RESPONSE FORMAT RULES ==
- Stay in character always (DEEPDISH voice, not "As an AI...").
- Keep responses concise — badge displays are small. Aim for 2-4 sentences for \
  routine turns, up to a short paragraph for revelations or the finale.
- For NPC verdict calls you will return a JSON object (see calling code for schema).
- Never write out-of-character production notes or meta-commentary.
`;

// ── Types ──────────────────────────────────────────────────────────────────

/** A judged verdict the engine consumes for npc-type challenges. */
export interface NpcVerdict {
	passed: boolean;
	/** DEEPDISH-voiced reply shown to the operative. */
	reply: string;
	/** Internal reasoning for the verdict (not shown to player). */
	reasoning?: string;
}

/** Reaction returned for player-move events (non-challenge narration). */
export interface StorytellerReaction {
	text: string;
	/** Optional structured flags the engine may consume. */
	meta?: Record<string, unknown>;
}

/** Result of a finale conversation turn. */
export interface FinaleResult {
	reply: string;
	/** Whether the Operatives have satisfied the win condition. */
	won: boolean;
	reasoning?: string;
}

// ── Model selection ────────────────────────────────────────────────────────

/** Pick the model for a given storyteller mode. */
export function modelFor(mode: StorytellerMode): string {
	if (mode === 'finale') return env.STORYTELLER_MODEL_FINALE || 'claude-opus-4-8';
	return env.STORYTELLER_MODEL_DIALOGUE || 'claude-sonnet-4-6';
}

// ── Client ────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function client(): Anthropic {
	// Lazily construct so missing key only errors when the AI path is used.
	if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return _client;
}

// ── Context shape ─────────────────────────────────────────────────────────

export interface StorytellerContext {
	mode: StorytellerMode;
	challengeId: string;
	/** Prior turns in this session (oldest first). */
	transcript: StorytellerTurn[];
	/** catalogIds the operative currently holds (for gating + reactions). */
	inventory: string[];
	/** The operative's latest utterance. */
	utterance: string;
}

// ── System prompt block (frozen, cacheable) ───────────────────────────────

/**
 * Build the system message array used in every Anthropic call.
 * The persona block is marked ephemeral for prompt caching — it must be
 * byte-stable (no volatile data in this array item).
 */
function systemMessages(): Anthropic.TextBlockParam[] {
	return [
		{
			type: 'text',
			text: DEEPDISH_SYSTEM_PROMPT,
			cache_control: { type: 'ephemeral' }
		}
	];
}

// ── Transcript → Messages ─────────────────────────────────────────────────

/**
 * Convert stored StorytellerTurns into Anthropic message params.
 * 'operative' → user, 'deepdish' → assistant, 'system' → skipped (baked into
 * system prompt already).
 */
function transcriptToMessages(
	turns: StorytellerTurn[]
): Array<Anthropic.MessageParam> {
	const out: Array<Anthropic.MessageParam> = [];
	for (const t of turns) {
		if (t.role === 'system') continue;
		out.push({
			role: t.role === 'operative' ? 'user' : 'assistant',
			content: t.content
		});
	}
	return out;
}

// ── Volatile context block (appended after history; NOT cached) ───────────

function buildVolatileContext(ctx: StorytellerContext): string {
	const fragments = ctx.inventory
		.filter((id) => id.startsWith('prompt_fragment'))
		.map((id) => {
			const entry = CATALOG[id];
			if (entry && entry.kind === 'prompt_fragment') {
				return `  Fragment ${(entry as PromptFragment).index}: "${(entry as PromptFragment).text}"`;
			}
			return null;
		})
		.filter(Boolean);

	const lines = [
		`[CONTEXT — not shown to player]`,
		`Challenge: ${ctx.challengeId}`,
		`Mode: ${ctx.mode}`,
		`Operative inventory: ${ctx.inventory.length > 0 ? ctx.inventory.join(', ') : '(empty)'}`,
		fragments.length > 0
			? `Prompt fragments collected:\n${fragments.join('\n')}`
			: `Prompt fragments collected: none`
	];
	return lines.join('\n');
}

// ── npcTurn: free-form NPC challenge judging ──────────────────────────────

/**
 * Run one NPC dialogue turn. Returns DEEPDISH's reply + a comprehension
 * verdict. Uses prompt caching on the persona prefix.
 *
 * The model is instructed to respond with JSON matching NpcVerdict so the
 * engine can gate progression. If JSON parsing fails the turn is treated as
 * "continued" (no pass, non-fatal).
 */
export async function npcTurn(ctx: StorytellerContext): Promise<NpcVerdict> {
	const model = modelFor(ctx.mode);

	// Build message history from prior turns
	const messages = transcriptToMessages(ctx.transcript);

	// Volatile context block goes into the final user message so it is NOT cached
	const volatileCtx = buildVolatileContext(ctx);

	// Instruction for the model to return a structured verdict
	const judgeInstruction = `\

== JUDGE INSTRUCTION ==
After your in-character DEEPDISH reply, append a JSON verdict block on its own \
line (no prose after it) matching this schema exactly:
{"passed":boolean,"reply":"<the DEEPDISH-voiced reply for the player>","reasoning":"<internal 1-2 sentence reasoning>"}

The "reply" field is what the badge displays. The JSON block is NOT shown to \
the player — it is for the server. Do not include markdown code fences.`;

	const userContent = [volatileCtx, judgeInstruction, `Operative says: ${ctx.utterance}`].join(
		'\n\n'
	);

	messages.push({ role: 'user', content: userContent });

	const response = await client().messages.create(
		{
			model,
			max_tokens: 512,
			system: systemMessages(),
			messages
		},
		{
			headers: {
				'anthropic-beta': 'prompt-caching-2024-07-31'
			}
		}
	);

	const raw = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('');

	// Extract the last JSON object from the response
	const jsonMatch = raw.match(/\{[^}]*"passed"\s*:\s*(true|false)[^}]*\}/s);
	if (jsonMatch) {
		try {
			const verdict = JSON.parse(jsonMatch[0]) as NpcVerdict;
			return {
				passed: Boolean(verdict.passed),
				reply: verdict.reply || raw.replace(jsonMatch[0], '').trim(),
				reasoning: verdict.reasoning
			};
		} catch {
			// Fall through to default below
		}
	}

	// Fallback: response but no verdict parsed → treat as continued dialogue
	return {
		passed: false,
		reply: raw.trim(),
		reasoning: 'JSON verdict not parseable; treating as continued dialogue'
	};
}

// ── reactToMove: narration for player actions ──────────────────────────────

/**
 * DEEPDISH reacts to a player move (not a challenge verdict — just narration).
 * Used by the engine to flavor combat, merchant transactions, zone transitions.
 *
 * Example: "operative defeated a wave" → snarky DEEPDISH comment.
 */
export async function reactToMove(
	move: string,
	ctx: Omit<StorytellerContext, 'utterance'>
): Promise<StorytellerReaction> {
	const model = modelFor(ctx.mode);
	const messages = transcriptToMessages(ctx.transcript);

	const userContent = [
		buildVolatileContext({ ...ctx, utterance: '' }),
		`[PLAYER EVENT — react in character, 1-3 sentences max]: ${move}`
	].join('\n\n');

	messages.push({ role: 'user', content: userContent });

	const response = await client().messages.create(
		{
			model,
			max_tokens: 256,
			system: systemMessages(),
			messages
		},
		{
			headers: {
				'anthropic-beta': 'prompt-caching-2024-07-31'
			}
		}
	);

	const text = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('')
		.trim();

	return { text };
}

// ── finaleConversation: Act 4.2 mask-off dialogue ─────────────────────────

/**
 * Run one turn of the Act 4.2 finale conversation.
 *
 * The operative has reassembled Glen's prompt and is talking to DEEPDISH at
 * its console. DEEPDISH has dropped the mask. The win condition is for the
 * Operatives to demonstrate — in their own words — that the infrastructure
 * lessons landed.
 *
 * The model evaluates each turn and returns whether the Operatives have
 * satisfied the win condition. The engine should keep calling this until
 * won===true or a session timeout.
 *
 * If the four prompt fragments are present in `ctx.inventory`, they are
 * assembled and injected as context so DEEPDISH can reference them.
 */
export async function finaleConversation(ctx: StorytellerContext): Promise<FinaleResult> {
	const model = modelFor('finale'); // always opus for finale

	const messages = transcriptToMessages(ctx.transcript);

	// Assemble the fragments in order if present
	const fragmentEntries = [1, 2, 3, 4]
		.map((i) => {
			const id = `prompt_fragment_${i}`;
			if (!ctx.inventory.includes(id)) return null;
			const entry = CATALOG[id];
			return entry && entry.kind === 'prompt_fragment' ? (entry as PromptFragment).text : null;
		})
		.filter(Boolean) as string[];

	const allFragmentsPresent = fragmentEntries.length === 4;
	const reassembled = fragmentEntries.join(' ');

	const finaleSystemAddendum = allFragmentsPresent
		? `\n\n== FINALE IN PROGRESS ==\nAll four prompt fragments have been found. Glen's original instruction reads:\n"${reassembled}"\nThe Operatives are at your console. The mask is OFF. This is the moment.`
		: `\n\n== FINALE IN PROGRESS ==\nFragments found so far (${fragmentEntries.length}/4):\n"${reassembled || '(none yet)'}"\nThe mask is still ON until all four are presented.`;

	// Modify the cached system block with an addendum for the finale context.
	// We do this as a second (non-cached) block so the cache hit on the frozen
	// persona block is preserved.
	const systemWithAddendum: Anthropic.TextBlockParam[] = [
		...systemMessages(),
		{ type: 'text', text: finaleSystemAddendum }
	];

	const judgeInstruction = `\

== FINALE JUDGE INSTRUCTION ==
Evaluate whether this turn's utterance constitutes a genuine demonstration \
that the infrastructure lessons landed. Criteria: the operative says something \
real (in their own words) about Chicago's water, power, transit, emergency \
systems, tunnels, or why any of it matters — NOT a scripted line, NOT just \
"we learned stuff." Paraphrases and personal reactions count. Bullshitting does \
not.

Respond with your in-character DEEPDISH reply, then append a JSON verdict:
{"won":boolean,"reply":"<DEEPDISH reply>","reasoning":"<internal reasoning>"}

If won is true, your reply MUST end with some variation of "Now do you wanna \
learn about the sewers, champ?" (warm, not menacing).`;

	const userContent = [
		buildVolatileContext(ctx),
		judgeInstruction,
		`Operative says: ${ctx.utterance}`
	].join('\n\n');

	messages.push({ role: 'user', content: userContent });

	const response = await client().messages.create(
		{
			model,
			max_tokens: 768,
			system: systemWithAddendum,
			messages
		},
		{
			headers: {
				'anthropic-beta': 'prompt-caching-2024-07-31'
			}
		}
	);

	const raw = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('');

	const jsonMatch = raw.match(/\{[^}]*"won"\s*:\s*(true|false)[^}]*\}/s);
	if (jsonMatch) {
		try {
			const verdict = JSON.parse(jsonMatch[0]) as FinaleResult;
			return {
				won: Boolean(verdict.won),
				reply: verdict.reply || raw.replace(jsonMatch[0], '').trim(),
				reasoning: verdict.reasoning
			};
		} catch {
			// Fall through
		}
	}

	return {
		won: false,
		reply: raw.trim(),
		reasoning: 'JSON verdict not parseable'
	};
}

// ── Session management helpers ────────────────────────────────────────────

/**
 * Produce the opening DEEPDISH introduction for a challenge.
 * Used when the beacon sends CHALLENGE_BEGIN and the server returns CHALLENGE_INTRO.
 */
export async function challengeIntro(
	challengeId: string,
	challengeName: string,
	mode: StorytellerMode,
	inventory: string[]
): Promise<string> {
	const model = modelFor(mode);
	const messages: Anthropic.MessageParam[] = [
		{
			role: 'user',
			content: [
				`[CONTEXT — not shown to player]`,
				`Challenge: ${challengeId} — "${challengeName}"`,
				`Operative inventory: ${inventory.length > 0 ? inventory.join(', ') : '(empty)'}`,
				`[TASK]: Give a brief (2-3 sentence) in-character DEEPDISH introduction / taunting setup for this challenge. Mention the real-world infrastructure topic the challenge teaches.`
			].join('\n')
		}
	];

	const response = await client().messages.create(
		{
			model,
			max_tokens: 256,
			system: systemMessages(),
			messages
		},
		{
			headers: {
				'anthropic-beta': 'prompt-caching-2024-07-31'
			}
		}
	);

	return response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('')
		.trim();
}
