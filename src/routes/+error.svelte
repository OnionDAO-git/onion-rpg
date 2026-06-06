<script lang="ts">
	import { page } from '$app/state';

	let status = $derived(page.status);
	let message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<svelte:head>
	<title>{status} — ONION RPG</title>
</svelte:head>

<main class="err">
	<span class="onion">🧅</span>
	<h1>{status}</h1>
	<p class="msg">{message}</p>
	<div class="links">
		<a href="/">← Player Guide</a>
		{#if status === 403 || status === 401}
			<a href="/admin">Ops Console</a>
		{/if}
	</div>
</main>

<style>
	.err {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 0.6rem; min-height: 100dvh; text-align: center;
		font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
		background: #0a0a12; color: #c4c4d4; padding: 2rem;
	}
	.onion { font-size: 3rem; }
	h1 { margin: 0; font-size: 2rem; color: #8ecf5e; }
	.msg { margin: 0; color: #8888a0; max-width: 28rem; font-size: 0.9rem; line-height: 1.5; }
	.links { display: flex; gap: 1.25rem; margin-top: 0.75rem; }
	.links a { color: #72a4e4; text-decoration: none; font-size: 0.85rem; }
	.links a:hover { color: #9cc2f0; }
</style>
