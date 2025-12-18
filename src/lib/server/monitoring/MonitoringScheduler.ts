/**
 * Monitoring Scheduler Service
 *
 * Orchestrates all automated monitoring tasks including missing content search,
 * upgrade monitoring, new episode detection, and cutoff unmet searches.
 *
 * Follows Radarr/Sonarr patterns for scheduled task execution:
 * - Uses a single polling interval (30 seconds) to check which tasks are due
 * - Persists last-run times to database (survives restarts)
 * - Tasks only run when their scheduled interval has passed, never immediately on startup
 * - Provides grace period after startup before any automated tasks run
 */

import { db } from '$lib/server/db/index.js';
import { monitoringSettings } from '$lib/server/db/schema.js';
import { EventEmitter } from 'events';
import { logger } from '$lib/logging';
import { taskHistoryService } from '$lib/server/tasks/TaskHistoryService.js';
import type { TaskExecutionContext } from '$lib/server/tasks/TaskExecutionContext.js';
import { TaskCancelledException } from '$lib/server/tasks/TaskCancelledException.js';
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';

/**
 * Default intervals in hours for each task type
 */
const DEFAULT_INTERVALS = {
	missing: 24,
	upgrade: 168, // Weekly
	newEpisode: 1, // Hourly
	cutoffUnmet: 24,
	pendingRelease: 0.25, // Every 15 minutes
	missingSubtitles: 6, // Every 6 hours
	subtitleUpgrade: 24, // Daily
	smartListRefresh: 1 // Hourly (checks which smart lists are due based on their individual intervals)
} as const;

/**
 * Minimum interval in hours (prevent overwhelming indexers)
 */
const MIN_INTERVAL_HOURS = 0.25; // 15 minutes

/**
 * Scheduler poll interval in milliseconds (how often to check for due tasks)
 * Following Sonarr pattern of 30 seconds
 */
const SCHEDULER_POLL_INTERVAL_MS = 30 * 1000;

/**
 * Grace period after startup before any automated tasks run (in milliseconds)
 * Allows the application to fully initialize before hammering indexers
 */
const STARTUP_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * When to trigger subtitle search during import
 */
export type SubtitleSearchTrigger = 'immediate' | 'after_metadata' | 'both';

/**
 * Monitoring settings interface
 */
export interface MonitoringSettings {
	missingSearchIntervalHours: number;
	upgradeSearchIntervalHours: number;
	newEpisodeCheckIntervalHours: number;
	cutoffUnmetSearchIntervalHours: number;
	autoReplaceEnabled: boolean;
	searchOnMonitorEnabled: boolean;
	// Subtitle monitoring settings
	missingSubtitlesIntervalHours: number;
	subtitleUpgradeIntervalHours: number;
	subtitleSearchOnImportEnabled: boolean;
	subtitleSearchTrigger: SubtitleSearchTrigger;
}

/**
 * Task execution result
 */
export interface TaskResult {
	taskType: string;
	itemsProcessed: number;
	itemsGrabbed: number;
	errors: number;
	executedAt: Date;
}

/**
 * Monitoring status response
 */
export interface MonitoringStatus {
	tasks: {
		missing: TaskStatus;
		upgrade: TaskStatus;
		newEpisode: TaskStatus;
		cutoffUnmet: TaskStatus;
		pendingRelease: TaskStatus;
		missingSubtitles: TaskStatus;
		subtitleUpgrade: TaskStatus;
		smartListRefresh: TaskStatus;
	};
}

interface TaskStatus {
	lastRunTime: Date | null;
	nextRunTime: Date | null;
	intervalHours: number;
	isRunning: boolean;
}

/**
 * MonitoringScheduler - Coordinate all monitoring tasks
 *
 * Uses a polling-based scheduler (like Sonarr) instead of individual timers:
 * - Single 30-second interval checks which tasks are due
 * - Persists last-run times to database
 * - Grace period after startup before running any automated tasks
 *
 * Implements BackgroundService for lifecycle management via ServiceManager.
 */
export class MonitoringScheduler extends EventEmitter implements BackgroundService {
	private static instance: MonitoringScheduler | null = null;

