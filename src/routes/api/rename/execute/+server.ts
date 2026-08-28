import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { diskScanService } from '$lib/server/library/disk-scan.js';
import { z } from 'zod';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';

export const renameExecuteSchema = z.object({
	fileIds: z
		.array(z.string())
		.min(1, 'fileIds array is required and must not be empty')
		.max(500, 'A maximum of 500 files can be renamed per batch'),
	mediaType: z.enum(['movie', 'episode', 'mixed']).optional().default('mixed')
});

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
