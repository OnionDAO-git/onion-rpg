<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let howToPlay = $derived(data.howToPlay);

	// Group challenges by act for display.
	let byAct = $derived(
		data.acts.map((a) => ({
			...a,
			items: data.challenges.filter((c) => c.act === a.act)
		}))
	);

	const typeIcon: Record<string, string> = {
		combat: '⚔️',
		dialogue: '🎙️',
		merchant: '🪙',
		npc: '🤖'
	};
</script>

<svelte:head>
	<title>How to Play — ONION RPG</title>
	<meta
		name="description"
		content="The Great Onion Shortage — how to play Onion DAO's live-action infrastructure RPG, plus hints for every challenge."
	/>
</svelte:head>

<section class="hero">
	<h1>The Great Onion Shortage</h1>
	<p class="lede">{howToPlay.premise}</p>
	<p class="lede">{howToPlay.youAre}</p>
</section>

<section class="block">
	<h2>The loop</h2>
	<ol class="loop">
		{#each howToPlay.loop as step}<li>{step}</li>{/each}
	</ol>
</section>

<section class="block">
	<h2>Your badge’s four tricks</h2>
	<div class="prim-grid">
		{#each howToPlay.primitives as p}
			<div class="prim">
				<div class="prim-kind">{p.kind}</div>
				<div class="prim-detail">{p.detail}</div>
			</div>
		{/each}
	</div>
</section>

<section class="block">
	<h2>Why onions?</h2>
	<p class="muted">{howToPlay.onions}</p>
</section>

<section class="block">
	<h2>Challenges &amp; hints</h2>
	<p class="muted small">
		Stuck at a beacon? Each challenge below shows what it teaches and how it works. Open one for a
		concrete hint. 🧅
	</p>

	{#each byAct as act}
		{#if act.items.length}
			<div class="act">
				<div class="act-head">
					<span class="act-no">ACT {act.act}</span>
					<span class="act-title">{act.title}</span>
				</div>
				<p class="act-blurb">{act.blurb}</p>
				<div class="card-grid">
					{#each act.items as c}
						<a class="card" href="/guide/{c.id}">
							<div class="card-top">
								<span class="card-id">{c.id}</span>
								<span class="card-type">{typeIcon[c.type] ?? '•'} {c.type}</span>
							</div>
							<div class="card-name">{c.name}</div>
							<div class="card-lesson">{c.lesson}</div>
							<div class="card-foot">View hint →</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	{/each}
</section>

<style>
	h1 { font-size: 2rem; color: #8ecf5e; margin: 0 0 1rem; line-height: 1.15; }
	h2 { font-size: 1.05rem; color: #d4d4e0; margin: 0 0 0.75rem; }
	.hero { margin-bottom: 2.5rem; }
	.lede { color: #b4b4c8; line-height: 1.65; font-size: 0.92rem; margin: 0 0 0.9rem; }
	.muted { color: #8888a0; line-height: 1.6; font-size: 0.88rem; }
	.small { font-size: 0.82rem; }
	.block { margin-bottom: 2.5rem; }

	.loop { margin: 0; padding-left: 1.2rem; color: #b4b4c8; line-height: 1.7; font-size: 0.88rem; }
	.loop li { margin-bottom: 0.3rem; }

	.prim-grid {
		display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem;
	}
	.prim { border: 1px solid #1e1e2e; border-radius: 0.5rem; padding: 0.85rem; background: #0d0d15; }
	.prim-kind { color: #8ecf5e; font-weight: 700; font-size: 0.82rem; margin-bottom: 0.35rem; }
	.prim-detail { color: #9494aa; font-size: 0.78rem; line-height: 1.5; }

	.act { margin-bottom: 2rem; }
	.act-head { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.2rem; }
	.act-no { color: #6b6b80; font-size: 0.72rem; letter-spacing: 0.1em; }
	.act-title { color: #e4b95e; font-weight: 700; font-size: 0.95rem; }
	.act-blurb { color: #8888a0; font-size: 0.82rem; margin: 0 0 0.9rem; line-height: 1.55; }

	.card-grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.75rem;
	}
	.card {
		display: flex; flex-direction: column; gap: 0.4rem;
		border: 1px solid #1e1e2e; border-radius: 0.5rem; padding: 0.85rem;
		background: #0d0d15; text-decoration: none; transition: border-color 0.15s, transform 0.1s;
	}
	.card:hover { border-color: #4a7a3a; transform: translateY(-2px); }
	.card-top { display: flex; justify-content: space-between; font-size: 0.7rem; }
	.card-id { color: #6b6b80; }
	.card-type { color: #8888a0; text-transform: capitalize; }
	.card-name { color: #8ecf5e; font-weight: 700; font-size: 0.88rem; }
	.card-lesson {
		color: #9494aa; font-size: 0.76rem; line-height: 1.5;
		display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
	}
	.card-foot { color: #72a4e4; font-size: 0.74rem; margin-top: auto; }
</style>
