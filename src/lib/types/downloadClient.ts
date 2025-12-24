/**
 * Types for download client and root folder management UI
 */

export type DownloadClientImplementation =
	| 'qbittorrent'
	| 'transmission'
	| 'deluge'
	| 'rtorrent'
	| 'aria2'
	| 'sabnzbd'
	| 'nzbget';
export type DownloadPriority = 'normal' | 'high' | 'force';
export type DownloadInitialState = 'start' | 'pause' | 'force';
export type RootFolderMediaType = 'movie' | 'tv';

/**
 * Download client definition - metadata about each client type
 */
export interface DownloadClientDefinition {
	id: DownloadClientImplementation;
	name: string;
	description: string;
	defaultPort: number;
	protocol: 'torrent' | 'usenet';
	supportsCategories: boolean;
	supportsPriority: boolean;
	supportsSeedingLimits: boolean;
}

/**
 * Download client configuration from database
 */
export interface DownloadClient {
	id: string;
	name: string;
	implementation: DownloadClientImplementation;
	enabled: boolean;

	// Connection
	host: string;
	port: number;
	useSsl: boolean;
	username?: string | null;
	// Note: password not returned to frontend for security
	hasPassword: boolean;

	// Categories
	movieCategory: string;
	tvCategory: string;

	// Priority
	recentPriority: DownloadPriority;
	olderPriority: DownloadPriority;
	initialState: DownloadInitialState;

	// Seeding limits
	seedRatioLimit?: string | null;
	seedTimeLimit?: number | null;

	// Path mapping
	downloadPathLocal?: string | null;
	downloadPathRemote?: string | null;

	priority: number;
	createdAt?: string;
	updatedAt?: string;
}

/**
 * Form data for creating/editing download client
 */
export interface DownloadClientFormData {
	name: string;
	implementation: DownloadClientImplementation;
	enabled: boolean;
	host: string;
	port: number;
	useSsl: boolean;
	username: string | null;
	password: string | null;
	movieCategory: string;
	tvCategory: string;
	recentPriority: DownloadPriority;
	olderPriority: DownloadPriority;
	initialState: DownloadInitialState;
	seedRatioLimit: string | null;
	seedTimeLimit: number | null;
	downloadPathLocal: string | null;
	priority: number;
}

/**
 * Root folder configuration from database
 */
export interface RootFolder {
	id: string;
	name: string;
	path: string;
	mediaType: RootFolderMediaType;
	isDefault: boolean;
	readOnly: boolean;
	preserveSymlinks: boolean;
	freeSpaceBytes?: number | null;
	freeSpaceFormatted?: string;
	accessible: boolean;
	lastCheckedAt?: string | null;
	createdAt?: string;
}

/**
 * Form data for creating/editing root folder
 */
export interface RootFolderFormData {
	name: string;
	path: string;
	mediaType: RootFolderMediaType;
	isDefault: boolean;
	readOnly?: boolean;
	preserveSymlinks?: boolean;
}

/**
 * Connection test result with details
 */
export interface ConnectionTestResult {
	success: boolean;
	error?: string;
	warnings?: string[];
	details?: {
		version?: string;
		apiVersion?: string;
		savePath?: string;
		categories?: string[];
		// qBittorrent-specific settings
		maxRatioEnabled?: boolean;
		maxRatio?: number;
		maxSeedingTimeEnabled?: boolean;
		maxSeedingTime?: number;
		maxRatioAction?: number;
	};
}

/**
 * Path validation result
 */
export interface PathValidationResult {
	valid: boolean;
	exists: boolean;
	writable: boolean;
	error?: string;
	freeSpaceBytes?: number;
	freeSpaceFormatted?: string;
}

/**
 * Download client status (runtime info)
 */
export interface DownloadClientStatus {
	connected: boolean;
	version?: string;
	activeDownloads?: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	lastCheckedAt?: string;
}

/**
 * Filter state for download client table
 */
export interface DownloadClientFilters {
	implementation: DownloadClientImplementation | 'all';
	status: 'all' | 'enabled' | 'disabled';
	search: string;
}

/**
 * Sort state for download client table
 */
export interface DownloadClientSort {
	column: 'name' | 'priority' | 'implementation' | 'enabled';
	direction: 'asc' | 'desc';
}
