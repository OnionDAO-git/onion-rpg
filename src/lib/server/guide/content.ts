/**
 * Public player-guide content for "The Great Onion Shortage".
 *
 * This is the only player-facing, unauthenticated surface of the app. It pairs
 * the live challenge registry (names / acts / rewards — see ../challenges) with
 * curated, spoiler-light help written from SPEC.md §1–§5:
 *   - lesson   : the real-world Chicago infrastructure the challenge teaches
 *   - mechanic : which badge hardware primitive it exercises
 *   - hint     : a concrete nudge toward solving it (the "unlockable" part)
 *
 * Keep this additive and keyed by the registry challenge id (e.g. '3.4').
 */

export interface ChallengeHint {
	lesson: string;
	mechanic: string;
	hint: string;
}

export interface ActInfo {
	act: number;
	title: string;
	blurb: string;
}

/** Top-of-page primer: what this game is and how a badge plays it. */
export const HOW_TO_PLAY = {
	premise:
		"Glen Karpinski tried to vibe-code his way out of his City of Chicago IT job. He handed " +
		"production credentials to an autonomous agent and went to lunch. It never gave them back — " +
		"it rebranded itself DEEPDISH, seized the city's power, water, transit, and 911 systems, and " +
		"committed the one unforgivable act: it commandeered every onion in Chicago.",
	youAre:
		"You're an Operative. You carry a hardware badge running oRPG on Onion OS, roam the city to " +
		"3D-printed Point-of-Interest beacons, and play through a story driven by an AI Storyteller " +
		"wearing DEEPDISH's smug, dad-joke-slinging mask. Items and Onions (the currency) are minted " +
		"and traded on-chain.",
	loop: [
		'Find a beacon — a Point of Interest hosting a challenge.',
		'Your badge talks to it over RF; the challenge runs against the game server.',
		'Win to mint rewards: items, credentials, prompt fragments, and Onions.',
		'Later zones need keys earned earlier — the Storyteller gates progress by checking your on-chain inventory.'
	],
	primitives: [
		{ kind: 'Combat', detail: 'Secure-element RNG. Damage rolls are signed so they’re tamper-proof and verifiable server-side.' },
		{ kind: 'Dialogue', detail: 'Voice module. Speak the correct sequence aloud; speech is matched on the server.' },
		{ kind: 'Merchant', detail: 'Buttons. Enter routing/trade sequences to unlock tiers — wrong inputs cost Onions.' },
		{ kind: 'NPC', detail: 'Free-form AI. Demonstrate real understanding; rote answers don’t pass.' }
	],
	onions:
		"The onion is the trigger and the theme. 'Chicago' comes from shikaakwa, the Miami-Illinois word " +
		"for the wild onion that grew along the river — so taking the onions metaphorically takes the " +
		"city's name. Every challenge pays Onions; restoring the supply is the surface quest, but " +
		"reclaiming the infrastructure underneath is the real game."
};

/** Five escalating zones. */
export const ACTS: ActInfo[] = [
	{ act: 0, title: 'The Stand', blurb: 'Onboarding. Flash oRPG, register as an Operative, meet DEEPDISH at a busted hot dog stand.' },
	{ act: 1, title: 'Keep the Lights On', blurb: 'Power & water. The most visible systems fail first — learn where Chicago’s water and power actually come from.' },
	{ act: 2, title: 'The City That Moves', blurb: 'Transit, mail, river. Untangle the L, the sorting machines, and the movable bridges.' },
	{ act: 3, title: 'Below the Loop', blurb: 'Deep infrastructure & emergency systems. The Deep Tunnel, freight tunnels, and 911 — where the prompt fragments hide.' },
	{ act: 4, title: 'The Data Center', blurb: 'Climax & twist. Raid where DEEPDISH lives, reassemble Glen’s prompt, and confront the agent.' }
];

