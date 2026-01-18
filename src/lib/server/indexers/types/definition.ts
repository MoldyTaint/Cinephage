/**
 * Indexer Definition Types
 *
 * Defines the structure of indexer definitions (both native TypeScript and YAML-based).
 * This is the "blueprint" for an indexer before it's configured by the user.
 */

import type { IndexerProtocol } from './protocol';
import type { IndexerAccessType } from './accessType';
import type { AuthMethod, DefinitionAuthConfig } from './auth';

// =============================================================================
// SETTING FIELD TYPES
// =============================================================================

/**
 * Types of setting fields that can be rendered in the UI
 */
export type SettingFieldType =
	| 'text' // Single-line text input
	| 'password' // Password/secret input (masked)
	| 'checkbox' // Boolean toggle
	| 'select' // Dropdown select
	| 'number' // Numeric input
	| 'info' // Informational text (not editable)
	| 'info_cookie' // Cookie help text
	| 'info_cloudflare' // Cloudflare warning
	| 'info_useragent' // User agent info
	| 'cardigannCaptcha' // CAPTCHA handling
	// Dynamic category info types (from YAML definitions)
	| `info_category_${number}`; // Category-specific info

/**
 * A setting field definition for indexer configuration
 */
export interface SettingField {
	/** Field name (used as key in settings object) */
	name: string;
	/** Display label */
	label: string;
	/** Field type */
	type: SettingFieldType;
	/** Whether this field is required */
	required?: boolean;
	/** Default value */
	default?: string;
	/** Placeholder text */
	placeholder?: string;
	/** Help text shown below the field */
	helpText?: string;
	/** Options for select fields */
	options?: Record<string, string>;
	/** Validation rules */
	validation?: {
		min?: number;
		max?: number;
		pattern?: string;
		message?: string;
	};
}

// =============================================================================
// CAPABILITIES
// =============================================================================

/**
 * Search parameters that an indexer can support
 */
export type SearchParam =
	| 'q' // Text query
	| 'imdbId' // IMDB ID (tt1234567)
	| 'tmdbId' // TMDB ID (number)
	| 'tvdbId' // TVDB ID (number)
	| 'tvMazeId' // TVMaze ID
	| 'traktId' // Trakt ID
	| 'season' // Season number
	| 'ep' // Episode number
	| 'year' // Release year
	| 'genre' // Genre filter
	| 'artist' // Music artist
	| 'album' // Music album
	| 'author' // Book author
	| 'title'; // Book/Album title

/**
 * Search mode capability
 */
export interface SearchMode {
	/** Whether this search mode is available */
	available: boolean;
	/** Parameters supported by this mode */
	supportedParams: SearchParam[];
	/** Optional: specific search path for this mode */
	searchPath?: string;
}

/**
 * Episode format types for search.
 * Matches SearchFormatProvider.EpisodeFormatType.
 */
export type EpisodeFormatType = 'standard' | 'european' | 'compact' | 'daily' | 'absolute';

/**
 * Movie format types for search.
 * Matches SearchFormatProvider.MovieFormatType.
 */
export type MovieFormatType = 'standard' | 'yearOnly' | 'noYear';

/**
 * Search format configuration for an indexer.
 * Specifies which format types the indexer prefers/supports.
 */
export interface SearchFormats {
	/** Episode format preferences, in order of preference */
	episode?: EpisodeFormatType[];
	/** Movie format preferences */
	movie?: MovieFormatType[];
}

/**
 * Indexer capabilities declaration
 */
export interface IndexerCapabilities {
	/** Basic text search */
	search: SearchMode;
	/** Movie-specific search */
	movieSearch?: SearchMode;
	/** TV-specific search */
	tvSearch?: SearchMode;
	/** Music search */
	musicSearch?: SearchMode;
	/** Book search */
	bookSearch?: SearchMode;

	/** Categories this indexer provides (id -> name) */
	categories: Map<number, string>;

