<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const diagram = `
flowchart LR
    subgraph Frame["Single ESP-NOW Frame (max 240 bytes)"]
        direction LR
        B0["byte 0 · MAGIC · 0x4F"]
        B1["byte 1 · VERSION · 0x01"]
        B2["byte 2 · MsgType · enum"]
        B3["byte 3 · flags · bit0=more-chunks"]
        B45["bytes 4-5 · msgId · u16 BE"]
        B6["byte 6 · seq · chunk index"]
        B7["byte 7 · total · chunk count"]
        B8N["bytes 8-N · JSON body · max 232 bytes"]
        B0 --- B1 --- B2 --- B3 --- B45 --- B6 --- B7 --- B8N
    end

    subgraph Chunking["Long-message chunking"]
        direction TB
        MSG["Full JSON message"]
        MSG --> C0["chunk seq=0 total=3"]
        MSG --> C1["chunk seq=1 total=3"]
        MSG --> C2["chunk seq=2 total=3 more=0"]
        C0 & C1 & C2 --> REASSEMBLER["Reassembler · collect, concat, JSON.parse"]
    end
`;

	const msgtypes = `
flowchart TD
    subgraph Discovery["Discovery and Identity 0x01-0x03"]
        T01["0x01 BEACON_HELLO"]
        T02["0x02 OPERATIVE_IDENTIFY"]
        T03["0x03 IDENTIFY_ACK"]
    end
    subgraph Lifecycle["Challenge Lifecycle 0x10-0x12"]
        T10["0x10 CHALLENGE_BEGIN"]
        T11["0x11 CHALLENGE_INTRO"]
        T12["0x12 CHALLENGE_RESULT"]
    end
    subgraph Combat["Combat / RNG 0x20-0x21"]
        T20["0x20 COMBAT_ROLL_REQUEST"]
        T21["0x21 COMBAT_ROLL_RESPONSE"]
    end
    subgraph Voice["Dialogue / Voice 0x30-0x31"]
        T30["0x30 VOICE_CAPTURE_SUBMIT"]
        T31["0x31 VOICE_RESULT"]
    end
    subgraph Merchant["Merchant / Buttons 0x40-0x41"]
        T40["0x40 MERCHANT_INPUT"]
        T41["0x41 MERCHANT_RESULT"]
    end
    subgraph NPC["NPC / AI 0x50-0x51"]
        T50["0x50 NPC_DIALOGUE_TURN"]
        T51["0x51 NPC_DIALOGUE_REPLY"]
    end
    subgraph Rewards["Rewards and State 0x60-0x61"]
        T60["0x60 REWARD_GRANT"]
        T61["0x61 PROGRESSION_STATE"]
    end
    subgraph Transport["Transport Control 0x70-0x71"]
        T70["0x70 ACK"]
        T71["0x71 ERROR"]
    end
`;
</script>

<svelte:head><title>Wire Protocol — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Wire Protocol</h1>
		<p class="page-sub">8-byte binary frame header, chunking model, and full MsgType table.</p>
	</header>
	<MermaidDiagram diagram={diagram} title="Frame layout" />
	<h2 class="section-title">MsgType table</h2>
	<MermaidDiagram diagram={msgtypes} title="MsgType table" />
</div>

<style>
	.page          { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header   { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back          { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover    { color: #8ecf5e; }
	.page-title    { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub      { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
	.section-title { font-size: 0.9rem; font-weight: 700; color: #c4c4d4; margin: 0; }
</style>
