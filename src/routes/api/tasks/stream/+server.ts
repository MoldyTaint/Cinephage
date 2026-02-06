/**
 * Server-Sent Events endpoint for real-time task status updates
 *
 * GET /api/tasks/stream
 *
 * Events emitted:
 * - task:started      - A task began execution (scheduled or manual)
 * - task:completed    - A task finished successfully
 * - task:failed       - A task encountered an error
 * - task:cancelled    - A running task was cancelled
 * - task:updated      - Task settings changed (enabled, interval, etc.)
 */

import type { RequestHandler } from './$types';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler';
import { taskSettingsService } from '$lib/server/tasks/TaskSettingsService';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService';
import type { TaskResult } from '$lib/server/monitoring/MonitoringScheduler';
import {
	UNIFIED_TASK_DEFINITIONS,
	type UnifiedTask,
	type UnifiedTaskDefinition
} from '$lib/server/tasks/UnifiedTaskRegistry';
import { librarySchedulerService } from '$lib/server/library/index';

/**
 * SSE event payload types
 */
interface TaskStartedEvent {
	taskId: string;
	startedAt: string;
}

interface TaskCompletedEvent {
	taskId: string;
	completedAt: string;
	lastRunTime: string;
	nextRunTime: string | null;
	result?: {
		itemsProcessed: number;
		itemsGrabbed: number;
		errors: number;
	};
	historyEntry?: {
		id: string;
		taskId: string;
		status: 'completed';
		results: Record<string, unknown> | null;
		errors: null;
		startedAt: string;
		completedAt: string;
	};
}

interface TaskFailedEvent {
	taskId: string;
	completedAt: string;
	error: string;
	historyEntry?: {
		id: string;
		taskId: string;
		status: 'failed';
		results: null;
		errors: string[];
		startedAt: string;
		completedAt: string;
	};
}

interface TaskCancelledEvent {
	taskId: string;
	cancelledAt: string;
}

interface TaskUpdatedEvent {
	taskId: string;
	enabled?: boolean;
	intervalHours?: number;
	nextRunTime?: string | null;
}

/**
 * Get initial task state by querying the database directly.
 * This bypasses the in-memory cache which may not be initialized yet.
 */
async function getInitialTaskState(): Promise<UnifiedTask[]> {
	return await Promise.all(
		UNIFIED_TASK_DEFINITIONS.map(async (def: UnifiedTaskDefinition) => {
			// Get settings from TaskSettingsService (queries DB directly)
			const settings = await taskSettingsService.getTaskSettings(def.id);
			const enabled = settings?.enabled ?? true;
			const intervalHours = settings?.intervalHours ?? def.defaultIntervalHours ?? null;

			if (def.category === 'scheduled') {
				// For scheduled tasks, use the lastRunAt from task_settings (DB)
				// This is always available regardless of MonitoringScheduler initialization
				const lastRunTime = settings?.lastRunAt ?? null;
				const nextRunTime = settings?.nextRunAt ?? null;

				// Check if task is currently running via monitoringScheduler's in-memory Set
				// Note: This relies on the in-memory state, but for initial load it's acceptable
				// because any running tasks will immediately emit task:started events via SSE
				const monitoringStatus = await monitoringScheduler.getStatus();
				const taskKey = def.id as keyof typeof monitoringStatus.tasks;
				const isRunning = monitoringStatus.tasks[taskKey]?.isRunning ?? false;

				return {
					...def,
					lastRunTime,
					nextRunTime,
					intervalHours,
					isRunning,
					enabled
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
					intervalHours,
					isRunning,
					enabled
				};
			}
		})
	);
}

