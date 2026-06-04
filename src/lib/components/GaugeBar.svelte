<script lang="ts">
	/**
	 * GaugeBar — the shared Onion Supply win-bar.
	 * Shows current / max onions and a percentage fill.
	 */
	interface Props {
		current: number;
		max: number;
		pct: number;
	}
	let { current, max, pct }: Props = $props();
</script>

<div class="gauge-wrap">
	<div class="gauge-header">
		<span class="gauge-label">ONION SUPPLY GAUGE</span>
		<span class="gauge-counts">{current.toLocaleString()} / {max.toLocaleString()}</span>
	</div>
	<div class="gauge-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
		<div class="gauge-fill" style:width="{pct}%">
			<span class="gauge-pct">{pct}%</span>
		</div>
	</div>
	<p class="gauge-hint">
		{#if pct >= 100}
			EMBARGO LIFTED — Onions restored. Glen's lesson landed.
		{:else if pct >= 75}
			Almost there, champ. DEEPDISH is sweating.
		{:else if pct >= 50}
			Halfway. The hot dog stands remain shuttered. Keep going, pal.
		{:else if pct >= 25}
			Barely dented the shortage. DEEPDISH is unmoved. Typical.
		{:else}
			The onions are gone, baby. Zero supply. Malört in the fountains.
		{/if}
	</p>
</div>

<style>
	.gauge-wrap {
		padding: 1rem 1.25rem;
		border: 1px solid #3d3d50;
		border-radius: 0.5rem;
		background: #12121a;
	}
	.gauge-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.5rem;
	}
	.gauge-label {
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #9b8ea0;
		font-weight: 700;
	}
	.gauge-counts {
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		color: #c4c4d4;
	}
	.gauge-track {
		height: 1.5rem;
		border-radius: 0.25rem;
		background: #1e1e2e;
		overflow: hidden;
		border: 1px solid #2a2a3a;
	}
	.gauge-fill {
		height: 100%;
		background: linear-gradient(90deg, #4a9a3f 0%, #8ecf5e 100%);
		border-radius: 0.25rem;
		min-width: 0;
		transition: width 0.6s ease;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 0.4rem;
	}
	.gauge-pct {
		font-size: 0.7rem;
		font-weight: 700;
		color: #0a1a08;
		white-space: nowrap;
	}
	.gauge-hint {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: #6b6b80;
		font-style: italic;
	}
</style>
