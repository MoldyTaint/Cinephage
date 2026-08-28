import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getArchiveJobManager } from '$lib/server/archivers/index.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const job = await getArchiveJobManager().get(event.params.id);
	return job
		? json({ success: true, job })
		: json({ success: false, error: 'Archive job not found or expired' }, { status: 404 });
};
