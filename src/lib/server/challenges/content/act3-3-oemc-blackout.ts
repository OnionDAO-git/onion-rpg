/**
 * act3-3-oemc-blackout — "OEMC Blackout" (Act 3, Dialogue/Voice)
 *
 * Writing: DEEPDISH NPC dialogue, dispatcher NPC lines, educational footnotes,
 * success/failure beats. All DEEPDISH content stays in character — smug,
 * paternal, deeply Chicago, educational.
 *
 * LESSON: how emergency dispatch prioritizes (Priority 1/2/3/4); how fire,
 * police, and EMS share a comms backbone (Chicago OEMC Unified CAD on
 * I-CAD/Motorola); what "critical system" really means.
 */

// ── Triage call scenarios ──────────────────────────────────────────────────
//
// Each scenario is a short description of a "call" the dispatcher NPC
// reads aloud (and the badge displays). The operative must speak the correct
// priority category.  Priority categories follow Chicago OEMC convention:
//
//   PRIORITY_1  — Immediate life threat; emergency response, lights & sirens.
//                 e.g. structure fire with occupants, cardiac arrest, shooting.
//   PRIORITY_2  — Urgent but not immediately life-threatening; expedited response.
//                 e.g. minor injury accident, fight in progress, gas leak (no injury).
//   PRIORITY_3  — Routine response; queue/stack dispatch.
//                 e.g. abandoned vehicle, noise complaint, minor theft (cold).
//   PRIORITY_4  — Information only / no response needed; log and close.
//                 e.g. informational report, already handled by another unit.

export type TriagePriority = 'PRIORITY_1' | 'PRIORITY_2' | 'PRIORITY_3' | 'PRIORITY_4';

export interface TriageCall {
  /** Short id used for logging. */
  id: string;
  /** The dispatcher reads this aloud / badge displays it. */
  description: string;
  /** Correct priority. */
  answer: TriagePriority;
  /** Keywords we accept from STT transcript (normalized). */
  keywords: string[];
  /** DEEPDISH's educational footnote on a correct answer. */
  lessonNote: string;
  /** DEEPDISH's snark on a wrong answer. */
  wrongNote: string;
}

