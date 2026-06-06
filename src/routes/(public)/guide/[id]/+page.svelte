<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let c = $derived(data.challenge);

	// The hint is the "unlockable" payload. Today it's free — reveal on click.
	// SEAM: gate this behind an Onion burn (createRequest type:'burn', then mark
	// unlocked per-user) when the festival economy is wired up. See
	// $lib/server/onion/client.ts createRequest().
	let revealed = $state(false);

	const typeIcon: Record<string, string> = {
		combat: '⚔️',
		dialogue: '🎙️',
		merchant: '🪙',
		npc: '🤖'
	};
</script>

<svelte:head>
	<title>{c.name} — Hint — ONION RPG</title>
</svelte:head>

<a class="back" href="/">← All challenges</a>

<header class="head">
	<div class="meta">
		<span class="id">Challenge {c.id}</span>
		<span class="type">{typeIcon[c.type] ?? '•'} {c.type}</span>
	</div>
	<h1>{c.name}</h1>
</header>

<section class="info">
	<h2>What it teaches</h2>
	<p>{c.lesson}</p>
</section>

<section class="info">
	<h2>How it works</h2>
	<p>{c.mechanic}</p>
</section>

{#if c.requires.length}
	<section class="info">
		<h2>You’ll need first</h2>
		<ul class="chips">
			{#each c.requires as r}<li class="chip req">{r}</li>{/each}
		</ul>
	</section>
{/if}

{#if c.rewards.length}
	<section class="info">
		<h2>Rewards</h2>
		<ul class="chips">
			{#each c.rewards as r}<li class="chip reward">{r.label}</li>{/each}
		</ul>
	</section>
{/if}

<section class="hint-box">
	<h2>🧅 Hint</h2>
	{#if revealed}
		<p class="hint">{c.hint}</p>
	{:else}
		<button class="reveal" onclick={() => (revealed = true)}>Reveal hint</button>
		<p class="hint-note">Free during the festival beta.</p>
	{/if}
</section>

<style>
	.back { color: #72a4e4; text-decoration: none; font-size: 0.8rem; }
	.back:hover { color: #9cc2f0; }

	.head { margin: 1rem 0 2rem; }
	.meta { display: flex; gap: 0.75rem; font-size: 0.74rem; margin-bottom: 0.4rem; }
	.id { color: #6b6b80; }
	.type { color: #8888a0; text-transform: capitalize; }
	h1 { font-size: 1.7rem; color: #8ecf5e; margin: 0; }

	.info { margin-bottom: 1.75rem; }
	.info h2 { font-size: 0.78rem; color: #6b6b80; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 0.5rem; }
	.info p { color: #b4b4c8; line-height: 1.65; font-size: 0.9rem; margin: 0; }

	.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; padding: 0; }
	.chip { font-size: 0.76rem; padding: 0.25rem 0.6rem; border-radius: 9999px; border: 1px solid #2a2a3a; }
	.chip.req { color: #e4b95e; border-color: #4a3f1e; background: #1a1610; }
	.chip.reward { color: #8ecf5e; border-color: #2a4a1e; background: #101a10; }

	.hint-box {
		margin-top: 2.5rem; border: 1px solid #2a4a1e; border-radius: 0.6rem;
		padding: 1.25rem; background: #0d150d;
	}
	.hint-box h2 { font-size: 0.95rem; color: #8ecf5e; margin: 0 0 0.75rem; }
	.hint { color: #c4d8b4; line-height: 1.7; font-size: 0.92rem; margin: 0; }
	.reveal {
		background: #1a2e12; color: #8ecf5e; border: 1px solid #4a7a3a;
		border-radius: 0.4rem; padding: 0.5rem 1rem; font-family: inherit;
		font-size: 0.82rem; cursor: pointer; transition: background 0.15s;
	}
	.reveal:hover { background: #25431a; }
	.hint-note { color: #6b6b80; font-size: 0.72rem; margin: 0.6rem 0 0; }
</style>
