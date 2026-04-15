/**
 * Series Rename Preview API
 *
 * GET /api/rename/preview/series/:id
 * Returns a preview of how files for a specific series would be renamed.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/rename/preview/series/:id
 * Get preview of rename for all files in a series
 */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	try {
		const { id } = params;

		if (!id) {
			return json({ error: 'Series ID is required' }, { status: 400 });
		}

		const service = new RenamePreviewService();
		const result = await service.previewSeries(id);

		return json(result);
	} catch (error) {
		logger.error(
			{
				seriesId: params.id,
				error: error instanceof Error ? error.message : String(error)
			},
			'[RenamePreview API] Failed to preview series rename'
		);

		return json(
			{
				error: 'Failed to generate series rename preview',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
