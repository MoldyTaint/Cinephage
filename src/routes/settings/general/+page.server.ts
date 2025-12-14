import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { rootFolderCreateSchema, rootFolderUpdateSchema } from '$lib/validation/schemas';
import { getRootFolderService } from '$lib/server/downloadClients';

export const load: PageServerLoad = async () => {
	const rootFolderService = getRootFolderService();
	const rootFolders = await rootFolderService.getFolders();

	return {
		rootFolders
	};
};

export const actions: Actions = {
	// Root Folder Actions
	createRootFolder: async ({ request }) => {
		const data = await request.formData();
		const jsonData = data.get('data');

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { rootFolderError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { rootFolderError: 'Invalid JSON data' });
		}

		const result = rootFolderCreateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				rootFolderError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const service = getRootFolderService();

		try {
			const folder = await service.createFolder(result.data);
			return { rootFolderSuccess: true, createdFolderId: folder.id };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { rootFolderError: message });
		}
	},

	updateRootFolder: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const jsonData = data.get('data');

		if (!id || typeof id !== 'string') {
			return fail(400, { rootFolderError: 'Missing folder ID' });
		}

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { rootFolderError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { rootFolderError: 'Invalid JSON data' });
		}

		const result = rootFolderUpdateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				rootFolderError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const service = getRootFolderService();

		try {
			await service.updateFolder(id, result.data);
			return { rootFolderSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { rootFolderError: message });
		}
	},

	deleteRootFolder: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { rootFolderError: 'Missing folder ID' });
		}

		const service = getRootFolderService();

		try {
			await service.deleteFolder(id);
			return { rootFolderSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { rootFolderError: message });
		}
	}
};
