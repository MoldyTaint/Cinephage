import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { logger } from '$lib/logging';

/**
 * POST /api/monitoring/search/subtitle-upgrade
 * Manually trigger subtitle upgrade search
 */
export const POST: RequestHandler = async () => {
	try {
		const result = await monitoringScheduler.runSubtitleUpgradeSearch();

		return json({
			success: true,
			message: 'Subtitle upgrade search completed',
			result
		});
	} catch (error) {
		logger.error(
			'[API] Failed to run subtitle upgrade search',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to run subtitle upgrade search',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
