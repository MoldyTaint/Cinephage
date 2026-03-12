/**
 * Rename Execute API
 *
 * POST /api/rename/execute
 * Execute approved file renames.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

interface ExecuteRequest {
	fileIds: string[];
	mediaType?: 'movie' | 'episode' | 'mixed';
}

/**
 * POST /api/rename/execute
 * Execute approved file renames
 *
 * Body:
 * {
 *   fileIds: string[] - Array of file IDs to rename
 *   mediaType?: 'movie' | 'episode' | 'mixed' - Type of files (default: 'mixed')
 * }
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	try {
		const body = (await request.json()) as ExecuteRequest;
		const { fileIds, mediaType = 'mixed' } = body;

		if (!fileIds || !Array.isArray(fileIds)) {
			return json({ error: 'fileIds array is required' }, { status: 400 });
		}

		if (fileIds.length === 0) {
			return json({ error: 'fileIds array cannot be empty' }, { status: 400 });
		}

		// Validate fileIds are strings
		if (!fileIds.every((id) => typeof id === 'string')) {
			return json({ error: 'All fileIds must be strings' }, { status: 400 });
		}

		logger.info('[RenameExecute API] Starting rename execution', {
			fileCount: fileIds.length,
			mediaType
		});

		const service = new RenamePreviewService();
		const result = await service.executeRenames(fileIds, mediaType);

		logger.info('[RenameExecute API] Rename execution complete', {
			processed: result.processed,
			succeeded: result.succeeded,
			failed: result.failed
		});

		return json(result);
	} catch (error) {
		logger.error('[RenameExecute API] Failed to execute renames', {
			error: error instanceof Error ? error.message : String(error)
		});

		return json(
			{
				error: 'Failed to execute renames',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