	readonly name = 'MonitoringScheduler';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	private schedulerTimer: NodeJS.Timeout | null = null;
	private lastRunTimes: Map<string, Date> = new Map();
	private taskIntervals: Map<string, number> = new Map(); // interval in hours
	private runningTasks: Set<string> = new Set();
	private isInitialized = false;
	private startupTime: Date | null = null;

	private constructor() {
		super();
	}

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	static getInstance(): MonitoringScheduler {
		if (!MonitoringScheduler.instance) {
			MonitoringScheduler.instance = new MonitoringScheduler();
		}
		return MonitoringScheduler.instance;
	}

	/** Reset the singleton instance (for testing) */
	static async resetInstance(): Promise<void> {
		if (MonitoringScheduler.instance) {
			await MonitoringScheduler.instance.stop();
			MonitoringScheduler.instance = null;
		}
	}

	/**
	 * Load last-run times from database
	 */
	private async loadLastRunTimes(): Promise<void> {
		const settings = await db.select().from(monitoringSettings);
		const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

		const taskTypes = [
			'missing',
			'upgrade',
			'newEpisode',
			'cutoffUnmet',
			'pendingRelease',
			'missingSubtitles',
			'subtitleUpgrade',
			'smartListRefresh'
		];
		for (const taskType of taskTypes) {
			const key = `last_run_${taskType}`;
			const value = settingsMap.get(key);
			if (value) {
				const date = new Date(value);
				if (!isNaN(date.getTime())) {
					this.lastRunTimes.set(taskType, date);
					logger.debug(`[MonitoringScheduler] Loaded last run time for ${taskType}`, {
						taskType,
						lastRunTime: date.toISOString()
					});
				}
			}
		}
	}

	/**
	 * Save last-run time to database
	 */
	private async saveLastRunTime(taskType: string, time: Date): Promise<void> {
		const key = `last_run_${taskType}`;
		try {
			await db
				.insert(monitoringSettings)
				.values({ key, value: time.toISOString() })
				.onConflictDoUpdate({ target: monitoringSettings.key, set: { value: time.toISOString() } });
			logger.debug(`[MonitoringScheduler] Saved last run time for ${taskType}`, {
				taskType,
				key,
				time: time.toISOString()
			});
		} catch (error) {
			logger.error(`[MonitoringScheduler] Failed to save last run time for ${taskType}`, error, {
				taskType,
				key,
				time: time.toISOString()
			});
			throw error;
		}
	}

	/**
	 * Get monitoring settings from database
	 */
	async getSettings(): Promise<MonitoringSettings> {
		const settings = await db.select().from(monitoringSettings);

		const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

		return {
			missingSearchIntervalHours: parseFloat(
				settingsMap.get('missing_search_interval_hours') || String(DEFAULT_INTERVALS.missing)
			),
			upgradeSearchIntervalHours: parseFloat(
				settingsMap.get('upgrade_search_interval_hours') || String(DEFAULT_INTERVALS.upgrade)
			),
			newEpisodeCheckIntervalHours: parseFloat(
				settingsMap.get('new_episode_check_interval_hours') || String(DEFAULT_INTERVALS.newEpisode)
			),
			cutoffUnmetSearchIntervalHours: parseFloat(
				settingsMap.get('cutoff_unmet_search_interval_hours') ||
					String(DEFAULT_INTERVALS.cutoffUnmet)
			),
			autoReplaceEnabled: settingsMap.get('auto_replace_enabled') !== 'false',
			searchOnMonitorEnabled: settingsMap.get('search_on_monitor_enabled') !== 'false',
			// Subtitle settings
			missingSubtitlesIntervalHours: parseFloat(
				settingsMap.get('missing_subtitles_interval_hours') ||
					String(DEFAULT_INTERVALS.missingSubtitles)
			),
			subtitleUpgradeIntervalHours: parseFloat(
				settingsMap.get('subtitle_upgrade_interval_hours') ||
					String(DEFAULT_INTERVALS.subtitleUpgrade)
			),
			subtitleSearchOnImportEnabled:
				settingsMap.get('subtitle_search_on_import_enabled') !== 'false',
			subtitleSearchTrigger:
				(settingsMap.get('subtitle_search_trigger') as SubtitleSearchTrigger) || 'after_metadata'
		};
	}

