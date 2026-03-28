import { z } from 'zod';
import { PROVIDER_IMPLEMENTATIONS } from '$lib/server/subtitles/types';

/**
 * Validation schemas for API inputs and database rows.
 * Use these with z.safeParse() for runtime validation.
 */

// ============================================================
// Indexer Schemas
// ============================================================

/**
 * Valid indexer protocols.
 */
export const indexerProtocolSchema = z.enum(['torrent', 'usenet', 'streaming']);

/**
 * Schema for creating a new indexer.
 * YAML-only architecture: all indexers are defined by YAML definitions.
 */
export const indexerCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	/** YAML definition ID (e.g., 'knaben', 'anidex', 'torrentday') */
	definitionId: z.string().regex(/^[a-z0-9-]+$/, 'Must be a valid definition ID'),
	baseUrl: z.string().url('Must be a valid URL'),
	/** Alternative/fallback URLs */
	alternateUrls: z.array(z.string().url('Must be a valid URL')).default([]),
	enabled: z.boolean().default(true),
	priority: z.number().int().min(1).max(100).default(25),
	/** User-provided settings for YAML indexers (apiKey, cookie, passkey, etc.) */
	settings: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
		.optional()
		.nullable(),

	// Search capability toggles
	enableAutomaticSearch: z.boolean().default(true),
	enableInteractiveSearch: z.boolean().default(true),

	// Torrent seeding settings (stored in protocolSettings JSON)
	minimumSeeders: z.number().int().min(0).default(1),
	seedRatio: z
		.string()
		.regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal number (e.g., "1.0", "2.5")')
		.optional()
		.nullable(), // Decimal as string (e.g., "1.0")
	seedTime: z.number().int().min(0).optional().nullable(), // Minutes
	packSeedTime: z.number().int().min(0).optional().nullable(), // Minutes
	rejectDeadTorrents: z.boolean().default(true) // Reject torrents with 0 seeders
});

/**
 * Schema for updating an existing indexer.
 */
export const indexerUpdateSchema = indexerCreateSchema.partial();

/**
 * Schema for testing an indexer connection.
 */
export const indexerTestSchema = z.object({
	indexerId: z.string().uuid().optional(),
	name: z.string().min(1),
	definitionId: z.string().regex(/^[a-z0-9-]+$/),
	baseUrl: z.string().url(),
	alternateUrls: z.array(z.string().url()).default([]),
	settings: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
		.optional()
		.nullable()
});

// ============================================================
// Search Schemas
// ============================================================

/**
 * Valid search types.
 */
export const searchTypeSchema = z.enum(['basic', 'movie', 'tv', 'music', 'book']);

/**
 * Base search criteria fields.
 */
const baseSearchCriteriaSchema = z.object({
	query: z.string().optional(),
	categories: z.array(z.number().int()).optional(),
	indexerIds: z.array(z.string()).optional(),
	limit: z.number().int().min(1).optional(),
	offset: z.number().int().min(0).default(0)
});

/**
 * Schema for basic text search.
 */
export const basicSearchCriteriaSchema = baseSearchCriteriaSchema.extend({
	searchType: z.literal('basic'),
	query: z.string().min(1, 'Query is required for basic search')
});

/**
 * Schema for movie search with optional IDs.
 */
export const movieSearchCriteriaSchema = baseSearchCriteriaSchema.extend({
	searchType: z.literal('movie'),
	imdbId: z
		.string()
		.regex(/^tt\d{7,8}$/, 'Invalid IMDB ID format')
		.optional(),
	tmdbId: z.number().int().positive().optional(),
	year: z.number().int().min(1888).max(2100).optional()
});

/**
 * Schema for TV search with optional IDs.
 */
export const tvSearchCriteriaSchema = baseSearchCriteriaSchema.extend({
	searchType: z.literal('tv'),
	imdbId: z
		.string()
		.regex(/^tt\d{7,8}$/, 'Invalid IMDB ID format')
		.optional(),
	tmdbId: z.number().int().positive().optional(),
	tvdbId: z.number().int().positive().optional(),
	season: z.number().int().min(0).optional(),
	episode: z.number().int().min(0).optional()
});

/**
 * Schema for music search.
 */
export const musicSearchCriteriaSchema = baseSearchCriteriaSchema.extend({
	searchType: z.literal('music'),
	artist: z.string().optional(),
	album: z.string().optional(),
	label: z.string().optional(),
	year: z.number().int().min(1900).max(2100).optional()
});

/**
 * Schema for book search.
 */
export const bookSearchCriteriaSchema = baseSearchCriteriaSchema.extend({
	searchType: z.literal('book'),
	author: z.string().optional(),
	title: z.string().optional()
});

/**
 * Union schema for all search criteria types.
 */
export const searchCriteriaSchema = z.discriminatedUnion('searchType', [
	basicSearchCriteriaSchema,
	movieSearchCriteriaSchema,
	tvSearchCriteriaSchema,
	musicSearchCriteriaSchema,
	bookSearchCriteriaSchema
]);

/**
 * Schema for search options (legacy - maps to SearchCriteria).
 */
export const searchOptionsSchema = z.object({
	query: z.string().min(1, 'Query is required'),
	categories: z.array(z.number().int()).optional(),
	indexerIds: z.array(z.string()).optional(),
	minSeeders: z.number().int().min(0).optional(),
	maxResults: z.number().int().min(1).max(500).default(100),
	contentType: z.enum(['movie', 'tv', 'all']).default('all'),
	useCache: z.boolean().default(true)
});

/**
 * Schema for enrichment options (quality filtering and TMDB matching).
 */
export const enrichmentOptionsSchema = z.object({
	/** Scoring profile ID for quality scoring */
	scoringProfileId: z.string().optional(),
	/** Whether to match releases to TMDB entries */
	matchToTmdb: z.boolean().default(false),
	/** Whether to filter out rejected releases */
	filterRejected: z.boolean().default(false),
	/** Minimum score to include (0-1000) */
	minScore: z.number().int().min(0).max(1000).optional()
});

/**
 * Schema for search query parameters (GET request).
 */
