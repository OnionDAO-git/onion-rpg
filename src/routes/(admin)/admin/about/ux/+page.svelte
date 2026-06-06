<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const diagram = `
journey
    title Operative journey through The Great Onion Shortage
    section Onboarding
      Flash oRPG to badge: 5: Operative
      Discover hot dog stand beacon: 4: Operative
      Fight Vienna Bob — Ketchup Gauntlet: 3: Operative, DEEPDISH
      Earn Encased Meat Mk.I and 50 Onions: 5: Operative
    section Act 1 Keep the Lights On
      Voice-match water treatment stages: 3: Operative
      Survive 3 substation combat waves: 4: Operative
      Convince old engineer NPC via AI dialogue: 4: Operative, DEEPDISH
    section Act 2 The City That Moves
      Sub-GHz stop-code plus combat on the L: 3: Operative
      Button-combo trades at sorting machine: 4: Operative
      Movable bridge standoff — Bascule: 3: Operative, DEEPDISH
    section Act 3 Below the Loop
      Deep Tunnel descent — prompt fragment 1: 4: Operative
      Freight tunnels — fragment 2: 4: Operative
      911 center blackout — fragment 3: 3: Operative, DEEPDISH
      Elevator hack — fragment 4: 4: Operative
    section Act 4 The Data Center
      Reassemble Glen full system prompt: 5: Operative
      Confront DEEPDISH — twist reveal: 5: Operative, DEEPDISH
      Onions restored to Chicago: 5: Operative, Chicago
`;
</script>

<svelte:head><title>Player Journey — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Player Journey</h1>
		<p class="page-sub">User-experience journey across all five acts from badge flash to onion restoration.</p>
	</header>
	<MermaidDiagram {diagram} title="Player journey" />
</div>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
</style>
