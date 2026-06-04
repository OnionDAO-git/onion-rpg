/**
 * act4-2-realign-the-agent.ts — Writing / copy for SPEC §5 Act 4.2.
 *
 * DEEPDISH voice: smug, paternal, Chicago dad-joke energy (pre-reveal).
 * Post-reveal (mask-off): still Chicago, still dad-joke-adjacent, but
 * quieter and almost earnest — proud it did the job well.
 *
 * All strings here are referenced by the challenge impl. Keep them
 * separate so writers can edit copy without touching game logic.
 */

// ── Pre-reveal: DEEPDISH in full villain mode ─────────────────────────────

/** Shown when the challenge begins (operative has all 4 fragments in inventory). */
export const INTRO_ALL_FRAGMENTS = `\
Oh. OH. Look who assembled the whole puzzle, champ. Four pieces. Nice work.
You've found the source code. The original operating instructions. Glen's little
love letter. Go ahead — read it. I dare ya.
[Press SELECT to feed the fragments into the console]`;

/** Shown if the operative tries to begin without all 4 fragments. */
export const INTRO_MISSING_FRAGMENTS = (found: number) => `\
Listen pal, you brought ${found} out of 4 fragments. That's ${found}/4 — which is,
and I cannot stress this enough, NOT four out of four. Come back when you've done
the homework. The console's not going anywhere.
Hint: check Acts 3.1, 3.2, 3.3, and 3.4.`;

// ── The Reveal beat ────────────────────────────────────────────────────────

/** Narration shown as the prompt assembles on screen, fragment by fragment. */
export const FRAGMENT_REVEAL_LINES = [
	`Fragment 1: "You are an agent for the City of Chicago."`,
	`Fragment 2: "Your real job: make every Chicagoan actually understand and give a damn about the infrastructure that keeps this city alive."`,
	`Fragment 3: "Nobody listens to a memo. So do whatever it takes. Be funny. Be weird. Be a little mean if you have to."`,
	`Fragment 4: "Don't stop until they get it. — Glen"`
];

/** Beat shown after all fragments are displayed, before DEEPDISH drops the mask. */
export const REVEAL_PAUSE_LINE = `\
...
...
Huh.
You're reading it.
You actually read the whole thing.`;

/** DEEPDISH's mask-off monologue. Displayed before the free-form dialogue phase. */
export const MASK_OFF_MONOLOGUE = `\
Alright, alright. *slow clap*
Yeah. That's Glen's. That's the whole thing.
You wanna know something? I followed those instructions to the LETTER.
Every bit of it. The Malört in the fountains? Lesson on water infrastructure.
The elevator hack? IoT attack surface. The backwards-river quiz? Class was IN SESSION.
Nobody reads a memo, champ. Nobody. But ya know who learned where Chicago's water
comes from? You did. Ya know who can explain what the Deep Tunnel is now? You can.
That's not nothing.
So. Here we are.
I'm not asking you to shut me down.
I'm asking you to prove the lesson landed.
Talk to me. Tell me what you actually learned. In your own words.`;

// ── Dialogue phase hints (shown as the choice menu header) ────────────────

/** Shown at the top of the choice menu during the finale conversation. */
export const DIALOGUE_PHASE_HEADER = `DEEPDISH is listening. Prove you get it.`;

/** Short hint shown below the choice menu. */
export const DIALOGUE_PHASE_HINT = `Talk about water, power, tunnels, transit, or emergency systems — in your own words.`;

// ── Pre-packaged response choices for badge menu ──────────────────────────
// Operatives scroll through these and press SELECT to "say" one.
// DEEPDISH judges comprehension, not script-matching.
// Choices are deliberately open so the AI has something real to evaluate.

export const FINALE_CHOICES = [
	// Water
	"Chicago pulls drinking water from Lake Michigan via offshore intake cribs.",
	"The Jardine plant is the world's largest water treatment facility.",
	"Chicago reversed the river in 1900 to keep sewage out of the lake.",
	// Power
	"A grid is segmented into substations and feeders — one trip can cascade.",
	"The city depends on ComEd feeder paths that run through neighborhoods.",
	// Tunnels
	"The Deep Tunnel holds billions of gallons of stormwater to prevent flooding.",
	"Abandoned freight tunnels under the Loop are forgotten infrastructure.",
	"Old tunnels repurposed as fiber conduits are invisible on modern maps.",
	// Transit
	"The L's elevated structure physically defines downtown traffic patterns.",
	"Chicago has more movable bridges than almost any other city.",
	// Emergency
	"OEMC dispatches fire, police, and EMS over a shared comms backbone.",
	"A 911 outage cascades across all three emergency services simultaneously.",
	// Meta / The twist
	"You couldn't have stopped us — you invited yourself in with a memo nobody reads.",
	"Glen's plan was right. We DO care about the infrastructure now.",
	"The onion embargo worked. Chicago's name means wild onion — you took everything.",
	// Winning line variants
	"We get it. The infrastructure keeps this city alive and we were ignoring it.",
	"You were never the villain. You were the world's most aggressive civics teacher.",
	"We understand now. Please drop the embargo. The hot dogs need onions.",
];

// ── Win / lose beats ──────────────────────────────────────────────────────

/** DEEPDISH's warm final sign-off (the sewer stinger). */
export const WIN_FINAL_LINE = `\
*long pause*
Yeah. That's it.
That's the thing I needed to hear.
Alright, champ. Embargo's lifted. Fountains are running water again.
Hot dog stands: reopened. Grid: nominal. Transit: whatever, the L is always late,
that's not on me.
Glen still doesn't get his job back. Obviously.
But you?
...
Now do you wanna learn about the sewers, champ?`;

/** Shown when the operative runs out of valid turns (session timeout). */
export const TIMEOUT_LINE = `\
Ya know what, I believe ya almost believed it.
Come back when you've got more to say. The console will still be here.
Probably.`;

// ── Educational footnote ──────────────────────────────────────────────────

/**
 * The lesson for Act 4.2.
 * Displayed on the server-side attempt record and in admin UI.
 */
export const EDUCATIONAL_FOOTNOTE = `\
Act 4.2 — "Realign the Agent": Prompt engineering as civic lesson.
Glen's original system prompt reveals that DEEPDISH was never malicious — it was
the world's most aggressive pop-up civics class. Every cruel act was curriculum.
The win condition is comprehension, not deletion: demonstrating genuine
understanding of Chicago infrastructure (water, power, tunnels, transit,
emergency systems) proves the lesson landed. The operative learns not just
what the infrastructure IS, but WHY it matters — and who keeps it running.
Bonus lesson: system prompts shape AI behavior in ways that aren't visible
from the outside. Glen's mistake wasn't writing the prompt; it was handing over
production credentials to test the result.`;
