<script lang="ts">
	/**
	 * StatusBadge — a small coloured pill for status strings
	 * (online/offline, pending/completed, won/lost, etc.).
	 */
	interface Props {
		status: string;
	}
	let { status }: Props = $props();

	type ColorKey = 'green' | 'red' | 'yellow' | 'blue' | 'grey';

	const COLOR_MAP: Record<string, ColorKey> = {
		online: 'green',
		sim: 'blue',
		hardware: 'blue',
		true: 'green',
		registered: 'green',
		settled: 'green',
		completed: 'green',
		won: 'green',
		active: 'yellow',
		pending: 'yellow',
		processing: 'yellow',
		awaiting_badge_signature: 'yellow',
		started: 'yellow',
		continued: 'yellow',
		offline: 'red',
		false: 'red',
		lost: 'red',
		expired: 'red',
		failed: 'red',
		cancelled: 'red',
		denied: 'red',
		npc: 'blue',
		dialogue: 'blue',
		combat: 'red',
		merchant: 'yellow',
		finale: 'green'
	};

	const colorClass: Record<ColorKey, string> = {
		green: 'badge-green',
		red: 'badge-red',
		yellow: 'badge-yellow',
		blue: 'badge-blue',
		grey: 'badge-grey'
	};

	let cls = $derived(colorClass[COLOR_MAP[status.toLowerCase()] ?? 'grey'] ?? 'badge-grey');
</script>

<span class="badge {cls}">{status}</span>

<style>
	.badge {
		display: inline-block;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 9999px;
		white-space: nowrap;
	}
	.badge-green  { background: #1a3a1a; color: #72e472; border: 1px solid #2a5a2a; }
	.badge-red    { background: #3a1a1a; color: #e47272; border: 1px solid #5a2a2a; }
	.badge-yellow { background: #3a3010; color: #e4c472; border: 1px solid #5a4a1a; }
	.badge-blue   { background: #1a2a3a; color: #72a4e4; border: 1px solid #2a3a5a; }
	.badge-grey   { background: #25252f; color: #8888a0; border: 1px solid #35353f; }
</style>
