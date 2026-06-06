<script lang="ts">
	/**
	 * DEEPDISH Storyteller Console.
	 *
	 * Left pane: session list (mode, model, status, operative, challenge).
	 * Right pane: full conversation transcript for the selected session.
	 * The console is read-only — watch DEEPDISH in action, no input required.
	 */
	import { goto } from '$app/navigation';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { AdminStorytellerSession, AdminTranscriptTurn } from '$lib/server/admin/queries';

	let { data } = $props();
	let { sessions, selectedSessionId, transcript } = $derived(data);

	function fmtDate(v: string | null | undefined): string {
		if (!v) return '—';
		try {
			return new Date(v).toLocaleString('en-US', {
				month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit',
			});
		} catch { return String(v); }
	}

	function selectSession(s: AdminStorytellerSession) {
		goto(`?session=${s.id}`, { replaceState: false, noScroll: true });
	}

	// Role display config
	const roleStyles: Record<string, { label: string; cls: string }> = {
		deepdish:  { label: 'DEEPDISH',  cls: 'role-deepdish' },
		operative: { label: 'Operative', cls: 'role-operative' },
		system:    { label: 'System',    cls: 'role-system' },
	};
</script>

<svelte:head>
	<title>Storyteller Console — ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">DEEPDISH Storyteller Console</h1>
		<p class="page-sub">
			"glen-agent-2026-06-06-v3 — committed to prod. Went to lunch. Never came back."
		</p>
	</header>

	<div class="console-layout">
		<!-- Session list (left pane) -->
		<aside class="session-list">
			<div class="pane-title">Sessions ({sessions.length})</div>
			{#if sessions.length === 0}
				<p class="empty-hint">No storyteller sessions yet. No one has talked to DEEPDISH.</p>
			{:else}
				{#each sessions as s (s.id)}
					<button
						class="session-row"
						class:session-selected={s.id === selectedSessionId}
						onclick={() => selectSession(s)}
					>
						<div class="session-top">
							<span class="session-challenge">{s.challengeId}</span>
							<StatusBadge status={s.mode} />
						</div>
						<div class="session-mid">
							{s.username ?? '(anon)'} &nbsp;·&nbsp; {s.model.split('-').slice(-2).join('-')}
						</div>
						<div class="session-bot">
							<StatusBadge status={s.status} />
							<span class="session-date">{fmtDate(s.updatedAt)}</span>
						</div>
					</button>
				{/each}
			{/if}
		</aside>

		<!-- Transcript (right pane) -->
		<section class="transcript-pane">
			{#if !selectedSessionId}
				<div class="transcript-empty">
					<span class="td-icon">🤖</span>
					<p>Select a session to read the conversation.</p>
					<p class="td-hint">"Every lesson is in here, champ. You just have to dig." — DEEPDISH</p>
				</div>
			{:else if transcript.length === 0}
				<div class="transcript-empty">
					<span class="td-icon">💬</span>
					<p>No turns recorded yet for this session.</p>
				</div>
			{:else}
				<div class="transcript-scroll">
					{#each transcript as turn (turn.id)}
						{@const style = roleStyles[turn.role] ?? { label: turn.role, cls: 'role-system' }}
						<div class="turn {style.cls}">
							<div class="turn-header">
								<span class="turn-role">{style.label}</span>
								<span class="turn-num">turn {turn.turn}</span>
							</div>
							<div class="turn-body">{turn.content}</div>
							{#if turn.meta && Object.keys(turn.meta).length > 0}
								<details class="turn-meta">
									<summary>meta</summary>
									<pre>{JSON.stringify(turn.meta, null, 2)}</pre>
								</details>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; height: calc(100dvh - 3rem); }
	.page-header { border-bottom: 1px solid #2a2a3a; padding-bottom: 1rem; flex-shrink: 0; }
	.page-title  { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub    { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; font-style: italic; }

	/* Two-pane layout */
	.console-layout {
		display: grid;
		grid-template-columns: 18rem 1fr;
		gap: 0;
		flex: 1;
		min-height: 0;
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
		overflow: hidden;
		background: #0d0d15;
	}

	/* Session list */
	.session-list {
		border-right: 1px solid #2a2a3a;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	.pane-title {
		padding: 0.6rem 0.9rem;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #6b6b80;
		border-bottom: 1px solid #2a2a3a;
		flex-shrink: 0;
	}
	.empty-hint {
		padding: 1.5rem 1rem;
		font-size: 0.75rem;
		color: #6b6b80;
		font-style: italic;
	}
	.session-row {
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid #1e1e2e;
		padding: 0.7rem 0.9rem;
		text-align: left;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		transition: background 0.1s;
	}
	.session-row:hover      { background: #1a1a28; }
	.session-selected { background: #121e10; border-left: 3px solid #8ecf5e; }
	.session-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.session-challenge {
		font-size: 0.8rem;
		font-weight: 700;
		color: #c4c4d4;
	}
	.session-mid {
		font-size: 0.68rem;
		color: #8888a0;
	}
	.session-bot {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.session-date { font-size: 0.65rem; color: #4a4a60; }

	/* Transcript pane */
	.transcript-pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
	.transcript-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 100%;
		color: #6b6b80;
		font-size: 0.8rem;
		text-align: center;
		padding: 2rem;
	}
	.td-icon { font-size: 2.5rem; }
	.td-hint { font-style: italic; font-size: 0.72rem; color: #4a4a60; }
	.transcript-scroll {
		overflow-y: auto;
		flex: 1;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Turn bubbles */
	.turn {
		border-radius: 0.4rem;
		padding: 0.65rem 0.85rem;
		border: 1px solid transparent;
		font-size: 0.8rem;
		max-width: 90%;
	}
	.role-deepdish {
		background: #1a1230;
		border-color: #3a2a60;
		color: #c4b0f0;
		align-self: flex-start;
	}
	.role-operative {
		background: #121e10;
		border-color: #2a4020;
		color: #90d090;
		align-self: flex-end;
	}
	.role-system {
		background: #1a1a1a;
		border-color: #2a2a2a;
		color: #6b6b80;
		align-self: center;
		max-width: 100%;
		font-style: italic;
		font-size: 0.72rem;
	}
	.turn-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.35rem;
	}
	.turn-role {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.turn-num {
		font-size: 0.6rem;
		opacity: 0.4;
	}
	.turn-body {
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.55;
	}
	.turn-meta {
		margin-top: 0.5rem;
		font-size: 0.68rem;
	}
	.turn-meta summary {
		cursor: pointer;
		color: #6b6b80;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
	}
	.turn-meta pre {
		margin: 0.3rem 0 0;
		padding: 0.5rem;
		background: #0a0a12;
		border-radius: 0.25rem;
		overflow-x: auto;
		color: #8888a0;
		font-size: 0.68rem;
		line-height: 1.4;
	}
</style>
