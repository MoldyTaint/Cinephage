/**
 * Type definitions for SABnzbd API responses and configuration.
 * Based on SABnzbd API documentation and Prowlarr implementation.
 */

/**
 * SABnzbd download status values.
 * These are the possible status strings returned by the SABnzbd API.
 */
export type SabnzbdDownloadStatus =
	| 'Grabbing'
	| 'Queued'
	| 'Paused'
	| 'Checking'
	| 'Downloading'
	| 'QuickCheck'
	| 'Verifying'
	| 'Repairing'
	| 'Fetching'
	| 'Extracting'
	| 'Moving'
	| 'Running'
	| 'Completed'
	| 'Failed'
	| 'Deleted'
	| 'Propagating';

/**
 * SABnzbd priority levels.
 * -100 = Default, -3 = Duplicate, -2 = Paused, -1 = Low, 0 = Normal, 1 = High, 2 = Force
 */
export enum SabnzbdPriority {
	Default = -100,
	Duplicate = -3,
	Paused = -2,
	Low = -1,
	Normal = 0,
	High = 1,
	Force = 2
}

/**
 * SABnzbd post-processing options.
 * Controls what actions are taken after download completes.
 */
export enum SabnzbdPostProcessing {
	/** Use category default */
	Default = -1,
	/** No post-processing */
	None = 0,
	/** Repair only */
	Repair = 1,
	/** Repair and unpack */
	RepairUnpack = 2,
	/** Repair, unpack, and delete archives */
	RepairUnpackDelete = 3
}

/**
 * Queue item from SABnzbd's queue API response.
 */
export interface SabnzbdQueueItem {
	/** Unique NZB ID (nzo_id) */
	nzo_id: string;
	/** Display name/title */
	filename: string;
	/** Current status */
	status: SabnzbdDownloadStatus;
	/** Position in queue (0-based) */
	index: number;
	/** Time remaining as string (e.g., "0:12:34") */
	timeleft: string;
	/** Total size in MB */
	mb: string;
	/** Remaining size in MB */
	mbleft: string;
	/** Download percentage (0-100) */
	percentage: number;
	/** Category name */
	cat: string;
	/** Priority level */
	priority: string;
	/** Average age of articles in days */
	avg_age: string;
	/** Download speed in KB/s */
	speed?: string;
	/** ETA as string */
	eta?: string;
	/** Size as human readable string (e.g., "1.2 GB") */
	size?: string;
	/** Size left as human readable string */
	sizeleft?: string;
}

/**
 * History item from SABnzbd's history API response.
 */
export interface SabnzbdHistoryItem {
	/** Unique NZB ID (nzo_id) */
	nzo_id: string;
	/** Display name/title */
	name: string;
	/** Original NZB filename */
	nzb_name: string;
	/** Category name */
	category: string;
	/** Final storage path (may be empty/incomplete during post-processing) */
	storage: string;
	/** Alternative path field */
	path?: string;
	/** Size in bytes */
	bytes: number;
	/** Download status */
	status: SabnzbdDownloadStatus;
	/** Failure message if failed */
	fail_message: string;
	/** Download time in seconds */
	download_time: number;
	/** Post-processing time in seconds */
	postproc_time?: number;
	/** Completion timestamp (Unix) */
	completed: number;
	/** Stage log entries */
	stage_log?: SabnzbdStageLog[];
	/** URL source if downloaded from URL */
	url?: string;
	/** Whether this was from an archive */
	archive?: boolean;
	/** Archive extraction password used */
	password?: string;
}

/**
 * Stage log entry for post-processing stages.
 */
export interface SabnzbdStageLog {
	/** Stage name */
	name: string;
	/** Stage actions/messages */
	actions: string[];
}

/**
 * SABnzbd queue response wrapper.
 */
export interface SabnzbdQueue {
	/** Queue items */
	slots: SabnzbdQueueItem[];
	/** Current download speed in KB/s */
	speed: string;
	/** Speed limit in KB/s (0 = unlimited) */
	speedlimit: string;
	/** Speed limit percentage (0-100) */
	speedlimit_abs?: string;
	/** Whether downloading is paused */
	paused: boolean;
	/** Pause time remaining */
	pause_int?: string;
	/** Total MB left in queue */
	mbleft: string;
	/** Total MB in queue */
	mb: string;
	/** Number of items without limit */
	noofslots_total: number;
	/** Disk space free on download drive */
	diskspacetotal1?: string;
	/** Disk space free on complete drive */
	diskspacetotal2?: string;
	/** Time remaining for queue */
	timeleft: string;
	/** ETA for queue completion */
	eta?: string;
}