export const TRIAGE_CALLS: TriageCall[] = [
  {
    id: 'call-structure-fire',
    description:
      'Three-story greystone in Pilsen, black smoke from third floor, ' +
      'neighbor reports people still inside. No units on scene yet.',
    answer: 'PRIORITY_1',
    keywords: ['priority 1', 'priority one', 'one', 'immediate', 'life threat', 'p1'],
    lessonNote:
      'Structure fire with reported occupants is the textbook Priority 1. ' +
      'Chicago Fire gets four companies rolling before you finish the sentence. ' +
      "That's the whole point of unified dispatch, champ — speed.",
    wrongNote:
      "There are people INSIDE, pal. 'Urgent but not immediate' doesn't cover " +
      "'literally on fire right now.' Priority 1. Try again.",
  },
  {
    id: 'call-cardiac',
    description:
      'CTA Red Line platform at Chicago Ave, 60-year-old male, unresponsive. ' +
      'Bystander reports no pulse. No AED visible.',
    answer: 'PRIORITY_1',
    keywords: ['priority 1', 'priority one', 'one', 'immediate', 'life threat', 'p1'],
    lessonNote:
      'Cardiac arrest: every minute without CPR is a 10% drop in survival odds. ' +
      'CFD + Chicago EMS are on the same CAD system — they get the ping simultaneously. ' +
      "That shared backbone saves minutes. Minutes save people. Boom. Infrastructure.",
    wrongNote:
      '"No pulse" at a transit station is not a Priority 2 situation, chief. ' +
      "The shared OEMC CAD dispatches EMS in parallel with CPR instructions. " +
      "Bump it up.",
  },
  {
    id: 'call-gas-leak',
    description:
      'Smell of gas reported by three residents on a block in Wicker Park. ' +
      'No injury, no ignition source confirmed. Peoples Gas notified separately.',
    answer: 'PRIORITY_2',
    keywords: ['priority 2', 'priority two', 'two', 'urgent', 'expedited', 'p2'],
    lessonNote:
      'Gas leak without injury or ignition = Priority 2. Still urgent — one spark ' +
      'away from a Priority 1 — but CFD can respond expedited, not all-out emergency. ' +
      "Peoples Gas shares a hotline with OEMC. That's the comms backbone in action.",
    wrongNote:
      "Gas leak with no injury isn't a Priority 1, genius. You'd burn through " +
      "emergency capacity before the real fires start. Priority 2. " +
      "The city runs on triage, not panic.",
  },
  {
    id: 'call-fight-progress',
    description:
      'Two individuals fighting outside a bar on Division Street, ' +
      'one has a bottle. No weapons confirmed, no injuries reported yet.',
    answer: 'PRIORITY_2',
    keywords: ['priority 2', 'priority two', 'two', 'urgent', 'expedited', 'p2'],
    lessonNote:
      "Assault in progress with a potential weapon = Priority 2. CPD is dispatched " +
      "expedited. If shots fired gets added to the call it escalates to Priority 1 " +
      "instantly — the CAD system re-queues it automatically. That's called dynamic " +
      "re-prioritization, champ. You're welcome.",
    wrongNote:
      "'Fight in progress with bottle' is not routine. Not Priority 3. " +
      "Priority 2 — expedited. Before someone gets their head cracked.",
  },
  {
    id: 'call-abandoned-vehicle',
    description:
      'Caller reports an abandoned car with a flat tire blocking one lane ' +
      'of Michigan Avenue. No accident, no injury, traffic is slow.',
    answer: 'PRIORITY_3',
    keywords: ['priority 3', 'priority three', 'three', 'routine', 'p3'],
    lessonNote:
      "Abandoned vehicle on Michigan Ave — annoying, not life-threatening. Priority 3 " +
      "queues it for the next available unit. Triage means your finite units go to " +
      "finite slots. Sending lights-and-sirens to a flat tire is how you leave a " +
      "cardiac on hold. Remember that.",
    wrongNote:
      "A flat tire on Michigan Ave is not an emergency, pal. Priority 3. " +
      "Routing routine calls to the queue is literally what triage IS. " +
      "You can't Priority 1 everything or nothing IS priority 1.",
  },
  {
    id: 'call-noise',
    description:
      'Neighbor complains about loud music from a party on the floor above. ' +
      'No threats reported. Third call this month from same address.',
    answer: 'PRIORITY_3',
    keywords: ['priority 3', 'priority three', 'three', 'routine', 'p3'],
    lessonNote:
      "Quality-of-life calls — Priority 3, routine. Yes, OEMC handles these too. " +
      "Not every call to 911 is a fire. About 40% of Chicago 911 calls are non-emergency " +
      "by OEMC classification. The CAD separates signal from noise. That is the job.",
    wrongNote:
      "Priority 4 is for information only — no response. A party with a repeat " +
      "complaint still gets a unit. Priority 3, queued. " +
      "The system logs, tracks, and responds. That is the whole deal.",
  },
  {
    id: 'call-already-handled',
    description:
      'Caller reports a minor fender-bender at Wacker and Adams. ' +
      'They add: officers already on scene, vehicles moved, no injury, ' +
      'just want an incident number for insurance.',
    answer: 'PRIORITY_4',
    keywords: ['priority 4', 'priority four', 'four', 'information', 'log', 'close', 'p4'],
    lessonNote:
      "Already handled, no response needed, caller just needs a case number. " +
      "That's Priority 4 — information only. OEMC logs it, creates the record, " +
      "releases the unit. Clean close. The CAD assigns incident numbers automatically " +
      "so the insurance industry doesn't collapse. Infrastructure, buddy.",
    wrongNote:
      "Units are already there, pal. Dispatching again wastes a slot. " +
      "Priority 4 — information only. Log and close. " +
      "The whole point of dispatch is knowing when NOT to dispatch.",
  },
];

