/**
 * Batched Folder Reorganization API
 *
 * POST /api/rename/reorganize-batch
 * Reorganizes parent folders for multiple movies or series in a single
 * request. Eliminates the N+1 sequential HTTP calls the rename page
 * previously made (one per media item).
 *
 * Each item is processed independently — a failure on one item does not
 * abort the others. Returns per-item results so the client can report
 * partial success.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService.js';
import { logger } from '$lib/logging/index.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { parseBody } from '$lib/server/api/validate.js';
import { z } from 'zod';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents.js';
import type { ReorganizeBatchResult } from '$lib/library/naming/types.js';

const reorganizeBatchSchema = z.object({
	items: z
		.array(
			z.object({
				mediaId: z.string().min(1),
				mediaType: z.enum(['movie', 'series'])
			})
		)
		.min(1)
		.max(500)
});

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	try {
		const { items } = await parseBody(request, reorganizeBatchSchema);

		const service = new RenamePreviewService();
		const results: ReorganizeBatchResult['results'] = [];
		let organized = 0;
		let failed = 0;

		for (const item of items) {
			try {
				const result = await service.reorganizeFolder(item.mediaId, item.mediaType);
				if (result.success) {
					organized++;
					results.push({
						mediaId: item.mediaId,
						mediaType: item.mediaType,
						success: true
					});
					libraryMediaEvents.emitLibraryDataChanged({
						source: item.mediaType === 'series' ? 'series' : 'movie',
						reason: 'folder-reorganized',
						entityId: item.mediaId
					});
				} else {
					failed++;
					results.push({
						mediaId: item.mediaId,
						mediaType: item.mediaType,
						success: false,
						error: result.error
					});
				}
			} catch (error) {
				failed++;
				results.push({
					mediaId: item.mediaId,
					mediaType: item.mediaType,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		logger.info(
			{ total: items.length, organized, failed },
			'[ReorganizeBatch API] Batch reorganization complete'
		);

		return json({
			success: failed === 0,
			organized,
			failed,
			results
		} satisfies ReorganizeBatchResult);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error)
			},
			'[ReorganizeBatch API] Failed to reorganize folders'
		);

		return json(
			{
				error: 'Failed to reorganize folders',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
