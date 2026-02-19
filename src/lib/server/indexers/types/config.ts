/**
 * Indexer Configuration Types
 *
 * Defines the structure for configured indexer instances stored in the database.
 * This is an indexer definition + user configuration.
 */

import type {
	IndexerProtocol,
	TorrentProtocolSettings,
	UsenetProtocolSettings,
	StreamingProtocolSettings
} from './protocol';

// =============================================================================
// INDEXER CONFIG
// =============================================================================

/**
 * Indexer configuration stored in database.
 * Represents a user-configured instance of an indexer definition.
 */
export interface IndexerConfig {
	/** Unique instance ID (UUID) */
	id: string;
	/** User-provided display name */
	name: string;
	/** Definition ID this instance is based on */
	definitionId: string;
	/** Whether the indexer is enabled */
	enabled: boolean;
	/** Base URL (can override definition default) */
	baseUrl: string;
	/** Alternative/fallback URLs (tried in order if primary fails) */
	alternateUrls: string[];
	/** Priority (1-100, lower = higher priority) */
	priority: number;
	/** Protocol type */
	protocol: IndexerProtocol;

	// Search capability toggles
	/** Whether automatic search is enabled */
	enableAutomaticSearch: boolean;
	/** Whether interactive/manual search is enabled */
	enableInteractiveSearch: boolean;

	// User-provided authentication settings
	/** Raw settings from user (apiKey, cookie, etc.) */
	settings?: Record<string, string | boolean | number | undefined>;

	// Protocol-specific settings (stored separately for clarity)
	/** Torrent-specific settings (if protocol === 'torrent') */
	torrentSettings?: TorrentProtocolSettings;
	/** Usenet-specific settings (if protocol === 'usenet') */
	usenetSettings?: UsenetProtocolSettings;
	/** Streaming-specific settings (if protocol === 'streaming') */
	streamingSettings?: StreamingProtocolSettings;

	// ==========================================================================
	// LEGACY FIELDS (for backwards compatibility during migration)
	// These are deprecated and will be moved to protocol-specific settings
	// ==========================================================================

	/** @deprecated Use torrentSettings.minimumSeeders */
	minimumSeeders?: number;
	/** @deprecated Use torrentSettings.seedRatio */
	seedRatio?: string | null;
	/** @deprecated Use torrentSettings.seedTime */
	seedTime?: number | null;
	/** @deprecated Use torrentSettings.packSeedTime */
	packSeedTime?: number | null;
	/** @deprecated Use torrentSettings.rejectDeadTorrents */
	rejectDeadTorrents?: boolean;
}

/**
 * Data required to create a new indexer
 */
export interface CreateIndexerData {
	/** User-provided display name */
	name: string;
	/** Definition ID to base this instance on */
	definitionId: string;
	/** Whether the indexer is enabled */
	enabled?: boolean;
	/** Base URL (optional, uses definition default if not provided) */
	baseUrl?: string;
	/** Alternative URLs */
	alternateUrls?: string[];
	/** Priority */
	priority?: number;

	// Search toggles
	enableAutomaticSearch?: boolean;
	enableInteractiveSearch?: boolean;

	// User settings (auth credentials, etc.)
	settings?: Record<string, string>;

	// Protocol-specific settings
	torrentSettings?: Partial<TorrentProtocolSettings>;
	usenetSettings?: Partial<UsenetProtocolSettings>;
	streamingSettings?: Partial<StreamingProtocolSettings>;
}

/**
 * Data for updating an existing indexer
 */
export interface UpdateIndexerData {
	/** User-provided display name */
	name?: string;
	/** Whether the indexer is enabled */
	enabled?: boolean;
	/** Base URL */
	baseUrl?: string;
	/** Alternative URLs */
	alternateUrls?: string[];
	/** Priority */
	priority?: number;

	// Search toggles
	enableAutomaticSearch?: boolean;
	enableInteractiveSearch?: boolean;

	// User settings (auth credentials, etc.)
	settings?: Record<string, string>;

	// Protocol-specific settings
	torrentSettings?: Partial<TorrentProtocolSettings>;
	usenetSettings?: Partial<UsenetProtocolSettings>;
	streamingSettings?: Partial<StreamingProtocolSettings>;
}

// =============================================================================
// STATUS TYPES
// =============================================================================

/**
 * Health status levels
 */
export type HealthStatus = 'healthy' | 'warning' | 'failing' | 'disabled';

/**
 * Indexer runtime status (health, failures, etc.)
 */
