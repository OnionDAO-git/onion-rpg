<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import type { KanbanDev } from '$lib/shared/kanban-meta';

	let { children, data } = $props<{
		children: any;
		data: { allDevelopers: KanbanDev[]; currentDev: KanbanDev | null };
	}>();

	const navItems = [
		{ href: '/admin',             label: 'Dashboard',   icon: '🧅' },
		{ href: '/admin/beacons',     label: 'Beacons',     icon: '📡' },
		{ href: '/admin/operatives',  label: 'Operatives',  icon: '🪪'  },
		{ href: '/admin/storyteller', label: 'Storyteller', icon: '🤖' },
		{ href: '/admin/rewards',     label: 'Rewards',     icon: '🪙'  },
		{ href: '/admin/about',       label: 'About',       icon: '📐'  },
	] as const;

	let pathname = $derived(page.url.pathname);
	function isActive(href: string) {
		if (href === '/admin') return pathname === '/admin';
		return pathname.startsWith(href);
	}

	let devSelectOpen = $state(false);

	async function selectDev(devId: string) {
		devSelectOpen = false;
		await fetch('/api/dev-pref', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ devId }),
		});
		await invalidateAll();
	}

	let currentDev = $derived(data.currentDev);
	let allDevelopers = $derived(data.allDevelopers ?? []);
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
			<span class="deepdish-tag">DEEPDISH v&infin;</span>
			<span class="version-value"><span class="version-label">VERSION</span> 2026-06-06</span>
		</div>
	</aside>

	<!-- Right column: topbar + content -->
	<div class="right-col">
		<!-- Topbar with user selector -->
		<header class="topbar">
			<span class="topbar-spacer"></span>
			<div class="user-selector">
				<button
					class="user-btn"
					class:no-user={!currentDev}
					onclick={() => devSelectOpen = !devSelectOpen}
					aria-label="Select operative"
				>
					{#if currentDev}
						<span class="user-avatar" style="background:{currentDev.color}">{currentDev.initials}</span>
						<span class="user-name">{currentDev.name}</span>
					{:else}
						<span class="user-avatar anon">?</span>
						<span class="user-name muted">Select operative</span>
					{/if}
					<span class="user-caret">▾</span>
				</button>

				{#if devSelectOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="user-backdrop" onclick={() => devSelectOpen = false}></div>
					<div class="user-dropdown">
						<div class="dropdown-header">Playing as</div>
						{#each allDevelopers as dev (dev.id)}
							<button
								class="dropdown-item"
								class:active={currentDev?.id === dev.id}
								onclick={() => selectDev(dev.id)}
							>
								<span class="user-avatar sm" style="background:{dev.color}">{dev.initials}</span>
								{dev.name}
								{#if currentDev?.id === dev.id}<span class="checkmark">✓</span>{/if}
							</button>
						{/each}
						<div class="dropdown-sep"></div>
						<button class="dropdown-item muted" onclick={() => selectDev('')}>Sign out</button>
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
	.user-btn.no-user     { border-color: #2a2a3a; opacity: 0.7; }
	.user-btn:hover.no-user { opacity: 1; }

	.user-avatar {
		width: 1.3rem; height: 1.3rem; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 0.55rem; font-weight: 700; color: #0d0d15; flex-shrink: 0;
	}
	.user-avatar.anon { background: #2a2a3a; color: #6b6b80; }
	.user-avatar.sm   { width: 1.1rem; height: 1.1rem; font-size: 0.5rem; }
	.user-name        { line-height: 1; }
	.user-name.muted  { color: #6b6b80; }
	.user-caret       { font-size: 0.6rem; color: #6b6b80; margin-left: 0.1rem; }

	.user-backdrop {
		position: fixed; inset: 0; z-index: 30;
	}
	.user-dropdown {
		position: absolute; top: calc(100% + 0.4rem); right: 0;
		background: #12121a; border: 1px solid #2a2a3a; border-radius: 0.4rem;
		min-width: 14rem; box-shadow: 0 4px 16px rgba(0,0,0,0.5);
		z-index: 40; overflow: hidden;
	}
	.dropdown-header {
		padding: 0.4rem 0.75rem; font-size: 0.65rem; color: #4a4a60;
		text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #1e1e2e;
	}
	.dropdown-item {
		display: flex; align-items: center; gap: 0.5rem;
		width: 100%; padding: 0.45rem 0.75rem;
		background: none; border: none; color: #c4c4d4;
		font-size: 0.78rem; font-family: inherit; cursor: pointer; text-align: left;
	}
	.dropdown-item:hover  { background: #1e1e2e; }
	.dropdown-item.active { color: #8ecf5e; }
	.dropdown-item.muted  { color: #6b6b80; font-size: 0.72rem; }
	.checkmark { margin-left: auto; color: #8ecf5e; font-size: 0.8rem; }
	.dropdown-sep { height: 1px; background: #1e1e2e; margin: 0.25rem 0; }

	/* ── Main ────────────────────────────────────────────────────────────── */
	.admin-main {
		flex: 1; min-width: 0;
		padding: 1.5rem 2rem;
		overflow-y: auto;
	}
</style>
