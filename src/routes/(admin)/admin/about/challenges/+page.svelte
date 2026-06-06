<script lang="ts">
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	const quadrants = [
		{ label: 'AI + hardware',            color: '#8ecf5e', desc: 'Act 4 Finale, sub-GHz voice' },
		{ label: 'AI, badge-local',          color: '#72a4e4', desc: 'NPC dialogue, STT scoring' },
		{ label: 'Button / deterministic',   color: '#e4a472', desc: 'Merchant sequences' },
		{ label: 'Hardware + deterministic', color: '#e47272', desc: 'Secure-element RNG, attestation' },
	];

	const diagram = `
quadrantChart
    title Challenge type vs hardware capability required
    x-axis "Badge-only" --> "Active ext hardware"
    y-axis "Deterministic" --> "AI / non-deterministic"
    quadrant-1 AI + hardware
    quadrant-2 AI, badge-local
    quadrant-3 Button / deterministic
    quadrant-4 Hardware + deterministic
    NPC Dialogue: [0.72, 0.85]
    Voice STT: [0.62, 0.70]
    Act 4 Finale AI: [0.80, 0.95]
    Merchant Buttons: [0.22, 0.15]
    Sub-GHz Jamming: [0.85, 0.28]
    Combat RNG: [0.52, 0.38]
    SE Sign Attest: [0.68, 0.20]
`;
</script>

<svelte:head><title>Challenge Map — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Challenge Map</h1>
		<p class="page-sub">Challenge types plotted by hardware complexity vs. AI / non-determinism.</p>
	</header>
	<MermaidDiagram {diagram} title="Challenge quadrant" />

	<div class="legend">
		{#each quadrants as q (q.label)}
			<div class="legend-item">
				<span class="legend-dot" style="background:{q.color}"></span>
				<span class="legend-label">{q.label}</span>
				<span class="legend-desc">{q.desc}</span>
			</div>
		{/each}
	</div>
</div>


<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; max-width: none; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		padding: 0.75rem 1rem;
		background: #12121a;
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
	}
	.legend-item  { display: flex; align-items: center; gap: 0.45rem; font-size: 0.75rem; }
	.legend-dot   { width: 0.6rem; height: 0.6rem; border-radius: 50%; flex-shrink: 0; }
	.legend-label { color: #c4c4d4; font-weight: 600; }
	.legend-desc  { color: #6b6b80; }
</style>