export const searchQuerySchema = z.object({
	q: z.string().optional(),
	searchType: searchTypeSchema.default('basic'),
	searchMode: z.enum(['all', 'multiSeasonPack']).optional(),
	categories: z
		.string()
		.optional()
		.transform((v) => v?.split(',').map(Number)),
	indexers: z
		.string()
		.optional()
		.transform((v) => v?.split(',')),
	minSeeders: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().min(1).optional(),
	// Movie/TV specific
	imdbId: z.string().optional(),
	tmdbId: z.coerce.number().int().positive().optional(),
	tvdbId: z.coerce.number().int().positive().optional(),
	year: z.coerce.number().int().min(1888).max(2100).optional(),
	season: z.coerce.number().int().min(0).optional(),
	episode: z.coerce.number().int().min(0).optional(),
	// Enrichment options
	enrich: z
		.string()
		.optional()
		.transform((v) => v === 'true' || v === '1'),
	scoringProfileId: z.string().optional(),
	matchToTmdb: z
		.string()
		.optional()
		.transform((v) => v === 'true' || v === '1'),
	filterRejected: z
		.string()
		.optional()
		.transform((v) => v === 'true' || v === '1'),
	minScore: z.coerce.number().int().min(0).max(1000).optional()
});

// ============================================================
// TMDB Schemas
// ============================================================

/**
 * Schema for TMDB API key validation.
 * TMDB API keys are 32-character hexadecimal strings.
 */
export const tmdbApiKeySchema = z
	.string()
	.min(32, 'TMDB API key must be at least 32 characters')
	.max(64, 'TMDB API key must be at most 64 characters')
	.regex(/^[a-f0-9]+$/i, 'TMDB API key must be hexadecimal');

/**
 * Schema for global TMDB filters.
 */
export const globalTmdbFiltersSchema = z.object({
	include_adult: z.boolean().default(false),
	min_vote_average: z.number().min(0).max(10).default(0),
	min_vote_count: z.number().int().min(0).default(0),
	language: z.string().default('en-US'),
	region: z.string().default('US'),
	excluded_genre_ids: z.array(z.number().int()).default([])
});

// ============================================================
// Discover API Schemas
// ============================================================

/**
 * Schema for discover query parameters.
 */
export const discoverQuerySchema = z.object({
	type: z.enum(['movie', 'tv', 'all']).default('all'),
	page: z.coerce.number().int().min(1).default(1),
	with_genres: z.string().optional(),
	with_watch_providers: z.string().optional(),
	sort_by: z.string().optional(),
	'primary_release_date.gte': z.string().optional(),
	'primary_release_date.lte': z.string().optional(),
	'first_air_date.gte': z.string().optional(),
	'first_air_date.lte': z.string().optional(),
	'vote_average.gte': z.coerce.number().min(0).max(10).optional(),
	'vote_average.lte': z.coerce.number().min(0).max(10).optional()
});

// ============================================================
// Database Row Schemas (for parsing DB results)
// ============================================================

/**
 * Schema for parsing indexer rows from database.
 */
export const indexerRowSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	implementation: z.string(),
	enabled: z
		.boolean()
		.nullable()
		.transform((v) => v ?? true),
	url: z.string(),
	apiKey: z.string().nullable(),
	priority: z
		.number()
		.nullable()
		.transform((v) => v ?? 25),
	protocol: z.string().transform((v) => {
		if (v === 'torrent' || v === 'usenet') return v;
		return 'torrent' as const;
	}),
	config: z.unknown().transform((v) => (v as Record<string, unknown>) ?? null),
	settings: z.unknown().transform((v) => (v as Record<string, string>) ?? null)
});

// ============================================================
// Type Exports
// ============================================================

export type IndexerCreate = z.infer<typeof indexerCreateSchema>;
export type IndexerUpdate = z.infer<typeof indexerUpdateSchema>;
export type IndexerTest = z.infer<typeof indexerTestSchema>;
export type SearchOptions = z.infer<typeof searchOptionsSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type EnrichmentOptions = z.infer<typeof enrichmentOptionsSchema>;
export type DiscoverQuery = z.infer<typeof discoverQuerySchema>;
export type GlobalTmdbFilters = z.infer<typeof globalTmdbFiltersSchema>;

// New typed search criteria
export type SearchType = z.infer<typeof searchTypeSchema>;
export type BasicSearchCriteria = z.infer<typeof basicSearchCriteriaSchema>;
export type MovieSearchCriteria = z.infer<typeof movieSearchCriteriaSchema>;
export type TvSearchCriteria = z.infer<typeof tvSearchCriteriaSchema>;
export type MusicSearchCriteria = z.infer<typeof musicSearchCriteriaSchema>;
export type BookSearchCriteria = z.infer<typeof bookSearchCriteriaSchema>;
export type SearchCriteria = z.infer<typeof searchCriteriaSchema>;

// ============================================================
// Download Client Schemas
// ============================================================

/**
 * Valid download client implementations.
 */
export const downloadClientImplementationSchema = z.enum([
	'qbittorrent',
	'transmission',
	'deluge',
	'rtorrent',
	'aria2',
	'nzbget',
	'sabnzbd'
]);

/**
 * Priority levels for downloads.
 */
export const downloadPrioritySchema = z.enum(['normal', 'high', 'force']);

/**
 * Initial state options for added downloads.
 */
export const downloadInitialStateSchema = z.enum(['start', 'pause', 'force']);

/**
 * Schema for creating a new download client.
 */
export const downloadClientCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	implementation: downloadClientImplementationSchema,
	enabled: z.boolean().default(true),

	// Connection settings
	host: z.string().min(1, 'Host is required'),
	port: z.number().int().min(1, 'Port must be at least 1').max(65535, 'Port must be at most 65535'),
	useSsl: z.boolean().default(false),
	urlBase: z.string().max(200).optional().nullable(),
	mountMode: z.enum(['nzbdav', 'altmount']).optional().nullable(),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable(),

	// Category settings
	movieCategory: z.string().min(1).default('movies'),
	tvCategory: z.string().min(1).default('tv'),

	// Priority settings
	recentPriority: downloadPrioritySchema.default('normal'),
	olderPriority: downloadPrioritySchema.default('normal'),
	initialState: downloadInitialStateSchema.default('start'),

	// Seeding limits
	seedRatioLimit: z
		.string()
		.regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal number (e.g., "1.0", "2.5")')
		.optional()
		.nullable(),
	seedTimeLimit: z.number().int().min(0).optional().nullable(),

	// Path mapping
	downloadPathLocal: z.string().optional().nullable(),
	downloadPathRemote: z.string().optional().nullable(),
	tempPathLocal: z.string().optional().nullable(),
	tempPathRemote: z.string().optional().nullable(),

	priority: z.number().int().min(1).max(100).default(1)
});