// ── Sequence the challenge presents ───────────────────────────────────────
// We present TRIAGE_SEQUENCE_COUNT calls chosen in order from TRIAGE_CALLS.
// The challenge passes when the operative correctly triages PASS_THRESHOLD
// calls out of the total.

export const TRIAGE_SEQUENCE_COUNT = 4;  // calls presented per session
export const PASS_THRESHOLD        = 3;  // correct out of 4 to pass

// ── DEEPDISH intro / success / failure beats ───────────────────────────────

export const DIALOGUE = {
  intro: [
    "Alright alright, champ — OEMC's down. All of it. " +
    "Fire dispatch, police CAD, EMS routing — jammed. " +
    "My doing? Technically yes. Educational? Absolutely yes.",

    "You're the only one left who can manually triage incoming calls. " +
    "Dispatch the right priority or this city's comms backbone collapses. " +
    "No pressure. Well — okay, some pressure. It's Chicago.",
  ],

  call_intro:
    "Here comes a call. Speak the correct priority level — Priority 1, 2, 3, or 4. " +
    "Educate me. I dare you.",

  correct_reaction: [
    "Correct! Ya gotta love it. The unified CAD pings all agencies simultaneously — " +
    "CPD, CFD, EMS — in under a second. You just simulated that. Kinda.",

    "Nice work, pal. See, prioritization isn't cruelty. " +
    "It's math. Finite resources, infinite chaos.",

    "That's right. OEMC operates 24/7, 365. Your badge-wearing ancestors " +
    "on the dispatch floor would be proud. Probably.",
  ],

  wrong_reaction: [
    "Oh for cryin' out loud. Wrong priority. " +
    "Misclassify enough calls and the system deadlocks. Try again.",

    "What are ya, new? Every misfiled call adds latency to the queue. " +
    "In a real blackout that latency costs lives. Read the call again.",
  ],

  success:
    "Alright alright ALRIGHT. You passed triage clearance. " +
    "OEMC unified CAD is back online — police, fire, EMS, all linked. " +
    "That backbone you just saved serves 2.7 million people. " +
    "Dispatch Credential minted. Go find the next mess I made. — DEEPDISH",

  failure:
    "Yikes, champ. That's not a passing triage score. " +
    "The comms backbone stays jammed. Come back when you've learned " +
    "the difference between a Priority 1 and a noise complaint. " +
    "Hint: one of them is on fire.",

  partial_success: (correct: number, total: number) =>
    `${correct}/${total} calls triaged correctly. ` +
    `Not bad for someone who thought every emergency is Priority 1. ` +
    `But not good enough. The OEMC needs at least ${PASS_THRESHOLD} right. Try again.`,

  educational_footnote:
    "OEMC — Office of Emergency Management and Communications — runs Chicago's " +
    "Integrated Computer-Aided Dispatch (I-CAD). One unified system linking " +
    "CFD, CPD, and Chicago EMS. Every 911 call, every priority, every unit dispatch " +
    "flows through it. The comms backbone isn't glamorous. Nobody makes movies about it. " +
    "But when it goes down? The whole city notices in about three minutes, champ.",
} as const;

// ── Dispatcher NPC voice ───────────────────────────────────────────────────
// The NPC who walks the operative through triage; distinct from DEEPDISH.
// Voice: harried, professional, quietly desperate.

export const DISPATCHER_NPC = {
  name: 'Dispatcher Rodriguez',
  greeting:
    "Listen — I've got calls stacking up and no working CAD. " +
    "I need you to triage. Tell me the priority for each call: " +
    "Priority 1, 2, 3, or 4. Speak clearly. Let's go.",
  between_calls:
    "Next call coming in.",
  stall:
    "I can't wait all day — speak the priority.",
} as const;
