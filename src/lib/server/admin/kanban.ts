import { sql } from '../db/index';
import { CATEGORY_META } from '$lib/shared/kanban-meta';
import type { KanbanDev, KanbanCategory, KanbanStatus, KanbanItem, KanbanComment } from '$lib/shared/kanban-meta';

// Re-export everything so server-only callers only need one import
export type { KanbanStatus, KanbanPriority, KanbanCategory, KanbanDev, KanbanItem, KanbanComment } from '$lib/shared/kanban-meta';
export { STATUSES, PRIORITY_META, CHALLENGE_TYPE_META, CATEGORY_META } from '$lib/shared/kanban-meta';

export interface CategorySummary {
	category:    KanbanCategory;
	label:       string;
	total:       number;
	backlog:     number;
	in_progress: number;
	review:      number;
	done:        number;
}

const SELECT_COLS = `
	i.id, i.title, i.description, i.category,
	i.challenge_id, i.act, i.challenge_type,
	i.beacon_id_hint, i.lua_script_path,
	i.status, i.priority,
	i.assignee_id, d.name AS assignee_name,
	d.initials AS assignee_initials, d.color AS assignee_color,
	i.commitment, i.due_date::text AS due_date,
	i.updated_at::text AS updated_at,
	(SELECT COUNT(*)::int FROM kanban_comments WHERE item_id = i.id) AS comment_count
`;

export async function getKanbanItems(category?: KanbanCategory): Promise<KanbanItem[]> {
	if (category) {
		return sql<KanbanItem[]>`
			SELECT ${sql.unsafe(SELECT_COLS)}
			FROM kanban_items i
			LEFT JOIN kanban_developers d ON d.id = i.assignee_id
			WHERE i.category = ${category}
			ORDER BY
				CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
				i.act NULLS LAST, i.created_at
		`;
	}
	return sql<KanbanItem[]>`
		SELECT ${sql.unsafe(SELECT_COLS)}
		FROM kanban_items i
		LEFT JOIN kanban_developers d ON d.id = i.assignee_id
		ORDER BY i.category, i.status,
			CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
			i.created_at
	`;
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
	const rows = await sql<{ category: string; status: string; cnt: number }[]>`
		SELECT category, status, COUNT(*)::int AS cnt
		FROM kanban_items
		GROUP BY category, status
	`;
	const map: Record<string, CategorySummary> = {};
	for (const r of rows) {
		const cat  = r.category as KanbanCategory;
		const meta = CATEGORY_META[cat];
		if (!map[cat]) map[cat] = { category: cat, label: meta?.label ?? cat, total: 0, backlog: 0, in_progress: 0, review: 0, done: 0 };
		const s = r.status as KanbanStatus;
		map[cat][s] = (map[cat][s] ?? 0) + r.cnt;
		map[cat].total += r.cnt;
	}
	return Object.values(map);
}

export async function getDevelopers(): Promise<KanbanDev[]> {
	return sql<KanbanDev[]>`SELECT id, name, initials, color FROM kanban_developers ORDER BY name`;
}

export async function claimItem(
	itemId: string, devId: string, commitment: string, dueDate: string
): Promise<void> {
	await sql`
		UPDATE kanban_items
		SET assignee_id = ${devId},
		    commitment  = ${commitment},
		    due_date    = ${dueDate || null},
		    status      = CASE WHEN status = 'backlog' THEN 'in_progress' ELSE status END,
		    updated_at  = now()
		WHERE id = ${itemId}
	`;
}

export async function unclaimItem(itemId: string): Promise<void> {
	await sql`
		UPDATE kanban_items
		SET assignee_id = NULL, commitment = NULL, due_date = NULL, updated_at = now()
		WHERE id = ${itemId}
	`;
}

export async function moveItem(itemId: string, status: KanbanStatus): Promise<void> {
	await sql`UPDATE kanban_items SET status = ${status}, updated_at = now() WHERE id = ${itemId}`;
}

export async function addDeveloper(name: string, initials: string, color: string): Promise<void> {
	await sql`
		INSERT INTO kanban_developers (name, initials, color)
		VALUES (${name}, ${initials.slice(0, 3).toUpperCase()}, ${color})
		ON CONFLICT (name) DO UPDATE SET initials = EXCLUDED.initials, color = EXCLUDED.color
	`;
}

export async function editItem(
	itemId: string,
	fields: { title?: string; description?: string; priority?: string }
): Promise<void> {
	if (fields.title !== undefined) {
		await sql`UPDATE kanban_items SET title = ${fields.title}, updated_at = now() WHERE id = ${itemId}`;
	}
	if (fields.description !== undefined) {
		await sql`UPDATE kanban_items SET description = ${fields.description}, updated_at = now() WHERE id = ${itemId}`;
	}
	if (fields.priority !== undefined) {
		await sql`UPDATE kanban_items SET priority = ${fields.priority}, updated_at = now() WHERE id = ${itemId}`;
	}
}

export async function getItemComments(itemId: string): Promise<KanbanComment[]> {
	return sql<KanbanComment[]>`
		SELECT id, item_id, dev_id, dev_name, dev_initials, dev_color, body,
		       created_at::text AS created_at
		FROM kanban_comments
		WHERE item_id = ${itemId}
		ORDER BY created_at ASC
	`;
}

export async function addComment(
	itemId: string,
	devId: string | null,
	devName: string,
	devInitials: string,
	devColor: string,
	body: string
): Promise<void> {
	await sql`
		INSERT INTO kanban_comments (item_id, dev_id, dev_name, dev_initials, dev_color, body)
		VALUES (${itemId}, ${devId || null}, ${devName}, ${devInitials}, ${devColor}, ${body})
	`;
}