/**
 * SABnzbd history response wrapper.
 */
export interface SabnzbdHistory {
	/** History items */
	slots: SabnzbdHistoryItem[];
	/** Total items in history (without limit) */
	noofslots: number;
	/** Total size downloaded */
	total_size?: string;
	/** Month size downloaded */
	month_size?: string;
	/** Week size downloaded */
	week_size?: string;
	/** Day size downloaded */
	day_size?: string;
}

/**
 * SABnzbd category configuration.
 */
export interface SabnzbdCategory {
	/** Category name (e.g., "movies", "tv") */
	name: string;
	/** Sort order */
	order: number;
	/** Post-processing preset */
	pp: string;
	/** Post-processing script */
	script: string;
	/** Output directory (relative or absolute) */
	dir: string;
	/** Default priority for category */
	priority: number;
}

/**
 * SABnzbd misc configuration.
 */
export interface SabnzbdMisc {
	/** Complete download directory */
	complete_dir: string;
	/** Incomplete/temp download directory */
	download_dir?: string;
	/** Pre-check enabled */
	pre_check?: boolean;
	/** TV sorting enabled */
	enable_tv_sorting?: boolean;
	/** Movie sorting enabled */
	enable_movie_sorting?: boolean;
	/** Date sorting enabled */
	enable_date_sorting?: boolean;
	/** Categories for TV sorting */
	tv_categories?: string[];
	/** Categories for movie sorting */
	movie_categories?: string[];
	/** Categories for date sorting */
	date_categories?: string[];
}

/**
 * SABnzbd server configuration.
 */
export interface SabnzbdServer {
	/** Server name */
	name: string;
	/** Server hostname */
	host: string;
	/** Server port */
	port: number;
	/** Server enabled */
	enable: boolean;
	/** SSL enabled */
	ssl: boolean;
	/** Number of connections */
	connections: number;
}

/**
 * SABnzbd full configuration response.
 */
export interface SabnzbdConfig {
	misc: SabnzbdMisc;
	categories: SabnzbdCategory[];
	servers?: SabnzbdServer[];
}

/**
 * SABnzbd add response (for addurl/addfile).
 */
export interface SabnzbdAddResponse {
	/** Success status */
	status: boolean;
	/** Array of NZB IDs that were added */
	nzo_ids?: string[];
	/** Error message if failed */
	error?: string;
}

/**
 * SABnzbd version response.
 */
export interface SabnzbdVersionResponse {
	/** SABnzbd version string (e.g., "3.7.2") */
	version: string;
}

/**
 * SABnzbd config response wrapper.
 */
export interface SabnzbdConfigResponse {
	config: SabnzbdConfig;
}

/**
 * SABnzbd error response.
 */
export interface SabnzbdErrorResponse {
	/** Status as string "true" or "false" */
	status?: string | boolean;
	/** Error message */
	error?: string;
}

/**
 * SABnzbd full status response (for monitoring).
 */
export interface SabnzbdFullStatus {
	/** Paused state */
	paused: boolean;
	/** Current speed in bytes/s */
	speed: number;
	/** Speed limit in bytes/s */
	speedlimit?: number;
	/** Download directory */
	download_dir: string;
	/** Complete directory */
	complete_dir: string;
	/** Disk space info */
	diskspace1?: string;
	diskspace2?: string;
	diskspacetotal1?: string;
	diskspacetotal2?: string;
}

/**
 * SABnzbd full status response wrapper.
 */
export interface SabnzbdFullStatusResponse {
	status: SabnzbdFullStatus;
}

/**
 * Settings for connecting to SABnzbd.
 */
export interface SabnzbdSettings {
	host: string;
	port: number;
	useSsl: boolean;
	apiKey: string;
	/** Optional URL base (e.g., "/sabnzbd") */
	urlBase?: string;
	/** Fallback username for auth */
	username?: string;
	/** Fallback password for auth */
	password?: string;
}

/**
 * Map our priority to SABnzbd priority.
 */
export function mapPriorityToSabnzbd(priority: 'normal' | 'high' | 'force' | undefined): number {
	switch (priority) {
		case 'force':
			return SabnzbdPriority.Force;
		case 'high':
			return SabnzbdPriority.High;
		case 'normal':
		default:
			return SabnzbdPriority.Normal;
	}
}