	/**
	 * Update monitoring settings
	 */
	async updateSettings(settings: Partial<MonitoringSettings>): Promise<void> {
		const updates: Array<{ key: string; value: string }> = [];

		if (settings.missingSearchIntervalHours !== undefined) {
			updates.push({
				key: 'missing_search_interval_hours',
				value: String(settings.missingSearchIntervalHours)
			});
		}
		if (settings.upgradeSearchIntervalHours !== undefined) {
			updates.push({
				key: 'upgrade_search_interval_hours',
				value: String(settings.upgradeSearchIntervalHours)
			});
		}
		if (settings.newEpisodeCheckIntervalHours !== undefined) {
			updates.push({
				key: 'new_episode_check_interval_hours',
				value: String(settings.newEpisodeCheckIntervalHours)
			});
		}
		if (settings.cutoffUnmetSearchIntervalHours !== undefined) {
			updates.push({
				key: 'cutoff_unmet_search_interval_hours',
				value: String(settings.cutoffUnmetSearchIntervalHours)
			});
		}
		if (settings.autoReplaceEnabled !== undefined) {
			updates.push({ key: 'auto_replace_enabled', value: String(settings.autoReplaceEnabled) });
		}
		if (settings.searchOnMonitorEnabled !== undefined) {
			updates.push({
				key: 'search_on_monitor_enabled',
				value: String(settings.searchOnMonitorEnabled)
			});
		}
		// Subtitle settings
		if (settings.missingSubtitlesIntervalHours !== undefined) {
			updates.push({
				key: 'missing_subtitles_interval_hours',
				value: String(settings.missingSubtitlesIntervalHours)
			});
		}
		if (settings.subtitleUpgradeIntervalHours !== undefined) {
			updates.push({
				key: 'subtitle_upgrade_interval_hours',
				value: String(settings.subtitleUpgradeIntervalHours)
			});
		}
		if (settings.subtitleSearchOnImportEnabled !== undefined) {
			updates.push({
				key: 'subtitle_search_on_import_enabled',
				value: String(settings.subtitleSearchOnImportEnabled)
			});
		}
		if (settings.subtitleSearchTrigger !== undefined) {
			updates.push({
				key: 'subtitle_search_trigger',
				value: settings.subtitleSearchTrigger
			});
		}

		// Insert or update each setting
		for (const { key, value } of updates) {
			await db
				.insert(monitoringSettings)
				.values({ key, value })
				.onConflictDoUpdate({ target: monitoringSettings.key, set: { value } });
		}

		// If intervals changed, restart scheduler
		if (Object.keys(settings).some((k) => k.includes('Interval'))) {
			await this.restart();
		}

		this.emit('settingsUpdated', settings);
	}

	/**
	 * Start the scheduler (non-blocking)
	 * Implements BackgroundService.start()
	 */
	start(): void {
		if (this.isInitialized || this._status === 'starting') {
			logger.debug('[MonitoringScheduler] Already initialized or starting');
			return;
		}

		this._status = 'starting';
		logger.info('[MonitoringScheduler] Starting...');

		// Run initialization in background
		setImmediate(() => {
			this.initialize()
				.then(() => {
					this._status = 'ready';
				})
				.catch((err) => {
					this._error = err instanceof Error ? err : new Error(String(err));
					this._status = 'error';
					logger.error('[MonitoringScheduler] Failed to initialize', this._error);
				});
		});
	}

