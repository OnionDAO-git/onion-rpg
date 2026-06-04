<script lang="ts">
	/**
	 * Beacon Fleet — shows all registered POI beacons with online/offline
	 * status, challenge assignment, landmark, and source (hardware|sim).
	 */
	import DataTable from '$lib/components/DataTable.svelte';
	import type { TableColumn } from '$lib/components/DataTable.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { AdminBeacon } from '$lib/server/admin/queries';

	let { data } = $props();
	let { beacons } = $derived(data);

	// Split online vs offline for the top-level quick view
	let online = $derived(beacons.filter((b: AdminBeacon) => b.online));
	let offline = $derived(beacons.filter((b: AdminBeacon) => !b.online));

	// Column definitions for the DataTable
	const columns: TableColumn[] = [
		{ key: 'name',        label: 'Name' },
		{ key: 'challengeId', label: 'Challenge', format: (v) => v ? String(v) : '—' },
		{ key: 'landmark',    label: 'Landmark',  format: (v) => v ? String(v) : '—' },
		{ key: 'source',      label: 'Source',    badge: true },
		{
			key: 'online',
			label: 'Status',
			badge: true,
			format: (v) => v ? 'online' : 'offline',
		},
		{ key: 'espnowMac',   label: 'ESP-NOW MAC', format: (v) => v ? String(v) : '—' },
		{ key: 'lastSeenAt',  label: 'Last Seen',   format: fmtDate },
	];

	function fmtDate(v: unknown): string {
		if (!v) return '—';
		try {
			return new Date(String(v)).toLocaleString('en-US', {
				month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit',
			});
		} catch {
			return String(v);
		}
	}

	// Selected beacon for the detail panel
	let selected = $state<AdminBeacon | null>(null);
</script>

<svelte:head>
	<title>Beacon Fleet — ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">Beacon Fleet</h1>
		<p class="page-sub">
			{online.length} online &nbsp;·&nbsp; {offline.length} offline &nbsp;·&nbsp; {beacons.length} total
		</p>
	</header>

	<!-- Status summary pills -->
	<div class="status-bar">
		{#each beacons as b (b.id)}
			<button
				class="beacon-pill"
				class:pill-online={b.online}
				class:pill-offline={!b.online}
				class:pill-selected={selected?.id === b.id}
				onclick={() => selected = selected?.id === b.id ? null : b}
				title="{b.name} — {b.online ? 'ONLINE' : 'OFFLINE'}"
			>
				{b.name}
			</button>
		{:else}
			<p class="no-beacons">No beacons registered yet. Deploy some hardware, champ.</p>
		{/each}
	</div>

	<!-- Detail panel for selected beacon -->
	{#if selected}
		<div class="detail-panel">
			<div class="detail-header">
				<span class="detail-name">{selected.name}</span>
				<StatusBadge status={selected.online ? 'online' : 'offline'} />
				<button class="detail-close" onclick={() => selected = null} aria-label="close">✕</button>
			</div>
			<dl class="detail-grid">
				<dt>ID</dt>              <dd><code>{selected.id}</code></dd>
				<dt>Challenge</dt>       <dd>{selected.challengeId ?? '—'}</dd>
				<dt>Landmark</dt>        <dd>{selected.landmark ?? '—'}</dd>
				<dt>Source</dt>          <dd><StatusBadge status={selected.source} /></dd>
				<dt>ESP-NOW MAC</dt>     <dd><code>{selected.espnowMac ?? '—'}</code></dd>
				<dt>Coordinates</dt>     <dd>
					{#if selected.lat !== null && selected.lon !== null}
						{selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
					{:else}
						—
					{/if}
				</dd>
				<dt>Last seen</dt>       <dd>{fmtDate(selected.lastSeenAt)}</dd>
			</dl>
		</div>
	{/if}

	<!-- Full table -->
	<section class="section">
		<h2 class="section-title">All Beacons</h2>
		<div class="table-card">
			<DataTable
				rows={beacons}
				{columns}
				onRowClick={(row) => { selected = row; }}
				emptyMessage="No beacons yet. Flash the firmware and register a beacon."
			/>
		</div>
	</section>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 1100px;
	}
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }
	.section-title {
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #6b6b80;
		margin: 0 0 0.5rem;
	}
	.section { display: flex; flex-direction: column; }

	/* Status bar */
	.status-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
	.no-beacons {
		font-size: 0.78rem;
		color: #6b6b80;
		font-style: italic;
	}
	.beacon-pill {
		padding: 0.25rem 0.65rem;
		border-radius: 9999px;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		background: none;
		transition: opacity 0.15s;
	}
	.pill-online  { background: #1a3a1a; color: #72e472; border-color: #2a5a2a; }
	.pill-offline { background: #3a1a1a; color: #a06060; border-color: #5a2a2a; }
	.pill-selected { outline: 2px solid #8ecf5e; outline-offset: 2px; }

	/* Detail panel */
	.detail-panel {
		border: 1px solid #3a3a5a;
		border-radius: 0.5rem;
		background: #0f0f1a;
		padding: 1rem 1.25rem;
	}
	.detail-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.detail-name {
		font-size: 1rem;
		font-weight: 700;
		color: #c4c4d4;
		flex: 1;
	}
	.detail-close {
		background: none;
		border: none;
		color: #6b6b80;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.2rem 0.4rem;
	}
	.detail-close:hover { color: #c4c4d4; }
	.detail-grid {
		display: grid;
		grid-template-columns: 9rem 1fr;
		gap: 0.35rem 0.75rem;
		font-size: 0.78rem;
	}
	dt { color: #6b6b80; }
	dd { color: #c4c4d4; margin: 0; }
	code { font-family: inherit; color: #72a4e4; font-size: 0.75rem; }

	/* Table card */
	.table-card {
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
		background: #12121a;
		overflow: hidden;
	}
</style>
