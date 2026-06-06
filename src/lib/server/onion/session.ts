/**
 * Shared Onion DAO login resolution.
 *
 * rpg.oniondao.dev shares the `session` cookie with oniondao.dev (the cookie is
 * scoped to `.oniondao.dev`). This app has its OWN database, so it cannot read
 * the sessions table directly — instead the SSR server forwards the cookie to
 * the landing app's session-introspection endpoint and trusts its answer.
 *
 * See landing-2026 `src/routes/api/public/session/+server.ts`.
 */
import { env } from '$env/dynamic/private';

const BASE = () => env.ONION_API_BASE_URL || 'https://oniondao.dev';

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	handle: string | null;
	avatarUrl: string | null;
	isAdmin: boolean;
	isStaff: boolean;
}

/**
 * Validate a `session` cookie value against oniondao.dev and return the user,
 * or null if the cookie is absent/invalid/expired. Never throws — a down auth
 * service or a malformed response degrades to "logged out" so the public guide
 * stays up even when the identity service is unreachable.
 */
export async function fetchSessionUser(sessionToken: string | undefined): Promise<AuthUser | null> {
	if (!sessionToken) return null;
	try {
		const res = await fetch(`${BASE()}/api/public/session`, {
			headers: { cookie: `session=${sessionToken}` }
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { user: AuthUser | null };
		return data.user ?? null;
	} catch {
		return null;
	}
}