	/**
	 * Initialize the scheduler and start background tasks
	 *
	 * Uses a polling-based approach like Sonarr:
	 * - Load persisted last-run times from database
	 * - Store task intervals for reference
	 * - Start a single polling timer that checks all tasks every 30 seconds
	 * - Apply grace period before running any tasks after startup
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			logger.debug('[MonitoringScheduler] Already initialized');
			return;
		}

		logger.info('[MonitoringScheduler] Initializing...');
		this.startupTime = new Date();

		// Load persisted last-run times from database
		await this.loadLastRunTimes();

		const settings = await this.getSettings();

		// Store task intervals (validated)
		this.taskIntervals.set(
			'missing',
			Math.max(settings.missingSearchIntervalHours, MIN_INTERVAL_HOURS)
		);
		this.taskIntervals.set(
			'upgrade',
			Math.max(settings.upgradeSearchIntervalHours, MIN_INTERVAL_HOURS)
		);
		this.taskIntervals.set(
			'newEpisode',
			Math.max(settings.newEpisodeCheckIntervalHours, MIN_INTERVAL_HOURS)
		);
		this.taskIntervals.set(
			'cutoffUnmet',
			Math.max(settings.cutoffUnmetSearchIntervalHours, MIN_INTERVAL_HOURS)
		);
		this.taskIntervals.set('pendingRelease', DEFAULT_INTERVALS.pendingRelease);
		this.taskIntervals.set(
			'missingSubtitles',
			Math.max(settings.missingSubtitlesIntervalHours, MIN_INTERVAL_HOURS)
		);
		this.taskIntervals.set(
			'subtitleUpgrade',
			Math.max(settings.subtitleUpgradeIntervalHours, MIN_INTERVAL_HOURS)
		);
		this.taskIntervals.set('smartListRefresh', DEFAULT_INTERVALS.smartListRefresh);

		// Log scheduled intervals
		for (const [taskType, intervalHours] of this.taskIntervals.entries()) {
			const lastRun = this.lastRunTimes.get(taskType);
			logger.info(`[MonitoringScheduler] Task ${taskType} configured`, {
				taskType,
				intervalHours,
				lastRunTime: lastRun?.toISOString() ?? 'never'
			});
		}

		// Start the polling scheduler (checks every 30 seconds which tasks are due)
		this.schedulerTimer = setInterval(() => {
			this.pollAndExecuteDueTasks().catch((error) => {
				logger.error('[MonitoringScheduler] Error in scheduler poll', error);
			});
		}, SCHEDULER_POLL_INTERVAL_MS);

		this.isInitialized = true;

		const gracePeriodMinutes = Math.round(STARTUP_GRACE_PERIOD_MS / 60000);
		logger.info(
			`[MonitoringScheduler] Initialized - tasks will start after ${gracePeriodMinutes} minute grace period`
		);
	}

	/**
	 * Poll for due tasks and execute them
	 * Called every 30 seconds by the scheduler timer
	 */
	private async pollAndExecuteDueTasks(): Promise<void> {
		// Check startup grace period
		if (this.startupTime) {
			const timeSinceStartup = Date.now() - this.startupTime.getTime();
			if (timeSinceStartup < STARTUP_GRACE_PERIOD_MS) {
				// Still in grace period, skip
				return;
			}
		}

		const now = new Date();

		// Copy taskIntervals to avoid race condition if settings updated during iteration
		const tasksToCheck = Array.from(this.taskIntervals.entries());

		for (const [taskType, intervalHours] of tasksToCheck) {
			// Skip if already running (atomic check before starting)
			if (this.runningTasks.has(taskType)) {
				continue;
			}

			const lastRunTime = this.lastRunTimes.get(taskType);
			const intervalMs = intervalHours * 60 * 60 * 1000;

			// Calculate if task is due
			let isDue = false;
			if (!lastRunTime) {
				// Never run before - run it (but we're past grace period)
				isDue = true;
				logger.debug(`[MonitoringScheduler] Task ${taskType} has never run, marking as due`);
			} else {
				const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
				isDue = timeSinceLastRun >= intervalMs;

				if (isDue) {
					const hoursSince = (timeSinceLastRun / (1000 * 60 * 60)).toFixed(1);
					logger.debug(
						`[MonitoringScheduler] Task ${taskType} is due (${hoursSince}h since last run)`
					);
				}
			}

			if (isDue) {
				// Mark as running BEFORE firing to prevent race condition
				// The executeTask method will handle cleanup in finally block
				if (this.runningTasks.has(taskType)) {
					// Double-check in case another poll started it
					continue;
				}
				this.runningTasks.add(taskType);

				// Execute task in background (don't await to allow parallel execution)
				this.executeTaskInternal(taskType).catch((error) => {
					logger.error(`[MonitoringScheduler] Task ${taskType} failed`, error);
				});
			}
		}
	}

