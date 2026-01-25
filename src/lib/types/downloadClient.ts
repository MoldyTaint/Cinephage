/**
 * Types for download client and root folder management UI
 */

export type DownloadClientImplementation =
	| 'qbittorrent'
	| 'transmission'
	| 'deluge'
	| 'rtorrent'
	| 'aria2'
	| 'nzb-mount'
	| 'sabnzbd'
	| 'nzbget'
	| 'nntp';
export type DownloadPriority = 'normal' | 'high' | 'force';
export type DownloadInitialState = 'start' | 'pause' | 'force';
export type RootFolderMediaType = 'movie' | 'tv';
export type DownloadClientMountMode = 'nzbdav' | 'altmount';

/**
 * Download client definition - metadata about each client type
 */
export interface DownloadClientDefinition {
	id: DownloadClientImplementation;
	name: string;
	description: string;
	defaultPort: number;
	protocol: 'torrent' | 'usenet' | 'nntp';
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
	urlBase?: string | null;
	mountMode?: DownloadClientMountMode | null;
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

	// Path mapping (completed downloads)
	downloadPathLocal?: string | null;
	downloadPathRemote?: string | null;
	// Path mapping (temp/incomplete downloads - SABnzbd only)
	tempPathLocal?: string | null;
	tempPathRemote?: string | null;

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
	urlBase: string | null;
	mountMode?: DownloadClientMountMode | null;
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
	downloadPathRemote: string | null;
	tempPathLocal: string | null;
	tempPathRemote: string | null;
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
	defaultMonitored: boolean;
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
	defaultMonitored?: boolean;
}

/**
 * Connection test result with details
 */
export interface ConnectionTestResult {
	success: boolean;
	error?: string;
	warnings?: string[];
	// NNTP server greeting (for NNTP connections)
	greeting?: string;
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
		// SABnzbd disk space info
		diskSpace1?: string;
		diskSpace2?: string;
		diskSpaceTotal1?: string;
		diskSpaceTotal2?: string;
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

/**
 * Unified client item that can represent either a download client or NNTP server.
 * Used in the settings UI where both types are displayed together.
 */
export interface UnifiedClientItem {
	id: string;
	name: string;
	type: 'download-client' | 'nntp-server';
	implementation: DownloadClientImplementation;
	host: string;
	port: number;
	useSsl: boolean | null;
	urlBase?: string | null;
	mountMode?: DownloadClientMountMode | null;
	enabled: boolean | null;
	username?: string | null;
	hasPassword?: boolean;
	// Download client fields
	movieCategory?: string;
	tvCategory?: string;
	recentPriority?: string;
	olderPriority?: string;
	initialState?: string;
	downloadPathLocal?: string | null;
	downloadPathRemote?: string | null;
	tempPathLocal?: string | null;
	tempPathRemote?: string | null;
	// NNTP server fields
	maxConnections?: number | null;
	priority?: number | null;
	testResult?: string | null;
	lastTestedAt?: string | null;
}