/**
 * Schema for updating an existing download client.
 */
export const downloadClientUpdateSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(100, 'Name must be 100 characters or less')
		.optional(),
	implementation: downloadClientImplementationSchema.optional(),
	enabled: z.boolean().optional(),

	// Connection settings
	host: z.string().min(1, 'Host is required').optional(),
	port: z
		.number()
		.int()
		.min(1, 'Port must be at least 1')
		.max(65535, 'Port must be at most 65535')
		.optional(),
	useSsl: z.boolean().optional(),
	urlBase: z.string().max(200).optional().nullable(),
	mountMode: z.enum(['nzbdav', 'altmount']).optional().nullable(),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable(),

	// Category settings
	movieCategory: z.string().min(1).optional(),
	tvCategory: z.string().min(1).optional(),

	// Priority settings
	recentPriority: downloadPrioritySchema.optional(),
	olderPriority: downloadPrioritySchema.optional(),
	initialState: downloadInitialStateSchema.optional(),

	// Seeding limits
	seedRatioLimit: z
		.string()
		.regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal number (e.g., "1.0", "2.5")')
		.optional()
		.nullable(),
	seedTimeLimit: z.number().int().min(0).optional().nullable(),

	// Path mapping
	downloadPathLocal: z.string().optional().nullable(),
	downloadPathRemote: z.string().optional().nullable(),
	tempPathLocal: z.string().optional().nullable(),
	tempPathRemote: z.string().optional().nullable(),

	priority: z.number().int().min(1).max(100).optional()
});

/**
 * Schema for testing download client connection.
 */
export const downloadClientTestSchema = z.object({
	implementation: downloadClientImplementationSchema,
	host: z.string().min(1, 'Host is required'),
	port: z.number().int().min(1).max(65535),
	useSsl: z.boolean().default(false),
	urlBase: z.string().max(200).optional().nullable(),
	mountMode: z.enum(['nzbdav', 'altmount']).optional().nullable(),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable()
});

// ============================================================
// Root Folder Schemas
// ============================================================

/**
 * Media type for root folders.
 */
export const rootFolderMediaTypeSchema = z.enum(['movie', 'tv']);
export const rootFolderMediaSubTypeSchema = z.enum(['standard', 'anime']);

/**
 * Schema for creating a root folder.
 */
export const rootFolderCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	path: z.string().min(1, 'Path is required'),
	mediaType: rootFolderMediaTypeSchema,
	mediaSubType: rootFolderMediaSubTypeSchema.default('standard'),
	isDefault: z.boolean().default(false),
	readOnly: z.boolean().default(false),
	preserveSymlinks: z.boolean().default(false),
	defaultMonitored: z.boolean().default(true)
});

/**
 * Schema for updating a root folder.
 */
export const rootFolderUpdateSchema = rootFolderCreateSchema.partial();

// Download Client Type Exports
export type DownloadClientImplementation = z.infer<typeof downloadClientImplementationSchema>;
export type DownloadPriority = z.infer<typeof downloadPrioritySchema>;
export type DownloadInitialState = z.infer<typeof downloadInitialStateSchema>;
export type DownloadClientCreate = z.infer<typeof downloadClientCreateSchema>;
export type DownloadClientUpdate = z.infer<typeof downloadClientUpdateSchema>;
export type DownloadClientTest = z.infer<typeof downloadClientTestSchema>;

// Root Folder Type Exports
export type RootFolderMediaType = z.infer<typeof rootFolderMediaTypeSchema>;
export type RootFolderMediaSubType = z.infer<typeof rootFolderMediaSubTypeSchema>;
export type RootFolderCreate = z.infer<typeof rootFolderCreateSchema>;
export type RootFolderUpdate = z.infer<typeof rootFolderUpdateSchema>;

// ============================================================
// Subtitle Provider Schemas
// ============================================================

/**
 * Valid subtitle provider implementations.
 * Uses the single source of truth from types.ts
 */
export const subtitleProviderImplementationSchema = z.enum(PROVIDER_IMPLEMENTATIONS);

/**
 * Schema for creating a subtitle provider.
 */
export const subtitleProviderCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	implementation: subtitleProviderImplementationSchema,
	enabled: z.boolean().default(true),
	priority: z.number().int().min(1).max(100).default(25),
	apiKey: z.string().optional().nullable(),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable(),
	settings: z.record(z.string(), z.unknown()).optional().nullable(),
	requestsPerMinute: z.number().int().min(1).max(1000).default(60)
});

/**
 * Schema for updating a subtitle provider.
 */
export const subtitleProviderUpdateSchema = subtitleProviderCreateSchema.partial();

/**
 * Schema for testing a subtitle provider.
 */
export const subtitleProviderTestSchema = z.object({
	implementation: subtitleProviderImplementationSchema,
	apiKey: z.string().optional().nullable(),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable(),
	settings: z.record(z.string(), z.unknown()).optional().nullable()
});

// ============================================================
// Language Profile Schemas
// ============================================================

import { isValidLanguageCode } from '$lib/shared/languages';
import { CAPTURED_LOG_LEVELS, CAPTURED_LOG_DOMAINS } from '$lib/logging/log-capture';

/**
 * Schema for language preference in a profile.
 * Validates language codes against the centralized SUPPORTED_LANGUAGES list.
 */
export const languagePreferenceSchema = z.object({
	code: z
		.string()
		.min(2)
		.max(10)
		.refine((code) => isValidLanguageCode(code), {
			message: 'Invalid language code. Please use a valid ISO 639-1 code (e.g., en, es, pt-br)'
		}),
	forced: z.boolean().default(false),
	hearingImpaired: z.boolean().default(false),
	excludeHi: z.boolean().default(false),
	isCutoff: z.boolean().default(false)
});