export const GET: RequestHandler = async ({ request }) => {
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const send = (event: string, data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Connection closed
				}
			};

			// Send initial connection event
			send('connected', { timestamp: new Date().toISOString() });

			// Send initial task state immediately (queries DB directly, bypasses cache)
			try {
				const initialTasks = await getInitialTaskState();
				send('tasks:initial', { tasks: initialTasks });
			} catch (error) {
				// Log error but don't fail the connection - client will rely on server-rendered data
				console.error('[Tasks SSE] Failed to fetch initial task state:', error);
			}

			// Heartbeat to keep connection alive
			const heartbeatInterval = setInterval(() => {
				try {
					send('heartbeat', { timestamp: new Date().toISOString() });
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 30000);

			/**
			 * Helper to compute the next run time after a task completes.
			 * Reads the interval from settings, calculates based on completion time.
			 */
			async function getNextRunTimeForTask(
				taskId: string,
				completionTime: Date
			): Promise<string | null> {
				const interval = await taskSettingsService.getTaskInterval(taskId);
				if (interval === null) return null;
				return new Date(completionTime.getTime() + interval * 60 * 60 * 1000).toISOString();
			}

			// --- Scheduled task events ---

			const onTaskStarted = (taskType: string) => {
				const payload: TaskStartedEvent = {
					taskId: taskType,
					startedAt: new Date().toISOString()
				};
				send('task:started', payload);
			};

			const onTaskCompleted = async (taskType: string, result: TaskResult) => {
				const completionTime = new Date();
				const nextRunTime = await getNextRunTimeForTask(taskType, completionTime);

				// Fetch the latest history entry for this task
				let historyEntry: TaskCompletedEvent['historyEntry'] | undefined;
				try {
					const lastRun = await taskHistoryService.getLastRunForTask(taskType);
					if (lastRun && lastRun.status === 'completed') {
						historyEntry = {
							id: lastRun.id,
							taskId: lastRun.taskId,
							status: 'completed',
							results: lastRun.results,
							errors: null,
							startedAt: lastRun.startedAt,
							completedAt: lastRun.completedAt!
						};
					}
				} catch {
					// Non-critical: skip history entry
				}

				const payload: TaskCompletedEvent = {
					taskId: taskType,
					completedAt: completionTime.toISOString(),
					lastRunTime: completionTime.toISOString(),
					nextRunTime,
					result: {
						itemsProcessed: result.itemsProcessed,
						itemsGrabbed: result.itemsGrabbed,
						errors: result.errors
					},
					historyEntry
				};
				send('task:completed', payload);
			};

			const onTaskFailed = async (taskType: string, error: unknown) => {
				const completionTime = new Date();

				// Fetch the latest history entry for this task
				let historyEntry: TaskFailedEvent['historyEntry'] | undefined;
				try {
					const lastRun = await taskHistoryService.getLastRunForTask(taskType);
					if (lastRun && lastRun.status === 'failed') {
						historyEntry = {
							id: lastRun.id,
							taskId: lastRun.taskId,
							status: 'failed',
							results: null,
							errors: lastRun.errors ?? [String(error)],
							startedAt: lastRun.startedAt,
							completedAt: lastRun.completedAt ?? completionTime.toISOString()
						};
					}
				} catch {
					// Non-critical: skip history entry
				}

				const payload: TaskFailedEvent = {
					taskId: taskType,
					completedAt: completionTime.toISOString(),
					error: error instanceof Error ? error.message : String(error),
					historyEntry
				};
				send('task:failed', payload);
			};

			const onTaskCancelled = (taskType: string) => {
				const payload: TaskCancelledEvent = {
					taskId: taskType,
					cancelledAt: new Date().toISOString()
				};
				send('task:cancelled', payload);
			};

			// --- Manual task events (same payloads, same SSE events) ---

			const onManualTaskStarted = (taskType: string) => {
				const payload: TaskStartedEvent = {
					taskId: taskType,
					startedAt: new Date().toISOString()
				};
				send('task:started', payload);
			};

			const onManualTaskCompleted = async (taskType: string, result: TaskResult) => {
				const completionTime = new Date();
				const nextRunTime = await getNextRunTimeForTask(taskType, completionTime);

				// Fetch the latest history entry for this task
				let historyEntry: TaskCompletedEvent['historyEntry'] | undefined;
				try {
					const lastRun = await taskHistoryService.getLastRunForTask(taskType);
					if (lastRun && lastRun.status === 'completed') {
						historyEntry = {
							id: lastRun.id,
							taskId: lastRun.taskId,
							status: 'completed',
							results: lastRun.results,
							errors: null,
							startedAt: lastRun.startedAt,
							completedAt: lastRun.completedAt!
						};
					}
				} catch {
					// Non-critical: skip history entry
				}

				const payload: TaskCompletedEvent = {
					taskId: taskType,
					completedAt: completionTime.toISOString(),
					lastRunTime: completionTime.toISOString(),
					nextRunTime,
					result: {
						itemsProcessed: result.itemsProcessed,
						itemsGrabbed: result.itemsGrabbed,
						errors: result.errors
					},
					historyEntry
				};
				send('task:completed', payload);
			};

			const onManualTaskFailed = async (taskType: string, error: unknown) => {
				const completionTime = new Date();

				// Fetch the latest history entry for this task
				let historyEntry: TaskFailedEvent['historyEntry'] | undefined;
				try {
					const lastRun = await taskHistoryService.getLastRunForTask(taskType);
					if (lastRun && lastRun.status === 'failed') {
						historyEntry = {
							id: lastRun.id,
							taskId: lastRun.taskId,
							status: 'failed',
							results: null,
							errors: lastRun.errors ?? [String(error)],
							startedAt: lastRun.startedAt,
							completedAt: lastRun.completedAt ?? completionTime.toISOString()
						};
					}
				} catch {
					// Non-critical: skip history entry
				}

				const payload: TaskFailedEvent = {
					taskId: taskType,
					completedAt: completionTime.toISOString(),
					error: error instanceof Error ? error.message : String(error),
					historyEntry
				};
				send('task:failed', payload);
			};

			const onManualTaskCancelled = (taskType: string) => {
				const payload: TaskCancelledEvent = {
					taskId: taskType,
					cancelledAt: new Date().toISOString()
				};
				send('task:cancelled', payload);
			};

			// --- Settings change events ---

			const onTaskSettingsUpdated = (data: {
				taskId: string;
				enabled?: boolean;
				intervalHours?: number;
				nextRunTime?: string | null;
			}) => {
				const payload: TaskUpdatedEvent = {
					taskId: data.taskId,
					enabled: data.enabled,
					intervalHours: data.intervalHours,
					nextRunTime: data.nextRunTime
				};
				send('task:updated', payload);
			};

			// Register all event handlers
			monitoringScheduler.on('taskStarted', onTaskStarted);
			monitoringScheduler.on('taskCompleted', onTaskCompleted);
			monitoringScheduler.on('taskFailed', onTaskFailed);
			monitoringScheduler.on('taskCancelled', onTaskCancelled);
			monitoringScheduler.on('manualTaskStarted', onManualTaskStarted);
			monitoringScheduler.on('manualTaskCompleted', onManualTaskCompleted);
			monitoringScheduler.on('manualTaskFailed', onManualTaskFailed);
			monitoringScheduler.on('manualTaskCancelled', onManualTaskCancelled);
			monitoringScheduler.on('taskSettingsUpdated', onTaskSettingsUpdated);

			// Cleanup on disconnect
			request.signal.addEventListener('abort', () => {
				clearInterval(heartbeatInterval);
				monitoringScheduler.off('taskStarted', onTaskStarted);
				monitoringScheduler.off('taskCompleted', onTaskCompleted);
				monitoringScheduler.off('taskFailed', onTaskFailed);
				monitoringScheduler.off('taskCancelled', onTaskCancelled);
				monitoringScheduler.off('manualTaskStarted', onManualTaskStarted);
				monitoringScheduler.off('manualTaskCompleted', onManualTaskCompleted);
				monitoringScheduler.off('manualTaskFailed', onManualTaskFailed);
				monitoringScheduler.off('manualTaskCancelled', onManualTaskCancelled);
				monitoringScheduler.off('taskSettingsUpdated', onTaskSettingsUpdated);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
