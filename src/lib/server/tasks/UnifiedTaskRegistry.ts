/**
 * Unified Task Registry
 *
 * Central registry for ALL tasks in Cinephage - both scheduled (monitoring) tasks
 * and manual maintenance tasks. Provides a single source of truth for task metadata.
 */

/**
 * Unified task definition covering both scheduled and manual tasks
 */
export interface UnifiedTaskDefinition {
	id: string;
	name: string;
	description: string;
	category: 'scheduled' | 'maintenance';
	/** API endpoint to POST to run this task */
	runEndpoint: string;
	/** For scheduled tasks: key in monitoringSettings for interval */
	intervalKey?: string;
	/** For scheduled tasks: default interval in hours */
	defaultIntervalHours?: number;
	/** For scheduled tasks: minimum allowed interval in hours */
	minIntervalHours?: number;
	/** Whether the interval can be edited by users (false for system tasks like pendingRelease) */
	intervalEditable?: boolean;
	/** Whether the task is enabled and should run automatically */
	enabled?: boolean;
}

/**
 * Unified task with runtime status
 */
export interface UnifiedTask extends UnifiedTaskDefinition {
	lastRunTime: string | null;
	nextRunTime: string | null;
	intervalHours: number | null;
	isRunning: boolean;
	enabled: boolean;
}

/**
 * All scheduled monitoring tasks
 */
const SCHEDULED_TASKS: UnifiedTaskDefinition[] = [
	{
		id: 'missing',
		name: 'Missing Content Search',
		description: 'Search for releases for monitored movies and episodes that are missing files',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/missing',
		intervalKey: 'missing_search_interval_hours',
		defaultIntervalHours: 24,
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'upgrade',
		name: 'Upgrade Search',
		description: 'Search for better quality releases to replace existing files',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/upgrade',
		intervalKey: 'upgrade_search_interval_hours',
		defaultIntervalHours: 168, // Weekly
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'newEpisode',
		name: 'New Episode Check',
		description: 'Search for recently aired episodes of monitored series',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/new-episodes',
		intervalKey: 'new_episode_check_interval_hours',
		defaultIntervalHours: 1,
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'cutoffUnmet',
		name: 'Cutoff Unmet Search',
		description: 'Search for releases for content below the quality profile cutoff',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/cutoff-unmet',
		intervalKey: 'cutoff_unmet_search_interval_hours',
		defaultIntervalHours: 24,
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'pendingRelease',
		name: 'Pending Release Processing',
		description: 'Process releases waiting in the delay profile queue',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/pending-releases',
		intervalKey: 'pending_release_interval_hours',
		defaultIntervalHours: 0.25, // 15 minutes
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'smartListRefresh',
		name: 'Smart List Refresh',
		description: 'Check and update smart lists based on their configured refresh intervals',
		category: 'scheduled',
		runEndpoint: '/api/smart-lists/refresh-all',
		intervalKey: 'smart_list_refresh_interval_hours',
		defaultIntervalHours: 1, // Hourly
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'missingSubtitles',
		name: 'Missing Subtitles Search',
		description: 'Download subtitles for media files missing required languages',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/missing-subtitles',
		intervalKey: 'missing_subtitles_interval_hours',
		defaultIntervalHours: 6,
		minIntervalHours: 0.25,
		intervalEditable: true
	},
	{
		id: 'subtitleUpgrade',
		name: 'Subtitle Upgrade Search',
		description: 'Search for better-scoring subtitles to replace existing ones',
		category: 'scheduled',
		runEndpoint: '/api/monitoring/search/subtitle-upgrade',
		intervalKey: 'subtitle_upgrade_interval_hours',
		defaultIntervalHours: 24,
		minIntervalHours: 0.25,
		intervalEditable: true
	}
];

/**
 * Manual maintenance tasks
 */
const MAINTENANCE_TASKS: UnifiedTaskDefinition[] = [
	{
		id: 'library-scan',
		name: 'Library Scan',
		description:
			'Scan root folders for media files. Run this after adding folders or if media is missing.',
		category: 'maintenance',
		runEndpoint: '/api/library/scan'
	},
	{
		id: 'update-strm-urls',
		name: 'Update .strm URLs',
		description:
			'Update all .strm files with the current streaming base URL. Run this after changing your server address, port, or domain.',
		category: 'maintenance',
		runEndpoint: '/api/streaming/strm/update'
	},
	{
		id: 'reprobe-strm-media-info',
		name: 'Reprobe .strm Media Info',
		description:
			'Reprobe existing .strm files to refresh media info, excluding Streamer Profile .strm files.',
		category: 'maintenance',
		runEndpoint: '/api/streaming/strm/reprobe'
	}
];

/**
 * All task definitions combined
 */
export const UNIFIED_TASK_DEFINITIONS: UnifiedTaskDefinition[] = [
	...SCHEDULED_TASKS,
	...MAINTENANCE_TASKS
];

/**
 * Get a task definition by ID
 */
export function getUnifiedTaskById(id: string): UnifiedTaskDefinition | undefined {
	return UNIFIED_TASK_DEFINITIONS.find((t) => t.id === id);
}

/**
 * Get all tasks in a category
 */
export function getUnifiedTasksByCategory(
	category: 'scheduled' | 'maintenance'
): UnifiedTaskDefinition[] {
	return UNIFIED_TASK_DEFINITIONS.filter((t) => t.category === category);
}

/**
 * Get all scheduled tasks (convenience function)
 */
export function getScheduledTasks(): UnifiedTaskDefinition[] {
	return SCHEDULED_TASKS;
}

/**
 * Get all maintenance tasks (convenience function)
 */
export function getMaintenanceTasks(): UnifiedTaskDefinition[] {
	return MAINTENANCE_TASKS;
}

/**
 * Check if a task is a scheduled task
 */
export function isScheduledTask(taskId: string): boolean {
	return SCHEDULED_TASKS.some((t) => t.id === taskId);
}

/**
 * Check if a task's interval can be edited
 */
export function isIntervalEditable(taskId: string): boolean {
	const task = getUnifiedTaskById(taskId);
	return task?.intervalEditable === true;
}
