<script lang="ts">
	import { enhance } from '$app/forms';
	import { PRIORITY_META, CHALLENGE_TYPE_META, STATUSES } from '$lib/shared/kanban-meta';
	import type { KanbanItem, KanbanDev, KanbanComment } from '$lib/shared/kanban-meta';
	type Comment = KanbanComment;

	let {
		item,
		currentDev,
		onclose,
	}: {
		item: KanbanItem;
		currentDev: KanbanDev | null;
		onclose: () => void;
	} = $props();

	const GITHUB_BASE = 'https://github.com/OnionDAO-git/onion-rpg/blob/main';

	// ── Comments ─────────────────────────────────────────────────────────────
	let comments     = $state<Comment[]>([]);
	let loadingComments = $state(true);
	let commentBody  = $state('');

	$effect(() => {
		if (item) {
			loadingComments = true;
			comments = [];
			fetch(`/api/kanban/${item.id}/comments`)
				.then(r => r.json())
				.then(data => { comments = data; loadingComments = false; })
				.catch(() => { loadingComments = false; });
		}
	});

	function refreshComments() {
		fetch(`/api/kanban/${item.id}/comments`)
			.then(r => r.json())
			.then(data => { comments = data; commentBody = ''; });
	}

	// ── Edit mode ─────────────────────────────────────────────────────────────
	let editing     = $state(false);
	let editTitle   = $state('');
	let editDesc    = $state('');
	let editPriority = $state('');

	function startEdit() {
		editTitle    = item.title;
		editDesc     = item.description;
		editPriority = item.priority;
		editing      = true;
	}
	function cancelEdit() { editing = false; }

	// ── Status helpers ────────────────────────────────────────────────────────
	const statusIdx = $derived(STATUSES.findIndex(s => s.value === item.status));
	const prevStatus = $derived(statusIdx > 0 ? STATUSES[statusIdx - 1] : null);
	const nextStatus = $derived(statusIdx < STATUSES.length - 1 ? STATUSES[statusIdx + 1] : null);
	const currentStatus = $derived(STATUSES[statusIdx]);

	function fmtDate(s: string | null) {
		if (!s) return '—';
		try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
		catch { return s; }
	}
	function fmtTs(s: string) {
		try { return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
		catch { return s; }
	}

	const pm  = $derived(PRIORITY_META[item.priority]);
	const ct  = $derived(item.challengeType ? CHALLENGE_TYPE_META[item.challengeType] : null);
	const todayStr = new Date().toISOString().slice(0, 10);
</script>

<div class="detail-backdrop" onclick={onclose} role="presentation"></div>

<div class="detail-panel" role="dialog" aria-modal="true">
	<!-- ── Header ── -->
	<div class="detail-header">
		<div class="detail-badges">
			<span class="badge pri-badge" style="--c:{pm.color}">{pm.label}</span>
			{#if ct}
				<span class="badge type-badge" style="--c:{ct.color}">{ct.label}</span>
			{/if}
			{#if item.act !== null}
				<span class="badge act-badge">Act {item.act}</span>
			{/if}
			<span class="badge cat-badge">{item.category}</span>
		</div>
		<div class="header-actions">
			{#if !editing}
				<button class="hdr-btn" onclick={startEdit} title="Edit item">✎ Edit</button>
			{/if}
			<button class="hdr-btn close-btn" onclick={onclose} aria-label="Close">✕</button>
		</div>
	</div>

	<div class="detail-scroll">
		{#if editing}
			<!-- ── Edit form ── -->
			<form
				method="POST" action="?/editItem"
				use:enhance={() => () => { editing = false; }}
				class="edit-form"
			>
				<input type="hidden" name="itemId" value={item.id} />

				<label class="edit-label">
					Title
					<input class="edit-input" name="title" bind:value={editTitle} required />
				</label>

				<label class="edit-label">
					Priority
					<select class="edit-input" name="priority" bind:value={editPriority}>
						{#each ['low','medium','high','critical'] as p}
							<option value={p}>{PRIORITY_META[p as keyof typeof PRIORITY_META].label}</option>
						{/each}
					</select>
				</label>

				<label class="edit-label">
					Description
					<textarea class="edit-textarea" name="description" bind:value={editDesc} rows="8"></textarea>
				</label>

				<div class="edit-actions">
					<button type="button" class="btn-secondary" onclick={cancelEdit}>Cancel</button>
					<button type="submit" class="btn-primary">Save Changes</button>
				</div>
			</form>
		{:else}
			<!-- ── View mode ── -->

			<h2 class="detail-title">{item.title}</h2>

			<!-- Beacon / Lua links -->
			{#if item.beaconIdHint || item.luaScriptPath}
				<div class="meta-chips">
					{#if item.beaconIdHint}
						<span class="meta-chip">📡 {item.beaconIdHint}</span>
					{/if}
					{#if item.luaScriptPath}
						<a href="{GITHUB_BASE}/{item.luaScriptPath}" target="_blank" rel="noopener" class="meta-chip lua-link">
							🌙 {item.luaScriptPath}
						</a>
					{/if}
				</div>
			{/if}

			<!-- Description -->
			<p class="detail-desc">{item.description || '—'}</p>

			<div class="detail-divider"></div>

			<!-- Status + move -->
			<div class="status-row">
				<span class="field-lbl">Status</span>
				<div class="status-controls">
					{#if prevStatus}
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="status" value={prevStatus.value} />
							<button type="submit" class="move-pill" style="--c:{prevStatus.color}">
								← {prevStatus.label}
							</button>
						</form>
					{/if}
					<span class="status-current" style="--c:{currentStatus?.color}">{currentStatus?.label}</span>
					{#if nextStatus}
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="status" value={nextStatus.value} />
							<button type="submit" class="move-pill fwd" style="--c:{nextStatus.color}">
								{nextStatus.label} →
							</button>
						</form>
					{/if}
				</div>
			</div>

			<!-- Assignee / claim -->
			<div class="assignee-row">
				<span class="field-lbl">Assigned to</span>
				<div class="assignee-info">
					{#if item.assigneeId}
						<span class="mini-avatar" style="background:{item.assigneeColor}">{item.assigneeInitials}</span>
						<span class="assignee-name-txt">{item.assigneeName}</span>
						{#if item.dueDate}
							<span class="due-chip">due {fmtDate(item.dueDate)}</span>
						{/if}
						<form method="POST" action="?/unclaim" use:enhance style="margin-left:auto">
							<input type="hidden" name="itemId" value={item.id} />
							<button type="submit" class="btn-sm-danger">Release</button>
						</form>
					{:else}
						<span class="unassigned-txt">Unassigned</span>
					{/if}
				</div>
			</div>

			<!-- Commitment text -->
			{#if item.commitment}
				<blockquote class="commitment-quote">{item.commitment}</blockquote>
			{/if}

			<!-- Claim form (only shown if unclaimed) -->
			{#if !item.assigneeId}
				<details class="claim-details">
					<summary class="claim-summary">
						{currentDev ? `Claim as ${currentDev.name}` : 'Claim this item'}
					</summary>
					{#if currentDev}
						<form method="POST" action="?/claim" use:enhance class="claim-inline-form">
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="devId" value={currentDev.id} />
							<label class="edit-label">
								Delivery date
								<input type="date" class="edit-input sm" name="dueDate" min={todayStr} required />
							</label>
							<input type="hidden" name="commitment" value="Auto-generated on save" />
							<p class="claim-note">
								By claiming, you commit: "I, {currentDev.name}, commit to deliver this to the OnionRPG team by the date above."
							</p>
							<button type="submit" class="btn-primary sm">Take Ownership</button>
						</form>
					{:else}
						<p class="claim-note warn">Select an operative from the top-right menu first.</p>
					{/if}
				</details>
			{/if}
		{/if}

		<div class="detail-divider"></div>

		<!-- ── Comments ── -->
		<div class="comments-section">
			<h3 class="comments-heading">
				Comments
				{#if comments.length > 0}<span class="comment-count">{comments.length}</span>{/if}
			</h3>

			{#if loadingComments}
				<p class="comments-loading">Loading…</p>
			{:else if comments.length === 0}
				<p class="no-comments">No comments yet.</p>
			{:else}
				<ul class="comment-list">
					{#each comments as c (c.id)}
						<li class="comment">
							<div class="comment-meta">
								<span class="comment-avatar" style="background:{c.devColor}">{c.devInitials}</span>
								<span class="comment-author">{c.devName}</span>
								<span class="comment-time">{fmtTs(c.createdAt)}</span>
							</div>
							<p class="comment-body">{c.body}</p>
						</li>
					{/each}
				</ul>
			{/if}

			<!-- Add comment form -->
			<form
				method="POST" action="?/comment"
				use:enhance={() => () => refreshComments()}
				class="comment-form"
			>
				<input type="hidden" name="itemId"      value={item.id} />
				<input type="hidden" name="devId"       value={currentDev?.id       ?? ''} />
				<input type="hidden" name="devName"     value={currentDev?.name     ?? 'Anonymous'} />
				<input type="hidden" name="devInitials" value={currentDev?.initials ?? '?'} />
				<input type="hidden" name="devColor"    value={currentDev?.color    ?? '#4a4a60'} />

				<textarea
					class="comment-input"
					name="body"
					bind:value={commentBody}
					placeholder={currentDev ? `Comment as ${currentDev.name}…` : 'Select an operative to comment…'}
					rows="3"
					disabled={!currentDev}
				></textarea>
				<div class="comment-form-footer">
					{#if currentDev}
						<span class="comment-as">
							<span class="mini-avatar xs" style="background:{currentDev.color}">{currentDev.initials}</span>
							Posting as {currentDev.name}
						</span>
					{:else}
						<span class="no-user-hint">No operative selected</span>
					{/if}
					<button type="submit" class="btn-primary sm" disabled={!currentDev || !commentBody.trim()}>
						Post
					</button>
				</div>
			</form>
		</div>
	</div>
</div>

<style>
	.detail-backdrop {
		position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 100;
	}
	.detail-panel {
		position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw);
		background: #0f0f1a; border-left: 1px solid #2a2a3a;
		z-index: 101; display: flex; flex-direction: column;
		box-shadow: -4px 0 24px rgba(0,0,0,0.5);
		animation: slide-in 0.18s ease-out;
	}
	@keyframes slide-in {
		from { transform: translateX(100%); }
		to   { transform: translateX(0); }
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.detail-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 0.75rem 1rem; border-bottom: 1px solid #2a2a3a;
		flex-shrink: 0;
	}
	.detail-badges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.badge { font-size: 0.6rem; padding: 0.15rem 0.4rem; border-radius: 9999px; font-weight: 600; }
	.pri-badge  { background: color-mix(in srgb, var(--c) 20%, transparent); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
	.type-badge { background: color-mix(in srgb, var(--c) 20%, transparent); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
	.act-badge  { background: #1e1e2e; color: #6b6b80; border: 1px solid #2a2a3a; }
	.cat-badge  { background: #1e1e2e; color: #4a4a60; border: 1px solid #1e1e2e; text-transform: capitalize; }

	.header-actions { display: flex; gap: 0.4rem; align-items: center; }
	.hdr-btn {
		background: none; border: 1px solid #2a2a3a; border-radius: 0.25rem;
		color: #8888a0; cursor: pointer; font-size: 0.72rem; padding: 0.2rem 0.55rem;
		font-family: inherit;
	}
	.hdr-btn:hover { color: #c4c4d4; border-color: #4a4a60; }
	.close-btn:hover { color: #e07070; border-color: #5a2a2a; }

	/* ── Scroll area ─────────────────────────────────────────────────────── */
	.detail-scroll { flex: 1; overflow-y: auto; padding: 1.25rem 1.25rem 2rem; display: flex; flex-direction: column; gap: 0.9rem; }

	.detail-title { font-size: 1.05rem; font-weight: 700; color: #c4c4d4; margin: 0; line-height: 1.3; }
	.detail-desc  { font-size: 0.8rem; color: #8888a0; line-height: 1.6; margin: 0; white-space: pre-wrap; }
	.detail-divider { height: 1px; background: #1e1e2e; margin: 0.25rem 0; flex-shrink: 0; }

	.meta-chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.meta-chip  { font-size: 0.65rem; background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.25rem; padding: 0.2rem 0.5rem; color: #8888a0; }
	.lua-link   { color: #72a4e4; text-decoration: none; }
	.lua-link:hover { color: #8ecf5e; }

	/* ── Status row ──────────────────────────────────────────────────────── */
	.status-row, .assignee-row { display: flex; flex-direction: column; gap: 0.35rem; }
	.field-lbl { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #4a4a60; }

	.status-controls { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.status-current  { font-size: 0.78rem; font-weight: 600; color: var(--c); padding: 0.2rem 0.5rem; border: 1px solid var(--c); border-radius: 9999px; }
	.move-pill {
		background: none; border: 1px solid #2a2a3a; border-radius: 9999px;
		color: #6b6b80; font-size: 0.7rem; padding: 0.2rem 0.55rem; cursor: pointer;
		font-family: inherit;
	}
	.move-pill:hover     { color: #c4c4d4; border-color: #4a4a60; }
	.move-pill.fwd:hover { color: var(--c); border-color: var(--c); }

	.assignee-info  { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.mini-avatar    { width: 1.3rem; height: 1.3rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 700; color: #0d0d15; flex-shrink: 0; }
	.mini-avatar.xs { width: 1rem; height: 1rem; font-size: 0.45rem; }
	.assignee-name-txt { font-size: 0.8rem; color: #c4c4d4; }
	.due-chip       { font-size: 0.68rem; color: #6b6b80; background: #1e1e2e; padding: 0.1rem 0.4rem; border-radius: 9999px; }
	.unassigned-txt { font-size: 0.75rem; color: #3a3a50; font-style: italic; }

	.commitment-quote {
		margin: 0; padding: 0.65rem 0.9rem;
		background: #0d1a0d; border: 1px solid #2a4a2a; border-left: 4px solid #4a7a3a;
		border-radius: 0.25rem 0.4rem 0.4rem 0.25rem;
		font-size: 0.75rem; color: #a8d8a8; font-style: italic; line-height: 1.5;
	}

	/* ── Claim inline ────────────────────────────────────────────────────── */
	.claim-details { border: 1px solid #2a2a3a; border-radius: 0.4rem; overflow: hidden; }
	.claim-summary {
		padding: 0.55rem 0.75rem; cursor: pointer;
		font-size: 0.78rem; color: #8ecf5e; background: #0f1a0f;
		list-style: none;
	}
	.claim-summary:hover { background: #141e12; }
	.claim-inline-form { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; background: #0d0d15; }
	.claim-note { font-size: 0.7rem; color: #6b6b80; margin: 0; line-height: 1.4; font-style: italic; }
	.claim-note.warn { color: #e4a472; }

	/* ── Edit form ───────────────────────────────────────────────────────── */
	.edit-form    { display: flex; flex-direction: column; gap: 0.75rem; }
	.edit-label   { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.7rem; color: #6b6b80; }
	.edit-input   { background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.3rem; color: #c4c4d4; padding: 0.4rem 0.6rem; font-size: 0.82rem; font-family: inherit; }
	.edit-input.sm { max-width: 12rem; }
	.edit-input:focus { outline: none; border-color: #4a7a3a; }
	.edit-textarea { background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 0.3rem; color: #c4c4d4; padding: 0.5rem 0.6rem; font-size: 0.78rem; font-family: inherit; resize: vertical; }
	.edit-textarea:focus { outline: none; border-color: #4a7a3a; }
	.edit-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

	/* ── Comments ────────────────────────────────────────────────────────── */
	.comments-section { display: flex; flex-direction: column; gap: 0.75rem; }
	.comments-heading { font-size: 0.82rem; font-weight: 700; color: #c4c4d4; margin: 0; display: flex; align-items: center; gap: 0.4rem; }
	.comment-count    { font-size: 0.7rem; background: #2a2a3a; color: #8888a0; padding: 0.05rem 0.4rem; border-radius: 9999px; }
	.comments-loading, .no-comments { font-size: 0.75rem; color: #4a4a60; font-style: italic; margin: 0; }

	.comment-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
	.comment      { display: flex; flex-direction: column; gap: 0.25rem; }
	.comment-meta { display: flex; align-items: center; gap: 0.4rem; }
	.comment-avatar { width: 1.2rem; height: 1.2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.5rem; font-weight: 700; color: #0d0d15; flex-shrink: 0; }
	.comment-author { font-size: 0.72rem; font-weight: 600; color: #c4c4d4; }
	.comment-time   { font-size: 0.65rem; color: #4a4a60; margin-left: 0.2rem; }
	.comment-body   { font-size: 0.78rem; color: #8888a0; margin: 0 0 0 1.6rem; line-height: 1.5; white-space: pre-wrap; }

	.comment-form        { display: flex; flex-direction: column; gap: 0.5rem; }
	.comment-input       { background: #1a1a2a; border: 1px solid #2a2a3a; border-radius: 0.35rem; color: #c4c4d4; padding: 0.5rem 0.6rem; font-size: 0.78rem; font-family: inherit; resize: none; }
	.comment-input:focus { outline: none; border-color: #4a4a60; }
	.comment-input:disabled { opacity: 0.4; cursor: not-allowed; }
	.comment-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.comment-as   { font-size: 0.68rem; color: #6b6b80; display: flex; align-items: center; gap: 0.3rem; }
	.no-user-hint { font-size: 0.68rem; color: #4a4a60; font-style: italic; }

	/* ── Shared buttons ──────────────────────────────────────────────────── */
	.btn-primary {
		padding: 0.4rem 0.9rem; background: #1a2e18; border: 1px solid #4a7a3a;
		border-radius: 0.3rem; color: #8ecf5e; cursor: pointer; font-size: 0.78rem;
		font-family: inherit; font-weight: 600;
	}
	.btn-primary:hover:not(:disabled) { background: #243e22; }
	.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
	.btn-primary.sm { padding: 0.25rem 0.65rem; font-size: 0.72rem; }

	.btn-secondary {
		padding: 0.4rem 0.9rem; background: #1e1e2e; border: 1px solid #2a2a3a;
		border-radius: 0.3rem; color: #8888a0; cursor: pointer; font-size: 0.78rem;
		font-family: inherit;
	}
	.btn-secondary:hover { color: #c4c4d4; }

	.btn-sm-danger {
		padding: 0.2rem 0.55rem; background: none; border: 1px solid #3a2a2a;
		border-radius: 0.25rem; color: #8888a0; cursor: pointer; font-size: 0.68rem;
		font-family: inherit;
	}
	.btn-sm-danger:hover { color: #e07070; border-color: #5a2a2a; }
</style>
