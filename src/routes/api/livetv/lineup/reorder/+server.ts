/**
 * Lineup Reorder API
 *
 * POST /api/livetv/lineup/reorder - Reorder lineup items
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';
import type { ReorderLineupRequest } from '$lib/types/livetv';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as ReorderLineupRequest;

		if (!body.itemIds || !Array.isArray(body.itemIds)) {
			throw new ValidationError('itemIds array is required');
		}

		if (body.itemIds.length === 0) {
			return json({
				success: true
			});
		}

		await channelLineupService.reorderLineup(body.itemIds);

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
		logger.error('[API] Failed to reorder lineup', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reorder lineup'
			},
			{ status: 500 }
		);
	}
};
