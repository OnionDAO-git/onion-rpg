/**
 * Display constants and shared types for the Kanban board. Lives in $lib/shared
 * so both the server query module and browser Svelte components can import safely.
 */

export interface KanbanDev {
	id:       string;
	name:     string;
	initials: string;
	color:    string;
}

export type KanbanStatus   = 'backlog' | 'in_progress' | 'review' | 'done';

export interface KanbanItem {
	id:               string;
	title:            string;
	description:      string;
	category:         KanbanCategory;
	challengeId:      string | null;
	act:              number | null;
	challengeType:    string | null;
	beaconIdHint:     string | null;
	luaScriptPath:    string | null;
	status:           KanbanStatus;
	priority:         KanbanPriority;
	assigneeId:       string | null;
	assigneeName:     string | null;
	assigneeInitials: string | null;
	assigneeColor:    string | null;
	commitment:       string | null;
	dueDate:          string | null;
	updatedAt:        string;
	commentCount:     number;
}

export interface KanbanComment {
	id:           string;
	itemId:       string;
	devId:        string | null;
	devName:      string;
	devInitials:  string;
	devColor:     string;
	body:         string;
	createdAt:    string;
}
export type KanbanPriority = 'low' | 'medium' | 'high' | 'critical';
export type KanbanCategory = 'challenge' | 'story' | 'infrastructure';

export const STATUSES: { value: KanbanStatus; label: string; color: string }[] = [
	{ value: 'backlog',     label: 'Backlog',     color: '#4a4a60' },
	{ value: 'in_progress', label: 'In Progress', color: '#72a4e4' },
	{ value: 'review',      label: 'In Review',   color: '#e4a472' },
	{ value: 'done',        label: 'Done',        color: '#8ecf5e' },
];

export const PRIORITY_META: Record<KanbanPriority, { color: string; label: string }> = {
	low:      { color: '#4a4a60', label: 'Low'      },
	medium:   { color: '#72a4e4', label: 'Medium'   },
	high:     { color: '#e4a472', label: 'High'     },
	critical: { color: '#e47272', label: 'Critical' },
};

export const CHALLENGE_TYPE_META: Record<string, { color: string; label: string }> = {
	combat:   { color: '#e47272', label: 'Combat'   },
	dialogue: { color: '#72a4e4', label: 'Dialogue' },
	merchant: { color: '#e4d472', label: 'Merchant' },
	npc:      { color: '#a472e4', label: 'NPC / AI' },
};

export const CATEGORY_META: Record<KanbanCategory, { label: string; icon: string; desc: string }> = {
	challenge:      { label: 'Challenges',     icon: '⚡', desc: '13 beacon interactions — the core gameplay loop' },
	story:          { label: 'Story',          icon: '📖', desc: 'Narrative, dialogue, and proof-story verification' },
	infrastructure: { label: 'Infrastructure', icon: '🔧', desc: 'Hardware, firmware, networking, and deployment' },
};
