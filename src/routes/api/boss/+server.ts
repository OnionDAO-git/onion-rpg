/**
 * /api/boss — global timed boss events (B6, personal-instance v1).
 *
 *   GET  /api/boss?hardwareId=...   -> { window, bosses, hp }
 *   POST /api/boss { hardwareId, action, ... }
 *     { action: 'start',  bossId }                       -> open a boss fight
 *     { action: 'roll',   sessionId, bossId, roll? }     -> apply one combat roll
 *     { action: 'potion', externalId? }                  -> onion-paid full heal
 *     { action: 'revive', externalId? }                  -> onion-paid revive
 *
 * Bosses don't cost energy; they're gated by the boss window + Colony level.
 */
import { json, error } from '@sveltejs/kit';
import { isAuthorizedBeacon } from '$lib/server/api/auth';
import { resolveOperative } from '$lib/server/engine/index';
import {
	bossWindowState,
	availableBosses,
	startBoss,
	resolveBossRoll,
	buyPotion,
	revive,
	getPlayerHp
} from '$lib/server/engine/boss';
import type { CombatRoll } from '$lib/shared/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	const hardwareId = url.searchParams.get('hardwareId');
	if (!hardwareId) error(400, 'hardwareId query param is required');
	const op = await resolveOperative(hardwareId);
	return json({
		window: bossWindowState(),
		bosses: await availableBosses(),
		hp: await getPlayerHp(op.id)
	});
};

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedBeacon(request)) error(401, 'Unauthorized');
	const body = (await request.json()) as {
		hardwareId?: string;
		action?: string;
		bossId?: string;
		sessionId?: string;
		roll?: Pick<CombatRoll, 'wave' | 'roll' | 'dmg' | 'sig'>;
		externalId?: string;
	};
	if (!body.hardwareId) error(400, 'hardwareId is required');
	const op = await resolveOperative(body.hardwareId);

	try {
		switch (body.action) {
			case 'start': {
				if (!body.bossId) error(400, 'bossId is required');
				const session = await startBoss(op.id, body.bossId);
				return json({ sessionId: session.id, enemyHp: session.enemyHp, opHp: session.operativeHp, status: session.status });
			}
			case 'roll': {
				if (!body.sessionId || !body.bossId) error(400, 'sessionId and bossId are required');
				const r = await resolveBossRoll(op.id, body.sessionId, body.bossId, body.roll);
				return json({ status: r.session.status, enemyHp: r.session.enemyHp, opHp: r.session.operativeHp, hp: r.hp, loot: r.loot ?? null });
			}
			case 'potion': {
				const externalId = body.externalId ?? `${op.id}:boss:potion:${Date.now()}`;
				return json({ hp: await buyPotion(op.id, externalId) });
			}
			case 'revive': {
				const externalId = body.externalId ?? `${op.id}:boss:revive:${Date.now()}`;
				return json({ hp: await revive(op.id, externalId) });
			}
			default:
				error(400, `unknown action: ${body.action}`);
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		error(409, msg);
	}
};
