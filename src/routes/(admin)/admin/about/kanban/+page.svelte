<script lang="ts">
	import { enhance } from '$app/forms';
	import type { CategorySummary, KanbanDev } from '$lib/server/admin/kanban';

	let { data, form } = $props<{
		data: { summaries: CategorySummary[]; developers: KanbanDev[] };
		form: { error?: string; ok?: boolean } | null;
	}>();

	const CATEGORY_META: Record<string, { icon: string; desc: string; color: string }> = {
		challenge:      { icon: '⚡', desc: 'Beacon interactions — the core gameplay loop', color: '#e47272' },
		story:          { icon: '📖', desc: 'Narrative, dialogue & proof-story verification', color: '#a472e4' },
		infrastructure: { icon: '🔧', desc: 'Hardware, firmware, networking & deployment',   color: '#72a4e4' },
	};

	const STATUS_COLORS: Record<string, string> = {
		backlog:     '#4a4a60',
		in_progress: '#72a4e4',
		review:      '#e4a472',
		done:        '#8ecf5e',
	};

	let showDevForm = $state(false);
	let devName     = $state('');
	let devInitials = $state('');
	let devColor    = $state('#8ecf5e');

	const PRESET_COLORS = ['#8ecf5e','#72a4e4','#e4a472','#a472e4','#e47272','#72e4d4'];

	function pct(n: number, total: number) {
		return total ? Math.round((n / total) * 100) : 0;
	}

	// Build progress bar segments: backlog(grey) | in_progress(blue) | review(amber) | done(green)
	function barSegments(s: CategorySummary) {
		return [
			{ w: pct(s.done,        s.total), color: '#8ecf5e' },
			{ w: pct(s.review,      s.total), color: '#e4a472' },
			{ w: pct(s.in_progress, s.total), color: '#72a4e4' },
			{ w: pct(s.backlog,     s.total), color: '#2a2a3a' },
		].filter(seg => seg.w > 0);
	}
</script>

<svelte:head><title>Project Kanban — ONION RPG Ops</title></svelte:head>

