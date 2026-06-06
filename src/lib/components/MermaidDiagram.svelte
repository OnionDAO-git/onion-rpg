<script lang="ts">
	import { onMount } from 'svelte';

	let { diagram, title = '' }: { diagram: string; title?: string } = $props();

	let svg = $state('');
	let error = $state('');
	let fullscreen = $state(false);
	let uid = Math.random().toString(36).slice(2);

	onMount(() => {
		// Mermaid may leave a hidden render container behind on parse errors.
		// Clean it up when this component unmounts so it doesn't persist across navigation.
		return () => {
			document.getElementById(`mermaid-${uid}`)?.remove();
			document.getElementById(`d${uid}`)?.remove();
		};
	});

	onMount(async () => {
		try {
			const mermaid = (await import('mermaid')).default;
			// Initialize once per page load — repeated calls are safe but noisy.
			mermaid.initialize({
				startOnLoad: false,
				theme: 'dark',
				themeVariables: {
					background:          '#0d0d15',
					mainBkg:             '#12121a',
					primaryColor:        '#1a2e18',
					primaryTextColor:    '#c4c4d4',
					primaryBorderColor:  '#4a7a3a',
					lineColor:           '#4a4a60',
					secondaryColor:      '#1e1e2e',
					tertiaryColor:       '#16161f',
					edgeLabelBackground: '#12121a',
					nodeBorder:          '#4a7a3a',
					clusterBkg:          '#12121a',
					titleColor:          '#8ecf5e',
					actorBkg:            '#1a2e18',
					actorBorder:         '#4a7a3a',
					actorTextColor:      '#c4c4d4',
					actorLineColor:      '#4a4a60',
					signalColor:         '#8ecf5e',
					signalTextColor:     '#c4c4d4',
					labelBoxBkgColor:    '#1e1e2e',
					labelBoxBorderColor: '#4a4a60',
					labelTextColor:      '#c4c4d4',
					loopTextColor:       '#8888a0',
					noteBkgColor:        '#1e1e2e',
					noteBorderColor:     '#4a4a60',
					noteTextColor:       '#c4c4d4',
					activationBkgColor:  '#1a2e18',
					sequenceNumberColor: '#8ecf5e',
					fontFamily:          "ui-monospace, 'Cascadia Code', monospace",
				},
				flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: false },
				sequence:  { useMaxWidth: false },
				journey:   { useMaxWidth: false },
				state:     { useMaxWidth: false },
			});
			const result = await mermaid.render(`mermaid-${uid}`, diagram.trim());
			svg = result.svg;
		} catch (e) {
			error = String(e);
		}
	});
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') fullscreen = false; }} />

<div class="diagram-outer" class:fs={fullscreen}>
	<div class="diagram-toolbar">
		{#if title}<span class="diagram-title">{title}</span>{/if}
		<button class="fs-btn" onclick={() => { fullscreen = !fullscreen; }} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
			{fullscreen ? '⤓' : '⤢'}
		</button>
	</div>

	{#if svg}
		<div class="diagram-scroll">
			<figure class="mermaid-wrap" aria-label={title || 'diagram'}>
				{@html svg}
			</figure>
		</div>
	{:else if error}
		<pre class="mermaid-error">{error}</pre>
	{:else}
		<div class="mermaid-loading">Rendering diagram…</div>
	{/if}
</div>

<style>
	.diagram-outer {
		display: flex;
		flex-direction: column;
		background: #0d0d15;
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.diagram-outer.fs {
		position: fixed;
		inset: 0;
		z-index: 1000;
		border-radius: 0;
		border: none;
	}

	.diagram-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border-bottom: 1px solid #1e1e2e;
		background: #0d0d15;
		flex-shrink: 0;
	}
	.diagram-title {
		font-size: 0.72rem;
		color: #4a4a60;
		flex: 1;
	}
	.fs-btn {
		background: none;
		border: 1px solid #2a2a3a;
		border-radius: 0.25rem;
		color: #6b6b80;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.1rem 0.35rem;
		line-height: 1;
	}
	.fs-btn:hover { color: #8ecf5e; border-color: #4a7a3a; }

	.diagram-scroll {
		overflow: auto;
		flex: 1;
		padding: 1.25rem;
		/* fullscreen gets the full viewport height minus toolbar */
		min-height: 480px;
	}
	.fs .diagram-scroll {
		min-height: 0;
		height: calc(100vh - 34px);
	}

	.mermaid-wrap {
		margin: 0;
		display: flex;
		justify-content: center;
		min-width: max-content;
	}
	.mermaid-wrap :global(svg) {
		height: auto;
		max-width: none;
		min-width: 600px;
	}
	.fs .mermaid-wrap :global(svg) {
		min-width: unset;
		max-width: 100%;
		height: calc(100vh - 34px - 2.5rem);
	}

	.mermaid-error {
		padding: 1rem;
		background: #1a0a0a;
		border-top: 1px solid #5a2a2a;
		color: #e07070;
		font-size: 0.72rem;
		overflow-x: auto;
		white-space: pre-wrap;
		margin: 0;
	}
	.mermaid-loading {
		padding: 3rem;
		text-align: center;
		color: #4a4a60;
		font-size: 0.78rem;
	}
</style>