	/** Whether the indexer supports pagination */
	supportsPagination: boolean;

	/** Whether the indexer returns info hash */
	supportsInfoHash: boolean;

	/** Maximum results per request */
	limitMax: number;

	/** Default result limit */
	limitDefault: number;

	/**
	 * Search format preferences for this indexer.
	 * Specifies which episode/movie formats the indexer expects.
	 * If not specified, defaults are used (standard format only).
	 */
	searchFormats?: SearchFormats;
}

// =============================================================================
// DEFINITION TYPES
// =============================================================================

/**
 * Source type for the indexer definition
 */
export type DefinitionSource = 'native' | 'yaml';

/**
 * Base indexer definition (common fields)
 */
export interface BaseIndexerDefinition {
	/** Unique definition ID (e.g., 'yts', 'iptorrents') */
	id: string;
	/** Display name */
	name: string;
	/** Description */
	description: string;
	/** Protocol type */
	protocol: IndexerProtocol;
	/** Access/privacy type */
	accessType: IndexerAccessType;
	/** Primary authentication method (simplified) */
	authMethod: AuthMethod;
	/** Full authentication configuration (for definitions) */
	auth?: DefinitionAuthConfig;
	/** Primary site URL */
	siteUrl: string;
	/** Alternate/mirror URLs (legacy name) */
	alternateUrls: string[];
	/** All available URLs (new unified name) */
	urls?: string[];
	/** Language code (e.g., 'en-US') */
	language: string;
	/** Indexer capabilities */
	capabilities: IndexerCapabilities;
	/** Settings fields for configuration */
	settings: SettingField[];
	/** Whether this definition is internal (auto-managed) */
	internal?: boolean;
	/** Tags for filtering/categorization */
	tags?: string[];
}

/**
 * Native TypeScript indexer definition
 */
export interface NativeIndexerDefinition extends BaseIndexerDefinition {
	/** Definition source */
	source: 'native';
	/** Factory function to create indexer instance */
	// factory is handled separately in the registry
}

/**
 * YAML-based indexer definition (Cardigann-compatible)
 */
export interface YamlIndexerDefinition extends BaseIndexerDefinition {
	/** Definition source */
	source: 'yaml';
	/** Path to the YAML file */
	filePath: string;
	/** Encoding used by the site */
	encoding?: string;
	/** Request delay in seconds */
	requestDelay?: number;
	/** Login configuration from YAML */
	login?: YamlLoginConfig;
	/** Search configuration from YAML */
	search?: YamlSearchConfig;
}

/**
 * Union of all definition types
 */
export type IndexerDefinition = NativeIndexerDefinition | YamlIndexerDefinition;

// =============================================================================
// YAML-SPECIFIC TYPES
// =============================================================================

/**
 * Login configuration from YAML definition
 */
export interface YamlLoginConfig {
	/** Login method */
	method: string;
	/** Login path */
	path?: string;
	/** Form inputs */
	inputs?: Record<string, string>;
	/** Cookies to set */
	cookies?: string[];
	/** Test selector to verify login */
	test?: {
		selector?: string;
		path?: string;
	};
	/** CAPTCHA configuration */
	captcha?: {
		type?: string;
		selector?: string;
	};
}

/**
 * Search configuration from YAML definition
 */
export interface YamlSearchConfig {
	/** Search paths */
	paths: YamlSearchPath[];
	/** Response type */
	responseType?: 'html' | 'json' | 'xml';
	/** Row selector for parsing results */
	rowSelector?: string;
	/** Field selectors */
	fields?: Record<string, YamlFieldSelector>;
}

/**
 * Search path from YAML definition
 */
export interface YamlSearchPath {
	/** URL path */
	path: string;
	/** HTTP method */
	method?: 'get' | 'post';
	/** Input parameters */
	inputs?: Record<string, string>;
	/** Categories this path applies to */
	categories?: string[];
}

/**
 * Field selector from YAML definition
 */
