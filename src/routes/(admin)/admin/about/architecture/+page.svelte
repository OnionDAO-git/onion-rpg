<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const diagram = `
graph TD
    subgraph Badge["ESP32-S3 Badge (oRPG.lua)"]
        LUA["oRPG.lua · main loop"]
        NET["lib/net.lua · ESP-NOW framing"]
        CAPS["lib/caps.lua · capability shim"]
        SCREENS["screens/*.lua · one per challenge"]
    end

    subgraph Beacon["ESP32-C3 Beacon (beacon/)"]
        HELLO["BEACON_HELLO · 5s broadcast"]
        RELAY_FW["HTTPS bridge · POST /api/relay"]
    end

    subgraph Server["Game Server (src/ — Bun + SvelteKit)"]
        RELAY_API["POST /api/relay · dispatch()"]
        ENGINE["engine/index.ts · orchestration"]
        COMBAT["engine/combat.ts · RNG sessions"]
        INV["engine/inventory.ts · items + credentials"]
        AI["ai/storyteller.ts · DEEPDISH"]
        STT["ai/stt.ts · voice scoring"]
        CHALLENGES["challenges/registry.ts · 13 impls"]
        DB[("Postgres · 10 tables")]
        ONION_CLIENT["onion/client.ts · DAO API client"]
    end

    subgraph OnionDAO["Onion DAO (oniondao.dev)"]
        ONION_API["Public API"]
        LUA_REG["Lua Script Registry"]
        MQTT_P["MQTT push to badge"]
    end

    LUA --> NET --> CAPS
    CAPS -->|ESP-NOW unicast| Beacon
    HELLO -->|broadcast| LUA
    RELAY_FW -->|HTTPS POST| RELAY_API
    RELAY_API --> ENGINE
    ENGINE --> COMBAT
    ENGINE --> INV
    ENGINE --> CHALLENGES
    ENGINE --> AI
    ENGINE --> STT
    ENGINE --- DB
    ENGINE --> ONION_CLIENT --> ONION_API
    ONION_API -->|webhook POST| RELAY_API
    ONION_API --> LUA_REG --> MQTT_P -->|OTA push| LUA
`;
</script>

<svelte:head><title>Architecture — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Architecture Overview</h1>
		<p class="page-sub">All four components and how they connect — badge, beacon, server, Onion DAO.</p>
	</header>
	<MermaidDiagram {diagram} title="Architecture Overview" />
</div>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
</style>
