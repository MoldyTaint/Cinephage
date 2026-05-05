import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { monitoringSettingsUpdateSchema } from '$lib/validation/schemas.js';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/monitoring/settings
 * Returns current monitoring settings and status
 */
export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		// Get both status and settings
		const status = await monitoringScheduler.getStatus();
		const fullSettings = await monitoringScheduler.getSettings();

		return json({
			success: true,
			settings: {
				missingSearchIntervalHours: status.tasks.missing.intervalHours,
				upgradeSearchIntervalHours: status.tasks.upgrade.intervalHours,
				newEpisodeCheckIntervalHours: status.tasks.newEpisode.intervalHours,
				cutoffUnmetSearchIntervalHours: status.tasks.cutoffUnmet.intervalHours,
				stalledDownloadTimeoutMinutes: fullSettings.stalledDownloadTimeoutMinutes,
				stalledDownloadProgressThreshold: fullSettings.stalledDownloadProgressThreshold
			},
			status: {
				tasks: status.tasks
			}
		});
	} catch (error) {
		logger.error(
			'[API] Failed to get monitoring settings',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to get monitoring settings'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/monitoring/settings
 * Update monitoring settings
 */
export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	try {
		const body = await request.json();
		const validation = monitoringSettingsUpdateSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{
					success: false,
					error: 'Invalid request body',
					details: validation.error.issues
				},
				{ status: 400 }
			);
		}

		const settings = validation.data;

		// Update settings
		await monitoringScheduler.updateSettings(settings);

		// Get updated status
		const status = await monitoringScheduler.getStatus();
		const fullUpdatedSettings = await monitoringScheduler.getSettings();

		return json({
			success: true,
			message: 'Monitoring settings updated',
			settings: {
				missingSearchIntervalHours: status.tasks.missing.intervalHours,
				upgradeSearchIntervalHours: status.tasks.upgrade.intervalHours,
				newEpisodeCheckIntervalHours: status.tasks.newEpisode.intervalHours,
				cutoffUnmetSearchIntervalHours: status.tasks.cutoffUnmet.intervalHours,
				stalledDownloadTimeoutMinutes: fullUpdatedSettings.stalledDownloadTimeoutMinutes,
				stalledDownloadProgressThreshold: fullUpdatedSettings.stalledDownloadProgressThreshold
			},
			status: {
				tasks: status.tasks
			}
		});
	} catch (error) {
		logger.error(
			'[API] Failed to update monitoring settings',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to update monitoring settings'
			},
			{ status: 500 }
		);
	}
};