export interface YamlFieldSelector {
	/** CSS/XPath selector */
	selector?: string;
	/** Attribute to extract */
	attribute?: string;
	/** Filters to apply */
	filters?: string[];
	/** Whether field is optional */
	optional?: boolean;
	/** Default value if not found */
	default?: string;
}

// =============================================================================
// DEFINITION UTILITIES
// =============================================================================

/**
 * Check if a definition is native TypeScript
 */
export function isNativeDefinition(
	definition: IndexerDefinition
): definition is NativeIndexerDefinition {
	return definition.source === 'native';
}

/**
 * Check if a definition is YAML-based
 */
export function isYamlDefinition(
	definition: IndexerDefinition
): definition is YamlIndexerDefinition {
	return definition.source === 'yaml';
}

/**
 * Get UI hints for a definition
 */
export interface DefinitionUIHints {
	/** Whether authentication is required */
	requiresAuth: boolean;
	/** Whether to show torrent-specific settings */
	showTorrentSettings: boolean;
	/** Whether to show usenet-specific settings */
	showUsenetSettings: boolean;
	/** Whether this is a streaming indexer */
	isStreaming: boolean;
}

/**
 * Compute UI hints for a definition
 */
export function computeDefinitionUIHints(definition: BaseIndexerDefinition): DefinitionUIHints {
	const hasAuthSettings = definition.settings.some(
		(s) =>
			s.type === 'password' || s.name === 'cookie' || s.name === 'apikey' || s.name === 'username'
	);

	return {
		requiresAuth: definition.authMethod !== 'none' && hasAuthSettings,
		showTorrentSettings: definition.protocol === 'torrent',
		showUsenetSettings: definition.protocol === 'usenet',
		isStreaming: definition.protocol === 'streaming'
	};
}

/**
 * Create default capabilities
 */
export function createDefaultCapabilities(): IndexerCapabilities {
	return {
		search: {
			available: true,
			supportedParams: ['q']
		},
		categories: new Map(),
		supportsPagination: false,
		supportsInfoHash: true,
		limitMax: 100,
		limitDefault: 100
	};
}

// =============================================================================
// CAPABILITY UTILITIES
// =============================================================================

import type { SearchType } from './search';

/**
 * Get the search mode for a given search type
 */
export function getSearchMode(
	capabilities: IndexerCapabilities,
	searchType: SearchType
): SearchMode | undefined {
	switch (searchType) {
		case 'basic':
			return capabilities.search;
		case 'movie':
			return capabilities.movieSearch;
		case 'tv':
			return capabilities.tvSearch;
		case 'music':
			return capabilities.musicSearch;
		case 'book':
			return capabilities.bookSearch;
	}
}

/**
 * Check if indexer supports a search param for a given search type
 */
export function supportsParam(
	capabilities: IndexerCapabilities,
	searchType: SearchType,
	param: SearchParam
): boolean {
	const mode = getSearchMode(capabilities, searchType);
	return mode?.available === true && mode.supportedParams.includes(param);
}

/**
 * Check if indexer supports ID-based search for movies
 */
export function supportsMovieIdSearch(capabilities: IndexerCapabilities): boolean {
	return (
		supportsParam(capabilities, 'movie', 'imdbId') || supportsParam(capabilities, 'movie', 'tmdbId')
	);
}

/**
 * Check if indexer supports ID-based search for TV
 */
export function supportsTvIdSearch(capabilities: IndexerCapabilities): boolean {
	return (
		supportsParam(capabilities, 'tv', 'imdbId') ||
		supportsParam(capabilities, 'tv', 'tmdbId') ||
		supportsParam(capabilities, 'tv', 'tvdbId')
	);
}

/**
 * Check if indexer can handle a specific search type
 */
export function canHandleSearchType(
	capabilities: IndexerCapabilities,
	searchType: SearchType
): boolean {
	const mode = getSearchMode(capabilities, searchType);
	return mode?.available === true;
}
