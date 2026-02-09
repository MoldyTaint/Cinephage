/**
 * Channel Categories Reorder API
 *
 * POST /api/livetv/channel-categories/reorder - Reorder categories
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelCategoryService } from '$lib/server/livetv/categories';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { categoryIds: string[] };

		if (!body.categoryIds || !Array.isArray(body.categoryIds)) {
			throw new ValidationError('categoryIds array is required');
		}

		if (body.categoryIds.length === 0) {
			return json({
				success: true
			});
		}

		await channelCategoryService.reorderCategories(body.categoryIds);

		return json({
			success: true
		});
	} catch (error) {
		// Validation errors
		if (error instanceof ValidationError) {
			return json(
				{
					success: false,
					error: error.message,
					code: error.code
				},
				{ status: error.statusCode }
			);
		}
		logger.error(
			'[API] Failed to reorder channel categories',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reorder channel categories'
			},
			{ status: 500 }
		);
	}
};
