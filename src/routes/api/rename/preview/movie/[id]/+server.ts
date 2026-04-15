/**
 * Single Movie Rename Preview API
 *
 * GET /api/rename/preview/movie/:id
 * Returns a preview of how files for a specific movie would be renamed.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/rename/preview/movie/:id
 * Get preview of rename for a single movie's files
 */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	try {
		const { id } = params;

		if (!id) {
			return json({ error: 'Movie ID is required' }, { status: 400 });
		}

		const service = new RenamePreviewService();
		const result = await service.previewMovie(id);

		return json(result);
	} catch (error) {
		logger.error(
			{
				movieId: params.id,
				error: error instanceof Error ? error.message : String(error)
			},
			'[RenamePreview API] Failed to preview movie rename'
		);

		return json(
			{
				error: 'Failed to generate movie rename preview',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
