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
	const accountIdsParam = url.searchParams.get('accountIds');
	const accountIdParam = url.searchParams.get('accountId');

	const accountIds =
		accountIdsParam
			?.split(',')
			.map((v) => v.trim())
			.filter(Boolean) ?? (accountIdParam ? [accountIdParam] : undefined);

	try {
		const categories = await channelService.getCategories(accountIds);
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
