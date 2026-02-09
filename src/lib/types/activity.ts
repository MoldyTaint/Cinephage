/**
 * Types for unified activity tracking
 * Consolidates download history and monitoring history into a single view
 */

import type { QueueQualityInfo } from './queue';

/**
 * Activity status values
 */
export type ActivityStatus =
	| 'imported' // Successfully imported to library
	| 'streaming' // Streaming source (no download)
	| 'downloading' // Currently downloading
	| 'failed' // Download or import failed
	| 'rejected' // Release rejected (quality, blocklist, etc.)
	| 'removed' // Removed from queue
	| 'no_results' // Search found no results
	| 'searching'; // Search in progress

/**
 * Activity event types for timeline
 */
export type ActivityEventType =
	| 'searched' // Search initiated
	| 'found' // Releases found
	| 'grabbed' // Release grabbed/sent to client
	| 'downloading' // Download started
	| 'completed' // Download completed
	| 'postprocessing' // Post-processing (usenet extraction)
	| 'importing' // Import started
	| 'imported' // Import completed
	| 'failed' // Operation failed
	| 'rejected' // Release rejected
	| 'removed'; // Removed from queue

/**
 * Timeline event within an activity
 */
export interface ActivityEvent {
	type: ActivityEventType;
	timestamp: string;
	details?: string; // e.g., "15 releases found", "Import failed: corrupted"
}

/**
 * Unified activity item combining download and monitoring history
 */
export interface UnifiedActivity {
	id: string;

	// Media info
	mediaType: 'movie' | 'episode';
	mediaId: string;
	mediaTitle: string;
	mediaYear: number | null;
	seriesId?: string; // for episodes
	seriesTitle?: string; // for episodes
	seasonNumber?: number;
	episodeNumber?: number;
	episodeIds?: string[]; // for multi-episode packs

	// Release info
	releaseTitle: string | null;
	quality: QueueQualityInfo | null;
	releaseGroup: string | null;
	size: number | null;

	// Source info
	indexerId: string | null;
	indexerName: string | null;
	protocol: 'torrent' | 'usenet' | 'streaming' | null;
	downloadClientId?: string | null;
	downloadClientName?: string | null;

	// Status
	status: ActivityStatus;
	statusReason?: string;
	downloadProgress?: number; // 0-100 for in-progress

	// Upgrade info
	isUpgrade: boolean;
	oldScore?: number;
	newScore?: number;

	// Timeline events
	timeline: ActivityEvent[];

	// Timestamps
	startedAt: string;
	completedAt: string | null;

	// Links
	queueItemId?: string; // Link to current queue item if downloading
	downloadHistoryId?: string; // Link to download history record
	monitoringHistoryId?: string; // Link to monitoring history record
	importedPath?: string; // Path where file was imported
}

/**
 * Filter options for activity listing
 */
export interface ActivityFilters {
	status?: ActivityStatus | 'success' | 'all';
	mediaType?: 'movie' | 'tv' | 'all';
	search?: string;
	startDate?: string;
	endDate?: string;
	protocol?: 'torrent' | 'usenet' | 'streaming' | 'all';
	indexer?: string;
	releaseGroup?: string;
	resolution?: string;
	isUpgrade?: boolean;
	downloadClientId?: string;
	includeNoResults?: boolean;
}

/**
 * Available filter options for dropdowns
 */
export interface FilterOptions {
	indexers: Array<{ id: string; name: string }>;
	downloadClients: Array<{ id: string; name: string }>;
	releaseGroups: string[];
	resolutions: string[];
}

/**
 * Sort options for activity listing
 */
export interface ActivitySortOptions {
	field: 'time' | 'media' | 'size' | 'status';
	direction: 'asc' | 'desc';
}

/**
 * SSE event types for activity updates
 */
export type ActivityEventStreamType =
	| 'activity:new' // New activity added
	| 'activity:updated' // Activity status changed
	| 'activity:progress'; // Download progress update

/**
 * SSE event payload for activity stream
 */
export interface ActivityStreamEvent {
	type: ActivityEventStreamType;
	data: UnifiedActivity | { id: string; progress: number };
	timestamp: string;
}

/**
 * Response from activity API
 */
export interface ActivityResponse {
	success: boolean;
	activities: UnifiedActivity[];
	total: number;
	hasMore: boolean;
}

/**
 * Score breakdown for activity details
 */
export interface ScoreBreakdown {
	resolution?: { old: number; new: number };
	source?: { old: number; new: number };
	codec?: { old: number; new: number };
	hdr?: { old: number; new: number };
	audio?: { old: number; new: number };
	releaseGroup?: { old: number; new: number };
	customFormats?: Array<{ name: string; old: number; new: number }>;
}

/**
 * Search result entry for audit trail
 */
export interface SearchResultEntry {
	title: string;
	indexer: string;
	score: number;
	size: number;
	protocol: string;
	rejected: boolean;
	rejectionReason?: string;
}

/**
 * Import log entry
 */
export interface ImportLogEntry {
	step: string;
	timestamp: string;
	message: string;
	success: boolean;
}

/**
 * File import entry
 */
export interface FileImportEntry {
	path: string;
	size: number;
	quality: string;
}

/**
 * File deletion entry
 */
export interface FileDeletionEntry {
	path: string;
	reason: string;
}

/**
 * Release info metadata
 */
export interface ReleaseInfo {
	indexerId?: string;
	indexerName?: string;
	downloadUrl?: string;
	magnetUrl?: string;
	seeders?: number;
	leechers?: number;
	age?: string;
}

/**
 * Replaced file info
 */
export interface ReplacedFileInfo {
	id: string;
	path: string;
	size: number | null;
	quality: QueueQualityInfo | null;
	releaseGroup: string | null;
}

/**
 * Activity details with full scoring breakdown and audit trail
 */
export interface ActivityDetails {
	id: string;
	activityId: string;
	scoreBreakdown?: ScoreBreakdown;
	replacedFileInfo?: ReplacedFileInfo;
	replacedFilePath?: string | null;
	replacedFileQuality?: QueueQualityInfo | null;
	replacedFileScore?: number | null;
	replacedFileSize?: number | null;
	searchResults?: SearchResultEntry[];
	selectionReason?: string | null;
	importLog?: ImportLogEntry[];
	filesImported?: FileImportEntry[];
	filesDeleted?: FileDeletionEntry[];
	downloadClientName?: string | null;
	downloadClientType?: string | null;
	downloadId?: string | null;
	infoHash?: string | null;
	releaseInfo?: ReleaseInfo;
	createdAt: string;
	updatedAt: string;
}
