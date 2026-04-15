import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRootFolderService } from '$lib/server/downloadClients/RootFolderService';
import { rootFolderCreateSchema } from '$lib/validation/schemas';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * GET /api/root-folders
 * List all configured root folders with free space info.
 */
export const GET: RequestHandler = async () => {
	const service = getRootFolderService();
	const folders = await service.getFolders();
	return json(folders);
};

/**
 * POST /api/root-folders
 * Create a new root folder.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	const validated = await parseBody(request, rootFolderCreateSchema);

	const service = getRootFolderService();

	const created = await service.createFolder({
		name: validated.name,
		path: validated.path,
		mediaType: validated.mediaType,
		mediaSubType: validated.mediaSubType,
		isDefault: validated.isDefault,
		readOnly: validated.readOnly,
		preserveSymlinks: validated.preserveSymlinks,
		defaultMonitored: validated.defaultMonitored
	});

	return json({ success: true, folder: created });
};
