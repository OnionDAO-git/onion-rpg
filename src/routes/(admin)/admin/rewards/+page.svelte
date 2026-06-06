<script lang="ts">
	/**
	 * Reward Audit — the Onion DAO request ledger.
	 * Shows every onion reward request with its Onion DAO status,
	 * amount, operative, and Onion DAO request ID for cross-referencing.
	 *
	 * Filter by status via query param or the quick-filter buttons.
	 */
	import { goto } from '$app/navigation';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { TableColumn } from '$lib/components/DataTable.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { AdminRewardRow } from '$lib/server/admin/queries';

	let { data } = $props();
	let { rewards, statusFilter } = $derived(data);

	// Per-status counts available for future use (e.g. filter pill badges)
	function statusCounts(): Record<string, number> {
		const c: Record<string, number> = {};
		let total = 0;
		for (const r of rewards as AdminRewardRow[]) {
			c[r.status] = (c[r.status] ?? 0) + 1;
			total++;
		}
		c[''] = total;
		return c;
	}

	// Total onions for displayed set
	let totalShown = $derived(
		(rewards as AdminRewardRow[]).reduce((s, r) => s + r.amount, 0)
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

	const STATUS_FILTERS = [
		'',
		'pending',
		'processing',
		'awaiting_badge_signature',
		'completed',
		'denied',
		'failed'
	] as const;
	const STATUS_LABELS: Record<string, string> = {
		'': 'All',
		pending: 'Pending',
		processing: 'Processing',
		awaiting_badge_signature: 'Awaiting Badge',
		completed: 'Completed',
		denied: 'Denied',
		failed: 'Failed'
	};

	function setFilter(s: string) {
		if (s) {
			goto(`?status=${s}`, { replaceState: false, noScroll: true });
		} else {
			goto('?', { replaceState: false, noScroll: true });
		}
	}

	const columns: TableColumn[] = [
		{ key: 'username',       label: 'Operative',    format: (v) => v ? String(v) : '(anon)' },
		{ key: 'type',           label: 'Type' },
		{ key: 'amount',         label: 'Onions',       align: 'right' },
		{ key: 'status',         label: 'Status',       badge: true },
		{ key: 'externalId',     label: 'External ID',  format: (v) => String(v).slice(0, 16) + '…' },
		{ key: 'onionRequestId', label: 'DAO Req ID',   format: (v) => v ? String(v).slice(0, 12) + '…' : '—' },
		{ key: 'createdAt',      label: 'Created',      format: fmtDate },
		{ key: 'updatedAt',      label: 'Updated',      format: fmtDate },
	];

	// Selected row for quick-copy detail
	let selected = $state<AdminRewardRow | null>(null);
</script>

<svelte:head>
	<title>Reward Audit — ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">Reward Audit</h1>
		<p class="page-sub">
			Onion DAO API request ledger — every challenge reward, every status.
		</p>
	</header>

	<!-- Status filter + totals -->
	<div class="toolbar">
		<div class="filters">
			{#each STATUS_FILTERS as s (s)}
				<button
					class="filter-btn"
					class:filter-active={statusFilter === s}
					onclick={() => setFilter(s)}
				>
					{STATUS_LABELS[s]}
				</button>
			{/each}
		</div>
		<div class="total-tag">
			{(rewards as AdminRewardRow[]).length} rows &nbsp;·&nbsp;
			<strong>{totalShown.toLocaleString()} onions</strong>
		</div>
	</div>

	<!-- Detail panel for selected row -->
	{#if selected}
		<div class="detail-panel">
			<div class="detail-header">
				<span class="detail-title">Reward detail</span>
				<StatusBadge status={selected.status} />
				<button class="detail-close" onclick={() => { selected = null; }} aria-label="close">✕</button>
			</div>
			<dl class="detail-grid">
				<dt>ID</dt>            <dd><code>{selected.id}</code></dd>
				<dt>Operative</dt>     <dd>{selected.username ?? '(anon)'} <span class="op-id">({selected.operativeId.slice(0,8)}…)</span></dd>
				<dt>Type</dt>          <dd>{selected.type}</dd>
				<dt>Amount</dt>        <dd class="amount-big">{selected.amount.toLocaleString()} onions</dd>
				<dt>External ID</dt>   <dd><code>{selected.externalId}</code></dd>
				<dt>DAO Request ID</dt><dd><code>{selected.onionRequestId ?? '—'}</code></dd>
				<dt>Created</dt>       <dd>{fmtDate(selected.createdAt)}</dd>
				<dt>Updated</dt>       <dd>{fmtDate(selected.updatedAt)}</dd>
			</dl>
		</div>
	{/if}

	<!-- Ledger table -->
	<div class="table-card">
		<DataTable
			rows={rewards as AdminRewardRow[]}
			{columns}
			onRowClick={(row) => { selected = row; }}
			emptyMessage="No rewards yet. Nobody has beaten a challenge."
		/>
	</div>

	<!-- Empty-state note when filter active -->
	{#if statusFilter && (rewards as AdminRewardRow[]).length === 0}
		<p class="filter-empty">
			No {statusFilter} rewards found. That's either great or terrible, champ.
		</p>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 1100px; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.filters { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.filter-btn {
		padding: 0.2rem 0.65rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		background: #1e1e2e;
		border: 1px solid #2a2a3a;
		color: #8888a0;
		cursor: pointer;
	}
	.filter-btn:hover  { background: #25253a; color: #c4c4d4; }
	.filter-active     { background: #121e10; border-color: #4a7a3a; color: #8ecf5e; }

	.total-tag {
		font-size: 0.75rem;
		color: #6b6b80;
	}
	.total-tag strong { color: #8ecf5e; }

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
	.detail-title { font-size: 0.9rem; font-weight: 700; color: #c4c4d4; flex: 1; }
	.detail-close {
		background: none; border: none; color: #6b6b80; cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.4rem;
	}
	.detail-close:hover { color: #c4c4d4; }
	.detail-grid {
		display: grid;
		grid-template-columns: 10rem 1fr;
		gap: 0.35rem 0.75rem;
		font-size: 0.78rem;
	}
	dt { color: #6b6b80; }
	dd { color: #c4c4d4; margin: 0; }
	code { font-family: inherit; color: #72a4e4; font-size: 0.72rem; word-break: break-all; }
	.op-id { font-size: 0.68rem; color: #4a4a60; }
	.amount-big { color: #8ecf5e; font-size: 0.95rem; font-weight: 700; }

	/* Table card */
	.table-card { border: 1px solid #2a2a3a; border-radius: 0.5rem; background: #12121a; overflow: hidden; }

	.filter-empty { font-size: 0.78rem; color: #6b6b80; font-style: italic; text-align: center; padding: 1rem; }
</style>
