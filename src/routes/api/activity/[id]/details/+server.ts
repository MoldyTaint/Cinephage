import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { activityService } from '$lib/server/activity';
import { logger } from '$lib/logging';

/**
 * GET - Get details for a unified activity row.
 * Expects the unified activity id (e.g. queue-*, history-*, monitoring-*).
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const activityId = params.id?.trim();
		if (!activityId) {
			return json({ success: false, error: 'Missing activity id' }, { status: 400 });
		}

		const details = await activityService.getActivityDetails(activityId);
		return json({ success: true, details });
	} catch (err) {
		logger.error('Error fetching activity details', err instanceof Error ? err : undefined, {
			activityId: params.id
		});
		return json({ success: false, error: 'Failed to fetch activity details' }, { status: 500 });
	}
};
