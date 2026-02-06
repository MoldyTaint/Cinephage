/**
 * Task Settings Service
 *
 * Manages per-task configuration including:
 * - Enabled/disabled state
 * - Custom intervals
 * - Last run and next run times
 *
 * Replaces the key-value monitoring_settings approach with structured storage.
 */

import { db } from '$lib/server/db/index.js';
import { taskSettings, type TaskSettingsRecord } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { UNIFIED_TASK_DEFINITIONS } from './UnifiedTaskRegistry.js';

/**
 * Default settings for all tasks
 */
const DEFAULT_TASK_SETTINGS: Record<
	string,
	{ intervalHours: number | null; minIntervalHours: number; enabled: boolean }
> = {
	missing: { intervalHours: 24, minIntervalHours: 0.25, enabled: true },
	upgrade: { intervalHours: 168, minIntervalHours: 0.25, enabled: true },
	newEpisode: { intervalHours: 1, minIntervalHours: 0.25, enabled: true },
	cutoffUnmet: { intervalHours: 24, minIntervalHours: 0.25, enabled: true },
	pendingRelease: { intervalHours: 0.25, minIntervalHours: 0.25, enabled: true },
	missingSubtitles: { intervalHours: 6, minIntervalHours: 0.25, enabled: true },
	subtitleUpgrade: { intervalHours: 24, minIntervalHours: 0.25, enabled: true },
	smartListRefresh: { intervalHours: 1, minIntervalHours: 0.25, enabled: true },
	'library-scan': { intervalHours: null, minIntervalHours: 0.25, enabled: true },
	'update-strm-urls': { intervalHours: null, minIntervalHours: 0.25, enabled: true }
};

class TaskSettingsService {
	/**
	 * Get settings for a specific task
	 */
	async getTaskSettings(taskId: string): Promise<TaskSettingsRecord | undefined> {
		const result = await db.select().from(taskSettings).where(eq(taskSettings.id, taskId)).get();
		return result;
	}

	/**
	 * Get all task settings
	 */
	async getAllTaskSettings(): Promise<TaskSettingsRecord[]> {
		return await db.select().from(taskSettings).all();
	}

	/**
	 * Initialize default settings for all tasks if not already set
	 */
	async initializeDefaults(): Promise<void> {
		const now = new Date().toISOString();

		for (const taskDef of UNIFIED_TASK_DEFINITIONS) {
			const defaults = DEFAULT_TASK_SETTINGS[taskDef.id];
			if (!defaults) continue;

			// Check if settings already exist
			const existing = await this.getTaskSettings(taskDef.id);
			if (existing) continue;

			// Calculate initial next_run_at for scheduled tasks
			let nextRunAt: string | null = null;
			if (defaults.intervalHours !== null) {
				nextRunAt = new Date(Date.now() + defaults.intervalHours * 60 * 60 * 1000).toISOString();
			}

			// Create default settings
			await db
				.insert(taskSettings)
				.values({
					id: taskDef.id,
					enabled: defaults.enabled,
					intervalHours: defaults.intervalHours,
					minIntervalHours: defaults.minIntervalHours,
					nextRunAt,
					createdAt: now,
					updatedAt: now
				})
				.run();

			logger.info(`[TaskSettings] Initialized default settings for task: ${taskDef.id}`);
		}
	}

	/**
	 * Update task enabled state
	 */
	async setTaskEnabled(taskId: string, enabled: boolean): Promise<void> {
		const now = new Date().toISOString();

		await db
			.insert(taskSettings)
			.values({
				id: taskId,
				enabled,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: taskSettings.id,
				set: {
					enabled,
					updatedAt: now
				}
			})
			.run();

		logger.info(`[TaskSettings] Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`);
	}

