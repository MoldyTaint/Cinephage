/**
 * Smart List Refresh Task
 *
 * Automated task for refreshing smart lists that are due.
 * Runs hourly to check which lists need to be refreshed based on their individual intervals.
 */

import { getSmartListService } from '$lib/server/smartlists/index.js';
import { logger } from '$lib/logging';
import type { TaskResult } from '../MonitoringScheduler.js';
import type { TaskExecutionContext } from '$lib/server/tasks/TaskExecutionContext.js';

/**
 * Execute smart list refresh task
 * @param ctx - Execution context for cancellation support and activity tracking
 */
export async function executeSmartListRefreshTask(
	ctx: TaskExecutionContext | null
): Promise<TaskResult> {
	const taskHistoryId = ctx?.historyId;
	logger.info('[SmartListRefreshTask] Starting smart list refresh task', { taskHistoryId });

	// Check for cancellation before starting
	ctx?.checkCancelled();

	const service = getSmartListService();

	try {
		const results = await service.refreshAllDueLists();

		const itemsProcessed = results.length;
		const itemsGrabbed = results.reduce((sum, r) => sum + r.itemsAutoAdded, 0);
		const errors = results.filter((r) => r.status === 'failed').length;

		logger.info('[SmartListRefreshTask] Completed', {
			listsRefreshed: itemsProcessed,
			itemsAutoAdded: itemsGrabbed,
			errors
		});

		return {
			taskType: 'smartListRefresh',
			itemsProcessed,
			itemsGrabbed,
			errors,
			executedAt: new Date()
		};
	} catch (error) {
		logger.error('[SmartListRefreshTask] Failed', error);
		throw error;
	}
}
