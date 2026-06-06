<script lang="ts">
	import { enhance } from '$app/forms';
	import { STATUSES, PRIORITY_META, CHALLENGE_TYPE_META } from '$lib/shared/kanban-meta';
	import type { KanbanItem, KanbanDev, KanbanStatus } from '$lib/shared/kanban-meta';
	import KanbanItemDetail from '$lib/components/KanbanItemDetail.svelte';

	let { data } = $props<{
		data: {
			category: string;
			items: KanbanItem[];
			developers: KanbanDev[];
			meta: { label: string; icon: string; desc: string };
			// from layout server:
			currentDev: KanbanDev | null;
		};
	}>();

	let activeItem = $state<KanbanItem | null>(null);

	function openItem(item: KanbanItem) { activeItem = item; }
	function closeItem() { activeItem = null; }

	const GITHUB_BASE = 'https://github.com/OnionDAO-git/onion-rpg/blob/main';

	// Group items by status
	function byStatus(status: KanbanStatus): KanbanItem[] {
		return data.items.filter((i: KanbanItem) => i.status === status);
	}

	// Reactive item lookup so claim/unclaim updates reflected after navigation
	let items = $derived(data.items);

	// ── Claim dialog state ──────────────────────────────────────────────────
	let claimItem   = $state<KanbanItem | null>(null);
	let claimDevId  = $state('');
	let claimDue    = $state('');
	let claimAgree  = $state(false);
	let dialogEl    = $state<HTMLDialogElement>();

	function openClaim(item: KanbanItem) {
		claimItem  = item;
		claimDevId = item.assigneeId ?? '';
		claimDue   = item.dueDate?.slice(0, 10) ?? '';
		claimAgree = false;
		dialogEl?.showModal();
	}
	function closeClaim() {
		claimItem = null;
		claimAgree = false;
		dialogEl?.close();
	}

	// Auto-generate commitment text
	let devName      = $derived(data.developers.find((d: KanbanDev) => d.id === claimDevId)?.name ?? '');
	let commitText   = $derived(
		claimItem && devName && claimDue
			? `I, ${devName}, commit to deliver "${claimItem.title}" to the OnionRPG team by ${new Date(claimDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
			: ''
	);

	// Today's date as min for date picker
	const todayStr = new Date().toISOString().slice(0, 10);

	// Status label helper
	function nextStatus(s: KanbanStatus): KanbanStatus | null {
		const i = STATUSES.findIndex(x => x.value === s);
		return i < STATUSES.length - 1 ? STATUSES[i + 1].value : null;
	}
	function prevStatus(s: KanbanStatus): KanbanStatus | null {
		const i = STATUSES.findIndex(x => x.value === s);
		return i > 0 ? STATUSES[i - 1].value : null;
	}
</script>

<svelte:head><title>{data.meta.label} Kanban — ONION RPG Ops</title></svelte:head>

<!-- Claim / commit dialog -->
<dialog bind:this={dialogEl} class="claim-dialog" onclose={closeClaim}>
	{#if claimItem}
		<div class="dialog-inner">
			<button class="dialog-close" onclick={closeClaim} aria-label="close">✕</button>
			<h2 class="dialog-title">Take Ownership</h2>
			<p class="dialog-item-name">{claimItem.title}</p>

			<form method="POST" action="?/claim" use:enhance={() => () => closeClaim()} class="claim-form">
				<input type="hidden" name="itemId" value={claimItem.id} />
				<input type="hidden" name="commitment" value={commitText} />

				<label class="field-label">
					Claim as
					<select class="field-input" name="devId" bind:value={claimDevId} required>
						<option value="">— select developer —</option>
						{#each data.developers as d (d.id)}
							<option value={d.id}>{d.name}</option>
						{/each}
					</select>
				</label>

				<label class="field-label">
					Target delivery date
					<input type="date" class="field-input" name="dueDate" bind:value={claimDue} min={todayStr} required />
				</label>

				{#if commitText}
					<blockquote class="commitment-preview">
						{commitText}
					</blockquote>

					<label class="agree-row">
						<input type="checkbox" bind:checked={claimAgree} required />
						<span>I agree to this commitment</span>
					</label>
				{/if}

				<div class="dialog-actions">
					<button type="button" class="btn-cancel" onclick={closeClaim}>Cancel</button>
					<button type="submit" class="btn-commit" disabled={!commitText || !claimAgree}>
						Take Ownership
					</button>
				</div>
			</form>
		</div>
	{/if}
</dialog>

<div class="page">
	<header class="page-header">
		<a href="/admin/about/kanban" class="back">← Kanban</a>
		<div class="page-heading">
			<span class="page-icon">{data.meta.icon}</span>
			<div>
				<h1 class="page-title">{data.meta.label}</h1>
				<p class="page-sub">{data.meta.desc}</p>
			</div>
		</div>
		<div class="legend">
			{#each STATUSES as s (s.value)}
				<span class="legend-dot" style="background:{s.color}"></span>
				<span class="legend-lbl">{s.label} ({byStatus(s.value).length})</span>
			{/each}
		</div>
	</header>

	<div class="board">
		{#each STATUSES as col (col.value)}
			<div class="column">
				<div class="col-header" style="border-color:{col.color}">
					<span class="col-title" style="color:{col.color}">{col.label}</span>
					<span class="col-count">{byStatus(col.value).length}</span>
				</div>

				<div class="col-cards">
					{#each byStatus(col.value) as item (item.id)}
						{@const pm = PRIORITY_META[item.priority]}
						{@const ct = item.challengeType ? CHALLENGE_TYPE_META[item.challengeType] : null}
						{@const prev = prevStatus(col.value)}
						{@const next = nextStatus(col.value)}

						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="card" class:claimed={!!item.assigneeId} onclick={() => openItem(item)}>
							<!-- Priority indicator -->
							<div class="card-priority" style="background:{pm.color}" title={pm.label}></div>

							<div class="card-body">
								<!-- Type badges (challenges only) -->
								<div class="card-badges">
									{#if ct}
										<span class="badge type-badge" style="--c:{ct.color}">{ct.label}</span>
									{/if}
									{#if item.act !== null}
										<span class="badge act-badge">Act {item.act}</span>
									{/if}
								</div>

								<p class="card-title">{item.title}</p>
								<p class="card-desc">{item.description.slice(0, 120)}{item.description.length > 120 ? '…' : ''}</p>

								<!-- Challenge-specific: beacon + lua link -->
								{#if item.beaconIdHint || item.luaScriptPath}
									<div class="card-meta">
										{#if item.beaconIdHint}
											<span class="meta-chip">📡 {item.beaconIdHint}</span>
										{/if}
										{#if item.luaScriptPath}
											<a
												href="{GITHUB_BASE}/{item.luaScriptPath}"
												target="_blank" rel="noopener"
												class="meta-chip lua-link"
												onclick={(e) => e.stopPropagation()}
											>🌙 {item.luaScriptPath.split('/').pop()}</a>
										{/if}
									</div>
								{/if}

								<!-- Assignee / due date -->
								<div class="card-footer">
									{#if item.assigneeId}
										<div class="assignee" style="--c:{item.assigneeColor}">
											<span class="assignee-avatar">{item.assigneeInitials}</span>
											<span class="assignee-name">{item.assigneeName}</span>
											{#if item.dueDate}
												<span class="due-date">due {item.dueDate.slice(0, 10)}</span>
											{/if}
										</div>
									{:else}
										<span class="unassigned">Unassigned</span>
									{/if}
								</div>

								<!-- Comment count + expand hint -->
								{#if item.commentCount > 0}
									<div class="card-comments-row">
										<span class="comment-bubble">💬 {item.commentCount}</span>
										<span class="click-hint">click to expand</span>
									</div>
								{:else}
									<span class="click-hint alone">click to expand</span>
								{/if}

								<!-- Actions (stop propagation so clicks don't open detail) -->
								<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
								<div class="card-actions" onclick={(e) => e.stopPropagation()}>
									<!-- Move left/right -->
									{#if prev}
										<form method="POST" action="?/move" use:enhance>
											<input type="hidden" name="itemId" value={item.id} />
											<input type="hidden" name="status" value={prev} />
											<button type="submit" class="move-btn" title="Move to {prev.replace('_',' ')}">←</button>
										</form>
									{/if}
									{#if next}
										<form method="POST" action="?/move" use:enhance>
											<input type="hidden" name="itemId" value={item.id} />
											<input type="hidden" name="status" value={next} />
											<button type="submit" class="move-btn fwd" title="Move to {next.replace('_',' ')}">→</button>
										</form>
									{/if}

									<!-- Claim / unclaim -->
									{#if item.assigneeId}
										<form method="POST" action="?/unclaim" use:enhance>
											<input type="hidden" name="itemId" value={item.id} />
											<button type="submit" class="unclaim-btn">Release</button>
										</form>
									{:else}
										<button class="claim-btn" onclick={() => openClaim(item)}>Claim</button>
									{/if}
								</div>
							</div>
						</div>
					{:else}
						<div class="empty-col">—</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Item detail panel -->
{#if activeItem}
	<KanbanItemDetail
		item={activeItem}
		currentDev={data.currentDev ?? null}
		onclose={closeItem}
	/>
{/if}

<style>
	.page        { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
	.back        { font-size: 0.72rem; color: #6b6b80; text-decoration: none; display: block; }
	.back:hover  { color: #8ecf5e; }
	.page-heading{ display: flex; align-items: center; gap: 0.75rem; }
	.page-icon   { font-size: 1.6rem; }
	.page-title  { font-size: 1.2rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.2rem 0 0; font-size: 0.72rem; color: #6b6b80; }
	.legend      { display: flex; align-items: center; gap: 0.4rem 0.7rem; flex-wrap: wrap; font-size: 0.7rem; color: #6b6b80; }
	.legend-dot  { width: 0.55rem; height: 0.55rem; border-radius: 50%; display: inline-block; }
	.legend-lbl  { margin-right: 0.2rem; }

	/* Board */
	.board       { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; align-items: start; min-height: 60vh; }

	/* Column */
	.column      { display: flex; flex-direction: column; gap: 0.5rem; }
	.col-header  { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; border-left: 3px solid; border-radius: 0 0.3rem 0.3rem 0; background: #12121a; }
	.col-title   { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
	.col-count   { font-size: 0.7rem; color: #6b6b80; background: #1e1e2e; padding: 0.1rem 0.4rem; border-radius: 9999px; }
	.col-cards   { display: flex; flex-direction: column; gap: 0.5rem; }
	.empty-col   { font-size: 0.72rem; color: #3a3a50; text-align: center; padding: 1.5rem 0; }

	/* Card */
	.card        { display: flex; background: #12121a; border: 1px solid #2a2a3a; border-radius: 0.4rem; overflow: hidden; transition: border-color 0.12s; }
	.card:hover  { border-color: #3a3a5a; }
	.card.claimed { border-color: #2a3a2a; }
	.card-priority { width: 3px; flex-shrink: 0; }
	.card-body   { flex: 1; padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }

	.card-badges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.badge       { font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 9999px; font-weight: 600; letter-spacing: 0.03em; }
	.type-badge  { background: color-mix(in srgb, var(--c) 20%, transparent); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
	.act-badge   { background: #1e1e2e; color: #6b6b80; border: 1px solid #2a2a3a; }

	.card-title  { font-size: 0.8rem; font-weight: 600; color: #c4c4d4; margin: 0; line-height: 1.3; }
	.card-desc   { font-size: 0.7rem; color: #6b6b80; margin: 0; line-height: 1.4; }

	.card-meta   { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.meta-chip   { font-size: 0.65rem; background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.25rem; padding: 0.15rem 0.4rem; color: #8888a0; white-space: nowrap; }
	.lua-link    { color: #72a4e4; text-decoration: none; }
	.lua-link:hover { color: #8ecf5e; border-color: #4a7a3a; }

	.card-footer { display: flex; align-items: center; gap: 0.4rem; }
	.assignee    { display: flex; align-items: center; gap: 0.3rem; }
	.assignee-avatar { width: 1.2rem; height: 1.2rem; border-radius: 50%; background: var(--c); display: flex; align-items: center; justify-content: center; font-size: 0.5rem; font-weight: 700; color: #0d0d15; flex-shrink: 0; }
	.assignee-name   { font-size: 0.68rem; color: #c4c4d4; }
	.due-date        { font-size: 0.62rem; color: #6b6b80; margin-left: 0.2rem; }
	.unassigned  { font-size: 0.68rem; color: #3a3a50; font-style: italic; }

	.card-comments-row { display: flex; align-items: center; gap: 0.4rem; }
	.comment-bubble    { font-size: 0.62rem; color: #72a4e4; }
	.click-hint        { font-size: 0.6rem; color: #2a2a3a; margin-left: auto; }
	.click-hint.alone  { display: block; text-align: right; font-size: 0.6rem; color: #2a2a3a; }
	.card:hover .click-hint { color: #4a4a60; }
	.card        { cursor: pointer; }

	.card-actions{ display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap; }
	.move-btn    { background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.25rem; color: #6b6b80; cursor: pointer; font-size: 0.75rem; padding: 0.15rem 0.45rem; line-height: 1; }
	.move-btn:hover { color: #c4c4d4; border-color: #4a4a60; }
	.move-btn.fwd:hover { color: #8ecf5e; border-color: #4a7a3a; }
	.claim-btn   { font-size: 0.68rem; padding: 0.2rem 0.55rem; background: #1a2e18; border: 1px solid #4a7a3a; border-radius: 0.25rem; color: #8ecf5e; cursor: pointer; margin-left: auto; }
	.claim-btn:hover { background: #243e22; }
	.unclaim-btn { font-size: 0.68rem; padding: 0.2rem 0.55rem; background: #1e1e2e; border: 1px solid #3a3a5a; border-radius: 0.25rem; color: #8888a0; cursor: pointer; margin-left: auto; }
	.unclaim-btn:hover { color: #e07070; border-color: #5a3a3a; }

	/* Claim dialog */
	.claim-dialog { background: #0f0f1a; border: 1px solid #3a3a5a; border-radius: 0.6rem; padding: 0; max-width: 500px; width: 90vw; color: #c4c4d4; box-shadow: 0 4px 32px rgba(0,0,0,0.6); }
	.claim-dialog::backdrop { background: rgba(0,0,0,0.7); }
	.dialog-inner { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; position: relative; }
	.dialog-close { position: absolute; top: 1rem; right: 1rem; background: none; border: none; color: #6b6b80; cursor: pointer; font-size: 1rem; padding: 0.2rem 0.4rem; }
	.dialog-close:hover { color: #c4c4d4; }
	.dialog-title { font-size: 1.1rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.dialog-item-name { font-size: 0.85rem; color: #c4c4d4; margin: 0; border-left: 3px solid #4a7a3a; padding-left: 0.6rem; }

	.claim-form  { display: flex; flex-direction: column; gap: 0.85rem; }
	.field-label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.72rem; color: #8888a0; }
	.field-input { background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.3rem; color: #c4c4d4; padding: 0.4rem 0.6rem; font-size: 0.82rem; font-family: inherit; width: 100%; box-sizing: border-box; }
	.field-input:focus { outline: none; border-color: #4a7a3a; }

	.commitment-preview { margin: 0; padding: 0.75rem 1rem; background: #0d1a0d; border: 1px solid #2a4a2a; border-left: 4px solid #4a7a3a; border-radius: 0.25rem 0.5rem 0.5rem 0.25rem; font-size: 0.82rem; color: #a8d8a8; line-height: 1.5; font-style: italic; }

	.agree-row   { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.75rem; color: #8888a0; cursor: pointer; }
	.agree-row input { margin-top: 0.15rem; accent-color: #8ecf5e; flex-shrink: 0; }

	.dialog-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
	.btn-cancel  { padding: 0.4rem 0.9rem; background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.3rem; color: #8888a0; cursor: pointer; font-size: 0.78rem; font-family: inherit; }
	.btn-cancel:hover { color: #c4c4d4; }
	.btn-commit  { padding: 0.4rem 1rem; background: #1a2e18; border: 1px solid #4a7a3a; border-radius: 0.3rem; color: #8ecf5e; cursor: pointer; font-size: 0.78rem; font-family: inherit; font-weight: 600; }
	.btn-commit:hover:not(:disabled) { background: #243e22; }
	.btn-commit:disabled { opacity: 0.4; cursor: not-allowed; }

	/* Responsive collapse to 2 columns on narrow screens */
	@media (max-width: 900px) {
		.board { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 550px) {
		.board { grid-template-columns: 1fr; }
	}
</style>
