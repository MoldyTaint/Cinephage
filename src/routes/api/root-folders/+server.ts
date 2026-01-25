import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRootFolderService } from '$lib/server/downloadClients/RootFolderService';
import { rootFolderCreateSchema } from '$lib/validation/schemas';

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
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = rootFolderCreateSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;
	const service = getRootFolderService();

	try {
		const created = await service.createFolder({
			name: validated.name,
			path: validated.path,
			mediaType: validated.mediaType,
			isDefault: validated.isDefault,
			readOnly: validated.readOnly,
			preserveSymlinks: validated.preserveSymlinks,
			defaultMonitored: validated.defaultMonitored
		});

		return json({ success: true, folder: created });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
