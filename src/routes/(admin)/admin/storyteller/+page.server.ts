/**
 * Storyteller console. Lists recent DEEPDISH sessions. When ?session=<id>
 * is present, loads the full transcript for that session.
 */
import type { PageServerLoad } from './$types';
import { adminListStortellerSessions, adminGetSessionTranscript } from '$lib/server/admin/queries';

export const load: PageServerLoad = async ({ url }) => {
	const sessionId = url.searchParams.get('session');

	const sessions = await adminListStortellerSessions();

	let transcript: Awaited<ReturnType<typeof adminGetSessionTranscript>> = [];
	if (sessionId) {
		transcript = await adminGetSessionTranscript(sessionId);
	}

	return { sessions, selectedSessionId: sessionId, transcript };
};
