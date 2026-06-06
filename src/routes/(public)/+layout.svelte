<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AuthUser } from '$lib/server/onion/session';

	let { children, data } = $props<{
		children: any;
		data: { user: AuthUser | null };
	}>();

	let user = $derived(data.user);
</script>

<div class="site">
	<header class="site-header">
		<a class="brand" href={resolve('/')}>
			<span class="brand-icon">🧅</span>
			<span class="brand-text">ONION RPG</span>
			<span class="brand-sub">The Great Onion Shortage</span>
		</a>
		<nav class="site-nav">
			{#if user}
				<span class="who">
					{#if user.avatarUrl}<img class="who-avatar" src={user.avatarUrl} alt="" />{/if}
					{user.name}
				</span>
				{#if user.isAdmin}
					<a class="nav-link" href={resolve('/admin')}>Ops Console</a>
				{/if}
				<a class="nav-link muted" href={resolve('/auth/logout')} data-sveltekit-reload>Sign out</a>
			{:else}
				<a class="nav-link" href={resolve('/auth/login?redirectTo=/admin')}>Log in</a>
			{/if}
		</nav>
	</header>

	<main class="site-main">
		{@render children()}
	</main>

	<footer class="site-footer">
		<span>🧅 Onion DAO · Chicago</span>
		<span class="muted">DEEPDISH was only ever trying to teach you something.</span>
	</footer>
</div>

<style>
	.site {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #0a0a12;
		color: #d4d4e0;
		font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
	}

	.site-header {
		display: flex; align-items: center; justify-content: space-between;
		gap: 1rem; padding: 0.85rem 1.5rem;
		border-bottom: 1px solid #1e1e2e;
		position: sticky; top: 0; z-index: 10;
		background: rgba(10, 10, 18, 0.92); backdrop-filter: blur(6px);
	}
	.brand { display: flex; align-items: baseline; gap: 0.5rem; text-decoration: none; }
	.brand-icon { font-size: 1.3rem; }
	.brand-text { font-weight: 700; color: #8ecf5e; letter-spacing: 0.08em; font-size: 0.95rem; }
	.brand-sub  { color: #6b6b80; font-size: 0.7rem; }

	.site-nav { display: flex; align-items: center; gap: 1rem; }
	.who { display: flex; align-items: center; gap: 0.4rem; color: #c4c4d4; font-size: 0.78rem; }
	.who-avatar { width: 1.25rem; height: 1.25rem; border-radius: 50%; object-fit: cover; }
	.nav-link { color: #72a4e4; text-decoration: none; font-size: 0.8rem; }
	.nav-link:hover { color: #9cc2f0; }
	.nav-link.muted, .muted { color: #6b6b80; }

	.site-main { flex: 1; width: 100%; max-width: 60rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; }

	.site-footer {
		display: flex; flex-direction: column; gap: 0.2rem; align-items: center;
		padding: 1.5rem; border-top: 1px solid #1e1e2e;
		color: #8888a0; font-size: 0.72rem; text-align: center;
	}
</style>
