import { sql } from '../db/index';
import type { AuthUser } from '../onion/session';

export interface RpgAdminGrant {
	userId: string;
	email: string | null;
	name: string | null;
	handle: string | null;
	avatarUrl: string | null;
	grantedByUserId: string;
	grantedByEmail: string | null;
	grantedByName: string | null;
	createdAt: string;
	updatedAt: string;
}

export function canManageRpgAdmins(user: AuthUser | null): user is AuthUser {
	return user?.isAdmin === true;
}

export async function hasRpgAdminGrant(userId: string): Promise<boolean> {
	const rows = await sql<{ exists: boolean }[]>`
		SELECT EXISTS (
			SELECT 1 FROM rpg_admin_grants WHERE user_id = ${userId}
		)
	`;
	return rows[0]?.exists === true;
}

export async function applyRpgAdminRole(user: AuthUser): Promise<AuthUser> {
	let isRpgAdmin = false;
	try {
		isRpgAdmin = await hasRpgAdminGrant(user.id);
	} catch {
		isRpgAdmin = false;
	}
	return {
		...user,
		isRpgAdmin,
		canAdminRpg: user.isAdmin || isRpgAdmin
	};
}

export async function listRpgAdminGrants(): Promise<RpgAdminGrant[]> {
	return sql<RpgAdminGrant[]>`
		SELECT
			user_id,
			email,
			name,
			handle,
			avatar_url,
			granted_by_user_id,
			granted_by_email,
			granted_by_name,
			created_at,
			updated_at
		FROM rpg_admin_grants
		ORDER BY updated_at DESC
	`;
}

export async function grantRpgAdmin(input: {
	userId: string;
	email?: string | null;
	name?: string | null;
	handle?: string | null;
	avatarUrl?: string | null;
	grantedBy: AuthUser;
}): Promise<void> {
	await sql`
		INSERT INTO rpg_admin_grants (
			user_id,
			email,
			name,
			handle,
			avatar_url,
			granted_by_user_id,
			granted_by_email,
			granted_by_name
		)
		VALUES (
			${input.userId},
			${input.email ?? null},
			${input.name ?? null},
			${input.handle ?? null},
			${input.avatarUrl ?? null},
			${input.grantedBy.id},
			${input.grantedBy.email},
			${input.grantedBy.name}
		)
		ON CONFLICT (user_id) DO UPDATE SET
			email = EXCLUDED.email,
			name = EXCLUDED.name,
			handle = EXCLUDED.handle,
			avatar_url = EXCLUDED.avatar_url,
			granted_by_user_id = EXCLUDED.granted_by_user_id,
			granted_by_email = EXCLUDED.granted_by_email,
			granted_by_name = EXCLUDED.granted_by_name,
			updated_at = now()
	`;
}

export async function revokeRpgAdmin(userId: string): Promise<void> {
	await sql`
		DELETE FROM rpg_admin_grants
		WHERE user_id = ${userId}
	`;
}
