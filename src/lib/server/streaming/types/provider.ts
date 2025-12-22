/**
 * Provider Types
 *
 * Type definitions for streaming providers and their configurations.
 */

import type { StreamResult } from './stream';

// ============================================================================
// Provider Identifiers
// ============================================================================

/**
 * All supported streaming provider IDs
 */
export type StreamingProviderId =
	| 'videasy'
	| 'vidlink'
	| 'xprime'
	| 'smashy'
	| 'hexa'
	| 'yflix'
	| 'mapple'
	| 'onetouchtv'
	| 'animekai'
	| 'kisskh';

/**
 * Media type for content search
 */
export type MediaType = 'movie' | 'tv';

/**
 * Content category support
 */
export type ContentCategory = 'movies' | 'tv' | 'anime' | 'asian-drama';

// ============================================================================
// Provider Capabilities
// ============================================================================

/**
 * Detailed capability flags for a provider
 */
export interface ProviderCapabilities {
	/** Supports movie content */
	supportsMovies: boolean;

	/** Supports TV show content */
	supportsTv: boolean;

	/** Supports anime content (may use different ID systems) */
	supportsAnime: boolean;

	/** Supports Asian drama content (may use different ID systems) */
	supportsAsianDrama: boolean;

	/** Requires content ID lookup (not TMDB-native) */
	requiresContentIdLookup: boolean;

	/** Requires encryption/decryption via EncDec API */
	requiresEncryption: boolean;

	/** Supports multiple language servers */
	supportsMultipleServers: boolean;

	/** Supports language-based stream selection */
	supportsLanguageSelection: boolean;
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Retry configuration for a provider
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxRetries: number;

	/** Base delay between retries in ms */
	baseDelayMs: number;

	/** Whether to use exponential backoff */
	exponentialBackoff: boolean;

	/** Maximum delay between retries in ms */
	maxDelayMs: number;
}

/**
 * Timeout configuration for a provider
 */
export interface TimeoutConfig {
	/** Connection timeout in ms */
	connectTimeout: number;

	/** Request timeout in ms */
	requestTimeout: number;

	/** Stream validation timeout in ms */
	validationTimeout: number;
}

/**
 * Static configuration for a provider
 */
export interface ProviderConfig {
	/** Unique provider identifier */
	id: StreamingProviderId;

	/** Human-readable provider name */
	name: string;

	/** Priority order (lower = higher priority) */
	priority: number;

	/** Whether this provider is enabled by default */
	enabledByDefault: boolean;

	/** Content type support flags */
	supportsMovies: boolean;
	supportsTv: boolean;
	supportsAnime: boolean;
	supportsAsianDrama: boolean;

	/** Whether streams require the HLS proxy */
	requiresProxy: boolean;

	/** Referer header to use for stream requests */
	referer: string;

	/** Request timeout in milliseconds */
	timeout: number;

	/** Optional detailed capabilities */
	capabilities?: ProviderCapabilities;

	/** Optional retry configuration (uses defaults if not specified) */
	retry?: RetryConfig;

	/** Optional timeout configuration (uses defaults if not specified) */
	timeouts?: TimeoutConfig;
}

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * A server/source within a provider (e.g., Videasy has 15 servers)
 */
export interface ServerConfig {
	/** Server identifier */
	id: string;

	/** Display name */
	name: string;

	/** Content language */
	language: string;

	/** Whether this server only supports movies */
	movieOnly?: boolean;

	/** Whether this server only supports TV shows */
	tvOnly?: boolean;

	/** Whether this server is enabled */
	enabled?: boolean;
}

// ============================================================================
// Search Parameters
// ============================================================================

/**
 * Parameters for searching/extracting streams
 */
export interface SearchParams {
	/** TMDB ID (required) */
	tmdbId: string;

	/** Media type */
	type: MediaType;

	/** IMDB ID (optional, some providers use it) */
	imdbId?: string;

	/** Content title (optional, some providers use it) */
	title?: string;

	/** Release year (optional) */
	year?: number;

	/** Season number for TV shows */
	season?: number;

	/** Episode number for TV shows */
	episode?: number;

	/** Alternative titles for content lookup (e.g., different language titles) */
	alternativeTitles?: string[];

	/** MyAnimeList ID (for anime - enables direct lookup) */
	malId?: number;

	/** AniList ID (for anime - enables direct lookup) */
	anilistId?: number;

	/** Ordered list of preferred language codes (ISO 639-1) for stream selection */
	preferredLanguages?: string[];
}

// ============================================================================
// Provider Results
// ============================================================================

/**
 * Result from a provider extraction attempt
 */
export interface ProviderResult {
	/** Whether extraction was successful */
	success: boolean;

	/** Extracted streams (empty if failed) */
	streams: StreamResult[];

	/** Provider that produced this result */
	provider: StreamingProviderId;

	/** Error message if failed */
	error?: string;

	/** Duration of extraction in milliseconds */
	durationMs?: number;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Interface that all providers must implement
 */
export interface IStreamProvider {
	/** Provider configuration */
	readonly config: ProviderConfig;

	/**
	 * Extract streams for the given content
	 * @param params Search parameters
	 * @returns Provider result with streams or error
	 */
	extract(params: SearchParams): Promise<ProviderResult>;

	/**
	 * Check if this provider can handle the given content
	 * @param params Search parameters
	 * @returns true if provider supports this content type
	 */
	canHandle(params: SearchParams): boolean;
}

// ============================================================================
// Re-exports
// ============================================================================

export type { StreamResult };
