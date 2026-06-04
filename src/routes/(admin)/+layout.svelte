<script lang="ts">
	/**
	 * Admin shell layout. All /(admin)/* pages share this nav + chrome.
	 * Chicago/DEEPDISH aesthetic: dark, monospace accents, onion-green.
	 */
	import { page } from '$app/state';
	let { children } = $props();

	const navItems = [
		{ href: '/admin',            label: 'Dashboard',   icon: '🧅' },
		{ href: '/admin/beacons',    label: 'Beacons',     icon: '📡' },
		{ href: '/admin/operatives', label: 'Operatives',  icon: '🪪'  },
		{ href: '/admin/storyteller',label: 'Storyteller', icon: '🤖' },
		{ href: '/admin/rewards',    label: 'Rewards',     icon: '🪙'  },
	] as const;

	let pathname = $derived(page.url.pathname);
	function isActive(href: string) {
		if (href === '/admin') return pathname === '/admin';
		return pathname.startsWith(href);
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
						<a
							href={item.href}
							class:active={isActive(item.href)}
						>
							<span class="nav-icon" aria-hidden="true">{item.icon}</span>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="sidebar-footer">
			<span class="deepdish-tag">DEEPDISH v&infin;</span>
			<span class="deepdish-hint">glen-agent-final-FINAL-v3</span>
		</div>
	</aside>

	<!-- Main content area -->
	<main class="admin-main">
		{@render children()}
	</main>
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
	}

	.sidebar-brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0 1rem 1.25rem;
		border-bottom: 1px solid #2a2a3a;
		margin-bottom: 0.75rem;
	}
	.brand-icon {
		font-size: 1.5rem;
		line-height: 1;
	}
	.brand-name {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: #8ecf5e;
	}
	.brand-sub {
		font-size: 0.6rem;
		color: #6b6b80;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	nav ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		color: #8888a0;
		text-decoration: none;
		font-size: 0.78rem;
		border-left: 3px solid transparent;
		transition: color 0.15s, background 0.15s;
	}
	nav a:hover {
		color: #c4c4d4;
		background: #1a1a28;
	}
	nav a.active {
		color: #8ecf5e;
		border-left-color: #8ecf5e;
		background: #121e10;
	}
	.nav-icon {
		font-size: 0.95rem;
		width: 1.2rem;
		text-align: center;
	}

	.sidebar-footer {
		margin-top: auto;
		padding: 1rem;
		border-top: 1px solid #1e1e2e;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.deepdish-tag {
		font-size: 0.65rem;
		color: #4a4a60;
		letter-spacing: 0.08em;
	}
	.deepdish-hint {
		font-size: 0.6rem;
		color: #3a3a50;
	}

	/* ── Main ────────────────────────────────────────────────────────────── */
	.admin-main {
		flex: 1;
		min-width: 0;
		padding: 1.5rem 2rem;
		overflow-y: auto;
	}
</style>
