import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { createChildLogger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

const logger = createChildLogger({
	module: 'MonitoringSearchMetadataRefreshApi',
	logDomain: 'monitoring'
});

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const result = await monitoringScheduler.runMetadataRefresh();

		return json({
			success: true,
			message: 'Metadata refresh completed',
			result
		});
	} catch (error) {
		logger.error(
			'[API] Failed to run metadata refresh',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to run metadata refresh',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
