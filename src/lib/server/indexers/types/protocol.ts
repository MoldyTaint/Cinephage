/**
 * Protocol Types
 *
 * Defines the three core indexer protocols and their specific configurations.
 * Each protocol has unique characteristics for authentication, results, and download handling.
 */

// =============================================================================
// PROTOCOL ENUM & TYPE
// =============================================================================

/**
 * The three supported indexer protocols.
 * - torrent: BitTorrent trackers returning .torrent files or magnet links
 * - usenet: Newznab/Usenet indexers returning NZB files
 * - streaming: Internal streaming provider creating .strm files
 */
export type IndexerProtocol = 'torrent' | 'usenet' | 'streaming';

/**
 * Protocol enum for runtime checks and iteration
 */
export const IndexerProtocols = {
	Torrent: 'torrent' as const,
	Usenet: 'usenet' as const,
	Streaming: 'streaming' as const
} as const;

/**
 * All valid protocol values as an array
 */
export const ALL_PROTOCOLS: IndexerProtocol[] = ['torrent', 'usenet', 'streaming'];

// =============================================================================
// PROTOCOL-SPECIFIC SETTINGS
// =============================================================================

/**
 * Torrent protocol settings (seeding, seeders requirements)
 */
export interface TorrentProtocolSettings {
	/** Minimum seeders required for a release to be considered */
	minimumSeeders?: number;
	/** Target seed ratio (e.g., "1.0", "2.0") */
	seedRatio?: string | null;
	/** Seed time in minutes */
	seedTime?: number | null;
	/** Seed time for season packs in minutes (usually longer) */
	packSeedTime?: number | null;
	/** Reject torrents with zero seeders */
	rejectDeadTorrents?: boolean;
	/** Maximum size in bytes */
	maximumSize?: number;
}

/**
 * Usenet protocol settings (retention, priority)
 */
export interface UsenetProtocolSettings {
	/** Minimum retention days required */
	minimumRetention?: number | null;
	/** Maximum retention days */
	maximumRetention?: number | null;
	/** Download priority for this indexer's results */
	downloadPriority?: 'normal' | 'high' | 'low';
	/** Prefer releases with more NZB parts (better completion) */
	preferCompleteNzb?: boolean;
	/** Reject password-protected releases */
	rejectPasswordProtected?: boolean;
	/** API key for authenticated requests */
	apiKey?: string;
	/** Maximum size in bytes */
	maximumSize?: number;
}

/**
 * Streaming protocol settings (quality, source preferences)
 */
export interface StreamingProtocolSettings {
	/** Base URL for .strm file content (resolved at runtime if empty) */
	baseUrl?: string | null;
	/** Preferred quality tier when multiple available */
	preferredQuality?: '4k' | '1080p' | '720p' | '480p' | 'auto';
	/** Whether to include releases in automatic searches */
	includeInAutoSearch?: boolean;
	/** Minimum quality to accept */
	minimumQuality?: string;
	/** Preferred streaming providers */
	preferredProviders?: string[];
	/** Blocked streaming providers */
	blockedProviders?: string[];
	/** Authentication token for protected streams */
	authToken?: string;
	/** Enable direct play (no transcoding) */
	enableDirectPlay?: boolean;
}

/**
 * Union type for all protocol-specific settings
 */
export type ProtocolSettings =
	| TorrentProtocolSettings
	| UsenetProtocolSettings
	| StreamingProtocolSettings;

// =============================================================================
// PROTOCOL-SPECIFIC RESULT FIELDS
// =============================================================================

/**
 * Torrent-specific fields in release results
 */
export interface TorrentResultFields {
	/** Number of seeders */
	seeders: number;
	/** Number of leechers */
	leechers: number;
	/** Number of completed downloads (grabs/snatches) */
	grabs?: number;
	/** Info hash (40-char hex string) */
	infoHash?: string;
	/** Magnet URL if available */
	magnetUrl?: string;
	/** Whether this is a freeleech release */
	freeleech?: boolean;
	/** Upload factor (e.g., 2x upload credit) */
	uploadFactor?: number;
	/** Download factor (e.g., 0.5x = 50% freeleech) */
	downloadFactor?: number;
	/** Whether this is an internal release */
	isInternal?: boolean;
	/** Whether this is freeleech (alias for freeleech) */
	isFreeleech?: boolean;
	/** Minimum ratio requirement */
	minimumRatio?: number;
	/** Minimum seed time requirement */
	minimumSeedTime?: number;
}

