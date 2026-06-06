import { env } from '$env/dynamic/private';

const LOGIN_BASE = () => env.ONION_API_BASE_URL || 'https://oniondao.dev';

function sameOriginReturnUrl(currentUrl: URL, value: string | null | undefined): string {
	if (!value) return new URL('/', currentUrl.origin).href;

	const target = value.trim();
	if (!target || target.startsWith('//')) return new URL('/', currentUrl.origin).href;

	if (target.startsWith('/')) {
		return new URL(target, currentUrl.origin).href;
	}

	try {
		const parsed = new URL(target);
		if (parsed.origin === currentUrl.origin) return parsed.href;
	} catch {
		// Fall through to the safe default.
	}

	return new URL('/', currentUrl.origin).href;
}

export function onionLoginRedirect(
	currentUrl: URL,
	redirectTo: string | null | undefined = currentUrl.href
): string {
	const loginUrl = new URL('/login', LOGIN_BASE());
	loginUrl.searchParams.set('redirectTo', sameOriginReturnUrl(currentUrl, redirectTo));
	return loginUrl.href;
}
