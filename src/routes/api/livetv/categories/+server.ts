/**
 * Categories API Endpoint
 *
 * GET /api/livetv/categories - List cached categories for filtering
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLiveTvChannelService } from '$lib/server/livetv/LiveTvChannelService';
import { logger } from '$lib/logging';

export const GET: RequestHandler = async ({ url }) => {
	const channelService = getLiveTvChannelService();

	// Parse query parameters
	const accountIdParam = url.searchParams.get('accountId');

	try {
		const categories = await channelService.getCategories(accountIdParam || undefined);
		return json({
			success: true,
			categories
		});
	} catch (error) {
		logger.error('[API] Failed to get categories', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get categories'
			},
			{ status: 500 }
		);
	}
};
