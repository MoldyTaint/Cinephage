import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { logger } from '$lib/logging';

/**
 * POST /api/monitoring/search/missing-subtitles
 * Manually trigger missing subtitles search
 */
export const POST: RequestHandler = async () => {
	try {
		const result = await monitoringScheduler.runMissingSubtitlesSearch();

		return json({
			success: true,
			message: 'Missing subtitles search completed',
			result
		});
	} catch (error) {
		logger.error(
			'[API] Failed to run missing subtitles search',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to run missing subtitles search',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
