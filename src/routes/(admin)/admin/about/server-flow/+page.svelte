<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const diagram = `
flowchart TD
    POST["POST /api/relay · Bearer: BEACON_API_KEY"] --> AUTH{auth check}
    AUTH -->|fail| E401["401 Unauthorized"]
    AUTH -->|pass| DECODE["decodeFrame / Reassembler"]

    DECODE --> TYPE{MsgType}

    TYPE -->|OPERATIVE_IDENTIFY| HID["handleIdentify · resolveOperative"]
    TYPE -->|CHALLENGE_BEGIN| HCB["handleChallengeBegin · canBegin + buildContext"]
    TYPE -->|COMBAT_ROLL_REQUEST| HCR["handleCombatRoll · openCombat / applyRoll"]
    TYPE -->|VOICE_CAPTURE_SUBMIT| HV["handleVoice · STT score"]
    TYPE -->|MERCHANT_INPUT| HM["handleMerchant · button validator"]
    TYPE -->|NPC_DIALOGUE_TURN| HND["handleNpcDialogue · npcTurn via DEEPDISH"]

    HCR --> ENGINE
    HV --> ENGINE
    HM --> ENGINE
    HND --> ENGINE
    HCB --> ENGINE

    ENGINE["engine/index.ts · submitChallenge"] --> VALIDATE["challenge.validate · per-challenge impl"]

    VALIDATE -->|passed| REWARDS["applyRewards · inventory + onions + gauge"]
    VALIDATE -->|ongoing| CONT["continued=true · ACK only"]
    VALIDATE -->|failed| FAIL["CHALLENGE_RESULT · passed=false"]

    REWARDS --> ENCODE["encodeResponse · chunk + base64"]
    CONT --> ENCODE
    FAIL --> ENCODE
    HID --> ENCODE
    ENCODE --> RESP["200 frames response"]
`;
</script>

<svelte:head><title>Server Dispatch — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Server Dispatch</h1>
		<p class="page-sub">POST /api/relay → dispatch → validate → rewards pipeline.</p>
	</header>
	<MermaidDiagram {diagram} title="Server dispatch" />
</div>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
</style>
