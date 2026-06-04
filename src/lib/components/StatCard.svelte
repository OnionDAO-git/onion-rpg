<script lang="ts">
	/**
	 * StatCard — a single metric tile for the dashboard summary row.
	 */
	interface Props {
		label: string;
		value: string | number;
		/** Optional sub-label shown below the value. */
		sub?: string;
		/** Optional accent colour: 'green' | 'yellow' | 'red' | 'blue' */
		accent?: 'green' | 'yellow' | 'red' | 'blue';
	}
	let { label, value, sub, accent = 'blue' }: Props = $props();
	const accentClass: Record<string, string> = {
		green: 'accent-green',
		yellow: 'accent-yellow',
		red: 'accent-red',
		blue: 'accent-blue'
	};
	let cls = $derived(accentClass[accent] ?? 'accent-blue');
</script>

<div class="stat-card {cls}">
	<span class="stat-label">{label}</span>
	<span class="stat-value">{value}</span>
	{#if sub}
		<span class="stat-sub">{sub}</span>
	{/if}
</div>

<style>
	.stat-card {
		padding: 1rem 1.25rem;
		border-radius: 0.5rem;
		border: 1px solid #2a2a3a;
		background: #12121a;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.stat-label {
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #6b6b80;
		font-weight: 600;
	}
	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.stat-sub {
		font-size: 0.7rem;
		color: #6b6b80;
	}
	/* accent left-border colours */
	.accent-green  { border-left: 3px solid #4a9a3f; }
	.accent-yellow { border-left: 3px solid #c4a020; }
	.accent-red    { border-left: 3px solid #9a3f3f; }
	.accent-blue   { border-left: 3px solid #3f6a9a; }
	/* value colour tints */
	.accent-green  .stat-value { color: #72e472; }
	.accent-yellow .stat-value { color: #e4c472; }
	.accent-red    .stat-value { color: #e47272; }
	.accent-blue   .stat-value { color: #72a4e4; }
</style>
