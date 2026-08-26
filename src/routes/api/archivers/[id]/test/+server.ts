import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { getArchiverManager } from '$lib/server/archivers/index.js';

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;
	const manager = getArchiverManager();
	const record = await manager.getRecord(event.params.id);
	if (!record) return json({ success: false, error: 'Archiver not found' }, { status: 404 });
	return json(await manager.testRecord(record));
};
