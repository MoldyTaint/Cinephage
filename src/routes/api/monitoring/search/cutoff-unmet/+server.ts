import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/monitoring/search/cutoff-unmet
 * Manually trigger cutoff unmet search
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const result = await monitoringScheduler.runCutoffUnmetSearch();

		return json({
			success: true,
			message: 'Cutoff unmet search completed',
			result
		});
	} catch (error) {
		logger.error(
			'[API] Failed to run cutoff unmet search',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to run cutoff unmet search',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
