/**
 * Task Run Endpoint
 *
 * POST /api/tasks/[taskId]/run
 *
 * Executes a registered system task and tracks its execution in history.
 * Prevents concurrent runs of the same task.
 * Emits SSE events via monitoringScheduler for real-time UI updates.
 *
 * Designed primarily for maintenance tasks (library-scan, update-strm-urls)
 * that don't go through MonitoringScheduler's executeTaskManually flow.
 * Scheduled tasks should be run via their direct runEndpoint instead
 * (which triggers MonitoringScheduler event emission natively).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUnifiedTaskById } from '$lib/server/tasks/UnifiedTaskRegistry';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'TaskRunAPI' });

export const POST: RequestHandler = async ({ params, fetch, request }) => {
	const { taskId } = params;

	// Validate task exists in registry
	const taskDef = getUnifiedTaskById(taskId);
	if (!taskDef) {
		return json({ success: false, error: `Task '${taskId}' not found` }, { status: 404 });
	}

	// Check if task is already running
	if (taskHistoryService.isTaskRunning(taskId)) {
		return json({ success: false, error: `Task '${taskId}' is already running` }, { status: 409 });
	}

	logger.info('[TaskRunAPI] Starting task', { taskId, endpoint: taskDef.runEndpoint });

	// Start tracking the task
	let historyId: string;
	try {
		historyId = await taskHistoryService.startTask(taskId);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start task';
		return json({ success: false, error: message }, { status: 500 });
	}

	// Emit SSE event: task started
	monitoringScheduler.emit('manualTaskStarted', taskId);

	try {
		// Execute the task's endpoint
		const response = await fetch(taskDef.runEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				// Forward relevant headers from original request
				...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie')! } : {})
			}
		});

		const result = await response.json();

		if (result.success) {
			await taskHistoryService.completeTask(historyId, result);
			logger.info('[TaskRunAPI] Task completed successfully', { taskId, result });

			// Emit SSE event: task completed
			// Build a TaskResult-compatible object for the SSE handler
			monitoringScheduler.emit('manualTaskCompleted', taskId, {
				itemsProcessed: result.itemsProcessed ?? result.totalFiles ?? 0,
				itemsGrabbed: result.itemsGrabbed ?? result.updatedFiles ?? 0,
				errors: result.errors ?? 0
			});

			return json({ success: true, historyId, ...result });
		} else {
			const errors = [result.error || 'Task endpoint returned failure'];
			await taskHistoryService.failTask(historyId, errors);
			logger.error('[TaskRunAPI] Task failed', { taskId, errors });

			// Emit SSE event: task failed
			monitoringScheduler.emit('manualTaskFailed', taskId, new Error(errors[0]));

			return json({ success: false, historyId, ...result });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await taskHistoryService.failTask(historyId, [message]);
		logger.error('[TaskRunAPI] Task execution error', { taskId, error: message });

		// Emit SSE event: task failed
		monitoringScheduler.emit('manualTaskFailed', taskId, error);

		return json({ success: false, historyId, error: message }, { status: 500 });
	}
};