	/**
	 * Update task interval
	 */
	async setTaskInterval(taskId: string, intervalHours: number): Promise<void> {
		const settings = await this.getTaskSettings(taskId);
		const minInterval = settings?.minIntervalHours ?? 0.25;

		// Enforce minimum interval
		if (intervalHours < minInterval) {
			throw new Error(
				`Interval must be at least ${minInterval} hours (${minInterval * 60} minutes)`
			);
		}

		const now = new Date().toISOString();

		// Calculate new next_run_at based on last_run_at or now
		const lastRunAt = settings?.lastRunAt;
		let nextRunAt: string | null;
		if (lastRunAt) {
			nextRunAt = new Date(
				new Date(lastRunAt).getTime() + intervalHours * 60 * 60 * 1000
			).toISOString();
		} else {
			nextRunAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
		}

		await db
			.insert(taskSettings)
			.values({
				id: taskId,
				intervalHours,
				nextRunAt,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: taskSettings.id,
				set: {
					intervalHours,
					nextRunAt,
					updatedAt: now
				}
			})
			.run();

		logger.info(`[TaskSettings] Updated ${taskId} interval to ${intervalHours} hours`);
	}

	/**
	 * Record that a task ran and update next run time
	 */
	async recordTaskRun(taskId: string): Promise<void> {
		const settings = await this.getTaskSettings(taskId);
		const now = new Date();
		const intervalHours = settings?.intervalHours ?? DEFAULT_TASK_SETTINGS[taskId]?.intervalHours;

		let nextRunAt: string | null = null;
		if (intervalHours !== null && intervalHours !== undefined) {
			nextRunAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString();
		}

		await db
			.insert(taskSettings)
			.values({
				id: taskId,
				lastRunAt: now.toISOString(),
				nextRunAt,
				updatedAt: now.toISOString()
			})
			.onConflictDoUpdate({
				target: taskSettings.id,
				set: {
					lastRunAt: now.toISOString(),
					nextRunAt,
					updatedAt: now.toISOString()
				}
			})
			.run();
	}

	/**
	 * Check if a task is enabled
	 */
	async isTaskEnabled(taskId: string): Promise<boolean> {
		const settings = await this.getTaskSettings(taskId);
		// Default to enabled if not set
		return settings?.enabled ?? true;
	}

	/**
	 * Get the effective interval for a task (custom or default)
	 */
	async getTaskInterval(taskId: string): Promise<number | null> {
		const settings = await this.getTaskSettings(taskId);
		if (settings?.intervalHours !== undefined && settings.intervalHours !== null) {
			return settings.intervalHours;
		}
		return DEFAULT_TASK_SETTINGS[taskId]?.intervalHours ?? null;
	}

	/**
	 * Get next run time for a task
	 */
	async getNextRunTime(taskId: string): Promise<string | null> {
		const settings = await this.getTaskSettings(taskId);
		return settings?.nextRunAt ?? null;
	}

	/**
	 * Get last run time for a task
	 */
	async getLastRunTime(taskId: string): Promise<string | null> {
		const settings = await this.getTaskSettings(taskId);
		return settings?.lastRunAt ?? null;
	}

	/**
	 * Get all tasks that are due to run (next_run_at in the past or null)
	 */
	async getDueTasks(): Promise<TaskSettingsRecord[]> {
		const now = new Date().toISOString();
		const allSettings = await this.getAllTaskSettings();

		return allSettings.filter((setting) => {
			// Must be enabled
			if (!setting.enabled) return false;
			// Must have an interval (scheduled task)
			if (setting.intervalHours === null) return false;
			// Check if due
			if (!setting.nextRunAt) return true;
			return new Date(setting.nextRunAt) <= new Date(now);
		});
	}

	/**
	 * Reset all settings to defaults
	 */
	async resetToDefaults(): Promise<void> {
		// Delete all existing settings
		await db.delete(taskSettings).run();

		// Re-initialize defaults
		await this.initializeDefaults();

		logger.info('[TaskSettings] Reset all task settings to defaults');
	}
}

// Export singleton instance
export const taskSettingsService = new TaskSettingsService();
