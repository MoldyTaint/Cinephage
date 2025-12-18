/**
 * Task Cancel Endpoint
 *
 * POST /api/tasks/[taskId]/cancel
 *
 * Cancels a running task. The task will stop at the next safe checkpoint
 * and preserve any work completed before cancellation.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUnifiedTaskById } from '$lib/server/tasks/UnifiedTaskRegistry';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'TaskCancelAPI' });

export const POST: RequestHandler = async ({ params }) => {
	const { taskId } = params;

	// Validate task exists in registry
	const taskDef = getUnifiedTaskById(taskId);
	if (!taskDef) {
		return json({ success: false, error: `Task '${taskId}' not found` }, { status: 404 });
	}

	// Check if task is running
	if (!taskHistoryService.isTaskRunning(taskId)) {
		return json({ success: false, error: `Task '${taskId}' is not running` }, { status: 400 });
	}

	logger.info('[TaskCancelAPI] Cancelling task', { taskId });

	try {
		const cancelled = await taskHistoryService.cancelTask(taskId);

		if (cancelled) {
			logger.info('[TaskCancelAPI] Task cancelled successfully', { taskId });
			return json({ success: true, message: `Task '${taskId}' cancelled` });
		} else {
			return json(
				{ success: false, error: `Failed to cancel task '${taskId}'` },
				{ status: 500 }
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to cancel task';
		logger.error('[TaskCancelAPI] Error cancelling task', { taskId, error: message });
		return json({ success: false, error: message }, { status: 500 });
	}
};