<div class="page">
	<header class="page-header">
		<a href="/admin/about" class="back">← About</a>
		<h1 class="page-title">Project Kanban</h1>
		<p class="page-sub">Track challenge builds, story elements, and infrastructure. Click a category to manage its items.</p>
	</header>

	<!-- Category overview cards -->
	<div class="categories">
		{#each data.summaries as s (s.category)}
			{@const meta = CATEGORY_META[s.category]}
			<a href="/admin/about/kanban/{s.category}" class="cat-card">
				<div class="cat-header">
					<span class="cat-icon">{meta?.icon ?? '📋'}</span>
					<span class="cat-title">{s.label}</span>
					<span class="cat-total">{s.total}</span>
				</div>
				<p class="cat-desc">{meta?.desc ?? ''}</p>

				<!-- Progress bar -->
				<div class="progress-bar">
					{#each barSegments(s) as seg}
						<div class="progress-seg" style="width:{seg.w}%;background:{seg.color}"></div>
					{/each}
				</div>

				<!-- Column counts -->
				<div class="cat-counts">
					{#each [['backlog', 'Backlog'], ['in_progress', 'In Progress'], ['review', 'Review'], ['done', 'Done']] as [k, lbl]}
						<div class="count-chip" style="--c:{STATUS_COLORS[k]}">
							<span class="count-n">{(s as Record<string, number>)[k] ?? 0}</span>
							<span class="count-l">{lbl}</span>
						</div>
					{/each}
				</div>

				<span class="cat-open">Open board →</span>
			</a>
		{/each}

		{#if data.summaries.length === 0}
			<div class="empty-state">
				No Kanban data yet. Run <code>docker compose exec app bun run kanban:seed</code> to seed the board.
			</div>
		{/if}
	</div>

	<!-- Developer roster -->
	<section class="devs-section">
		<div class="devs-header">
			<h2 class="section-title">Team</h2>
			<button class="add-btn" onclick={() => showDevForm = !showDevForm}>
				{showDevForm ? '✕ Cancel' : '+ Add Developer'}
			</button>
		</div>

		<div class="dev-list">
			{#each data.developers as d (d.id)}
				<div class="dev-chip" style="--c:{d.color}">
					<span class="dev-avatar">{d.initials}</span>
					<span class="dev-name">{d.name}</span>
				</div>
			{/each}
		</div>

		{#if showDevForm}
			<form
				method="POST" action="?/addDev"
				use:enhance={() => () => { showDevForm = false; devName = ''; devInitials = ''; }}
				class="dev-form"
			>
				{#if form?.error}<p class="form-error">{form.error}</p>{/if}
				<div class="form-row">
					<label class="form-label">
						Full name
						<input class="form-input" name="name" bind:value={devName} placeholder="e.g. Jane Smith" required />
					</label>
					<label class="form-label">
						Initials
						<input class="form-input short" name="initials" bind:value={devInitials} placeholder="JS" maxlength="3" required />
					</label>
					<div class="form-label">
						Color
						<div class="color-row">
							{#each PRESET_COLORS as c}
								<button type="button" class="color-swatch" class:selected={devColor === c}
									style="background:{c}" aria-label="Select colour {c}" onclick={() => devColor = c}></button>
							{/each}
							<input type="color" class="color-pick" name="color" bind:value={devColor} />
						</div>
					</div>
				</div>
				<button type="submit" class="submit-btn">Register Developer</button>
			</form>
		{/if}
	</section>
</div>

<style>
	.page        { display: flex; flex-direction: column; gap: 1.5rem; max-width: 1100px; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; margin-bottom: 0.4rem; }
	.back:hover  { color: #8ecf5e; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }

	/* Category cards */
	.categories    { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
	.cat-card      { display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; background: #12121a; border: 1px solid #2a2a3a; border-radius: 0.5rem; text-decoration: none; transition: border-color 0.15s, background 0.15s; }
	.cat-card:hover{ border-color: #4a7a3a; background: #141e12; }
	.cat-header    { display: flex; align-items: center; gap: 0.5rem; }
	.cat-icon      { font-size: 1.2rem; }
	.cat-title     { font-size: 0.9rem; font-weight: 700; color: #c4c4d4; flex: 1; }
	.cat-total     { font-size: 0.78rem; color: #6b6b80; background: #1e1e2e; padding: 0.1rem 0.4rem; border-radius: 9999px; }
	.cat-desc      { font-size: 0.72rem; color: #6b6b80; margin: 0; line-height: 1.4; }

	.progress-bar  { height: 4px; background: #1e1e2e; border-radius: 2px; display: flex; overflow: hidden; }
	.progress-seg  { height: 100%; transition: width 0.3s; }

	.cat-counts    { display: flex; gap: 0.4rem; flex-wrap: wrap; }
	.count-chip    { display: flex; flex-direction: column; align-items: center; padding: 0.25rem 0.5rem; background: #0d0d15; border: 1px solid var(--c, #2a2a3a); border-radius: 0.3rem; min-width: 3.5rem; }
	.count-n       { font-size: 1rem; font-weight: 700; color: var(--c, #c4c4d4); line-height: 1; }
	.count-l       { font-size: 0.6rem; color: #6b6b80; text-transform: uppercase; letter-spacing: 0.05em; }

	.cat-open      { font-size: 0.7rem; color: #4a4a60; margin-top: auto; }
	.cat-card:hover .cat-open { color: #8ecf5e; }

	.empty-state   { grid-column: 1/-1; padding: 2rem; text-align: center; color: #6b6b80; font-size: 0.78rem; border: 1px dashed #2a2a3a; border-radius: 0.5rem; }
	.empty-state code { background: #1e1e2e; padding: 0.1rem 0.4rem; border-radius: 0.2rem; font-family: inherit; }

	/* Developer section */
	.devs-section  { border-top: 1px solid #2a2a3a; padding-top: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.devs-header   { display: flex; align-items: center; gap: 1rem; }
	.section-title { font-size: 0.9rem; font-weight: 700; color: #c4c4d4; margin: 0; flex: 1; }
	.add-btn       { font-size: 0.72rem; padding: 0.25rem 0.65rem; background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 9999px; color: #8888a0; cursor: pointer; }
	.add-btn:hover { color: #8ecf5e; border-color: #4a7a3a; }

	.dev-list      { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.dev-chip      { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.65rem 0.3rem 0.3rem; background: #12121a; border: 1px solid #2a2a3a; border-radius: 9999px; }
	.dev-avatar    { width: 1.4rem; height: 1.4rem; border-radius: 50%; background: var(--c); display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; color: #0d0d15; }
	.dev-name      { font-size: 0.75rem; color: #c4c4d4; }

	/* Dev add form */
	.dev-form      { background: #0f0f1a; border: 1px solid #2a2a3a; border-radius: 0.5rem; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.form-row      { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.form-label    { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.72rem; color: #8888a0; }
	.form-input    { background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.3rem; color: #c4c4d4; padding: 0.3rem 0.5rem; font-size: 0.78rem; font-family: inherit; min-width: 12rem; }
	.form-input.short { min-width: 4rem; }
	.form-input:focus { outline: none; border-color: #4a7a3a; }
	.color-row     { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
	.color-swatch  { width: 1.2rem; height: 1.2rem; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
	.color-swatch.selected { border-color: #fff; }
	.color-pick    { width: 1.5rem; height: 1.5rem; border: none; background: none; cursor: pointer; padding: 0; border-radius: 50%; }
	.form-error    { color: #e07070; font-size: 0.72rem; margin: 0; }
	.submit-btn    { align-self: flex-start; padding: 0.35rem 0.9rem; background: #1a2e18; border: 1px solid #4a7a3a; border-radius: 0.3rem; color: #8ecf5e; font-size: 0.78rem; cursor: pointer; font-family: inherit; }
	.submit-btn:hover { background: #243e22; }
</style>