/**
 * Schema for validating a language code
 */
export const languageCodeSchema = z
	.string()
	.min(2)
	.max(10)
	.refine((code) => isValidLanguageCode(code), {
		message: 'Invalid language code'
	});

/**
 * Schema for creating a language profile.
 */
export const languageProfileCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	languages: z.array(languagePreferenceSchema).min(1, 'At least one language is required'),
	cutoffIndex: z.number().int().min(0).default(0),
	upgradesAllowed: z.boolean().default(true),
	minimumScore: z.number().int().min(0).max(360).default(60),
	isDefault: z.boolean().default(false)
});

/**
 * Schema for updating a language profile.
 */
export const languageProfileUpdateSchema = languageProfileCreateSchema.partial();

// ============================================================
// Subtitle Search Schemas
// ============================================================

/**
 * Schema for subtitle search request.
 */
export const subtitleSearchSchema = z.object({
	// Media identification
	movieId: z.string().uuid().optional(),
	episodeId: z.string().uuid().optional(),
	// Manual search parameters
	title: z.string().optional(),
	year: z.number().int().min(1888).max(2100).optional(),
	imdbId: z
		.string()
		.regex(/^tt\d{7,8}$/, 'Invalid IMDB ID format')
		.optional(),
	tmdbId: z.number().int().positive().optional(),
	// For episodes
	seriesTitle: z.string().optional(),
	season: z.number().int().min(0).optional(),
	episode: z.number().int().min(0).optional(),
	// Language preferences - validate against supported languages
	languages: z.array(languageCodeSchema).optional(),
	// Filters
	includeForced: z.boolean().default(true),
	includeHearingImpaired: z.boolean().default(true),
	excludeHearingImpaired: z.boolean().default(false),
	// Provider selection
	providerIds: z.array(z.string().uuid()).optional()
});

/**
 * Schema for subtitle download request.
 */
export const subtitleDownloadSchema = z.object({
	providerId: z.string().uuid(),
	providerSubtitleId: z.string().min(1),
	movieId: z.string().uuid().optional(),
	episodeId: z.string().uuid().optional(),
	language: languageCodeSchema,
	isForced: z.boolean().default(false),
	isHearingImpaired: z.boolean().default(false)
});

/**
 * Schema for subtitle sync request (alass).
 */
export const subtitleSyncSchema = z.object({
	subtitleId: z.string().uuid(),
	referenceType: z.enum(['video', 'subtitle']).default('video'),
	referencePath: z
		.string()
		.refine((s) => !s.includes('\0'), { message: 'Path must not contain null bytes' })
		.optional(),
	splitPenalty: z.number().int().min(0).max(1000).default(7),
	noSplits: z.boolean().default(false)
});

/**
 * Schema for bulk subtitle sync request.
 * Syncs multiple subtitles with shared settings.
 */
export const subtitleBulkSyncSchema = z.object({
	subtitleIds: z.array(z.string().uuid()).min(1).max(500),
	splitPenalty: z.number().int().min(0).max(1000).default(7),
	noSplits: z.boolean().default(false)
});

/**
 * Schema for deleting a subtitle file.
 */
export const subtitleDeleteSchema = z.object({
	addToBlacklist: z.boolean().default(false),
	reason: z.enum(['wrong_content', 'out_of_sync', 'poor_quality', 'manual']).optional()
});

/**
 * Schema for blacklisting a subtitle.
 */
export const subtitleBlacklistSchema = z.object({
	subtitleId: z.string().uuid().optional(),
	providerId: z.string().uuid(),
	providerSubtitleId: z.string().min(1),
	movieId: z.string().uuid().optional(),
	episodeId: z.string().uuid().optional(),
	reason: z.enum(['wrong_content', 'out_of_sync', 'poor_quality', 'manual']).default('manual')
});

// ============================================================
// Subtitle Settings Schemas
// ============================================================

/**
 * Schema for updating subtitle settings.
 *
 * NOTE: Scheduling-related settings (searchOnImport, searchTrigger, intervals)
 * have been consolidated into MonitoringScheduler settings.
 */
export const subtitleSettingsUpdateSchema = z.object({
	defaultLanguageProfileId: z.string().uuid().nullable().optional(),
	defaultFallbackLanguage: z.string().min(2).max(5).optional()
});

// Subtitle Type Exports
export type SubtitleProviderImplementation = z.infer<typeof subtitleProviderImplementationSchema>;
export type SubtitleProviderCreate = z.infer<typeof subtitleProviderCreateSchema>;
export type SubtitleProviderUpdate = z.infer<typeof subtitleProviderUpdateSchema>;
export type SubtitleProviderTest = z.infer<typeof subtitleProviderTestSchema>;
export type LanguagePreference = z.infer<typeof languagePreferenceSchema>;
export type LanguageProfileCreate = z.infer<typeof languageProfileCreateSchema>;
export type LanguageProfileUpdate = z.infer<typeof languageProfileUpdateSchema>;
export type SubtitleSearchRequest = z.infer<typeof subtitleSearchSchema>;
export type SubtitleDownloadRequest = z.infer<typeof subtitleDownloadSchema>;
export type SubtitleSyncRequest = z.infer<typeof subtitleSyncSchema>;
export type SubtitleBlacklistRequest = z.infer<typeof subtitleBlacklistSchema>;
export type SubtitleSettingsUpdate = z.infer<typeof subtitleSettingsUpdateSchema>;

// ============================================================
// Naming Settings Schemas
// ============================================================

/**
 * Multi-episode style options for naming.
 */
export const multiEpisodeStyleSchema = z.enum(['extend', 'duplicate', 'repeat', 'scene', 'range']);

/**
 * Colon replacement options for naming.
 */
export const colonReplacementSchema = z.enum([
	'delete',
	'dash',
	'spaceDash',
	'spaceDashSpace',
	'smart'
]);

/**
 * Media server ID format options.
 * - plex: {tmdb-12345} or {tvdb-12345}
 * - jellyfin: [tmdbid-12345] or [tvdbid-12345]
 */
export const mediaServerIdFormatSchema = z.enum(['plex', 'jellyfin']);

