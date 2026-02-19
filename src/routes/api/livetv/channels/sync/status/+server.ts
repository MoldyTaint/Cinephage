/**
 * Sync Status API Endpoint
 *
 * GET /api/livetv/channels/sync/status - Get sync status for all accounts
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLiveTvChannelService } from '$lib/server/livetv/LiveTvChannelService';
import { logger } from '$lib/logging';

export const GET: RequestHandler = async () => {
	const channelService = getLiveTvChannelService();

	try {
		const accounts = await channelService.getSyncStatus();
		return json({
			success: true,
			accounts
		});
	} catch (error) {
		logger.error('[API] Failed to get sync status', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get sync status'
			},
			{ status: 500 }
		);
	}
};
