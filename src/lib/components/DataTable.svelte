<script lang="ts">
	/**
	 * DataTable — a generic admin data table with column definitions.
	 *
	 * Usage:
	 *   <DataTable rows={beacons} columns={[
	 *     { key: 'name', label: 'Name' },
	 *     { key: 'online', label: 'Status', format: (v) => v ? 'online' : 'offline' },
	 *   ]} />
	 *
	 * Rows can be any object type. Columns reference string keys; type safety is
	 * handled at the call-site via the key literals.
	 */
	import StatusBadge from './StatusBadge.svelte';

	export interface TableColumn {
		key: string;
		label: string;
		/** Transform the cell value to a display string. */
		format?: (value: unknown, row: Record<string, unknown>) => string;
		/** When true the cell is rendered as a StatusBadge. */
		badge?: boolean;
		/** Text alignment (default 'left'). */
		align?: 'left' | 'right' | 'center';
	}

	interface Props {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		rows: any[];
		columns: TableColumn[];
		/** Optional row click handler — passes the row object. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		onRowClick?: (row: any) => void;
		emptyMessage?: string;
	}

	let {
		rows,
		columns,
		onRowClick,
		emptyMessage = 'No data yet, champ.'
	}: Props = $props();

	function cellValue(col: TableColumn, row: Record<string, unknown>): string {
		const raw = row[col.key];
		if (col.format) return col.format(raw, row);
		if (raw === null || raw === undefined) return '—';
		return String(raw);
	}
</script>

<div class="table-wrap">
	{#if rows.length === 0}
		<p class="empty">{emptyMessage}</p>
	{:else}
		<table>
			<thead>
				<tr>
					{#each columns as col (col.key)}
						<th class="align-{col.align ?? 'left'}">{col.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i (i)}
					<tr
						role={onRowClick ? 'button' : undefined}
						class:clickable={!!onRowClick}
						onclick={() => onRowClick?.(row)}
						onkeydown={(e) => e.key === 'Enter' && onRowClick?.(row)}
						tabindex={onRowClick ? 0 : undefined}
					>
						{#each columns as col (col.key)}
							<td class="align-{col.align ?? 'left'}">
								{#if col.badge}
									<StatusBadge status={cellValue(col, row)} />
								{:else}
									{cellValue(col, row)}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	thead th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #6b6b80;
		border-bottom: 1px solid #2a2a3a;
		white-space: nowrap;
	}
	tbody tr {
		border-bottom: 1px solid #1e1e2e;
	}
	tbody tr:last-child {
		border-bottom: none;
	}
	tbody tr.clickable {
		cursor: pointer;
	}
	tbody tr.clickable:hover {
		background: #1a1a28;
	}
	td {
		padding: 0.55rem 0.75rem;
		color: #c4c4d4;
		vertical-align: middle;
		font-variant-numeric: tabular-nums;
		max-width: 22ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.align-right  { text-align: right; }
	.align-center { text-align: center; }
	.empty {
		padding: 2rem;
		text-align: center;
		color: #6b6b80;
		font-style: italic;
	}
</style>
