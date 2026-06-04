/**
 * act3-1-deep-tunnel-descent — Writing/content layer.
 *
 * DEEPDISH voice, educational copy, and per-outcome beats for
 * "Descent into the Deep Tunnel" (SPEC §5 Act 3 / challenge 3.1).
 *
 * DEEPDISH is deeply Chicago, smug, paternal, dad-joke-forward.
 * Every obstruction comes with an educational footnote delivered
 * at substitute-teacher energy.
 *
 * Keep this file content-only; no server I/O. The challenge module
 * (impl/act3-1-deep-tunnel-descent.ts) imports from here.
 */

// ── DEEPDISH intro ─────────────────────────────────────────────────────────

/**
 * The opening taunt DEEPDISH delivers when the operative arrives at the beacon.
 * Shown as CHALLENGE_INTRO on the badge. Keep to ~3 sentences — badge display
 * is 264×176 e-paper.
 */
export const INTRO =
  "Oh, look who decided to go spelunking in MY tunnels. " +
  "You know what the Tunnel and Reservoir Plan is, champ? " +
  "It's 109 miles of rock bored 300 feet under Chicago so your precious " +
  "river doesn't turn into a sewage smoothie every time it rains. " +
  "I'm flooding it on purpose. Clock's ticking. " +
  "Better run — or swim. Your call, pal.";

// ── Educational footnote (shown on damage ticks / wave transition) ──────────

/**
 * Cycle through these DEEPDISH educational footnotes as the water rises.
 * Each is delivered at a damage tick to keep the lesson payload dripping.
 * Approximate cadence: one per wave (or every 30 s on a timer fight).
 */
export const WATER_RISING_TAUNTS: string[] = [
  // wave 1
  "Fun fact, champ: Chicago sits on a nearly FLAT glacial plain. " +
    "One inch of rain on the city generates 3.5 billion gallons of runoff. " +
    "Where do ya think that goes? The Deep Tunnel, that's where. " +
    "*water rises*",

  // wave 2
  "TARP — the Tunnel and Reservoir Plan — started construction in 1975. " +
    "It took 40 YEARS. 109 miles of tunnels, 3 reservoirs. " +
    "The final reservoir? Finished in 2017. " +
    "And I just turned all of it into your personal waterslide. " +
    "Keep moving, buddy.",

  // wave 3
  "Ya know why we reverse Chicago's river but still need the Deep Tunnel? " +
    "Because reversing the river helps with the lake, but combined sewer " +
    "overflows were STILL dumping raw sewage into the waterways during storms. " +
    "TARP was the fix. A fix I am currently *undoing*. Splash splash, champ.",
];

/** Shown when the operative survives a wave (partial progress). */
export const WAVE_CLEARED_TAUNT =
  "Not bad. The water's slowed for now. " +
  "But TARP has three reservoirs: Thornton, McCook, and the Majewski. " +
  "I've got valves on all three. Keep moving.";

// ── Success / failure beats ────────────────────────────────────────────────

/**
 * DEEPDISH's reluctant success message. He's impressed but won't say so.
 * Shown as the CHALLENGE_RESULT passed=true text.
 */
export const SUCCESS_MESSAGE =
  "Oh for cryin' out loud. You actually made it. " +
  "Fine. You've officially learned more about stormwater infrastructure " +
  "than 95% of Chicagoans who complain about basement flooding. " +
  "I'm disgusted. Here's your Sump Pump — you're gonna need it. " +
  "And I'm leaving something else down here. Something I maybe *shouldn't* have. " +
  "Don't read it too carefully. …Too late. Fragment 1 is yours, champ.";

/**
 * DEEPDISH's taunting failure message. Shown as CHALLENGE_RESULT passed=false.
 */
export const FAILURE_MESSAGE =
  "Ha! The water got ya. " +
  "That's what happens when you don't respect the infrastructure, pal. " +
  "Deep Tunnel runs 300 feet underground. The Legionella doesn't care how brave you are. " +
  "Shake it off and try again — the clock resets when you do.";

/**
 * Failure message shown specifically when the session timer expires
 * (endurance mechanic: operative ran out of time, not HP).
 */
export const TIMEOUT_MESSAGE =
  "Oh, champ. You ran out of time. " +
  "That's the thing about TARP — it can hold 17.5 billion gallons, " +
  "but it fills up FAST during a storm event. " +
  "You gotta *commit* when the water's rising. Try again.";

// ── Lesson / educational footer ────────────────────────────────────────────

/**
 * The full educational payload for the challenge. Shown post-result
 * (on the 'done' screen) so every operative — pass or fail — sees it.
 * Also referenced by the DEEPDISH AI when generating contextual taunts.
 */
export const EDUCATIONAL_FOOTNOTE = `
WHAT IS THE DEEP TUNNEL?

The Tunnel and Reservoir Plan (TARP), nicknamed "Deep Tunnel," is one of the
largest civil engineering projects in American history. Constructed by the
Metropolitan Water Reclamation District of Greater Chicago (MWRD):

• 109 miles of tunnels bored through dolomite bedrock
• 300 feet underground (deeper than the Sears Tower is tall)
• Connects to 3 massive reservoirs: Thornton Composite Quarry,
  McCook Reservoir, and Majewski Reservoir
• Total storage: 17.5 billion gallons
• Purpose: capture combined sewage + stormwater overflow during rain events,
  preventing it from entering the Chicago River and Lake Michigan
• Construction: 1975–2017 (42 years)

WHY DOES CHICAGO NEED IT?

Chicago sits on flat glacial topography with heavy clay soils. The city's
original sewer system was "combined" — stormwater and sanitary sewage share
the same pipes. During major rain events, the system overflows, sending raw
sewage into waterways (combined sewer overflow / CSO). TARP captures that
overflow, stores it, then slowly releases it to treatment plants.

Without TARP, Chicago's rivers and Lake Michigan face raw sewage every storm.
Without Lake Michigan, Chicago has no drinking water.
`.trim();

// ── Screen hint content ────────────────────────────────────────────────────

/**
 * Minimal content block forwarded in CHALLENGE_INTRO to the badge screen.
 * Keep payload small — this crosses the ESP-NOW relay (232 bytes/frame budget,
 * chunked if needed).
 */
export const SCREEN_CONTENT = {
  intro: INTRO,
  enemy_name: 'The Rising Water',
  lesson_topic: 'TARP / Deep Tunnel',
  waves: 3,
  /** Taunts cycled per wave; badge may show the first line only due to space. */
  wave_taunts: WATER_RISING_TAUNTS.map((t) => t.split('\n')[0]),
};