export interface IndexerStatus {
	/** Indexer ID */
	indexerId: string;
	/** Current health status */
	health: HealthStatus;
	/** Whether enabled by user */
	isEnabled: boolean;
	/** Whether auto-disabled due to failures */
	isDisabled: boolean;
	/** When auto-disabled until (if applicable) */
	disabledUntil?: Date;
	/** Consecutive failure count */
	consecutiveFailures: number;
	/** Total requests made */
	totalRequests: number;
	/** Total failures */
	totalFailures: number;
	/** Last successful request */
	lastSuccess?: Date;
	/** Last failed request */
	lastFailure?: Date;
	/** Average response time in ms */
	avgResponseTime?: number;
	/** Recent failures with messages */
	recentFailures: Array<{
		timestamp: Date;
		message: string;
		requestUrl?: string;
	}>;
}

/**
 * Indexer status snapshot (for quick checks)
 */
export interface IndexerStatusSnapshot {
	/** Whether the indexer is enabled by user */
	isEnabled: boolean;
	/** Whether the indexer is auto-disabled due to failures */
	isDisabled: boolean;
	/** When the indexer can be retried (if disabled) */
	disabledUntil?: Date;
	/** Overall health assessment */
	health: HealthStatus;
	/** Consecutive failure count */
	consecutiveFailures: number;
	/** Priority (from config) */
	priority: number;
}

// =============================================================================
// COMBINED TYPES FOR UI
// =============================================================================

/**
 * Indexer with status for UI display
 */
export interface IndexerWithStatus extends IndexerConfig {
	/** Runtime status */
	status?: IndexerStatus;
	/** Definition display name (if different from instance name) */
	definitionName?: string;
}

/**
 * Filter state for indexer list
 */
export interface IndexerFilters {
	/** Filter by protocol */
	protocol: IndexerProtocol | 'all';
	/** Filter by enabled/disabled status */
	status: 'all' | 'enabled' | 'disabled';
	/** Text search */
	search: string;
}

/**
 * Sort options for indexer list
 */
export interface IndexerSort {
	/** Field to sort by */
	field: 'name' | 'priority' | 'health' | 'protocol';
	/** Sort direction */
	direction: 'asc' | 'desc';
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert legacy flat config to new structured config
 */
export function convertLegacyConfig(legacy: {
	id: string;
	name: string;
	implementation: string;
	enabled: boolean;
	url: string;
	alternateUrls?: string[];
	priority: number;
	protocol: IndexerProtocol;
	settings?: Record<string, string>;
	minimumSeeders?: number;
	seedRatio?: string | null;
	seedTime?: number | null;
	packSeedTime?: number | null;
	enableAutomaticSearch?: boolean;
	enableInteractiveSearch?: boolean;
}): IndexerConfig {
	const config: IndexerConfig = {
		id: legacy.id,
		name: legacy.name,
		definitionId: legacy.implementation,
		enabled: legacy.enabled,
		baseUrl: legacy.url,
		alternateUrls: legacy.alternateUrls ?? [],
		priority: legacy.priority,
		protocol: legacy.protocol,
		enableAutomaticSearch: legacy.enableAutomaticSearch ?? true,
		enableInteractiveSearch: legacy.enableInteractiveSearch ?? true,
		settings: legacy.settings ?? {}
	};

	// Convert torrent-specific settings
	if (legacy.protocol === 'torrent') {
		config.torrentSettings = {
			minimumSeeders: legacy.minimumSeeders ?? 1,
			seedRatio: legacy.seedRatio ?? null,
			seedTime: legacy.seedTime ?? null,
			packSeedTime: legacy.packSeedTime ?? null
		};
	}

	return config;
}

/**
 * Convert structured config back to flat format (for backwards compatibility)
 */
export function convertToFlatConfig(config: IndexerConfig): Record<string, unknown> {
	const flat: Record<string, unknown> = {
		id: config.id,
		name: config.name,
		implementation: config.definitionId,
		enabled: config.enabled,
		url: config.baseUrl,
		alternateUrls: config.alternateUrls,
		priority: config.priority,
		protocol: config.protocol,
		settings: config.settings,
		enableAutomaticSearch: config.enableAutomaticSearch,
		enableInteractiveSearch: config.enableInteractiveSearch
	};

	// Flatten torrent settings
	if (config.torrentSettings) {
		flat.minimumSeeders = config.torrentSettings.minimumSeeders;
		flat.seedRatio = config.torrentSettings.seedRatio;
		flat.seedTime = config.torrentSettings.seedTime;
		flat.packSeedTime = config.torrentSettings.packSeedTime;
	}

	return flat;
}