	/**
	 * Stop the scheduler
	 * Implements BackgroundService.stop()
	 */
	async stop(): Promise<void> {
		logger.info('[MonitoringScheduler] Stopping...');

		// Clear the polling timer
		if (this.schedulerTimer) {
			clearInterval(this.schedulerTimer);
			this.schedulerTimer = null;
		}

		// Remove all event listeners to prevent memory leaks
		this.removeAllListeners();

		this.isInitialized = false;
		this.startupTime = null;
		this._status = 'pending';
		logger.info('[MonitoringScheduler] Stopped');
	}

	/**
	 * Shutdown the scheduler (alias for stop, backward compatibility)
	 */
	async shutdown(): Promise<void> {
		return this.stop();
	}

	/**
	 * Restart the scheduler (re-initialize with new settings)
	 */
	private async restart(): Promise<void> {
		await this.shutdown();
		this.isInitialized = false;
		await this.initialize();
	}

	/**
	 * Execute a specific task type (internal - runningTasks already set by caller)
	 */
	private async executeTaskInternal(taskType: string): Promise<void> {
		// runningTasks is already set by pollAndExecuteDueTasks before calling this
		this.emit('taskStarted', taskType);

		logger.info(`[MonitoringScheduler] Executing ${taskType} task...`, { taskType });

		// Create execution context (includes history tracking and cancellation support)
		let ctx: TaskExecutionContext | null = null;
		try {
			ctx = await taskHistoryService.createExecutionContext(taskType);
		} catch (historyError) {
			// Log but don't fail the task if history recording fails
			logger.warn(`[MonitoringScheduler] Failed to create execution context for ${taskType}`, {
				taskType,
				error: historyError
			});
		}

		try {
			// Pass context to task for cancellation support and per-item activity tracking
			const result = await this.runTask(taskType, ctx);
			const completionTime = new Date();

			// Record success in history
			if (ctx) {
				try {
					await taskHistoryService.completeTask(ctx.historyId, {
						itemsProcessed: result.itemsProcessed,
						itemsGrabbed: result.itemsGrabbed,
						errors: result.errors
					});
				} catch (historyError) {
					logger.warn(`[MonitoringScheduler] Failed to complete history for ${taskType}`, {
						taskType,
						historyId: ctx.historyId,
						error: historyError
					});
				}
			}

			// Persist to database FIRST, then update in-memory cache
			// This ensures consistency - if DB fails, we'll retry on next poll
			try {
				await this.saveLastRunTime(taskType, completionTime);
				// Only update in-memory cache after successful DB write
				this.lastRunTimes.set(taskType, completionTime);
			} catch (dbError) {
				logger.error(
					`[MonitoringScheduler] Failed to persist last run time for ${taskType}`,
					dbError
				);
				// Still emit completion but don't update in-memory cache
				// This way task will be retried on next poll
			}

			this.emit('taskCompleted', taskType, result);
			logger.info(`[MonitoringScheduler] ${taskType} task completed`, {
				taskType,
				itemsGrabbed: result.itemsGrabbed,
				itemsProcessed: result.itemsProcessed
			});
		} catch (error) {
			// Handle cancellation separately - don't treat as failure
			if (TaskCancelledException.isTaskCancelled(error)) {
				logger.info(`[MonitoringScheduler] ${taskType} task was cancelled`, { taskType });
				this.emit('taskCancelled', taskType);
				// History is already marked as cancelled by cancelTask()
				return;
			}

			// Record failure in history
			if (ctx) {
				try {
					const errorMessage = error instanceof Error ? error.message : String(error);
					await taskHistoryService.failTask(ctx.historyId, [errorMessage]);
				} catch (historyError) {
					logger.warn(`[MonitoringScheduler] Failed to record failure history for ${taskType}`, {
						taskType,
						historyId: ctx.historyId,
						error: historyError
					});
				}
			}

			logger.error(`[MonitoringScheduler] ${taskType} task failed`, error, { taskType });
			this.emit('taskFailed', taskType, error);
		} finally {
			this.runningTasks.delete(taskType);
		}
	}

