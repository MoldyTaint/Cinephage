import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { logger } from '$lib/logging';

/**
 * POST /api/monitoring/search/pending-releases
 * Manually trigger pending release processing
 */
export const POST: RequestHandler = async () => {
	try {
		const result = await monitoringScheduler.runPendingReleaseProcessing();

		return json({
			success: true,
			message: 'Pending release processing completed',
			result
		});
	} catch (error) {
		logger.error(
			'[API] Failed to run pending release processing',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to run pending release processing',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