/**
 * Schema for updating naming settings.
 * All fields are optional - only provided fields will be updated.
 */
export const namingConfigUpdateSchema = z.object({
	// Movie formats
	movieFolderFormat: z.string().min(1).max(500).optional(),
	movieFileFormat: z.string().min(1).max(500).optional(),

	// TV formats
	seriesFolderFormat: z.string().min(1).max(500).optional(),
	seasonFolderFormat: z.string().min(1).max(200).optional(),
	episodeFileFormat: z.string().min(1).max(500).optional(),
	dailyEpisodeFormat: z.string().min(1).max(500).optional(),
	animeEpisodeFormat: z.string().min(1).max(500).optional(),
	multiEpisodeStyle: multiEpisodeStyleSchema.optional(),

	// Options
	replaceSpacesWith: z.string().max(10).optional(),
	colonReplacement: colonReplacementSchema.optional(),
	mediaServerIdFormat: mediaServerIdFormatSchema.optional(),
	includeQuality: z.boolean().optional(),
	includeMediaInfo: z.boolean().optional(),
	includeReleaseGroup: z.boolean().optional()
});

export const namingPresetSelectionSchema = z.object({
	selectedServerPresetId: z.string().min(1),
	selectedStylePresetId: z.string().min(1),
	selectedDetailPresetId: z.string().min(1),
	selectedCustomPresetId: z.string().min(1).optional()
});

export const namingSettingsUpdateSchema = z.object({
	config: namingConfigUpdateSchema,
	presetSelection: namingPresetSelectionSchema
});

// Naming Type Exports
export type MultiEpisodeStyle = z.infer<typeof multiEpisodeStyleSchema>;
export type ColonReplacement = z.infer<typeof colonReplacementSchema>;
export type MediaServerIdFormat = z.infer<typeof mediaServerIdFormatSchema>;
export type NamingConfigUpdate = z.infer<typeof namingConfigUpdateSchema>;
export type NamingPresetSelection = z.infer<typeof namingPresetSelectionSchema>;
export type NamingSettingsUpdate = z.infer<typeof namingSettingsUpdateSchema>;

// ============================================================
// NNTP Server Schemas (for NZB streaming)
// ============================================================

/**
 * Schema for creating an NNTP server.
 */
export const nntpServerCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	host: z.string().min(1, 'Host is required'),
	port: z.number().int().min(1).max(65535).default(563),
	useSsl: z.boolean().default(true),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable(),
	maxConnections: z.number().int().min(1).max(50).default(10),
	priority: z.number().int().min(0).max(99).default(1),
	enabled: z.boolean().default(true),
	downloadClientId: z.string().uuid().optional().nullable()
});

/**
 * Schema for updating an NNTP server.
 */
export const nntpServerUpdateSchema = nntpServerCreateSchema.partial();

/**
 * Schema for testing NNTP connection.
 */
export const nntpServerTestSchema = z.object({
	host: z.string().min(1, 'Host is required'),
	port: z.number().int().min(1).max(65535),
	useSsl: z.boolean().default(true),
	username: z.string().optional().nullable(),
	password: z.string().optional().nullable()
});

// NNTP Server Type Exports
export type NntpServerCreate = z.infer<typeof nntpServerCreateSchema>;
export type NntpServerUpdate = z.infer<typeof nntpServerUpdateSchema>;
export type NntpServerTest = z.infer<typeof nntpServerTestSchema>;

// ============================================================
// Media server notification schemas
// ============================================================

/**
 * Server type for MediaBrowser servers.
 */
export const mediaBrowserServerTypeSchema = z.enum(['jellyfin', 'emby', 'plex']);

/**
 * Path mapping for MediaBrowser servers.
 */
export const mediaBrowserPathMappingSchema = z.object({
	localPath: z.string().min(1, 'Local path is required'),
	remotePath: z.string().min(1, 'Remote path is required')
});

/**
 * Schema for creating a MediaBrowser server.
 */
export const mediaBrowserServerCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	serverType: mediaBrowserServerTypeSchema,
	host: z.string().url('Must be a valid URL'),
	apiKey: z.string().min(1, 'API key is required'),
	enabled: z.boolean().default(true),
	onImport: z.boolean().default(true),
	onUpgrade: z.boolean().default(true),
	onRename: z.boolean().default(true),
	onDelete: z.boolean().default(true),
	pathMappings: z.array(mediaBrowserPathMappingSchema).default([])
});

/**
 * Schema for updating a MediaBrowser server.
 */
export const mediaBrowserServerUpdateSchema = mediaBrowserServerCreateSchema.partial();

/**
 * Schema for testing a MediaBrowser server connection.
 */
export const mediaBrowserServerTestSchema = z.object({
	host: z.string().url('Must be a valid URL'),
	apiKey: z.string().min(1, 'API key is required'),
	serverType: mediaBrowserServerTypeSchema.optional().default('jellyfin')
});

// MediaBrowser Type Exports
export type MediaBrowserServerType = z.infer<typeof mediaBrowserServerTypeSchema>;
export type MediaBrowserPathMapping = z.infer<typeof mediaBrowserPathMappingSchema>;
export type MediaBrowserServerCreate = z.infer<typeof mediaBrowserServerCreateSchema>;
export type MediaBrowserServerUpdate = z.infer<typeof mediaBrowserServerUpdateSchema>;
export type MediaBrowserServerTest = z.infer<typeof mediaBrowserServerTestSchema>;

// ============================================================
// Stalker Portal Account Schemas (Live TV)
// ============================================================

/**
 * MAC address validation regex.
 * Format: XX:XX:XX:XX:XX:XX (uppercase or lowercase hex)
 */
const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/**
 * Timezone format regex (e.g., Europe/London, America/New_York)
 */
const TIMEZONE_REGEX = /^[a-zA-Z_]+\/[a-zA-Z_]+$/;

/**
 * Schema for creating a Stalker Portal account.
 */