/**
 * Usenet-specific fields in release results
 */
export interface UsenetResultFields {
	/** Poster name */
	poster?: string;
	/** Usenet group */
	group?: string;
	/** Number of NZB parts */
	parts?: number;
	/** Retention in days (how old the post is) */
	retention?: number;
	/** Whether the release is password protected */
	passwordProtected?: boolean;
	/** Number of grabs/downloads */
	grabs?: number;
	/** Number of files in the release */
	fileCount?: number;
	/** NZB identifier */
	nzbId?: string;
	/** Completion percentage (0-100) */
	completionPercentage?: number;
}

/**
 * Streaming-specific fields in release results
 */
export interface StreamingResultFields {
	/** Quality of the stream */
	streamQuality?: '4k' | '1080p' | '720p' | '480p' | 'unknown';
	/** Streaming provider name */
	providerName?: string;
	/** Provider-specific content ID */
	providerId?: string;
	/** Whether the stream has been verified as available */
	verified?: boolean;
	/** Available audio languages */
	audioLanguages?: string[];
	/** Available subtitle languages */
	subtitleLanguages?: string[];
	/** Direct stream URL */
	streamUrl?: string;
	/** Quality string (e.g., "1080p", "720p") */
	quality?: string;
	/** Content type */
	contentType?: string;
	/** Whether direct play is supported */
	supportsDirectPlay?: boolean;
	/** Whether authentication is required */
	requiresAuth?: boolean;
	/** Available subtitle tracks */
	subtitles?: Array<{
		language: string;
		url: string;
		label?: string;
	}>;
	/** Available quality variants */
	variants?: Array<{
		quality: string;
		url: string;
		bitrate?: number;
		isDefault: boolean;
	}>;

	// Pack-related fields (for internal streaming indexer)
	/** Whether this is a season pack release */
	isSeasonPack?: boolean;
	/** Whether this is a complete series release */
	isCompleteSeries?: boolean;
	/** Number of episodes (for season packs) */
	episodeCount?: number;
	/** Episode numbers in the pack */
	episodeNumbers?: number[];
	/** Number of seasons (for complete series) */
	seasonCount?: number;
	/** Total episodes (for complete series) */
	totalEpisodes?: number;
	/** Season numbers included */
	seasons?: number[];
}

// =============================================================================
// DEFAULT SETTINGS FACTORIES
// =============================================================================

/**
 * Create default torrent protocol settings
 */
export function createDefaultTorrentSettings(): TorrentProtocolSettings {
	return {
		minimumSeeders: 1,
		seedRatio: null,
		seedTime: null,
		packSeedTime: null
	};
}

/**
 * Create default usenet protocol settings
 */
export function createDefaultUsenetSettings(): UsenetProtocolSettings {
	return {
		minimumRetention: null,
		downloadPriority: 'normal',
		preferCompleteNzb: true
	};
}

/**
 * Create default streaming protocol settings
 */
export function createDefaultStreamingSettings(): StreamingProtocolSettings {
	return {
		baseUrl: null,
		preferredQuality: 'auto',
		includeInAutoSearch: true
	};
}

/**
 * Get default settings for a protocol
 */
export function getDefaultProtocolSettings(protocol: IndexerProtocol): ProtocolSettings {
	switch (protocol) {
		case 'torrent':
			return createDefaultTorrentSettings();
		case 'usenet':
			return createDefaultUsenetSettings();
		case 'streaming':
			return createDefaultStreamingSettings();
	}
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if settings are torrent settings
 */
export function isTorrentSettings(settings: ProtocolSettings): settings is TorrentProtocolSettings {
	return 'minimumSeeders' in settings;
}

/**
 * Check if settings are usenet settings
 */
export function isUsenetSettings(settings: ProtocolSettings): settings is UsenetProtocolSettings {
	return 'minimumRetention' in settings;
}

/**
 * Check if settings are streaming settings
 */
export function isStreamingSettings(
	settings: ProtocolSettings
): settings is StreamingProtocolSettings {
	return 'preferredQuality' in settings;
}

/**
 * Check if a protocol value is valid
 */
export function isValidProtocol(value: string): value is IndexerProtocol {
	return ALL_PROTOCOLS.includes(value as IndexerProtocol);
}
