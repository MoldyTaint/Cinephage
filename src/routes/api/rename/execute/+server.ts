import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { z } from 'zod';

const renameExecuteSchema = z.object({
	fileIds: z.array(z.string()).min(1, 'fileIds array is required and must not be empty'),
	mediaType: z.enum(['movie', 'episode', 'mixed']).optional().default('mixed')
});

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

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

		return json(result);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error)
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
