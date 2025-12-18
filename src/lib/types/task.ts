/**
 * Task System Types
 *
 * Type definitions for the system tasks feature.
 * Tasks are manual maintenance operations that users can trigger from the Tasks page.
 */

/**
 * Definition of a system task that can be run manually
 */
export interface TaskDefinition {
	/** Unique identifier for the task (e.g., 'update-strm-urls') */
	id: string;
	/** Human-readable name displayed in UI */
	name: string;
	/** Description of what the task does */
	description: string;
	/** API endpoint to call when running the task (POST) */
	endpoint: string;
	/** Category for grouping tasks */
	category: 'maintenance' | 'housekeeping' | 'sync';
}

/**
 * A record of a task execution
 */
export interface TaskHistoryEntry {
	id: string;
	taskId: string;
	status: 'running' | 'completed' | 'failed' | 'cancelled';
	results: Record<string, unknown> | null;
	errors: string[] | null;
	startedAt: string;
	completedAt: string | null;
}

/**
 * Combined task status including definition and last run info
 */
export interface TaskStatus {
	taskId: string;
	lastRun: TaskHistoryEntry | null;
	isRunning: boolean;
}
