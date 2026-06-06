import { sql } from '../db/index';
import { grantItem } from '../engine/inventory';
import { getChallenge } from '../challenges/registry';

export interface AdminHint {
	id: string;
	challengeId: string | null;
	text: string;
	createdAt: string;
}

async function ensureOperative(operativeId: string): Promise<void> {
	const [operative] = await sql<{ id: string }[]>`
		SELECT id FROM operatives WHERE id = ${operativeId}
	`;
	if (!operative) throw new Error('Operative not found');
}

export async function adminCreateHint(
	operativeId: string,
	text: string,
	challengeId: string | null
): Promise<void> {
	await ensureOperative(operativeId);
	if (challengeId && !getChallenge(challengeId)) throw new Error('Unknown challenge');
	const hint: AdminHint = {
		id: crypto.randomUUID(),
		challengeId,
		text,
		createdAt: new Date().toISOString()
	};

	await sql`
		INSERT INTO game_state (operative_id, flags)
		VALUES (
			${operativeId},
			${sql.json({ adminHints: [hint] } as any)}
		)
		ON CONFLICT (operative_id) DO UPDATE SET
			flags = jsonb_set(
				game_state.flags,
				'{adminHints}',
				COALESCE(game_state.flags->'adminHints', '[]'::jsonb) || ${sql.json([hint] as any)},
				true
			),
			updated_at = now()
	`;
}

export async function adminGrantCatalogItem(
	operativeId: string,
	catalogId: string,
	qty: number
): Promise<void> {
	await ensureOperative(operativeId);
	await grantItem(operativeId, catalogId, {
		qty,
		metadata: { grantedBy: 'admin', grantedAt: new Date().toISOString() }
	});
}

export async function adminSetCurrentAct(operativeId: string, act: number): Promise<void> {
	await ensureOperative(operativeId);
	await sql`
		INSERT INTO game_state (operative_id, current_act)
		VALUES (${operativeId}, ${act})
		ON CONFLICT (operative_id) DO UPDATE SET
			current_act = EXCLUDED.current_act,
			updated_at = now()
	`;
}

export async function adminBypassChallenge(
	operativeId: string,
	challengeId: string,
	reason: string
): Promise<void> {
	await ensureOperative(operativeId);
	const challenge = getChallenge(challengeId);
	if (!challenge) throw new Error('Unknown challenge');

	await sql.begin(async (tx) => {
		await tx`
			INSERT INTO game_state (operative_id, current_act, challenge_status, flags)
			VALUES (
				${operativeId},
				${challenge.act},
				${tx.json({ [challengeId]: 'cleared' } as any)},
				${tx.json({ lastAdminBypass: { challengeId, reason, at: new Date().toISOString() } } as any)}
			)
			ON CONFLICT (operative_id) DO UPDATE SET
				current_act = GREATEST(game_state.current_act, ${challenge.act}),
				challenge_status = game_state.challenge_status || ${tx.json({ [challengeId]: 'cleared' } as any)},
				flags = game_state.flags || ${tx.json({
					lastAdminBypass: { challengeId, reason, at: new Date().toISOString() }
				} as any)},
				updated_at = now()
		`;

		await tx`
			INSERT INTO challenge_attempts
				(operative_id, challenge_id, challenge_type, status, input, result, resolved_at)
			VALUES (
				${operativeId},
				${challengeId},
				${challenge.type},
				'passed',
				${tx.json({ source: 'admin_bypass', reason } as any)},
				${tx.json({ passed: true, bypassed: true, reason } as any)},
				now()
			)
		`;
	});
}