	/**
	 * Run a specific task
	 * @param taskType - The type of task to run
	 * @param ctx - Optional execution context for cancellation support and activity tracking
	 */
	private async runTask(taskType: string, ctx: TaskExecutionContext | null): Promise<TaskResult> {
		const settings = await this.getSettings();

		switch (taskType) {
			case 'missing': {
				const { executeMissingContentTask } = await import('./tasks/MissingContentTask.js');
				return await executeMissingContentTask(ctx);
			}
			case 'upgrade': {
				const { executeUpgradeMonitorTask } = await import('./tasks/UpgradeMonitorTask.js');
				return await executeUpgradeMonitorTask(ctx);
			}
			case 'newEpisode': {
				const { executeNewEpisodeMonitorTask } = await import('./tasks/NewEpisodeMonitorTask.js');
				return await executeNewEpisodeMonitorTask(settings.newEpisodeCheckIntervalHours, ctx);
			}
			case 'cutoffUnmet': {
				const { executeCutoffUnmetTask } = await import('./tasks/CutoffUnmetTask.js');
				return await executeCutoffUnmetTask(ctx);
			}
			case 'pendingRelease': {
				const { executePendingReleaseTask } = await import('./tasks/PendingReleaseTask.js');
				return await executePendingReleaseTask(ctx);
			}
			case 'missingSubtitles': {
				const { executeMissingSubtitlesTask } = await import('./tasks/MissingSubtitlesTask.js');
				return await executeMissingSubtitlesTask(ctx);
			}
			case 'subtitleUpgrade': {
				const { executeSubtitleUpgradeTask } = await import('./tasks/SubtitleUpgradeTask.js');
				return await executeSubtitleUpgradeTask(ctx);
			}
			case 'smartListRefresh': {
				const { executeSmartListRefreshTask } = await import('./tasks/SmartListRefreshTask.js');
				return await executeSmartListRefreshTask(ctx);
			}
			default:
				throw new Error(`Unknown task type: ${taskType}`);
		}
	}

	/**
	 * Manually trigger a specific task
	 */
	async runMissingContentSearch(): Promise<TaskResult> {
		return await this.executeTaskManually('missing');
	}

	async runUpgradeSearch(): Promise<TaskResult> {
		return await this.executeTaskManually('upgrade');
	}

	async runNewEpisodeCheck(): Promise<TaskResult> {
		return await this.executeTaskManually('newEpisode');
	}

	async runCutoffUnmetSearch(): Promise<TaskResult> {
		return await this.executeTaskManually('cutoffUnmet');
	}

	async runPendingReleaseProcessing(): Promise<TaskResult> {
		return await this.executeTaskManually('pendingRelease');
	}

	async runMissingSubtitlesSearch(): Promise<TaskResult> {
		return await this.executeTaskManually('missingSubtitles');
	}

	async runSubtitleUpgradeSearch(): Promise<TaskResult> {
		return await this.executeTaskManually('subtitleUpgrade');
	}

	async runSmartListRefresh(): Promise<TaskResult> {
		return await this.executeTaskManually('smartListRefresh');
	}

