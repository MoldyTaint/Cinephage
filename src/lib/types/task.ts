/**
 * Task System Types
 *
 * Type definitions for the system tasks feature.
 * Tasks are manual maintenance operations that users can trigger from the Tasks page.
 */

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
