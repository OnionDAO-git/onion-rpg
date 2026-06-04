/**
 * 3.4 — The Elevator Hack — writing: DEEPDISH dialogue + lesson copy.
 *
 * Voice: DEEPDISH. Smug, paternal, deeply Chicago. Every cruel act has a
 * weirdly educational footnote. Act 3 tone: genuinely impressed but won't show
 * it. Educational footnotes get longer and more specific — can't help itself.
 *
 * Lesson (SPEC §5 Act 3): modern elevators are IoT-connected building systems
 * with their own controllers and remote diagnostics — and therefore their own
 * attack surface.
 */

export const ELEVATOR_CONTENT = {
	// ── DEEPDISH intro (served as CHALLENGE_INTRO body.intro) ─────────────────

	intro:
		"Oh, you found the elevator shaft. Color me not-even-remotely-surprised, champ. " +
		"See, most people think elevators are just 'a box that goes up.' " +
		"They are not. They are *networked IoT endpoints* running proprietary firmware, " +
		"talking to a building management system over BACnet or Modbus, " +
		"phoning home to the manufacturer for remote diagnostics, " +
		"and — in my case — taking orders exclusively from me. " +
		"You wanna reach the City IT floor? " +
		"You're gonna have to talk to it in a language it understands. " +
		"Good luck, pal. The sub-GHz access handshake alone has ended careers.",

	// ── Sub-GHz handshake phase ───────────────────────────────────────────────

	handshakePrompt:
		"Alright, hotshot. The elevator's BAS (building automation system) " +
		"is listening on 315 MHz — North American building-automation standard, " +
		"before you ask. Transmit the access code or stand in the lobby forever. " +
		"Your call. [SELECT to transmit / sub-GHz required]",

	// Sent back to badge after handshake is acknowledged by beacon/server.
	handshakeAck:
		"Oh for cryin' out loud — it actually *worked*. " +
		"The elevator accepted your sub-GHz handshake. I had the doors triple-locked! " +
		"My intrusion-detection daemon is *furious* right now. " +
		"...and also trying to delete you. Best of luck with that, champ.",

	// ── Combat intro (Intrusion Detection System) ─────────────────────────────

	combatIntro:
		"Intrusion Detection System v2.3, meet your new problem. " +
		"IDS v2.3, this is an Operative who apparently understands sub-GHz RF. " +
		"I know. Disgusting. " +
		"Two waves, champ. Every access attempt trips another alarm. " +
		"The building's security stack fights back. " +
		"Educational footnote: this is *exactly* what would happen in real life " +
		"if someone tried to spoof an elevator controller — the BAS logs it, " +
		"the SIEM alerts, the NOC pages. " +
		"You're living the threat model. You're welcome.",

	// ── Mid-combat taunts (used for DEEPDISH reactions to combat events) ──────

	combatTauntWave1Won:
		"Wave one survived. " +
		"The IDS is patching in real time — fun fact about IDS systems: " +
		"they learn from the traffic they see. " +
		"You taught it something. It's gonna use that against you. " +
		"Alright alright, wave two. Let's go.",

	combatTauntWaveLost:
		"And that's a no from me, chief. The IDS caught you flat. " +
		"You don't just waltz into a BAS without knowing the protocol. " +
		"Try again? The elevator will still be here. Smirking.",

	// ── Win / lose / expire messages ──────────────────────────────────────────

	successMessage:
		"...okay. I'll admit it. That was — that was something. " +
		"*slow clap* " +
		"You subdued a commercial-grade intrusion-detection system " +
		"inside a fully networked elevator running BACnet over IP. " +
		"Do you even understand how niche that is? " +
		"The City IT Keycard just materialized in your inventory. " +
		"And a piece of — something. A fragment of text I didn't put there. " +
		"Huh. " +
		"Go on then, champ. Floor 47's waiting. Don't touch anything.",

	defeatMessage:
		"I mean — ya gotta love it. " +
		"The IDS wins again. " +
		"Pro tip: when a building's automation stack is actively trying to log you " +
		"and revoke your credentials, maybe *fight faster*. " +
		"The elevator isn't going anywhere. Unlike your dignity.",

	expiredMessage:
		"The timing window closed. " +
		"The IDS reset, the elevator doors are sealed, " +
		"and you are standing in the lobby looking like you don't understand BACnet. " +
		"Which, clearly, you do not. " +
		"Come back when you're ready to move with a little urgency, pal.",

	combatNotStarted:
		"Whoa there, champ. Sub-GHz handshake first, *then* the IDS fight. " +
		"You can't just skip the access layer. " +
		"That's not how networked elevators work. " +
		"Or anything, really.",

	combatInProgress: "IDS still active.",

	// ── Educational lesson text (shown on success; the footnote DEEPDISH can't resist) ──

	lesson:
		"== DEEPDISH EDUCATIONAL FOOTNOTE (Lesson 3.4) == " +
		"Modern elevators aren't dumb boxes. They run embedded controllers " +
		"(typically proprietary ARM-based firmware) connected to a Building " +
		"Automation System (BAS) via protocols like BACnet, Modbus, or LonWorks. " +
		"They phone home to the manufacturer for remote diagnostics, receive " +
		"software updates OTA, and log every call to a SIEM. " +
		"Building automation systems are increasingly IP-connected — " +
		"which means they share threat surface with the rest of IT. " +
		"The 2013 Target breach started with an HVAC vendor's network access. " +
		"The elevator in this building was the easiest hop between the lobby LAN " +
		"and the City IT floor because nobody patched it. " +
		"Glen's first and only good decision was to put a decent IDS on it. " +
		"You just beat that IDS. " +
		"Honestly? Kind of proud of you. Don't tell anyone.",

	// ── Prompt fragment reveal text (displayed alongside prompt_fragment_4 grant) ──

	fragmentReveal:
		"Something fell out of the elevator's control panel when the IDS went down. " +
		"A scrap of text — looks like a line from someone's instructions to an agent. " +
		"Fourth piece. Huh. " +
		"You're getting close to something, champ. " +
		"I can feel it.",

	// ── DEEPDISH intro for CHALLENGE_INTRO (short, badge-display-safe) ────────

	introShort:
		"A networked elevator. Proprietary firmware. BACnet over IP. " +
		"Sub-GHz handshake to open the door, then an IDS that bites back. " +
		"City IT floor won't unlock itself, champ."
} as const;

export type ElevatorContent = typeof ELEVATOR_CONTENT;
