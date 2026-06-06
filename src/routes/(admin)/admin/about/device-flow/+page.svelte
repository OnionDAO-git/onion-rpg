<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const diagram = `
sequenceDiagram
    participant B as Badge (oRPG.lua)
    participant BN as Beacon (ESP32-C3)
    participant S as Game Server
    participant DAO as Onion DAO

    BN-->>B: BEACON_HELLO (broadcast every 5s) challengeId + beaconId

    B->>BN: OPERATIVE_IDENTIFY hardwareId, onionId
    BN->>S: POST /api/relay {frames:[base64]}
    S-->>BN: IDENTIFY_ACK + progression snapshot
    BN-->>B: IDENTIFY_ACK

    B->>BN: CHALLENGE_BEGIN
    BN->>S: POST /api/relay
    S-->>BN: CHALLENGE_INTRO content, button map, combat params
    BN-->>B: CHALLENGE_INTRO

    Note over B,S: Challenge loop (combat example)
    B->>BN: COMBAT_ROLL_REQUEST action=roll, seRng?
    BN->>S: POST /api/relay
    S-->>BN: COMBAT_ROLL_RESPONSE enemyHp, wave, verdict
    BN-->>B: COMBAT_ROLL_RESPONSE

    alt challenge passed
        S-->>BN: REWARD_GRANT + PROGRESSION_STATE
        BN-->>B: REWARD_GRANT
        S-)DAO: POST /api/public/onions/requests (async)
        DAO-)S: POST /api/onion/callback (HMAC-verified)
    else challenge failed
        S-->>BN: CHALLENGE_RESULT passed=false, message
        BN-->>B: CHALLENGE_RESULT
    end
`;
</script>

<svelte:head><title>Device Flow — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Device Perspective</h1>
		<p class="page-sub">ESP-NOW frame sequence from BEACON_HELLO through reward grant.</p>
	</header>
	<MermaidDiagram {diagram} title="Device Flow" />
</div>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
</style>