export const stalkerAccountCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	portalUrl: z
		.string()
		.url('Must be a valid URL')
		.refine(
			(url) => {
				// Allow any valid URL - portal path varies by provider
				try {
					new URL(url);
					return true;
				} catch {
					return false;
				}
			},
			{ message: 'Must be a valid portal URL' }
		),
	macAddress: z.string().regex(MAC_ADDRESS_REGEX, {
		message: 'Invalid MAC address format (expected XX:XX:XX:XX:XX:XX)'
	}),
	enabled: z.boolean().default(true),
	// Device parameters (optional - will be auto-generated if not provided)
	serialNumber: z.string().max(50).optional(),
	deviceId: z.string().max(50).optional(),
	deviceId2: z.string().max(50).optional(),
	model: z.string().max(50).default('MAG254'),
	timezone: z
		.string()
		.regex(TIMEZONE_REGEX, { message: 'Invalid timezone format (expected Region/City)' })
		.default('Europe/London'),
	// Optional credentials
	username: z.string().max(100).optional(),
	password: z.string().max(100).optional()
});

/**
 * Schema for updating a Stalker Portal account.
 */
export const stalkerAccountUpdateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	portalUrl: z.string().url().optional(),
	macAddress: z
		.string()
		.regex(MAC_ADDRESS_REGEX, {
			message: 'Invalid MAC address format (expected XX:XX:XX:XX:XX:XX)'
		})
		.optional(),
	enabled: z.boolean().optional(),
	// Device parameters
	serialNumber: z.string().max(50).optional(),
	deviceId: z.string().max(50).optional(),
	deviceId2: z.string().max(50).optional(),
	model: z.string().max(50).optional(),
	timezone: z
		.string()
		.regex(TIMEZONE_REGEX, { message: 'Invalid timezone format (expected Region/City)' })
		.optional(),
	// Credentials
	username: z.string().max(100).optional(),
	password: z.string().max(100).optional()
});

/**
 * Schema for testing a Stalker Portal account connection.
 */
export const stalkerAccountTestSchema = z.object({
	portalUrl: z.string().url('Must be a valid URL'),
	macAddress: z.string().regex(MAC_ADDRESS_REGEX, {
		message: 'Invalid MAC address format (expected XX:XX:XX:XX:XX:XX)'
	}),
	// Device parameters (optional - will be auto-generated if not provided)
	serialNumber: z.string().max(50).optional(),
	deviceId: z.string().max(50).optional(),
	deviceId2: z.string().max(50).optional(),
	model: z.string().max(50).optional(),
	timezone: z.string().optional(),
	// Optional credentials
	username: z.string().max(100).optional(),
	password: z.string().max(100).optional()
});

// Stalker Account Type Exports
export type StalkerAccountCreate = z.infer<typeof stalkerAccountCreateSchema>;
export type StalkerAccountUpdate = z.infer<typeof stalkerAccountUpdateSchema>;
export type StalkerAccountTest = z.infer<typeof stalkerAccountTestSchema>;

// ============================================================================
// LiveTV Lineup Schemas
// ============================================================================

/**
 * Schema for channel category form (create/update)
 */
export const channelCategoryFormSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	color: z.string().optional(),
	icon: z.string().optional()
});

/**
 * Schema for reordering categories
 */
export const categoryReorderSchema = z.object({
	categoryIds: z.array(z.string()).min(0)
});

/**
 * Schema for adding to lineup
 */
export const addToLineupSchema = z.object({
	channels: z.array(
		z.object({
			accountId: z.string().min(1),
			channelId: z.string().min(1),
			categoryId: z.string().nullable().optional()
		})
	)
});

/**
 * Schema for updating a channel in lineup
 */
export const updateChannelSchema = z.object({
	channelNumber: z.number().nullable().optional(),
	customName: z.string().nullable().optional(),
	customLogo: z.string().nullable().optional(),
	epgId: z.string().nullable().optional(),
	epgSourceChannelId: z.string().nullable().optional(),
	categoryId: z.string().nullable().optional()
});

/**
 * Schema for removing from lineup
 */
export const removeFromLineupSchema = z.object({
	itemIds: z.array(z.string())
});

/**
 * Schema for reordering lineup
 */
export const reorderLineupSchema = z.object({
	itemIds: z.array(z.string())
});

/**
 * Schema for bulk setting category
 */
export const bulkSetCategorySchema = z.object({
	itemIds: z.array(z.string()),
	categoryId: z.string().nullable().optional()
});

/**
 * Schema for bulk clean names
 */
export const bulkCleanNamesSchema = z.object({
	itemIds: z.array(z.string())
});

/**
 * Schema for adding backup link
 */
export const addBackupLinkSchema = z.object({
	accountId: z.string().min(1),
	channelId: z.string().min(1)
});

/**
 * Schema for reordering backups
 */
export const reorderBackupsSchema = z.object({
	backupIds: z.array(z.string())
});

// LiveTV Lineup Type Exports
export type ChannelCategoryForm = z.infer<typeof channelCategoryFormSchema>;
export type CategoryReorder = z.infer<typeof categoryReorderSchema>;
export type AddToLineup = z.infer<typeof addToLineupSchema>;
export type UpdateChannel = z.infer<typeof updateChannelSchema>;
export type RemoveFromLineup = z.infer<typeof removeFromLineupSchema>;
export type ReorderLineup = z.infer<typeof reorderLineupSchema>;
export type BulkSetCategory = z.infer<typeof bulkSetCategorySchema>;
export type BulkCleanNames = z.infer<typeof bulkCleanNamesSchema>;
export type AddBackupLink = z.infer<typeof addBackupLinkSchema>;
export type ReorderBackups = z.infer<typeof reorderBackupsSchema>;

// ============================================================================
// Stalker Portal Schemas (for scanner feature)
// ============================================================================

/**
 * Schema for creating a Stalker Portal.
 */
export const stalkerPortalCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	url: z
		.string()
		.min(1, 'URL is required')
		.refine(
			(url) => {
				try {
					// Accept URLs with or without protocol
					const testUrl = url.startsWith('http') ? url : `http://${url}`;
					new URL(testUrl);
					return true;
				} catch {
					return false;
				}
			},
			{ message: 'Must be a valid portal URL' }
		),
	enabled: z.boolean().default(true)
});

/**
 * Schema for updating a Stalker Portal.
 */
export const stalkerPortalUpdateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	url: z.string().min(1).optional(),
	enabled: z.boolean().optional()
});

/**
 * Schema for detecting portal type.
 */
