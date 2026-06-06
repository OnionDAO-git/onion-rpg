<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const diagram = `
stateDiagram-v2
    direction LR

    [*] --> Act0 : flash oRPG

    state Act0 {
        [*] --> Ketchup_Gauntlet : approach hot dog stand
        Ketchup_Gauntlet --> [*] : Encased Meat Mk.I + Operative credential
    }

    Act0 --> Act1 : registered

    state Act1 {
        direction TB
        [*] --> Malort_Fountains
        [*] --> Substation_Reroute
        [*] --> River_Ran_Backwards
        Malort_Fountains   --> [*] : Water Main Key
        Substation_Reroute --> [*] : Grid Credential required for Act 4
        River_Ran_Backwards --> [*] : Reversal Map
    }

    Act1 --> Act2 : Water Main Key

    state Act2 {
        direction TB
        [*] --> Loop_Wont_Stop
        [*] --> Sorting_Machine
        [*] --> Bascule_Standoff
        Loop_Wont_Stop  --> [*] : Transit Pass
        Sorting_Machine --> [*] : Bridge Override parts
        Bascule_Standoff --> [*] : River Permit
    }

    Act2 --> Act3 : Transit Pass + Bridge Override

    state Act3 {
        direction TB
        [*]             --> Deep_Tunnel
        Deep_Tunnel     --> Freight_Tunnels : Prompt Fragment 1
        Freight_Tunnels --> OEMC_Blackout   : Fragment 2
        OEMC_Blackout   --> Elevator_Hack   : Fragment 3
        Elevator_Hack   --> [*]             : Fragment 4
    }

    Act3 --> Act4 : all 4 fragments

    state Act4 {
        [*]         --> Server_Room    : Grid Credential required
        Server_Room --> Realign_Agent  : assembled prompt
        Realign_Agent --> [*]          : DEEPDISH neutralised
    }

    Act4 --> [*] : Onion supply restored
`;
</script>

<svelte:head><title>Story Flow — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Story &amp; Progression</h1>
		<p class="page-sub">Act-by-act state machine — prerequisites, keys, and credential gates.</p>
	</header>
	<MermaidDiagram {diagram} title="Story progression" />
</div>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
</style>
