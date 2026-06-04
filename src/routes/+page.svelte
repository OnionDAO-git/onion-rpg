<script lang="ts">
	// Root landing — redirects to the admin ops console.
	// The real machine-facing surface is /api/*; this page is for humans.
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	if (browser) goto('/admin', { replaceState: true });
</script>

<svelte:head>
	<title>ONION RPG — Game Server</title>
</svelte:head>

<main style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:0.5rem;">
	<span style="font-size:3rem;">🧅</span>
	<p style="color:#8ecf5e;font-family:monospace;font-size:1rem;font-weight:700;">ONION RPG</p>
	<p style="color:#6b6b80;font-size:0.8rem;font-family:monospace;">
		<a href="/admin" style="color:#72a4e4;text-decoration:none;">→ Ops Console</a>
	</p>
</main>