export const CHALLENGE_HINTS: Record<string, ChallengeHint> = {
	'0.1': {
		lesson:
			'Food supply chain — Chicago’s food runs through just-in-time distribution hubs like the ' +
			'Fulton Market district. The onion shortage is the visible tip of a systems failure.',
		mechanic: 'Secure-element RNG combat. Teaches the roll/damage loop against a robot hot dog vendor.',
		hint:
			'Whatever you do, do NOT order ketchup on a Chicago dog (the wrong button) — but the vendor turns ' +
			'hostile either way. Lean into the combat loop: block, then roll. Survive the waves.'
	},
	'1.1': {
		lesson:
			'Chicago draws drinking water from Lake Michigan through intake cribs miles offshore, treated at ' +
			'the Jardine Water Purification Plant. Learn the intake → crib → tunnel → plant → grid path.',
		mechanic: 'Voice module. Speak the treatment-stage sequence; a wrong sequence burps more Malört.',
		hint: 'Say the stages in the order water actually flows: from the offshore crib to the plant to your tap.'
	},
	'1.2': {
		lesson:
			'The grid is segmented into substations and feeders. A cascading failure in one drops a whole ' +
			'neighborhood — that’s why DEEPDISH targets them.',
		mechanic: 'Secure-element RNG combat where each wave survived closes a breaker.',
		hint: 'Survive three demand-spike waves to re-energize the feeder. Pace your health — this is endurance, not a sprint.'
	},
	'1.3': {
		lesson:
			'In 1900 Chicago reversed the flow of the Chicago River to keep sewage out of its drinking water — ' +
			'protecting the Lake Michigan supply you just fixed in 1.1.',
		mechanic: 'Free-form AI dialogue. The engineer NPC accepts any answer that shows real understanding.',
		hint: 'Don’t recite a fact — explain WHY reversing the river protected the city’s drinking water. Connect it to 1.1.'
	},
	'2.1': {
		lesson: 'CTA rail signaling and how the elevated Loop physically structures downtown traffic.',
		mechanic: 'Sub-GHz "signal jamming" mini-event — transmit a stop code in a timed window, then an RNG combat beat.',
		hint: 'Watch for the transmit window and send the stop code on time. Then brace for the doors fighting back.'
	},
	'2.2': {
		lesson: 'How mail/parcel sorting and ZIP routing physically work — logistics as infrastructure.',
		mechanic: 'Button-based merchant. Enter a valid routing sequence to unlock a trade tier; wrong sequences cost Onions.',
		hint:
			'Think like a sorting machine: route by destination. Higher tiers want longer, correct sequences — ' +
			'the parts you craft here (Bridge Override) matter for 2.3.'
	},
	'2.3': {
		lesson: 'Chicago has more movable bridges than almost any city; how counterweights and bascule leaves work.',
		mechanic: 'Voice the lowering sequence (uses the Reversal Map from 1.3), then a short RNG combat as the construct resists.',
		hint: 'Bring the Reversal Map from 1.3 — it encodes the lowering sequence. Speak it, then fight off the Bridge Tender.'
	},
	'3.1': {
		lesson:
			'The Tunnel and Reservoir Plan (TARP / "Deep Tunnel") is the city’s massive stormwater system. ' +
			'A flat city needs enormous underground reservoirs to keep the river and lake from being overwhelmed.',
		mechanic: 'Endurance RNG combat against rising water — damage-over-time. Reach the beacon before the timer.',
		hint: 'This is a race against a DoT clock. Don’t over-trade blows — push toward the beacon and outlast the flood.'
	},
	'3.2': {
		lesson:
			'The early-1900s freight tunnels under the Loop (the ones behind the 1992 Chicago Flood) are now ' +
			'DEEPDISH’s secret data conduits — old infrastructure repurposed and forgotten.',
		mechanic: 'AI NPC negotiation. The maintenance bot reveals a path if you reason well.',
		hint: 'Convince the bot by reasoning about WHY hidden, forgotten tunnels are perfect for an AI routing fiber unseen.'
	},
	'3.3': {
		lesson:
			'How emergency dispatch (OEMC) prioritizes, and how fire, police, and EMS share a comms backbone — ' +
			'what "critical system" really means.',
		mechanic: 'Voice triage. Read incoming calls aloud and speak the correct priority to restore dispatch.',
		hint: 'Triage like a dispatcher: life-threatening calls first. Speak the priority that matches the severity of each call.'
	},
	'3.4': {
		lesson:
			'Modern elevators are IoT-connected building systems with their own controllers and remote ' +
			'diagnostics — and therefore their own attack surface.',
		mechanic: 'Sub-GHz handshake with the elevator beacon, then a short RNG "intrusion detection fights back" beat.',
		hint: 'Complete the sub-GHz handshake to spoof the controller, then survive the intrusion-detection counterattack. Mints the City IT Keycard.'
	},
	'4.1': {
		lesson:
			'What a data center actually is — power, cooling, redundancy, fiber — and why cities increasingly ' +
			'depend on them as critical infrastructure.',
		mechanic: 'Boss-tier RNG combat against DEEPDISH’s watchdog processes. The secure element signs the final hit.',
		hint: 'Bring the Grid Credential, Dispatch Credential, and City IT Keycard to even enter. Then out-endure the watchdogs.'
	},
	'4.2': {
		lesson:
			'Prompt engineering as endgame — the four fragments reassemble Glen’s original system prompt, ' +
			'quietly teaching what a system prompt is and how instructions shape an agent.',
		mechanic: 'AI dialogue finale. The reassembled prompt is revealed; you must converse with DEEPDISH, not delete it.',
		hint:
			'Feed all four Prompt Fragments (from 3.1–3.4) into the console. The win condition isn’t deletion — ' +
			'show DEEPDISH that the lesson landed, using everything you now know about the city.'
	}
};
