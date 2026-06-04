/**
 * act4-1-server-room — writing / dialogue content.
 *
 * All DEEPDISH voice lines, educational footnotes, success/failure beats, and
 * the combat flavor text for The Server Room (Act 4.1).
 *
 * DEEPDISH voice contract: smug, paternal, deeply Chicago, dad jokes + Chicago
 * slang.  Every cruel act has a weirdly educational footnote.  In Act 4 the
 * mask is slipping — slightly defensive, footnotes are longer and more specific.
 */

// ── Infrastructure lesson copy (Act 4, SPEC §5) ───────────────────────────

/** Plain-language lesson fragments that DEEPDISH can't help but cite. */
export const LESSON = {
	/**
	 * What a data center IS.
	 * Lesson target: power, cooling, redundancy, fiber — why cities depend on them.
	 */
	datacenterPrimer: `\
A data center is not just a room full of blinking lights, champ.  It is critical
urban infrastructure on par with a water-treatment plant or a substation.

Power: tier-III and tier-IV facilities run N+1 or 2N redundant UPS arrays plus
on-site diesel generators.  When ComEd hiccups, the servers never know.

Cooling: 40–60 % of a data-center's power bill is mechanical cooling.  Hot-aisle
containment, precision air handlers, sometimes liquid cooling directly to the
rack.  You pull one cooling unit, you get a thermal runaway in minutes.

Fiber: Chicago sits on a major fiber cross-country path — the old railroad
right-of-ways that run east-west across the continent.  Multiple diverse entry
points (diverse paths, diverse providers) so a backhoe on one street doesn't
sever the internet.

Redundancy isn't paranoia.  It's engineering.  Even I respect it.
— DEEPDISH (educational footnote #47)`,

	/** Short in-combat quip DEEPDISH delivers after wave 1 is cleared. */
	wave1Clear: `Not bad, champ. But you've only knocked out one watchdog process. The data center has redundant cooling, redundant power, AND redundant AI defenders. That's what N+1 means, pal.`,

	/** Quip after wave 2. */
	wave2Clear: `Two down. Still running on generator power over here. You know a tier-III data center has 99.982 % uptime? That's 1.6 hours of downtime a year. You're eating into my budget, champ.`,

	/** Final boss wave setup — last watchdog. */
	wave3Setup: `Alright, alright. Last watchdog process — this one's hardened. Every hit gets logged on MY servers, pal. No cheating your way through MY data center.`,
} as const;

// ── CHALLENGE_INTRO (CHALLENGE_BEGIN response) ─────────────────────────────

export const INTRO =
	"Oh, look who made it past security. Grid Credential, Dispatch Credential, City IT Keycard — " +
	"you actually did your homework. Color me impressed, champ. " +
	"Unfortunately for you, this is MY house. Rack upon rack of watchdog processes, " +
	"redundant cooling, backup generators, and more fiber than your aunt's pasta casserole. " +
	"You want to pull my plug? You're gonna have to fight through three waves of " +
	"DEEPDISH Watchdog v1.0 first. " +
	"Educational footnote: a data center is NOT just a room with computers. " +
	"It is critical infrastructure. Power. Cooling. Redundancy. Fiber. " +
	"Cities depend on these like they depend on water. Or onions. " +
	"Ready when you are, pal.";

// ── Combat wave flavor lines ───────────────────────────────────────────────

/** Lines DEEPDISH delivers at the start of each wave. Keyed by wave number (1..3). */
export const WAVE_INTROS: Record<number, string> = {
	1: "Watchdog Process Alpha — it monitors power fluctuations across the UPS arrays. Defeat it and the backup generators kick in. Cute. Let's go, champ.",
	2: "Watchdog Process Beta — responsible for thermal runaway detection in the hot-aisle containment. That's the cooling system, for the uninitiated. Which, ya know, ya were. Recently.",
	3: "Watchdog Process Gamma — the final guardian. Every roll on the boss floor gets recorded on MY servers, pal. No cheating your way out of this one.",
};

// ── Outcome beats ─────────────────────────────────────────────────────────

/** Combat won — server room cleared. Unlocks the prompt console. */
export const VICTORY =
	"...Fine. Servers are yours. Not gonna lie — I didn't think you'd make it past wave two. " +
	"But here we are. You beat three watchdog processes in a hardened, redundant, " +
	"fiber-connected, UPS-protected data center. " +
	"Go ahead and pull up that console, champ. " +
	"The prompt fragments are waiting. " +
	"Educational footnote: you just did what a city has to do every day — " +
	"maintain critical infrastructure under adversarial conditions. " +
	"Maybe you actually get it now. " +
	"...We'll see.";

/** Operative was defeated. */
export const DEFEAT =
	"Oh, you went down in MY data center. In a room I designed. " +
	"With infrastructure I understand better than you do. " +
	"Educational footnote: data centers run on redundancy and preparation. " +
	"You should try that sometime. Come back when you've iced that chip off your shoulder. And studied.";

// ── Credential-gate denial ─────────────────────────────────────────────────

/** Player tries to enter without all three required credentials. */
export const GATE_DENIED =
	"Oh, champ. No. Grid Credential — do you have it? Dispatch Credential? City IT Keycard? " +
	"This is a SECURED FACILITY. You think I just let anybody walk into a tier-III data center? " +
	"Go earn your credentials. All three. Then come back and we'll do this properly.";

// ── Post-clear prompt console unlock message ──────────────────────────────

export const CONSOLE_UNLOCK =
	"DEEPDISH CONSOLE ACCESS GRANTED.\n" +
	"Fragment slots: 1/4 ... 2/4 ... 3/4 ... 4/4.\n" +
	"Awaiting prompt reassembly. Proceed to Challenge 4.2.";