	private async executeTaskManually(taskType: string): Promise<TaskResult> {
		// Check if task is already running (either automatic or manual)
		if (this.runningTasks.has(taskType)) {
			logger.warn(`[MonitoringScheduler] Cannot manually run ${taskType} - already running`, {
				taskType
			});
			throw new Error(`Task ${taskType} is already running`);
		}

		// Mark as running to prevent concurrent execution
		this.runningTasks.add(taskType);

		logger.info(`[MonitoringScheduler] Manually executing ${taskType} task...`, { taskType });
		this.emit('manualTaskStarted', taskType);

		// Create execution context (includes history tracking and cancellation support)
		let ctx: TaskExecutionContext | null = null;
		try {
			ctx = await taskHistoryService.createExecutionContext(taskType);
		} catch (historyError) {
			// Log but don't fail the task if history recording fails
			logger.warn(`[MonitoringScheduler] Failed to create execution context for manual ${taskType}`, {
				taskType,
				error: historyError
			});
		}

		try {
			// Pass context to task for cancellation support and per-item activity tracking
			const result = await this.runTask(taskType, ctx);
			const completionTime = new Date();

			// Record success in history
			if (ctx) {
				try {
					await taskHistoryService.completeTask(ctx.historyId, {
						itemsProcessed: result.itemsProcessed,
						itemsGrabbed: result.itemsGrabbed,
						errors: result.errors
					});
				} catch (historyError) {
					logger.warn(`[MonitoringScheduler] Failed to complete history for manual ${taskType}`, {
						taskType,
						historyId: ctx.historyId,
						error: historyError
					});
				}
			}

			// Persist to database FIRST, then update in-memory cache (same as automatic execution)
			try {
				await this.saveLastRunTime(taskType, completionTime);
				this.lastRunTimes.set(taskType, completionTime);
			} catch (dbError) {
				logger.error(
					`[MonitoringScheduler] Failed to persist last run time for manual ${taskType}`,
					dbError
				);
				// Still continue - the task completed successfully
			}

			this.emit('manualTaskCompleted', taskType, result);
			return result;
		} catch (error) {
			// Handle cancellation separately - don't treat as failure
			if (TaskCancelledException.isTaskCancelled(error)) {
				logger.info(`[MonitoringScheduler] Manual ${taskType} task was cancelled`, { taskType });
				this.emit('manualTaskCancelled', taskType);
				// History is already marked as cancelled by cancelTask()
				throw error; // Re-throw so caller knows it was cancelled
			}

			// Record failure in history
			if (ctx) {
				try {
					const errorMessage = error instanceof Error ? error.message : String(error);
					await taskHistoryService.failTask(ctx.historyId, [errorMessage]);
				} catch (historyError) {
					logger.warn(
						`[MonitoringScheduler] Failed to record failure history for manual ${taskType}`,
						{
							taskType,
							historyId: ctx.historyId,
							error: historyError
						}
					);
				}
			}

			logger.error(`[MonitoringScheduler] Manual ${taskType} task failed`, error, { taskType });
			this.emit('manualTaskFailed', taskType, error);
			throw error;
		} finally {
			// Always clean up running state
			this.runningTasks.delete(taskType);
		}
	}

	/**
	 * Get current monitoring status
	 */
	async getStatus(): Promise<MonitoringStatus> {
		const settings = await this.getSettings();

		const getTaskStatus = (taskType: string, intervalHours: number): TaskStatus => {
			const lastRunTime = this.lastRunTimes.get(taskType) || null;
			const nextRunTime = lastRunTime
				? new Date(lastRunTime.getTime() + intervalHours * 60 * 60 * 1000)
				: null;

			return {
				lastRunTime,
				nextRunTime,
				intervalHours,
				isRunning: this.runningTasks.has(taskType)
			};
		};

		return {
			tasks: {
				missing: getTaskStatus('missing', settings.missingSearchIntervalHours),
				upgrade: getTaskStatus('upgrade', settings.upgradeSearchIntervalHours),
				newEpisode: getTaskStatus('newEpisode', settings.newEpisodeCheckIntervalHours),
				cutoffUnmet: getTaskStatus('cutoffUnmet', settings.cutoffUnmetSearchIntervalHours),
				pendingRelease: getTaskStatus('pendingRelease', DEFAULT_INTERVALS.pendingRelease),
				missingSubtitles: getTaskStatus('missingSubtitles', settings.missingSubtitlesIntervalHours),
				subtitleUpgrade: getTaskStatus('subtitleUpgrade', settings.subtitleUpgradeIntervalHours),
				smartListRefresh: getTaskStatus('smartListRefresh', DEFAULT_INTERVALS.smartListRefresh)
			}
		};
	}
}

// Singleton getter - preferred way to access the service
export function getMonitoringScheduler(): MonitoringScheduler {
	return MonitoringScheduler.getInstance();
}

// Reset singleton (for testing)
export async function resetMonitoringScheduler(): Promise<void> {
	await MonitoringScheduler.resetInstance();
}

// Backward-compatible export (prefer getMonitoringScheduler())
export const monitoringScheduler = MonitoringScheduler.getInstance();