export const stalkerPortalDetectSchema = z.object({
	url: z.string().min(1, 'URL is required')
});

// Stalker Portal Type Exports
export type StalkerPortalCreate = z.infer<typeof stalkerPortalCreateSchema>;
export type StalkerPortalUpdate = z.infer<typeof stalkerPortalUpdateSchema>;
export type StalkerPortalDetect = z.infer<typeof stalkerPortalDetectSchema>;

// ============================================================
// Log Filter Schemas
// ============================================================

/**
 * Schema for log filter query parameters (SSE stream & download).
 * Supports both single `level` and comma-separated `levels` for multi-toggle.
 */
export const logFilterQuerySchema = z.object({
	level: z.enum(CAPTURED_LOG_LEVELS).optional(),
	levels: z
		.string()
		.optional()
		.transform((v) =>
			v
				? (v
						.split(',')
						.filter((l) =>
							(CAPTURED_LOG_LEVELS as readonly string[]).includes(l)
						) as (typeof CAPTURED_LOG_LEVELS)[number][])
				: undefined
		),
	logDomain: z.enum(CAPTURED_LOG_DOMAINS).optional(),
	search: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(1000).optional()
});

export type LogFilterQuery = z.infer<typeof logFilterQuerySchema>;

// ============================================================================
// Library Schemas
// ============================================================================

/**
 * Schema for library status request
 */
export const libraryStatusSchema = z.object({
	tmdbIds: z.array(z.number().int()),
	mediaType: z.enum(['movie', 'tv', 'all']).default('all')
});

/**
 * Schema for updating an episode
 */
export const episodeUpdateSchema = z
	.object({
		monitored: z.boolean().optional(),
		wantsSubtitlesOverride: z.union([z.boolean(), z.null()]).optional()
	})
	.refine((data) => data.monitored !== undefined || data.wantsSubtitlesOverride !== undefined, {
		message: 'No valid fields to update'
	});

/**
 * Schema for updating a movie
 */
export const movieUpdateSchema = z.object({
	monitored: z.boolean().optional(),
	scoringProfileId: z.string().nullable().optional(),
	minimumAvailability: z.string().min(1).optional(),
	rootFolderId: z.string().optional(),
	moveFilesOnRootChange: z.boolean().optional(),
	wantsSubtitles: z.boolean().optional(),
	languageProfileId: z.string().nullable().optional()
});

/**
 * Schema for updating a series
 */
export const seriesUpdateSchema = z.object({
	monitored: z.boolean().optional(),
	scoringProfileId: z.string().nullable().optional(),
	seasonFolder: z.boolean().optional(),
	seriesType: z.enum(['standard', 'anime', 'daily']).optional(),
	rootFolderId: z.string().optional(),
	wantsSubtitles: z.boolean().optional(),
	languageProfileId: z.string().nullable().optional()
});

/**
 * Schema for auto-search request
 */
export const autoSearchSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('episode'),
		episodeId: z.string().min(1)
	}),
	z.object({
		type: z.literal('season'),
		seasonNumber: z.number().int().min(0)
	}),
	z.object({
		type: z.literal('missing')
	}),
	z.object({
		type: z.literal('bulk'),
		episodeIds: z.array(z.string()).min(1)
	})
]);

/**
 * Schema for updating a season
 */
export const seasonUpdateSchema = z.object({
	monitored: z.boolean().optional(),
	updateEpisodes: z.boolean().optional()
});

/**
 * Schema for library scan
 */
export const libraryScanSchema = z
	.object({
		rootFolderId: z.string().optional(),
		fullScan: z.boolean().optional()
	})
	.optional()
	.default({});

/**
 * Schema for batch episode update
 */
export const episodeBatchUpdateSchema = z.object({
	monitored: z.boolean(),
	episodeIds: z.array(z.string()).min(1).optional(),
	seriesId: z.string().optional(),
	seasonNumber: z.number().int().optional()
});

/**
 * Schema for batch movie update
 */
export const movieBatchUpdateSchema = z.object({
	movieIds: z.array(z.string()).min(1),
	updates: z.object({
		monitored: z.boolean().optional(),
		scoringProfileId: z.string().nullable().optional()
	})
});

/**
 * Schema for batch movie delete
 */
export const movieBatchDeleteSchema = z.object({
	movieIds: z.array(z.string()).min(1),
	deleteFiles: z.boolean().default(false),
	removeFromLibrary: z.boolean().default(false)
});

/**
 * Schema for batch series update
 */
export const seriesBatchUpdateSchema = z.object({
	seriesIds: z.array(z.string()).min(1),
	updates: z.object({
		monitored: z.boolean().optional(),
		scoringProfileId: z.string().nullable().optional()
	})
});

/**
 * Schema for batch series delete
 */
export const seriesBatchDeleteSchema = z.object({
	seriesIds: z.array(z.string()).min(1),
	deleteFiles: z.boolean().default(false),
	removeFromLibrary: z.boolean().default(false)
});

// ============================================================================
// Download & Queue Schemas
// ============================================================================

/**
 * Schema for grab request
 */
export const grabRequestSchema = z
	.object({
		guid: z.string().optional(),
		downloadUrl: z.string().optional(),
		magnetUrl: z.string().optional(),
		infoHash: z.string().optional(),
		title: z.string().min(1, 'title is required'),
		indexerId: z.string().optional(),
		indexerName: z.string().optional(),
		protocol: z.enum(['torrent', 'usenet', 'streaming']).optional(),
		categories: z.array(z.number()).optional(),
		size: z.number().optional(),
		commentsUrl: z.string().optional(),
		movieId: z.string().optional(),
		seriesId: z.string().optional(),
		episodeIds: z.array(z.string()).optional(),
		seasonNumber: z.number().int().optional(),
		mediaType: z.enum(['movie', 'tv']),
		quality: z
			.object({
				resolution: z.string().optional(),
				source: z.string().optional(),
				codec: z.string().optional(),
				hdr: z.string().optional()
			})
			.optional(),
		isAutomatic: z.boolean().optional(),
		isUpgrade: z.boolean().optional(),
		force: z.boolean().optional(),
		streamUsenet: z.boolean().optional()
	})
	.refine((data) => data.downloadUrl || data.magnetUrl, {
		message: 'Either downloadUrl or magnetUrl is required',
		path: ['downloadUrl']
	})
	.refine((data) => data.movieId || data.seriesId, {
		message: 'Either movieId or seriesId is required',
		path: ['movieId']
	});

