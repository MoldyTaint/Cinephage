import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getArchiveStatusService } from '$lib/server/archivers/ArchiveStatusService.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const status = await getArchiveStatusService().series(event.params.id);
	return status
		? json({ success: true, status })
		: json({ success: false, error: 'Series not found' }, { status: 404 });
};
