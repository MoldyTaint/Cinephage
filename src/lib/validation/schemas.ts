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
 * Schema for Torznab-specific configuration.
 */
export const torznabConfigSchema = z.object({
	categories: z.array(z.number().int().positive()).optional()
});

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
	preferMagnetUrl: z.boolean().default(false)
});

/**
 * Schema for updating an existing indexer.
 */
export const indexerUpdateSchema = indexerCreateSchema.partial();

/**
 * Schema for testing an indexer connection.
 */
export const indexerTestSchema = z.object({
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
	limit: z.number().int().min(1).max(500).default(100),
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
	/** Scoring profile ID to filter/score against */
	scoringProfileId: z.string().optional(),
	/** @deprecated Use scoringProfileId instead */
	qualityPresetId: z.string().optional(),
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
	categories: z
		.string()
		.optional()
		.transform((v) => v?.split(',').map(Number)),
	indexers: z
		.string()
		.optional()
		.transform((v) => v?.split(',')),
	minSeeders: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().min(1).max(500).default(100),
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
	/** @deprecated Use scoringProfileId instead */
	qualityPresetId: z.string().optional(),
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
	'aria2'
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

	priority: z.number().int().min(1).max(100).default(1)
});

/**
 * Schema for updating an existing download client.
 */
export const downloadClientUpdateSchema = downloadClientCreateSchema.partial();

/**
 * Schema for testing download client connection.
 */
export const downloadClientTestSchema = z.object({
	implementation: downloadClientImplementationSchema,
	host: z.string().min(1, 'Host is required'),
	port: z.number().int().min(1).max(65535),
	useSsl: z.boolean().default(false),
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

/**
 * Schema for creating a root folder.
 */
export const rootFolderCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	path: z.string().min(1, 'Path is required'),
	mediaType: rootFolderMediaTypeSchema,
	isDefault: z.boolean().default(false)
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
 * Schema for subtitle sync request.
 */
export const subtitleSyncSchema = z.object({
	subtitleId: z.string().uuid(),
	referenceType: z.enum(['video', 'subtitle']).default('video'),
	referencePath: z.string().optional(),
	maxOffsetSeconds: z.number().int().min(1).max(600).default(60),
	noFixFramerate: z.boolean().default(false),
	gss: z.boolean().default(false)
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
	autoSyncEnabled: z.boolean().optional(),
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

// Naming Type Exports
export type MultiEpisodeStyle = z.infer<typeof multiEpisodeStyleSchema>;
export type ColonReplacement = z.infer<typeof colonReplacementSchema>;
export type MediaServerIdFormat = z.infer<typeof mediaServerIdFormatSchema>;
export type NamingConfigUpdate = z.infer<typeof namingConfigUpdateSchema>;
