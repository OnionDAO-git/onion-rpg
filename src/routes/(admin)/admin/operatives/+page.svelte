<script lang="ts">
	/**
	 * Operative Roster — full list with act/HP/registration status.
	 * Clicking a row navigates to ?id=<id> which loads inventory + attempts.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { TableColumn } from '$lib/components/DataTable.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { AdminOperative } from '$lib/server/admin/queries';

	let { data } = $props();
	let { operatives, selectedId, detail } = $derived(data);

	// Filter by act from query param
	let actFilter = $state(page.url.searchParams.get('act') ?? '');

	let filtered = $derived(
		actFilter !== '' && actFilter !== null
			? operatives.filter((o: AdminOperative) => String(o.act) === actFilter)
			: operatives
	);

	function fmtDate(v: unknown): string {
		if (!v) return '—';
		try {
			return new Date(String(v)).toLocaleString('en-US', {
				month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit',
			});
		} catch { return String(v); }
	}

	const columns: TableColumn[] = [
		{ key: 'username',   label: 'Username',    format: (v) => v ? String(v) : '(anon)' },
		{ key: 'callsign',   label: 'Callsign',    format: (v) => v ? String(v) : '—' },
		{ key: 'act',        label: 'Act',         align: 'center' },
		{ key: 'hp',         label: 'HP',          align: 'right' },
		{
			key: 'registered',
			label: 'Reg.',
			badge: true,
			format: (v) => v ? 'registered' : 'false',
		},
		{ key: 'lastSeenAt', label: 'Last Seen',   format: fmtDate },
		{ key: 'hardwareId', label: 'HW ID',       format: (v) => String(v).slice(0, 12) + '…' },
	];

	function selectRow(row: AdminOperative) {
		goto(`?id=${row.id}`, { replaceState: false, noScroll: true });
	}

	function clearSelection() {
		goto('?', { replaceState: false, noScroll: true });
	}

	// Find the selected operative object for the header
	let selectedOp = $derived(
		selectedId ? operatives.find((o: AdminOperative) => o.id === selectedId) ?? null : null
	);

	// Inventory kind colours
	function kindAccent(kind: string): string {
		if (kind === 'credential')     return 'kind-cred';
		if (kind === 'prompt_fragment') return 'kind-frag';
		return 'kind-item';
	}
</script>

<svelte:head>
	<title>Operatives — ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">Operative Roster</h1>
		<p class="page-sub">{filtered.length} operative{filtered.length !== 1 ? 's' : ''} shown</p>
	</header>

	<!-- Act filter -->
	<div class="filters">
		<span class="filter-label">Filter by act:</span>
		{#each ['', '0', '1', '2', '3', '4'] as act (act)}
			<button
				class="filter-btn"
				class:filter-active={actFilter === act}
				onclick={() => { actFilter = act; }}
			>
				{act === '' ? 'All' : `Act ${act}`}
			</button>
		{/each}
	</div>

	<!-- Detail panel when a row is selected -->
	{#if selectedOp && detail}
		<div class="detail-panel">
			<div class="detail-header">
				<div class="detail-id">
					<span class="detail-name">{selectedOp.username ?? '(anon)'}</span>
					{#if selectedOp.callsign}
						<span class="detail-callsign">"{selectedOp.callsign}"</span>
					{/if}
					<StatusBadge status={selectedOp.registered ? 'registered' : 'false'} />
				</div>
				<button class="detail-close" onclick={clearSelection} aria-label="close">✕</button>
			</div>

			<div class="detail-meta">
				<span>Act <strong>{selectedOp.act}</strong></span>
				<span>HP <strong>{selectedOp.hp}</strong></span>
				<span>Last seen <strong>{fmtDate(selectedOp.lastSeenAt)}</strong></span>
				<span class="hw-id"><code>{selectedOp.hardwareId}</code></span>
			</div>

			<!-- Inventory -->
			<h3 class="detail-section-title">Inventory ({detail.inventory.length} items)</h3>
			{#if detail.inventory.length}
				<ul class="inv-list">
					{#each detail.inventory as item (item.catalogId)}
						<li class="inv-item {kindAccent(item.kind)}">
							<span class="inv-catalog">{item.catalogId}</span>
							<span class="inv-kind">{item.kind.replace('_', ' ')}</span>
							{#if item.qty > 1}<span class="inv-qty">×{item.qty}</span>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-hint">Empty inventory. Not a single hot dog to their name.</p>
			{/if}

			<!-- Attempts -->
			<h3 class="detail-section-title">Recent Attempts ({detail.attempts.length})</h3>
			{#if detail.attempts.length}
				<table class="attempts-table">
					<thead>
						<tr>
							<th>Challenge</th>
							<th>Status</th>
							<th>When</th>
						</tr>
					</thead>
					<tbody>
						{#each detail.attempts as a (a.id)}
							<tr>
								<td>{a.challengeId}</td>
								<td><StatusBadge status={a.status} /></td>
								<td>{fmtDate(a.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty-hint">No attempts logged yet.</p>
			{/if}
		</div>
	{/if}

	<!-- Main roster table -->
	<div class="table-card">
		<DataTable
			rows={filtered}
			{columns}
			onRowClick={selectRow}
			emptyMessage="No operatives yet. Badges not on the field."
		/>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 1100px; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }

	/* Filters */
	.filters {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.filter-label {
		font-size: 0.7rem;
		color: #6b6b80;
		letter-spacing: 0.08em;
	}
	.filter-btn {
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		background: #1e1e2e;
		border: 1px solid #2a2a3a;
		color: #8888a0;
		cursor: pointer;
	}
	.filter-btn:hover { background: #25253a; color: #c4c4d4; }
	.filter-active    { background: #121e10; border-color: #4a7a3a; color: #8ecf5e; }

	/* Detail panel */
	.detail-panel {
		border: 1px solid #3a3a5a;
		border-radius: 0.5rem;
		background: #0f0f1a;
		padding: 1.1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.detail-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}
	.detail-id    { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.detail-name  { font-size: 1rem; font-weight: 700; color: #c4c4d4; }
	.detail-callsign { font-size: 0.85rem; color: #8888a0; font-style: italic; }
	.detail-close {
		background: none; border: none; color: #6b6b80; cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.4rem;
	}
	.detail-close:hover { color: #c4c4d4; }
	.detail-meta {
		display: flex;
		gap: 1.25rem;
		font-size: 0.78rem;
		color: #8888a0;
		flex-wrap: wrap;
	}
	.detail-meta strong { color: #c4c4d4; }
	.hw-id code { font-family: inherit; font-size: 0.72rem; color: #72a4e4; }

	.detail-section-title {
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #6b6b80;
		margin: 0.25rem 0 0;
	}

	/* Inventory list */
	.inv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.inv-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.6rem;
		border-radius: 0.3rem;
		font-size: 0.72rem;
		border: 1px solid transparent;
	}
	.kind-item  { background: #1a2030; border-color: #2a3050; color: #9ab0d0; }
	.kind-cred  { background: #1a3020; border-color: #2a5030; color: #6ad0a0; }
	.kind-frag  { background: #30201a; border-color: #50302a; color: #d0a06a; }
	.inv-catalog { font-weight: 600; }
	.inv-kind   { font-size: 0.6rem; opacity: 0.65; }
	.inv-qty    { font-size: 0.68rem; opacity: 0.7; }

	/* Attempts table */
	.attempts-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
	.attempts-table th {
		text-align: left; padding: 0.3rem 0.6rem;
		font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
		color: #6b6b80; border-bottom: 1px solid #2a2a3a;
	}
	.attempts-table td {
		padding: 0.35rem 0.6rem; color: #c4c4d4;
		border-bottom: 1px solid #1e1e2e;
	}
	.attempts-table tr:last-child td { border-bottom: none; }

	.empty-hint { font-size: 0.75rem; color: #6b6b80; font-style: italic; margin: 0; }

	/* Table card */
	.table-card { border: 1px solid #2a2a3a; border-radius: 0.5rem; background: #12121a; overflow: hidden; }
</style>
