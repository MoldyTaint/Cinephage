import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { ValidationError } from '$lib/errors';
import { diskScanService } from '$lib/server/library/disk-scan.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';
import { renameExecuteSchema } from '$lib/server/library/naming/rename-execute-schema.js';

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	if (diskScanService.scanning) {
		return json(
			{ error: 'A library scan is in progress. Wait for it to finish, then retry the rename.' },
			{ status: 409 }
		);
	}

	const { request } = event;
	try {
		const { fileIds, mediaType = 'mixed' } = await parseBody(request, renameExecuteSchema);

		logger.info(
			{
				fileCount: fileIds.length,
				mediaType
			},
			'[RenameExecute API] Starting rename execution'
		);

		const service = new RenamePreviewService();
		const result = await service.executeRenames(fileIds, mediaType);

		logger.info(
			{
				processed: result.processed,
				succeeded: result.succeeded,
				failed: result.failed
			},
			'[RenameExecute API] Rename execution complete'
		);

		if (result.succeeded > 0) {
			libraryMediaEvents.emitLibraryDataChanged({
				source: mediaType === 'episode' ? 'series' : 'movie',
				reason: 'renames-executed'
			});
		}

		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/scan is in progress/i.test(message)) {
			return json({ error: message }, { status: 409 });
		}
		if (error instanceof ValidationError) {
			return json({ error: message }, { status: 400 });
		}

		logger.error(
			{
				error
			},
			'[RenameExecute API] Failed to execute renames'
		);

		return json(
			{
				error: 'Failed to execute renames',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