/**
 * Schema for queue action
 */
export const queueActionSchema = z.object({
	action: z.enum(['pause', 'resume'])
});

// ============================================================================
// Workers Schemas
// ============================================================================

/**
 * Schema for worker config update
 */
export const workerConfigUpdateSchema = z.object({
	maxConcurrent: z
		.record(z.enum(['stream', 'import', 'scan', 'monitoring']), z.number().int().min(0).max(100))
		.optional(),
	cleanupAfterMs: z.number().int().min(0).optional(),
	maxLogsPerWorker: z.number().int().min(10).max(10000).optional()
});

// ============================================================================
// Naming Schemas
// ============================================================================

/**
 * Schema for naming preset create
 */
export const namingPresetCreateSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
	config: z.record(z.string(), z.unknown())
});

/**
 * Schema for naming preset update
 */
export const namingPresetUpdateSchema = z.object({
	name: z.string().min(1, 'Name cannot be empty').optional(),
	description: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional()
});

/**
 * Schema for naming preview
 */
export const namingPreviewSchema = z.object({
	config: z.record(z.string(), z.unknown()).optional()
});

/**
 * Schema for naming validate
 */
export const namingValidateSchema = z.object({
	formats: z.record(z.string(), z.string())
});

/**
 * Schema for rename execute
 */
export const renameExecuteSchema = z.object({
	fileIds: z.array(z.string()).min(1, 'fileIds array cannot be empty'),
	mediaType: z.enum(['movie', 'episode', 'mixed']).default('mixed')
});

// ============================================================================
// User Schemas
// ============================================================================

/**
 * Schema for user language preference
 */
export const userLanguageSchema = z.object({
	language: z.string().min(1, 'Language is required')
});

// ============================================================================
// Subtitle Scan Schema
// ============================================================================

/**
 * Schema for subtitle scan
 */
export const subtitleScanSchema = z
	.object({
		movieId: z.string().optional(),
		seriesId: z.string().optional(),
		scanAll: z.boolean().optional()
	})
	.optional()
	.default({})
	.refine((data) => data?.movieId || data?.seriesId || data?.scanAll, {
		message: 'Specify movieId, seriesId, or scanAll: true'
	});

// ============================================================================
// Unmatched Schemas
// ============================================================================

/**
 * Schema for unmatched match
 */
export const unmatchedMatchSchema = z.object({
	fileIds: z.array(z.string()).min(1),
	tmdbId: z.number().int(),
	mediaType: z.enum(['movie', 'tv']),
	season: z.number().int().optional(),
	episodeMapping: z
		.record(
			z.string(),
			z.object({
				season: z.number().int(),
				episode: z.number().int()
			})
		)
		.optional()
});

/**
 * Schema for unmatched delete
 */
export const unmatchedDeleteSchema = z.object({
	fileIds: z.array(z.string()).min(1),
	deleteFromDisk: z.boolean().default(false)
});

/**
 * Schema for unmatched single match
 */
export const unmatchedSingleMatchSchema = z.object({
	tmdbId: z.number().int(),
	mediaType: z.enum(['movie', 'tv']),
	season: z.number().int().optional(),
	episode: z.number().int().optional()
});

// ============================================================================
// Streaming Schemas
// ============================================================================

/**
 * Schema for streaming status action
 */
export const streamingStatusActionSchema = z.object({
	action: z.enum(['reset-all'])
});

/**
 * Schema for STRM update
 */
export const strmUpdateSchema = z
	.object({
		baseUrl: z.string().optional(),
		apiKey: z.string().optional()
	})
	.optional();

// ============================================================================
// Type Exports for New Schemas
// ============================================================================

// Library Type Exports
export type LibraryStatusRequest = z.infer<typeof libraryStatusSchema>;
export type EpisodeUpdate = z.infer<typeof episodeUpdateSchema>;
export type MovieUpdate = z.infer<typeof movieUpdateSchema>;
export type SeriesUpdate = z.infer<typeof seriesUpdateSchema>;
export type AutoSearchRequest = z.infer<typeof autoSearchSchema>;
export type SeasonUpdate = z.infer<typeof seasonUpdateSchema>;
export type LibraryScanRequest = z.infer<typeof libraryScanSchema>;
export type EpisodeBatchUpdate = z.infer<typeof episodeBatchUpdateSchema>;
export type MovieBatchUpdate = z.infer<typeof movieBatchUpdateSchema>;
export type MovieBatchDelete = z.infer<typeof movieBatchDeleteSchema>;
export type SeriesBatchUpdate = z.infer<typeof seriesBatchUpdateSchema>;
export type SeriesBatchDelete = z.infer<typeof seriesBatchDeleteSchema>;

// Download & Queue Type Exports
export type GrabRequest = z.infer<typeof grabRequestSchema>;
export type QueueAction = z.infer<typeof queueActionSchema>;

// Workers Type Exports
export type WorkerConfigUpdate = z.infer<typeof workerConfigUpdateSchema>;

// Naming Type Exports
export type NamingPresetCreate = z.infer<typeof namingPresetCreateSchema>;
export type NamingPresetUpdate = z.infer<typeof namingPresetUpdateSchema>;
export type NamingPreview = z.infer<typeof namingPreviewSchema>;
export type NamingValidate = z.infer<typeof namingValidateSchema>;
export type RenameExecute = z.infer<typeof renameExecuteSchema>;

// User Type Exports
export type UserLanguage = z.infer<typeof userLanguageSchema>;

// Unmatched Type Exports
export type UnmatchedMatch = z.infer<typeof unmatchedMatchSchema>;
export type UnmatchedDelete = z.infer<typeof unmatchedDeleteSchema>;
export type UnmatchedSingleMatch = z.infer<typeof unmatchedSingleMatchSchema>;

// Streaming Type Exports
export type StreamingStatusAction = z.infer<typeof streamingStatusActionSchema>;
export type StrmUpdate = z.infer<typeof strmUpdateSchema>;
