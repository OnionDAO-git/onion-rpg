<svelte:head>
	<title>About — ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">About / Architecture</h1>
		<p class="page-sub">System diagrams for ONION RPG — The Great Onion Shortage.</p>
	</header>

	<div class="featured-grid">
		{#each featured as d (d.href)}
			<a href={d.href} class="diagram-card featured-card">
				<span class="card-icon">{d.icon}</span>
				<div>
					<div class="card-title">{d.title}</div>
					<div class="card-desc">{d.desc}</div>
				</div>
				<span class="card-arrow">→</span>
			</a>
		{/each}
	</div>

	<h2 class="section-label">Architecture Diagrams</h2>
	<div class="diagram-grid">
		{#each diagrams as d (d.href)}
			<a href={d.href} class="diagram-card">
				<span class="card-icon">{d.icon}</span>
				<div>
					<div class="card-title">{d.title}</div>
					<div class="card-desc">{d.desc}</div>
				</div>
				<span class="card-arrow">→</span>
			</a>
		{/each}
	</div>
</div>

<script lang="ts">
	const featured = [
		{
			href:  '/admin/about/kanban',
			icon:  '🗂️',
			title: 'Project Kanban',
			desc:  'Track challenges, story, and infrastructure. Claim items with delivery commitments.',
			accent: true,
		},
	];

	const diagrams = [
		{
			href:  '/admin/about/architecture',
			icon:  '🏗️',
			title: 'Architecture Overview',
			desc:  'All four components and how they connect — badge, beacon, server, Onion DAO.',
		},
		{
			href:  '/admin/about/device-flow',
			icon:  '📡',
			title: 'Device Perspective',
			desc:  'ESP-NOW frame sequence from BEACON_HELLO through reward grant.',
		},
		{
			href:  '/admin/about/wire-protocol',
			icon:  '🔌',
			title: 'Wire Protocol',
			desc:  '8-byte binary frame header layout and chunking model.',
		},
		{
			href:  '/admin/about/server-flow',
			icon:  '⚙️',
			title: 'Server Dispatch',
			desc:  'POST /api/relay → dispatch → validate → rewards pipeline.',
		},
		{
			href:  '/admin/about/ux',
			icon:  '🎮',
			title: 'Player Journey',
			desc:  'User-experience journey across all five acts.',
		},
		{
			href:  '/admin/about/story',
			icon:  '📖',
			title: 'Story & Progression',
			desc:  'Act-by-act state machine — prerequisites, keys, and credentials.',
		},
		{
			href:  '/admin/about/challenges',
			icon:  '🗺️',
			title: 'Challenge Map',
			desc:  'Challenge types plotted by hardware complexity vs. AI involvement.',
		},
	];
</script>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.5rem; max-width: 900px; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }

	.featured-grid { display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-bottom: 0.25rem; }
	.featured-card { background: #141e12 !important; border-color: #4a7a3a !important; }
	.featured-card .card-title { color: #8ecf5e !important; }
	.section-label { font-size: 0.72rem; font-weight: 600; color: #4a4a60; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; }

	.diagram-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.75rem;
	}

	.diagram-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.9rem 1rem;
		background: #12121a;
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
		text-decoration: none;
		transition: border-color 0.15s, background 0.15s;
	}
	.diagram-card:hover {
		border-color: #4a7a3a;
		background: #141e12;
	}
	.card-icon  { font-size: 1.4rem; flex-shrink: 0; }
	.card-title { font-size: 0.82rem; font-weight: 700; color: #c4c4d4; margin-bottom: 0.2rem; }
	.card-desc  { font-size: 0.72rem; color: #6b6b80; line-height: 1.4; }
	.card-arrow { margin-left: auto; color: #4a4a60; font-size: 0.9rem; flex-shrink: 0; }
	.diagram-card:hover .card-arrow { color: #8ecf5e; }
</style>
