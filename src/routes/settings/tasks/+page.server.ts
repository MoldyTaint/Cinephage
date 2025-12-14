/**
 * Unified Tasks Page Server Load
 *
 * Loads all tasks (scheduled + maintenance) with their status and history.
 */

import type { PageServerLoad } from './$types';
import {
	UNIFIED_TASK_DEFINITIONS,
	type UnifiedTask,
	type UnifiedTaskDefinition
} from '$lib/server/tasks/UnifiedTaskRegistry';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService';
import { librarySchedulerService } from '$lib/server/library/index';
import type { TaskHistoryEntry } from '$lib/types/task';

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:tasks');

	// Get monitoring status for scheduled tasks
	const monitoringStatus = await monitoringScheduler.getStatus();

	// Build unified task list with status
	const tasks: UnifiedTask[] = await Promise.all(
		UNIFIED_TASK_DEFINITIONS.map(async (def: UnifiedTaskDefinition) => {
			if (def.category === 'scheduled') {
				// Get status from MonitoringScheduler
				const taskKey = def.id as keyof typeof monitoringStatus.tasks;
				const status = monitoringStatus.tasks[taskKey];

				return {
					...def,
					lastRunTime: status?.lastRunTime?.toISOString() ?? null,
					nextRunTime: status?.nextRunTime?.toISOString() ?? null,
					intervalHours: status?.intervalHours ?? def.defaultIntervalHours ?? null,
					isRunning: status?.isRunning ?? false
				};
			} else {
				// Get status from TaskHistoryService for maintenance tasks
				const lastRun = await taskHistoryService.getLastRunForTask(def.id);
				let isRunning = taskHistoryService.isTaskRunning(def.id);

				// Special handling for library-scan: check librarySchedulerService for actual running state
				if (def.id === 'library-scan') {
					const libStatus = await librarySchedulerService.getStatus();
					isRunning = libStatus.scanning;
				}

				return {
					...def,
					lastRunTime: lastRun?.completedAt ?? lastRun?.startedAt ?? null,
					nextRunTime: null,
					intervalHours: null,
					isRunning
				};
			}
		})
	);

	// Get recent history for all tasks (for initial expansion)
	const allTaskIds = UNIFIED_TASK_DEFINITIONS.map((t) => t.id);
	const historyMap = await taskHistoryService.getHistoryForTasks(allTaskIds, 5);

	// Convert Map to plain object for serialization
	const taskHistory: Record<string, TaskHistoryEntry[]> = {};
	for (const [taskId, entries] of historyMap) {
		taskHistory[taskId] = entries;
	}

	return {
		tasks,
		taskHistory
	};
};
