<script lang="ts">
	import { page } from '$app/state';
	import type { AuthUser } from '$lib/server/onion/session';

	let { children, data } = $props<{
		children: any;
		data: { user: AuthUser };
	}>();

	const navItems = [
		{ href: '/admin',             label: 'Dashboard',   icon: '🧅' },
		{ href: '/admin/beacons',     label: 'Beacons',     icon: '📡' },
		{ href: '/admin/operatives',  label: 'Operatives',  icon: '🪪'  },
		{ href: '/admin/storyteller', label: 'Storyteller', icon: '🤖' },
		{ href: '/admin/rewards',     label: 'Rewards',     icon: '🪙'  },
	] as const;

	let pathname = $derived(page.url.pathname);
	function isActive(href: string) {
		if (href === '/admin') return pathname === '/admin';
		return pathname.startsWith(href);
	}

	// The signed-in Onion DAO admin, pulled from the shared session cookie +
	// onion API (see (admin)/+layout.server.ts).
	let user = $derived(data.user);
	let menuOpen = $state(false);

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('') || '?';
	}
</script>

<div class="admin-shell">
	<!-- Sidebar nav -->
	<aside class="sidebar">
		<div class="sidebar-brand">
			<span class="brand-icon">🧅</span>
			<div>
				<div class="brand-name">ONION RPG</div>
				<div class="brand-sub">ops console</div>
			</div>
		</div>

		<nav>
			<ul>
				{#each navItems as item (item.href)}
					<li>
						<a href={item.href} class:active={isActive(item.href)}>
							<span class="nav-icon" aria-hidden="true">{item.icon}</span>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="sidebar-footer">
			<a class="guide-link" href="/">📖 Player Guide ↗</a>
			<span class="deepdish-tag">DEEPDISH v&infin;</span>
			<span class="version-value"><span class="version-label">VERSION</span> 2026-06-06</span>
		</div>
	</aside>

	<!-- Right column: topbar + content -->
	<div class="right-col">
		<!-- Topbar with signed-in admin -->
		<header class="topbar">
			<span class="topbar-spacer"></span>
			<div class="user-selector">
				<button
					class="user-btn"
					onclick={() => menuOpen = !menuOpen}
					aria-label="Account menu"
				>
					{#if user.avatarUrl}
						<img class="user-avatar img" src={user.avatarUrl} alt="" />
					{:else}
						<span class="user-avatar">{initials(user.name)}</span>
					{/if}
					<span class="user-name">{user.name}</span>
					<span class="user-caret">▾</span>
				</button>

				{#if menuOpen}
					<button class="user-backdrop" aria-label="Close menu" onclick={() => menuOpen = false}></button>
					<div class="user-dropdown">
						<div class="dropdown-header">
							Signed in{#if user.handle} as @{user.handle}{/if}
						</div>
						<div class="dropdown-meta">{user.email}</div>
						<div class="dropdown-sep"></div>
						<a class="dropdown-item muted" href="/auth/logout" data-sveltekit-reload>Sign out</a>
					</div>
				{/if}
			</div>
		</header>

		<!-- Main content area -->
		<main class="admin-main">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.admin-shell {
		display: flex;
		min-height: 100dvh;
		font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
	}

	/* ── Sidebar ─────────────────────────────────────────────────────────── */
	.sidebar {
		width: 13rem;
		flex-shrink: 0;
		background: #0d0d15;
		border-right: 1px solid #2a2a3a;
		display: flex;
		flex-direction: column;
		padding: 1rem 0;
		position: sticky;
		top: 0;
		height: 100dvh;
		overflow-y: auto;
		z-index: 10;
	}
	.sidebar-brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0 1rem 1.25rem;
		border-bottom: 1px solid #2a2a3a;
		margin-bottom: 0.75rem;
	}
	.brand-icon { font-size: 1.5rem; line-height: 1; }
	.brand-name { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em; color: #8ecf5e; }
	.brand-sub  { font-size: 0.6rem; color: #6b6b80; letter-spacing: 0.08em; text-transform: uppercase; }

	nav ul { list-style: none; margin: 0; padding: 0; }
	nav a {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.5rem 1rem; color: #8888a0; text-decoration: none;
		font-size: 0.78rem; border-left: 3px solid transparent;
		transition: color 0.15s, background 0.15s;
	}
	nav a:hover  { color: #c4c4d4; background: #1a1a28; }
	nav a.active { color: #8ecf5e; border-left-color: #8ecf5e; background: #121e10; }
	.nav-icon    { font-size: 0.95rem; width: 1.2rem; text-align: center; }

	.sidebar-footer {
		margin-top: auto; padding: 1rem;
		border-top: 1px solid #1e1e2e;
		display: flex; flex-direction: column; gap: 0.2rem;
	}
	.guide-link {
		font-size: 0.68rem; color: #72a4e4; text-decoration: none;
		margin-bottom: 0.4rem;
	}
	.guide-link:hover { color: #9cc2f0; }
	.deepdish-tag   { font-size: 0.65rem; color: #6b6b80; letter-spacing: 0.08em; }
	.version-label  { color: #6b6b80; letter-spacing: 0.1em; }
	.version-value  { font-size: 0.68rem; color: #8ecf5e; }

	/* ── Right column ────────────────────────────────────────────────────── */
	.right-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }

	/* ── Topbar ──────────────────────────────────────────────────────────── */
	.topbar {
		height: 2.5rem;
		border-bottom: 1px solid #1e1e2e;
		background: #0a0a12;
		display: flex;
		align-items: center;
		padding: 0 1.25rem;
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.topbar-spacer { flex: 1; }

	/* ── User selector ───────────────────────────────────────────────────── */
	.user-selector { position: relative; }

	.user-btn {
		display: flex; align-items: center; gap: 0.4rem;
		background: none; border: 1px solid #2a2a3a; border-radius: 9999px;
		padding: 0.2rem 0.6rem 0.2rem 0.3rem;
		cursor: pointer; color: #c4c4d4; font-family: inherit; font-size: 0.72rem;
		transition: border-color 0.15s;
	}
	.user-btn:hover       { border-color: #4a7a3a; }

	.user-avatar {
		width: 1.3rem; height: 1.3rem; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 0.55rem; font-weight: 700; color: #0d0d15; flex-shrink: 0;
		background: #8ecf5e;
	}
	.user-avatar.img  { object-fit: cover; background: #2a2a3a; }
	.user-name        { line-height: 1; }
	.user-caret       { font-size: 0.6rem; color: #6b6b80; margin-left: 0.1rem; }

	.user-backdrop {
		position: fixed; inset: 0; z-index: 30;
		background: none; border: none; padding: 0; cursor: default;
	}
	.user-dropdown {
		position: absolute; top: calc(100% + 0.4rem); right: 0;
		background: #12121a; border: 1px solid #2a2a3a; border-radius: 0.4rem;
		min-width: 14rem; box-shadow: 0 4px 16px rgba(0,0,0,0.5);
		z-index: 40; overflow: hidden;
	}
	.dropdown-header {
		padding: 0.4rem 0.75rem 0.1rem; font-size: 0.65rem; color: #4a4a60;
		text-transform: uppercase; letter-spacing: 0.08em;
	}
	.dropdown-meta {
		padding: 0 0.75rem 0.4rem; font-size: 0.68rem; color: #8888a0;
	}
	.dropdown-item {
		display: flex; align-items: center; gap: 0.5rem;
		width: 100%; padding: 0.45rem 0.75rem;
		background: none; border: none; color: #c4c4d4;
		font-size: 0.78rem; font-family: inherit; cursor: pointer; text-align: left;
		text-decoration: none;
	}
	.dropdown-item:hover  { background: #1e1e2e; }
	.dropdown-item.muted  { color: #6b6b80; font-size: 0.72rem; }
	.dropdown-sep { height: 1px; background: #1e1e2e; margin: 0.25rem 0; }

	/* ── Main ────────────────────────────────────────────────────────────── */
	.admin-main {
		flex: 1; min-width: 0;
		padding: 1.5rem 2rem;
		overflow-y: auto;
	}
</style>
