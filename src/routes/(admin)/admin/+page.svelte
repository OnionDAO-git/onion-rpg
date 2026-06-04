<script lang="ts">
	/**
	 * Admin dashboard home — gauge, summary stats, quick-look at act progression.
	 */
	import GaugeBar from '$lib/components/GaugeBar.svelte';
	import StatCard from '$lib/components/StatCard.svelte';

	let { data } = $props();
	let { gauge, stats } = $derived(data);

	const acts = [0, 1, 2, 3, 4] as const;
	const actLabels: Record<number, string> = {
		0: 'The Stand',
		1: 'Keep the Lights On',
		2: 'The City That Moves',
		3: 'Below the Loop',
		4: 'The Data Center',
	};
</script>

<svelte:head>
	<title>Dashboard — ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">Operations Dashboard</h1>
		<p class="page-sub">
			"Every system runs on onions, champ. Don't let anybody tell you different." — DEEPDISH
		</p>
	</header>

	<!-- Supply Gauge (full width) -->
	<section class="section">
		<GaugeBar current={gauge.current} max={gauge.max} pct={gauge.pct} />
	</section>

	<!-- Summary stats row -->
	<section class="stats-row">
		<StatCard
			label="Operatives"
			value={stats.totalOperatives}
			sub="{stats.registeredOperatives} registered"
			accent="blue"
		/>
		<StatCard
			label="Beacons Online"
			value="{stats.onlineBeacons} / {stats.totalBeacons}"
			sub="POI beacons"
			accent={stats.onlineBeacons === stats.totalBeacons && stats.totalBeacons > 0 ? 'green' : 'yellow'}
		/>
		<StatCard
			label="Pending Rewards"
			value={stats.pendingRewards}
			sub="awaiting Onion DAO callback"
			accent={stats.pendingRewards > 0 ? 'yellow' : 'green'}
		/>
		<StatCard
			label="Onions Awarded"
			value={stats.totalOnionsAwarded.toLocaleString()}
			sub="settled rewards"
			accent="green"
		/>
	</section>

	<!-- Act breakdown (static, no per-act DB query to keep load fast) -->
	<section class="section">
		<h2 class="section-title">Story Acts</h2>
		<div class="act-grid">
			{#each acts as act (act)}
				<div class="act-card">
					<div class="act-num">Act {act}</div>
					<div class="act-name">{actLabels[act]}</div>
					<a href="/admin/operatives?act={act}" class="act-link">operatives in act &rarr;</a>
				</div>
			{/each}
		</div>
	</section>

	<!-- Quick nav tiles -->
	<section class="section">
		<h2 class="section-title">Quick Jump</h2>
		<div class="quick-nav">
			<a href="/admin/beacons" class="qnav-tile">
				<span class="qnav-icon">📡</span>
				<span class="qnav-label">Beacon Fleet</span>
				<span class="qnav-hint">online/offline, challenge, landmark</span>
			</a>
			<a href="/admin/operatives" class="qnav-tile">
				<span class="qnav-icon">🪪</span>
				<span class="qnav-label">Operative Roster</span>
				<span class="qnav-hint">HP, act, inventory, progress</span>
			</a>
			<a href="/admin/storyteller" class="qnav-tile">
				<span class="qnav-icon">🤖</span>
				<span class="qnav-label">Storyteller Console</span>
				<span class="qnav-hint">DEEPDISH sessions + transcripts</span>
			</a>
			<a href="/admin/rewards" class="qnav-tile">
				<span class="qnav-icon">🪙</span>
				<span class="qnav-label">Reward Audit</span>
				<span class="qnav-hint">Onion DAO request ledger + status</span>
			</a>
		</div>
	</section>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
		max-width: 960px;
	}
	.page-header {
		border-bottom: 1px solid #2a2a3a;
		padding-bottom: 1rem;
	}
	.page-title {
		font-size: 1.4rem;
		font-weight: 700;
		color: #8ecf5e;
		margin: 0;
	}
	.page-sub {
		margin: 0.35rem 0 0;
		font-size: 0.78rem;
		color: #6b6b80;
		font-style: italic;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.section-title {
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #6b6b80;
		margin: 0;
	}

	/* Stats row */
	.stats-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.75rem;
	}

	/* Act grid */
	.act-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.75rem;
	}
	.act-card {
		padding: 0.75rem 1rem;
		border: 1px solid #2a2a3a;
		border-radius: 0.4rem;
		background: #12121a;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.act-num {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #4a4a60;
	}
	.act-name {
		font-size: 0.8rem;
		color: #c4c4d4;
		font-weight: 600;
	}
	.act-link {
		margin-top: 0.3rem;
		font-size: 0.68rem;
		color: #5a8a50;
		text-decoration: none;
	}
	.act-link:hover { color: #8ecf5e; text-decoration: underline; }

	/* Quick nav */
	.quick-nav {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.75rem;
	}
	.qnav-tile {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem 1.25rem;
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
		background: #12121a;
		text-decoration: none;
		transition: border-color 0.15s, background 0.15s;
	}
	.qnav-tile:hover {
		border-color: #4a6a4a;
		background: #151e12;
	}
	.qnav-icon { font-size: 1.25rem; }
	.qnav-label {
		font-size: 0.85rem;
		font-weight: 700;
		color: #c4c4d4;
	}
	.qnav-hint {
		font-size: 0.68rem;
		color: #6b6b80;
	}
</style>
