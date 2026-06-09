<script lang="ts">
	import type { RpgAdminGrant } from '$lib/server/admin/rpg-admins';

	let { data, form } = $props<{
		data: { grants: RpgAdminGrant[] };
		form?: { message?: string; values?: Record<string, FormDataEntryValue> };
	}>();

	let grants = $derived(data.grants);

	function value(name: string): string {
		const raw = form?.values?.[name];
		return typeof raw === 'string' ? raw : '';
	}

	function fmtDate(v: string): string {
		try {
			return new Date(v).toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return v;
		}
	}

	function displayName(grant: RpgAdminGrant): string {
		return grant.name ?? grant.handle ?? grant.email ?? grant.userId;
	}
</script>

<svelte:head>
	<title>RPG Admins - ONION RPG Ops</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div>
			<h1 class="page-title">RPG Admins</h1>
			<p class="page-sub">{grants.length} local grant{grants.length === 1 ? '' : 's'}</p>
		</div>
	</header>

	{#if form?.message}
		<div class="form-error">{form.message}</div>
	{/if}

	<section class="grant-panel" aria-labelledby="grant-title">
		<h2 id="grant-title">Set RPG Admin</h2>
		<form method="POST" action="?/grant" class="grant-form">
			<label>
				<span>Onion DAO User ID</span>
				<input name="userId" value={value('userId')} required autocomplete="off" />
			</label>

			<label>
				<span>Email</span>
				<input name="email" type="email" value={value('email')} autocomplete="off" />
			</label>

			<label>
				<span>Name</span>
				<input name="name" value={value('name')} autocomplete="off" />
			</label>

			<label>
				<span>Handle</span>
				<input name="handle" value={value('handle')} autocomplete="off" />
			</label>

			<label class="wide">
				<span>Avatar URL</span>
				<input name="avatarUrl" type="url" value={value('avatarUrl')} autocomplete="off" />
			</label>

			<button class="grant-submit" type="submit">Grant RPG Admin</button>
		</form>
	</section>

	<section class="table-card" aria-labelledby="current-title">
		<div class="table-head">
			<h2 id="current-title">Current RPG Admins</h2>
		</div>

		{#if grants.length}
			<table>
				<thead>
					<tr>
						<th>User</th>
						<th>Onion DAO User ID</th>
						<th>Granted By</th>
						<th>Updated</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each grants as grant (grant.userId)}
						<tr>
							<td>
								<div class="person">
									{#if grant.avatarUrl}
										<img src={grant.avatarUrl} alt="" />
									{:else}
										<span class="avatar">{displayName(grant).slice(0, 1).toUpperCase()}</span>
									{/if}
									<div>
										<div class="person-name">{displayName(grant)}</div>
										{#if grant.email}
											<div class="person-meta">{grant.email}</div>
										{:else if grant.handle}
											<div class="person-meta">@{grant.handle}</div>
										{/if}
									</div>
								</div>
							</td>
							<td><code>{grant.userId}</code></td>
							<td>{grant.grantedByName ?? grant.grantedByEmail ?? grant.grantedByUserId}</td>
							<td>{fmtDate(grant.updatedAt)}</td>
							<td class="actions">
								<form method="POST" action="?/revoke">
									<input type="hidden" name="userId" value={grant.userId} />
									<button class="revoke-btn" type="submit">Revoke</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty-hint">No local RPG Admin grants yet.</p>
		{/if}
	</section>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 1100px; }
	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		border-bottom: 1px solid #2a2a3a;
		padding-bottom: 1rem;
	}
	.page-title { font-size: 1.3rem; font-weight: 700; color: #8ecf5e; margin: 0; }
	.page-sub { margin: 0.3rem 0 0; font-size: 0.75rem; color: #6b6b80; }

	.form-error {
		border: 1px solid #6d3b3b;
		background: #231214;
		color: #ff9b9b;
		border-radius: 0.4rem;
		padding: 0.65rem 0.8rem;
		font-size: 0.78rem;
	}

	.grant-panel,
	.table-card {
		border: 1px solid #2a2a3a;
		border-radius: 0.5rem;
		background: #0f0f1a;
	}

	.grant-panel { padding: 1rem; }
	h2 {
		margin: 0 0 0.85rem;
		font-size: 0.75rem;
		color: #8888a0;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.grant-form {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.85rem;
		align-items: end;
	}
	label { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
	label span {
		font-size: 0.65rem;
		color: #6b6b80;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	input {
		width: 100%;
		box-sizing: border-box;
		background: #0a0a12;
		border: 1px solid #2a2a3a;
		border-radius: 0.35rem;
		color: #d4d4e0;
		font: inherit;
		font-size: 0.78rem;
		padding: 0.5rem 0.6rem;
	}
	input:focus {
		outline: none;
		border-color: #8ecf5e;
		box-shadow: 0 0 0 1px #8ecf5e33;
	}
	.wide { grid-column: span 3; }
	.grant-submit,
	.revoke-btn {
		border: 1px solid transparent;
		border-radius: 0.35rem;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.grant-submit {
		background: #8ecf5e;
		color: #081008;
		font-weight: 700;
		padding: 0.5rem 0.75rem;
	}
	.grant-submit:hover { background: #a5e176; }

	.table-head { padding: 1rem 1rem 0; }
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}
	th {
		text-align: left;
		color: #6b6b80;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.62rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid #2a2a3a;
	}
	td {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #1e1e2e;
		color: #c4c4d4;
		vertical-align: middle;
	}
	tr:last-child td { border-bottom: none; }
	code {
		color: #72a4e4;
		font-family: inherit;
		font-size: 0.72rem;
	}
	.person { display: flex; align-items: center; gap: 0.65rem; min-width: 12rem; }
	.person img,
	.avatar {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.person img { object-fit: cover; background: #2a2a3a; }
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		background: #8ecf5e;
		color: #0d0d15;
		font-weight: 700;
	}
	.person-name { color: #d4d4e0; font-weight: 700; }
	.person-meta { color: #6b6b80; font-size: 0.7rem; margin-top: 0.15rem; }
	.actions { text-align: right; }
	.revoke-btn {
		background: #21161a;
		border-color: #4b242f;
		color: #ff9b9b;
		padding: 0.35rem 0.6rem;
	}
	.revoke-btn:hover { background: #301b21; border-color: #7a3545; }
	.empty-hint {
		margin: 0;
		padding: 1rem;
		font-size: 0.78rem;
		color: #6b6b80;
	}

	@media (max-width: 900px) {
		.grant-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.wide { grid-column: span 2; }
	}

	@media (max-width: 680px) {
		.grant-form { grid-template-columns: 1fr; }
		.wide { grid-column: span 1; }
		.table-card { overflow-x: auto; }
	}
</style>
