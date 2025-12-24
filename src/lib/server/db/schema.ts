import { integer, real, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export const user = sqliteTable('user', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	age: integer('age')
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// ============================================================================
// Indexer Definitions - Cached metadata from YAML files
// ============================================================================

/**
 * Indexer Definitions - Cached metadata loaded from YAML definition files.
 * This table stores parsed YAML definitions for quick lookup without
 * re-reading files on every request.
 */
export const indexerDefinitions = sqliteTable(
	'indexer_definitions',
	{
		// Definition ID (e.g., 'knaben', 'nzbgeek', 'cinephage-stream')
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description'),
		// Protocol type
		protocol: text('protocol', { enum: ['torrent', 'usenet', 'streaming'] }).notNull(),
		// Access type
		type: text('type', { enum: ['public', 'semi-private', 'private'] }).notNull(),
		language: text('language').default('en-US'),
		// Primary and alternate URLs as JSON arrays
		urls: text('urls', { mode: 'json' }).$type<string[]>().notNull(),
		legacyUrls: text('legacy_urls', { mode: 'json' }).$type<string[]>(),
		// Settings schema for UI generation (JSON array of setting field definitions)
		settingsSchema: text('settings_schema', { mode: 'json' }).$type<
			Array<{
				name: string;
				type: string;
				label: string;
				default?: string | boolean | number;
				options?: Record<string, string>;
			}>
		>(),
		// Capabilities JSON (search modes, categories, etc.)
		capabilities: text('capabilities', { mode: 'json' })
			.$type<{
				search?: { available: boolean; supportedParams: string[] };
				tvSearch?: { available: boolean; supportedParams: string[] };
				movieSearch?: { available: boolean; supportedParams: string[] };
				musicSearch?: { available: boolean; supportedParams: string[] };
				bookSearch?: { available: boolean; supportedParams: string[] };
				categories: Record<string, string>;
			}>()
			.notNull(),
		// Source file info for change detection
		filePath: text('file_path'),
		fileHash: text('file_hash'),
		// Timestamps
		loadedAt: text('loaded_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		index('idx_indexer_definitions_protocol').on(table.protocol),
		index('idx_indexer_definitions_type').on(table.type)
	]
);

export type IndexerDefinitionRecord = typeof indexerDefinitions.$inferSelect;
export type NewIndexerDefinitionRecord = typeof indexerDefinitions.$inferInsert;

// ============================================================================
// Indexers - User-configured indexer instances
// ============================================================================

/**
 * Protocol-specific settings types
 */
export interface TorrentProtocolSettings {
	minimumSeeders: number;
	seedRatio: string | null;
	seedTime: number | null;
	packSeedTime: number | null;
	preferMagnetUrl: boolean;
	rejectDeadTorrents: boolean;
}

export interface UsenetProtocolSettings {
	minimumRetention: number | null;
	maximumRetention: number | null;
	downloadPriority: 'normal' | 'high' | 'low';
	preferCompleteNzb: boolean;
	rejectPasswordProtected: boolean;
}

export interface StreamingProtocolSettings {
	baseUrl: string | null;
	preferredQuality: '4k' | '1080p' | '720p' | '480p' | 'auto';
	includeInAutoSearch: boolean;
	enabledProviders: string[] | null;
	blockedProviders: string[] | null;
}

export type ProtocolSettings =
	| TorrentProtocolSettings
	| UsenetProtocolSettings
	| StreamingProtocolSettings;

/**
 * Indexers - User-configured indexer instances.
 * Each row represents a configured indexer that references a definition.
 */
export const indexers = sqliteTable(
	'indexers',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// User-given display name
		name: text('name').notNull(),
		// Reference to the YAML definition ID
		definitionId: text('definition_id').notNull(),
		// Enable/disable toggle
		enabled: integer('enabled', { mode: 'boolean' }).default(true),
		// Selected base URL (from definition's urls array)
		baseUrl: text('base_url').notNull(),
		// Alternate URLs for failover (JSON array)
		alternateUrls: text('alternate_urls', { mode: 'json' }).$type<string[]>(),
		// Priority for search ordering (lower = higher priority)
		priority: integer('priority').default(25),
		// Search toggles
		enableAutomaticSearch: integer('enable_automatic_search', { mode: 'boolean' }).default(true),
		enableInteractiveSearch: integer('enable_interactive_search', { mode: 'boolean' }).default(
			true
		),
		// User-provided settings values (apiKey, cookie, custom fields, etc.)
		settings: text('settings', { mode: 'json' }).$type<Record<string, string | boolean | number>>(),
		// Protocol-specific settings (JSON - one of the protocol settings types)
		protocolSettings: text('protocol_settings', { mode: 'json' }).$type<ProtocolSettings>(),
		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_indexers_definition').on(table.definitionId),
		index('idx_indexers_enabled').on(table.enabled)
	]
);

export type IndexerRecord = typeof indexers.$inferSelect;
export type NewIndexerRecord = typeof indexers.$inferInsert;

/**
 * Indexer Status - Persists health, failures, and backoff state across restarts.
 * Tracks indexer reliability and auto-disables failing indexers with exponential backoff.
 */
export const indexerStatus = sqliteTable(
	'indexer_status',
	{
		indexerId: text('indexer_id')
			.primaryKey()
			.references(() => indexers.id, { onDelete: 'cascade' }),

		// Health state
		health: text('health', { enum: ['healthy', 'warning', 'failing', 'disabled'] })
			.notNull()
			.default('healthy'),

		// Failure tracking
		consecutiveFailures: integer('consecutive_failures').notNull().default(0),
		totalRequests: integer('total_requests').notNull().default(0),
		totalFailures: integer('total_failures').notNull().default(0),

		// Auto-disable state
		isDisabled: integer('is_disabled', { mode: 'boolean' }).notNull().default(false),
		disabledAt: text('disabled_at'),
		disabledUntil: text('disabled_until'),

		// Last activity
		lastSuccess: text('last_success'),
		lastFailure: text('last_failure'),
		// Last error message for quick diagnostics
		lastErrorMessage: text('last_error_message'),

		// Performance metrics
		avgResponseTime: integer('avg_response_time'),

		// Recent failures as JSON array (max 10)
		recentFailures: text('recent_failures', { mode: 'json' })
			.$type<Array<{ timestamp: string; message: string; requestUrl?: string }>>()
			.default([]),

		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [index('idx_indexer_status_health').on(table.health, table.isDisabled)]
);

export type IndexerStatusRecord = typeof indexerStatus.$inferSelect;
export type NewIndexerStatusRecord = typeof indexerStatus.$inferInsert;

// Relations for indexer status
export const indexerStatusRelations = relations(indexerStatus, ({ one }) => ({
	indexer: one(indexers, {
		fields: [indexerStatus.indexerId],
		references: [indexers.id]
	})
}));

// Relations for indexers to definitions
export const indexersRelations = relations(indexers, ({ one }) => ({
	definition: one(indexerDefinitions, {
		fields: [indexers.definitionId],
		references: [indexerDefinitions.id]
	}),
	status: one(indexerStatus, {
		fields: [indexers.id],
		references: [indexerStatus.indexerId]
	})
}));

/**
 * Quality Definitions - Resolution/quality definitions with size limits per minute
 * Currently unused but available for future quality management features
 * Inspired by Radarr/Sonarr quality definition system
 */
export const qualityDefinitions = sqliteTable('quality_definitions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	resolution: text('resolution').notNull().unique(),
	title: text('title').notNull(),
	weight: integer('weight').default(0).notNull(),
	// Size limits per minute of video (stored as text for decimal precision)
	minSizeMbPerMinute: text('min_size_mb_per_minute'),
	maxSizeMbPerMinute: text('max_size_mb_per_minute'),
	preferredSizeMbPerMinute: text('preferred_size_mb_per_minute'),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Quality Presets - Define minimum quality requirements and preferences
 * Used to filter and score search results
 *
 * @deprecated This table is deprecated in favor of `scoringProfiles` which provides
 * a more comprehensive quality scoring system. The qualityPresets table will be
 * removed in a future version. Use `scoringProfiles` for all new code.
 *
 * Migration path:
 * - Movies/series have both qualityPresetId and scoringProfileId
 * - scoringProfileId is the preferred field to use
 * - qualityPresetId is kept for backwards compatibility
 */
export const qualityPresets = sqliteTable('quality_presets', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	// Minimum acceptable resolution (null = any)
	minResolution: text('min_resolution'),
	// Preferred resolution (ideal target)
	preferredResolution: text('preferred_resolution'),
	// Maximum resolution (null = no limit)
	maxResolution: text('max_resolution'),
	// Allowed sources as JSON array (e.g., ['bluray', 'webdl', 'webrip'])
	allowedSources: text('allowed_sources', { mode: 'json' }).$type<string[]>(),
	// Excluded sources as JSON array (e.g., ['cam', 'telesync'])
	excludedSources: text('excluded_sources', { mode: 'json' }).$type<string[]>(),
	// Prefer HDR content
	preferHdr: integer('prefer_hdr', { mode: 'boolean' }).default(false),
	// Is this the default preset
	isDefault: integer('is_default', { mode: 'boolean' }).default(false),
	// Minimum size in MB (null = no minimum)
	minSizeMb: integer('min_size_mb'),
	// Maximum size in MB (null = no maximum)
	maxSizeMb: integer('max_size_mb'),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Scoring Profiles - Custom profiles that configure how releases are scored
 *
 * Built on the scoring engine foundation. Each profile assigns scores to
 * formats (resolution, source, audio, HDR, release groups, etc.) that
 * determine release quality rankings.
 *
 * Built-in profiles (Quality, Balanced, Compact, Streamer) are defined in code
 * and serve as templates. Custom profiles are stored here and are standalone
 * (no runtime inheritance). Users can create custom profiles from scratch or
 * by copying from built-in or other custom profiles.
 */
export const scoringProfiles = sqliteTable('scoring_profiles', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	description: text('description'),
	// Tags for filtering/searching
	tags: text('tags', { mode: 'json' }).$type<string[]>(),
	// Whether upgrades are allowed with this profile
	upgradesAllowed: integer('upgrades_allowed', { mode: 'boolean' }).default(true),
	// Minimum score for a release to be accepted
	minScore: integer('min_score').default(0),
	// Score threshold to stop upgrading (-1 = never stop)
	upgradeUntilScore: integer('upgrade_until_score').default(-1),
	// Minimum score improvement to trigger upgrade
	minScoreIncrement: integer('min_score_increment').default(0),
	// Resolution fallback order as JSON array (highest priority first)
	// e.g., ['2160p', '1080p', '720p', '480p']
	resolutionOrder: text('resolution_order', { mode: 'json' }).$type<string[]>(),
	// Format score overrides (only stored if different from base profile)
	// Record<formatId, score>
	formatScores: text('format_scores', { mode: 'json' }).$type<Record<string, number>>(),
	// Allowed protocols for this profile (torrent, usenet, streaming)
	// Default: ['torrent', 'usenet'] - streaming only allowed in streaming profile
	allowedProtocols: text('allowed_protocols', { mode: 'json' }).$type<
		('torrent' | 'usenet' | 'streaming')[]
	>(),
	// Is this the default profile for new movies/shows
	isDefault: integer('is_default', { mode: 'boolean' }).default(false),
	// Media-specific file size limits (null = no limit)
	// Movie limits in GB
	movieMinSizeGb: real('movie_min_size_gb'),
	movieMaxSizeGb: real('movie_max_size_gb'),
	// Episode limits in MB (for per-episode validation, season packs use average)
	episodeMinSizeMb: real('episode_min_size_mb'),
	episodeMaxSizeMb: real('episode_max_size_mb'),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Profile Size Limits - User-configured overrides for built-in profiles
 *
 * Built-in profiles (Quality, Balanced, Compact, Streamer) are defined in code.
 * This table stores size limit overrides and default status for them.
 * Custom profiles store everything directly in the scoringProfiles table.
 */
export const profileSizeLimits = sqliteTable('profile_size_limits', {
	// Built-in profile ID (e.g., 'quality', 'balanced', 'compact', 'streamer')
	profileId: text('profile_id').primaryKey(),
	// Movie limits in GB
	movieMinSizeGb: real('movie_min_size_gb'),
	movieMaxSizeGb: real('movie_max_size_gb'),
	// Episode limits in MB
	episodeMinSizeMb: real('episode_min_size_mb'),
	episodeMaxSizeMb: real('episode_max_size_mb'),
	// Is this the default profile
	isDefault: integer('is_default', { mode: 'boolean' }).default(false),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

export type ProfileSizeLimitsRecord = typeof profileSizeLimits.$inferSelect;
export type NewProfileSizeLimitsRecord = typeof profileSizeLimits.$inferInsert;

/**
 * Custom Formats - User-defined format matching rules
 *
 * These extend the built-in formats with custom conditions.
 * Each format has conditions that determine when it matches a release.
 */
export const customFormats = sqliteTable('custom_formats', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	description: text('description'),
	// Category for UI grouping
	category: text('category', {
		enum: [
			'resolution',
			'release_group_tier',
			'audio',
			'hdr',
			'streaming',
			'micro',
			'low_quality',
			'banned',
			'enhancement',
			'codec',
			'other'
		]
	})
		.notNull()
		.default('other'),
	// Tags for filtering/searching
	tags: text('tags', { mode: 'json' }).$type<string[]>(),
	// Conditions as JSON array (FormatCondition[])
	conditions: text('conditions', { mode: 'json' }).$type<
		Array<{
			name: string;
			type: string;
			required: boolean;
			negate: boolean;
			resolution?: string;
			source?: string;
			pattern?: string;
			codec?: string;
			audio?: string;
			hdr?: string | null;
			streamingService?: string;
			flag?: string;
		}>
	>(),
	// Whether this format is active
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

export type CustomFormatRecord = typeof customFormats.$inferSelect;
export type NewCustomFormatRecord = typeof customFormats.$inferInsert;

/**
 * External ID Cache - Cache TMDB external IDs (IMDB, TVDB) to reduce API calls
 */
export const externalIdCache = sqliteTable(
	'external_id_cache',
	{
		tmdbId: integer('tmdb_id').notNull(),
		mediaType: text('media_type').notNull(), // 'movie' | 'tv'
		imdbId: text('imdb_id'),
		tvdbId: integer('tvdb_id'),
		cachedAt: text('cached_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [primaryKey({ columns: [table.tmdbId, table.mediaType] })]
);

/**
 * Download Clients - Configuration for torrent/usenet download clients
 * Currently supports qBittorrent, extensible for Transmission, Deluge, etc.
 */
export const downloadClients = sqliteTable('download_clients', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	// Client type: 'qbittorrent', future: 'transmission', 'deluge', etc.
	implementation: text('implementation').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).default(true),

	// Connection settings
	host: text('host').notNull(),
	port: integer('port').notNull(),
	useSsl: integer('use_ssl', { mode: 'boolean' }).default(false),
	username: text('username'),
	password: text('password'),

	// Category settings (separate for movie/tv)
	movieCategory: text('movie_category').default('movies'),
	tvCategory: text('tv_category').default('tv'),

	// Priority settings
	recentPriority: text('recent_priority').default('normal'), // 'normal' | 'high' | 'force'
	olderPriority: text('older_priority').default('normal'),
	initialState: text('initial_state').default('start'), // 'start' | 'pause' | 'force'

	// Seeding limits
	seedRatioLimit: text('seed_ratio_limit'), // Decimal as string
	seedTimeLimit: integer('seed_time_limit'), // Minutes

	// Path mapping - local path as seen by Cinephage server
	downloadPathLocal: text('download_path_local'),
	// QBittorrent's reported path (for reference)
	downloadPathRemote: text('download_path_remote'),

	priority: integer('priority').default(1),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Root Folders - Media library destination folders (where Jellyfin looks for content)
 */
export const rootFolders = sqliteTable('root_folders', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	path: text('path').notNull().unique(),
	// Media type this folder is for
	mediaType: text('media_type').notNull(), // 'movie' | 'tv'
	// Whether this is the default for its media type
	isDefault: integer('is_default', { mode: 'boolean' }).default(false),
	// Read-only folder (for virtual mounts like NZBDav - catalog only, no imports)
	readOnly: integer('read_only', { mode: 'boolean' }).default(false),
	// Preserve symlinks during import (for NZBDav/rclone - recreate symlinks instead of copying content)
	preserveSymlinks: integer('preserve_symlinks', { mode: 'boolean' }).default(false),
	// Cached free space in bytes (updated periodically)
	freeSpaceBytes: integer('free_space_bytes'),
	// Last time free space was checked
	lastCheckedAt: text('last_checked_at'),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString())
});

// ============================================================================
// MEDIA LIBRARY TABLES
// ============================================================================

/**
 * Movies - Movies added to the library (linked to TMDB)
 */
export const movies = sqliteTable(
	'movies',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		tmdbId: integer('tmdb_id').notNull().unique(),
		imdbId: text('imdb_id'),
		title: text('title').notNull(),
		originalTitle: text('original_title'),
		year: integer('year'),
		overview: text('overview'),
		posterPath: text('poster_path'),
		backdropPath: text('backdrop_path'),
		runtime: integer('runtime'), // Minutes
		genres: text('genres', { mode: 'json' }).$type<string[]>(),
		// Path to the movie folder (relative to root folder)
		path: text('path').notNull(),
		rootFolderId: text('root_folder_id').references(() => rootFolders.id, { onDelete: 'set null' }),
		// Legacy quality preset (for filtering - to be deprecated)
		qualityPresetId: text('quality_preset_id').references(() => qualityPresets.id, {
			onDelete: 'set null'
		}),
		// Quality profile for scoring and filtering releases
		scoringProfileId: text('scoring_profile_id').references(() => scoringProfiles.id, {
			onDelete: 'set null'
		}),
		// Language profile for subtitle preferences (deferred reference - languageProfiles defined later)
		languageProfileId: text('language_profile_id'),
		// Whether to monitor for upgrades
		monitored: integer('monitored', { mode: 'boolean' }).default(true),
		// Minimum availability before searching (announced, inCinemas, released, preDb)
		minimumAvailability: text('minimum_availability').default('released'),
		added: text('added').$defaultFn(() => new Date().toISOString()),
		// Cached: does this movie have a file?
		hasFile: integer('has_file', { mode: 'boolean' }).default(false),
		// Whether to search for subtitles for this movie
		wantsSubtitles: integer('wants_subtitles', { mode: 'boolean' }).default(true),
		// Last time this movie was searched for releases (ISO timestamp)
		lastSearchTime: text('last_search_time')
	},
	(table) => [index('idx_movies_monitored_hasfile').on(table.monitored, table.hasFile)]
);

/**
 * Movie Files - Actual movie files on disk
 */
export const movieFiles = sqliteTable('movie_files', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	movieId: text('movie_id')
		.notNull()
		.references(() => movies.id, { onDelete: 'cascade' }),
	// Path relative to the movie folder
	relativePath: text('relative_path').notNull(),
	// File size in bytes
	size: integer('size'),
	// When the file was added to library
	dateAdded: text('date_added').$defaultFn(() => new Date().toISOString()),
	// Scene name if detected
	sceneName: text('scene_name'),
	// Release group if detected
	releaseGroup: text('release_group'),
	// Parsed quality info as JSON
	quality: text('quality', { mode: 'json' }).$type<{
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	}>(),
	// MediaInfo extracted data
	mediaInfo: text('media_info', { mode: 'json' }).$type<{
		containerFormat?: string;
		videoCodec?: string;
		videoProfile?: string;
		videoBitrate?: number;
		videoBitDepth?: number;
		videoHdrFormat?: string;
		width?: number;
		height?: number;
		fps?: number;
		runtime?: number; // seconds
		audioCodec?: string;
		audioChannels?: number;
		audioBitrate?: number;
		audioLanguages?: string[];
		subtitleLanguages?: string[];
	}>(),
	// Edition info (Director's Cut, Extended, etc.)
	edition: text('edition'),
	// Languages detected in file
	languages: text('languages', { mode: 'json' }).$type<string[]>()
});

/**
 * Series - TV series added to the library (linked to TMDB)
 */
export const series = sqliteTable(
	'series',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		tmdbId: integer('tmdb_id').notNull().unique(),
		tvdbId: integer('tvdb_id'),
		imdbId: text('imdb_id'),
		title: text('title').notNull(),
		originalTitle: text('original_title'),
		year: integer('year'), // First air year
		overview: text('overview'),
		posterPath: text('poster_path'),
		backdropPath: text('backdrop_path'),
		status: text('status'), // 'Continuing', 'Ended', 'Upcoming'
		network: text('network'),
		genres: text('genres', { mode: 'json' }).$type<string[]>(),
		// Path to the series folder (relative to root folder)
		path: text('path').notNull(),
		rootFolderId: text('root_folder_id').references(() => rootFolders.id, { onDelete: 'set null' }),
		// Legacy quality preset (for filtering - to be deprecated)
		qualityPresetId: text('quality_preset_id').references(() => qualityPresets.id, {
			onDelete: 'set null'
		}),
		// Quality profile for scoring and filtering releases
		scoringProfileId: text('scoring_profile_id').references(() => scoringProfiles.id, {
			onDelete: 'set null'
		}),
		// Language profile for subtitle preferences (deferred reference - languageProfiles defined later)
		languageProfileId: text('language_profile_id'),
		// Whether to monitor for new episodes
		monitored: integer('monitored', { mode: 'boolean' }).default(true),
		// How to handle new seasons/episodes added after initial add: 'all' | 'none'
		monitorNewItems: text('monitor_new_items').default('all'),
		// Whether to monitor specials (Season 0)
		monitorSpecials: integer('monitor_specials', { mode: 'boolean' }).default(false),
		// Use season folders (e.g., /Season 01/)
		seasonFolder: integer('season_folder', { mode: 'boolean' }).default(true),
		// Series type for episode naming/searching: 'standard', 'anime', 'daily'
		seriesType: text('series_type').default('standard'),
		added: text('added').$defaultFn(() => new Date().toISOString()),
		// Cached stats
		episodeCount: integer('episode_count').default(0),
		episodeFileCount: integer('episode_file_count').default(0),
		// Whether to search for subtitles for this series (inherited by episodes by default)
		wantsSubtitles: integer('wants_subtitles', { mode: 'boolean' }).default(true)
	},
	(table) => [index('idx_series_monitored').on(table.monitored)]
);

/**
 * Seasons - TV seasons (for tracking monitoring per season)
 */
export const seasons = sqliteTable('seasons', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	seriesId: text('series_id')
		.notNull()
		.references(() => series.id, { onDelete: 'cascade' }),
	seasonNumber: integer('season_number').notNull(),
	// Whether to monitor this season
	monitored: integer('monitored', { mode: 'boolean' }).default(true),
	// TMDB metadata
	name: text('name'),
	overview: text('overview'),
	posterPath: text('poster_path'),
	airDate: text('air_date'),
	// Cached stats
	episodeCount: integer('episode_count').default(0),
	episodeFileCount: integer('episode_file_count').default(0)
});

/**
 * Episodes - Individual TV episodes
 */
export const episodes = sqliteTable(
	'episodes',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		seriesId: text('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		seasonId: text('season_id').references(() => seasons.id, { onDelete: 'set null' }),
		tmdbId: integer('tmdb_id'),
		tvdbId: integer('tvdb_id'),
		seasonNumber: integer('season_number').notNull(),
		episodeNumber: integer('episode_number').notNull(),
		absoluteEpisodeNumber: integer('absolute_episode_number'),
		title: text('title'),
		overview: text('overview'),
		airDate: text('air_date'),
		runtime: integer('runtime'), // Minutes
		// Whether to monitor this episode
		monitored: integer('monitored', { mode: 'boolean' }).default(true),
		// Cached: does this episode have a file?
		hasFile: integer('has_file', { mode: 'boolean' }).default(false),
		// Override series-level subtitle preference (null = inherit from series)
		wantsSubtitlesOverride: integer('wants_subtitles_override', { mode: 'boolean' }),
		// Last time this episode was searched for releases (ISO timestamp)
		lastSearchTime: text('last_search_time')
	},
	(table) => [
		index('idx_episodes_series_season').on(table.seriesId, table.seasonNumber),
		index('idx_episodes_monitored_hasfile').on(table.monitored, table.hasFile),
		index('idx_episodes_airdate').on(table.airDate)
	]
);

/**
 * Episode Files - Actual episode files on disk
 */
export const episodeFiles = sqliteTable('episode_files', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	seriesId: text('series_id')
		.notNull()
		.references(() => series.id, { onDelete: 'cascade' }),
	seasonNumber: integer('season_number').notNull(),
	// Can contain multiple episodes (e.g., double episodes)
	episodeIds: text('episode_ids', { mode: 'json' }).$type<string[]>(),
	// Path relative to the series folder
	relativePath: text('relative_path').notNull(),
	// File size in bytes
	size: integer('size'),
	// When the file was added to library
	dateAdded: text('date_added').$defaultFn(() => new Date().toISOString()),
	// Scene name if detected
	sceneName: text('scene_name'),
	// Release group if detected
	releaseGroup: text('release_group'),
	// Release type (singleEpisode, multiEpisode, seasonPack, etc.)
	releaseType: text('release_type'),
	// Parsed quality info as JSON
	quality: text('quality', { mode: 'json' }).$type<{
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	}>(),
	// MediaInfo extracted data (same structure as movieFiles)
	mediaInfo: text('media_info', { mode: 'json' }).$type<{
		containerFormat?: string;
		videoCodec?: string;
		videoProfile?: string;
		videoBitrate?: number;
		videoBitDepth?: number;
		videoHdrFormat?: string;
		width?: number;
		height?: number;
		fps?: number;
		runtime?: number;
		audioCodec?: string;
		audioChannels?: number;
		audioBitrate?: number;
		audioLanguages?: string[];
		subtitleLanguages?: string[];
	}>(),
	// Languages detected in file
	languages: text('languages', { mode: 'json' }).$type<string[]>()
});

/**
 * Unmatched Files - Files found on disk that couldn't be auto-matched
 */
export const unmatchedFiles = sqliteTable('unmatched_files', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	// Full path to the file
	path: text('path').notNull().unique(),
	rootFolderId: text('root_folder_id').references(() => rootFolders.id, { onDelete: 'cascade' }),
	// Media type based on root folder
	mediaType: text('media_type').notNull(), // 'movie' | 'tv'
	// File size in bytes
	size: integer('size'),
	// Parsed info from filename
	parsedTitle: text('parsed_title'),
	parsedYear: integer('parsed_year'),
	parsedSeason: integer('parsed_season'),
	parsedEpisode: integer('parsed_episode'),
	// Best guess TMDB matches as JSON array
	suggestedMatches: text('suggested_matches', { mode: 'json' }).$type<
		Array<{
			tmdbId: number;
			title: string;
			year?: number;
			confidence: number;
		}>
	>(),
	// Why it wasn't matched
	reason: text('reason'), // 'no_match', 'low_confidence', 'multiple_matches', 'parse_failed'
	// When discovered
	discoveredAt: text('discovered_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Library Scan History - Track scan operations
 */
export const libraryScanHistory = sqliteTable('library_scan_history', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	// Type of scan
	scanType: text('scan_type').notNull(), // 'full', 'incremental', 'folder'
	// Scope of scan
	rootFolderId: text('root_folder_id').references(() => rootFolders.id, { onDelete: 'set null' }),
	// Status
	status: text('status').notNull(), // 'running', 'completed', 'failed', 'cancelled'
	// Timestamps
	startedAt: text('started_at').$defaultFn(() => new Date().toISOString()),
	completedAt: text('completed_at'),
	// Stats
	filesScanned: integer('files_scanned').default(0),
	filesAdded: integer('files_added').default(0),
	filesUpdated: integer('files_updated').default(0),
	filesRemoved: integer('files_removed').default(0),
	unmatchedFiles: integer('unmatched_files').default(0),
	// Error info if failed
	errorMessage: text('error_message')
});

/**
 * Library Settings - Configuration for library scanning
 */
export const librarySettings = sqliteTable('library_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/**
 * Naming Settings - Configuration for file and folder naming conventions
 * Follows TRaSH Guides naming recommendations for media server compatibility
 *
 * Settings keys:
 * - 'movie_folder_format': string - Format for movie folder names
 * - 'movie_file_format': string - Format for movie file names
 * - 'series_folder_format': string - Format for series folder names
 * - 'season_folder_format': string - Format for season folder names
 * - 'episode_file_format': string - Format for episode file names
 * - 'daily_episode_format': string - Format for daily show episodes
 * - 'anime_episode_format': string - Format for anime episodes
 * - 'multi_episode_style': 'extend' | 'duplicate' | 'repeat' | 'scene' | 'range'
 * - 'colon_replacement': 'delete' | 'dash' | 'spaceDash' | 'spaceDashSpace' | 'smart'
 * - 'replace_spaces_with': string | null
 * - 'media_server_id_format': 'plex' | 'jellyfin' - Controls ID format in folder names
 * - 'include_quality': boolean
 * - 'include_media_info': boolean
 * - 'include_release_group': boolean
 */
export const namingSettings = sqliteTable('naming_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/**
 * Naming Presets - User-saved naming format presets
 * Built-in presets are defined in code, custom presets are stored here
 */
export const namingPresets = sqliteTable('naming_presets', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	description: text('description'),
	config: text('config', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
	isBuiltIn: integer('is_built_in', { mode: 'boolean' }).default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

// Default library settings keys:
// - 'scan_interval_hours': How often to run periodic scans (default: 12)
// - 'watch_enabled': Whether filesystem watching is enabled (default: true)
// - 'auto_match_threshold': Minimum confidence for auto-matching (default: 0.8)
// - 'scan_on_startup': Whether to scan on app startup (default: true)

// ============================================================================
// DOWNLOAD QUEUE & HISTORY TABLES
// ============================================================================

/**
 * Download Queue - Active and pending downloads being tracked
 * Links to media items (movies/series/episodes) for automatic import
 */
export const downloadQueue = sqliteTable(
	'download_queue',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),

		// Download client info
		downloadClientId: text('download_client_id')
			.notNull()
			.references(() => downloadClients.id, { onDelete: 'cascade' }),
		// Hash/ID from the download client (torrent hash, NZB ID, etc.)
		downloadId: text('download_id').notNull(),
		// Info hash from the release/magnet (reliable identifier)
		infoHash: text('info_hash'),

		// Release info
		title: text('title').notNull(),
		indexerId: text('indexer_id'),
		indexerName: text('indexer_name'),
		// Original download/magnet URL
		downloadUrl: text('download_url'),
		magnetUrl: text('magnet_url'),
		// Protocol: 'torrent' | 'usenet' | 'streaming'
		protocol: text('protocol').notNull().default('torrent'),

		// Linked media (at least one should be set)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'set null' }),
		seriesId: text('series_id').references(() => series.id, { onDelete: 'set null' }),
		// For episode-specific grabs (JSON array of episode IDs)
		episodeIds: text('episode_ids', { mode: 'json' }).$type<string[]>(),
		// Season number for season pack grabs
		seasonNumber: integer('season_number'),

		// Status tracking
		// 'queued' | 'downloading' | 'paused' | 'completed' | 'importing' | 'imported' | 'failed' | 'seeding' | 'removed'
		status: text('status').notNull().default('queued'),
		// Download progress (0.0 - 1.0)
		progress: text('progress').default('0'), // Stored as text for decimal precision
		// Size in bytes
		size: integer('size'),
		// Download/upload speeds in bytes/sec (cached from last poll)
		downloadSpeed: integer('download_speed').default(0),
		uploadSpeed: integer('upload_speed').default(0),
		// ETA in seconds (cached from last poll)
		eta: integer('eta'),
		// Current seed ratio
		ratio: text('ratio').default('0'),

		// Paths
		// Client-reported download path (may differ from actual path)
		clientDownloadPath: text('client_download_path'),
		// Actual path on disk after path mapping applied
		outputPath: text('output_path'),
		// Path where files were imported to (in root folder)
		importedPath: text('imported_path'),

		// Quality info (from parsed release name)
		quality: text('quality', { mode: 'json' }).$type<{
			resolution?: string;
			source?: string;
			codec?: string;
			hdr?: string;
		}>(),

		// Timestamps
		addedAt: text('added_at').$defaultFn(() => new Date().toISOString()),
		// When download started (first saw progress > 0)
		startedAt: text('started_at'),
		// When download reached 100%
		completedAt: text('completed_at'),
		// When import finished
		importedAt: text('imported_at'),

		// Error tracking
		errorMessage: text('error_message'),
		// Number of import attempts
		importAttempts: integer('import_attempts').default(0),
		lastAttemptAt: text('last_attempt_at'),

		// Flags
		// Whether this was an automatic grab or manual
		isAutomatic: integer('is_automatic', { mode: 'boolean' }).default(false),
		// Whether this is an upgrade for existing file
		isUpgrade: integer('is_upgrade', { mode: 'boolean' }).default(false)
	},
	(table) => [
		index('idx_download_queue_status').on(table.status),
		index('idx_download_queue_movie').on(table.movieId),
		index('idx_download_queue_series').on(table.seriesId)
	]
);

/**
 * Download History - Permanent record of completed/failed downloads
 * Created when a download is imported or permanently fails
 */
export const downloadHistory = sqliteTable('download_history', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),

	// Snapshot of queue item data
	downloadClientId: text('download_client_id'),
	downloadClientName: text('download_client_name'),
	downloadId: text('download_id'),
	title: text('title').notNull(),
	indexerId: text('indexer_id'),
	indexerName: text('indexer_name'),
	protocol: text('protocol'),

	// Linked media
	movieId: text('movie_id').references(() => movies.id, { onDelete: 'set null' }),
	seriesId: text('series_id').references(() => series.id, { onDelete: 'set null' }),
	episodeIds: text('episode_ids', { mode: 'json' }).$type<string[]>(),
	seasonNumber: integer('season_number'),

	// Final status: 'imported' | 'failed' | 'rejected' | 'removed'
	status: text('status').notNull(),
	// For failures/rejections
	statusReason: text('status_reason'),

	// Final stats
	size: integer('size'),
	// How long download took (seconds)
	downloadTimeSeconds: integer('download_time_seconds'),
	// Final ratio when removed from client
	finalRatio: text('final_ratio'),

	// Quality info
	quality: text('quality', { mode: 'json' }).$type<{
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	}>(),

	// Paths
	importedPath: text('imported_path'),

	// Created file IDs (for tracking what was imported)
	movieFileId: text('movie_file_id').references(() => movieFiles.id, { onDelete: 'set null' }),
	episodeFileIds: text('episode_file_ids', { mode: 'json' }).$type<string[]>(),

	// Timestamps
	grabbedAt: text('grabbed_at'),
	completedAt: text('completed_at'),
	importedAt: text('imported_at'),
	// When this history record was created
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString())
});

// ============================================================================
// MONITORING SYSTEM TABLES
// ============================================================================

/**
 * Monitoring Settings - Configuration for automated monitoring system
 * Controls intervals and behavior for missing content search, upgrade monitoring, etc.
 */
export const monitoringSettings = sqliteTable('monitoring_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// Default monitoring settings keys:
// - 'missing_search_interval_hours': number - How often to search for missing content (default: 24)
// - 'upgrade_search_interval_hours': number - How often to search for upgrades (default: 168)
// - 'new_episode_check_interval_hours': number - How often to check for new episodes (default: 1)
// - 'cutoff_unmet_search_interval_hours': number - How often to search for cutoff unmet (default: 24)
// - 'auto_replace_enabled': boolean - Auto-replace with better quality (default: true)
// - 'search_on_monitor_enabled': boolean - Search when item first monitored (default: true)

/**
 * Monitoring History - Audit trail of monitoring system activity
 * Tracks searches, grabs, and decisions made by the automated monitoring system
 */
/**
 * Blocklist - Tracks releases that should not be grabbed again
 * Prevents re-downloading failed or problematic releases
 */
export const blocklist = sqliteTable(
	'blocklist',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// What was blocked
		title: text('title').notNull(),
		infoHash: text('info_hash'),
		indexerId: text('indexer_id').references(() => indexers.id, { onDelete: 'set null' }),
		// Associated content (at least one must be set)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
		seriesId: text('series_id').references(() => series.id, { onDelete: 'cascade' }),
		episodeIds: text('episode_ids', { mode: 'json' }).$type<string[]>(),
		// Why it was blocked
		reason: text('reason').notNull(), // 'download_failed', 'import_failed', 'quality_mismatch', 'manual'
		message: text('message'),
		// Source information for matching
		sourceTitle: text('source_title'),
		quality: text('quality', { mode: 'json' }).$type<{
			resolution?: string;
			source?: string;
			codec?: string;
			hdr?: string;
		}>(),
		size: integer('size'),
		protocol: text('protocol'), // 'torrent' | 'usenet' | 'streaming'
		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		expiresAt: text('expires_at') // Optional expiration (null = permanent)
	},
	(table) => [
		index('idx_blocklist_movie').on(table.movieId),
		index('idx_blocklist_series').on(table.seriesId),
		index('idx_blocklist_infohash').on(table.infoHash)
	]
);

/**
 * Delay Profiles - Configures grab delays based on protocol and quality
 * Similar to Radarr/Sonarr's delay profiles for waiting for better releases
 */
export const delayProfiles = sqliteTable('delay_profiles', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	// Profile name
	name: text('name').notNull(),
	// Order for matching (lower = higher priority)
	sortOrder: integer('sort_order').notNull().default(0),
	// Enable/disable
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	// Protocol delays (in minutes, 0 = immediate)
	usenetDelay: integer('usenet_delay').notNull().default(0),
	torrentDelay: integer('torrent_delay').notNull().default(0),
	// Quality-based delays (JSON map of resolution -> delay in minutes)
	qualityDelays: text('quality_delays', { mode: 'json' }).$type<Record<string, number>>(),
	// Preferred protocols
	preferredProtocol: text('preferred_protocol'), // 'usenet', 'torrent', or null
	// Tags for matching (JSON array)
	tags: text('tags', { mode: 'json' }).$type<string[]>(),
	// Bypass delay conditions
	bypassIfHighestQuality: integer('bypass_if_highest_quality', { mode: 'boolean' }).default(true),
	bypassIfAboveScore: integer('bypass_if_above_score'),
	// Timestamps
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Pending Releases - Tracks releases waiting for delay to expire
 * Releases are queued here when delay profile requires waiting
 */
export const pendingReleases = sqliteTable('pending_releases', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	// Release info
	title: text('title').notNull(),
	infoHash: text('info_hash'),
	indexerId: text('indexer_id').references(() => indexers.id, { onDelete: 'set null' }),
	// Download info
	downloadUrl: text('download_url'),
	magnetUrl: text('magnet_url'),
	// Associated content
	movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
	seriesId: text('series_id').references(() => series.id, { onDelete: 'cascade' }),
	episodeIds: text('episode_ids', { mode: 'json' }).$type<string[]>(),
	// Release details
	score: integer('score').notNull(),
	size: integer('size'),
	protocol: text('protocol').notNull(), // 'torrent' | 'usenet' | 'streaming'
	quality: text('quality', { mode: 'json' }).$type<{
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	}>(),
	// Delay tracking
	delayProfileId: text('delay_profile_id').references(() => delayProfiles.id, {
		onDelete: 'set null'
	}),
	addedAt: text('added_at').$defaultFn(() => new Date().toISOString()),
	processAt: text('process_at').notNull(), // When to process this release
	// Status
	status: text('status').notNull().default('pending'), // 'pending', 'superseded', 'grabbed', 'expired'
	supersededBy: text('superseded_by') // ID of release that superseded this one
});

export const monitoringHistory = sqliteTable(
	'monitoring_history',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// Link to parent task execution (for unified task history)
		taskHistoryId: text('task_history_id').references(() => taskHistory.id, {
			onDelete: 'cascade'
		}),
		// Task type that triggered this action
		taskType: text('task_type').notNull(), // 'missing', 'upgrade', 'new_episode', 'cutoff_unmet'

		// Linked media (at least one should be set)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
		seriesId: text('series_id').references(() => series.id, { onDelete: 'cascade' }),
		seasonNumber: integer('season_number'),
		episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'cascade' }),

		// Status of this monitoring action
		// 'searching' | 'found' | 'grabbed' | 'no_results' | 'skipped' | 'error'
		status: text('status').notNull(),

		// Search results
		releasesFound: integer('releases_found').default(0),
		releaseGrabbed: text('release_grabbed'), // Title of release that was grabbed
		queueItemId: text('queue_item_id'), // Link to download queue if grabbed

		// Upgrade tracking
		isUpgrade: integer('is_upgrade', { mode: 'boolean' }).default(false),
		oldScore: integer('old_score'), // Previous file score (for upgrades)
		newScore: integer('new_score'), // New release score (for upgrades)

		// Timestamps
		executedAt: text('executed_at').$defaultFn(() => new Date().toISOString()),

		// Error info
		errorMessage: text('error_message')
	},
	(table) => [
		index('idx_monitoring_history_task_history').on(table.taskHistoryId),
		index('idx_monitoring_history_movie').on(table.movieId),
		index('idx_monitoring_history_series').on(table.seriesId),
		index('idx_monitoring_history_episode').on(table.episodeId)
	]
);

// ============================================================================
// SUBTITLE MANAGEMENT TABLES
// ============================================================================

/**
 * Language Profile - Type definitions for JSON columns
 */
export interface LanguagePreference {
	code: string; // ISO 639-1 code (e.g., 'en', 'es', 'fr')
	forced: boolean; // Look for forced subtitles
	hearingImpaired: boolean; // SDH/HI preference (include HI if true)
	excludeHi: boolean; // Explicitly exclude HI if true
	isCutoff: boolean; // If satisfied, stop searching for more languages
}

/**
 * Language Profiles - Define ordered language preferences for subtitle searching
 * Each movie/series can be assigned a profile to determine which subtitles to search for
 */
export const languageProfiles = sqliteTable('language_profiles', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	// Ordered list of language preferences with config
	languages: text('languages', { mode: 'json' }).$type<LanguagePreference[]>().notNull(),
	// Index in languages array where cutoff is satisfied (stop searching after this)
	cutoffIndex: integer('cutoff_index').default(0),
	// Whether to upgrade existing subtitles with better matches
	upgradesAllowed: integer('upgrades_allowed', { mode: 'boolean' }).default(true),
	// Minimum score threshold for auto-download (0-100 for movies, 0-360 for episodes)
	minimumScore: integer('minimum_score').default(60),
	// Is this the default profile for new movies/shows
	isDefault: integer('is_default', { mode: 'boolean' }).default(false),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Subtitle Providers - Configuration for subtitle sources (OpenSubtitles, Podnapisi, etc.)
 */
export const subtitleProviders = sqliteTable('subtitle_providers', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	// Provider type: 'opensubtitles', 'addic7ed', 'subdl', 'yifysubtitles', 'gestdown', 'subf2m'
	implementation: text('implementation').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	// Priority for search order (lower = higher priority)
	priority: integer('priority').default(25),

	// Authentication (provider-specific)
	apiKey: text('api_key'),
	username: text('username'),
	password: text('password'),

	// Provider-specific settings as JSON
	settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>(),

	// Rate limiting config
	requestsPerMinute: integer('requests_per_minute').default(60),

	// Throttling/health tracking
	lastError: text('last_error'),
	lastErrorAt: text('last_error_at'),
	consecutiveFailures: integer('consecutive_failures').default(0),
	throttledUntil: text('throttled_until'),

	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Subtitles - Subtitle files on disk linked to movies/episodes
 */
export const subtitles = sqliteTable(
	'subtitles',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),

		// Link to media (one must be set)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
		episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'cascade' }),

		// File info
		relativePath: text('relative_path').notNull(),
		language: text('language').notNull(), // ISO 639-1 code

		// Subtitle properties
		isForced: integer('is_forced', { mode: 'boolean' }).default(false),
		isHearingImpaired: integer('is_hearing_impaired', { mode: 'boolean' }).default(false),
		format: text('format').notNull(), // 'srt', 'ass', 'sub', 'vtt'

		// Source info (null if manually added or discovered on disk)
		providerId: text('provider_id').references(() => subtitleProviders.id, {
			onDelete: 'set null'
		}),
		providerSubtitleId: text('provider_subtitle_id'), // External ID from provider

		// Scoring info (how well it matched)
		matchScore: integer('match_score'),
		isHashMatch: integer('is_hash_match', { mode: 'boolean' }).default(false),

		// File metadata
		size: integer('size'),

		// Sync correction applied (milliseconds offset)
		syncOffset: integer('sync_offset').default(0),
		wasSynced: integer('was_synced', { mode: 'boolean' }).default(false),

		dateAdded: text('date_added').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_subtitles_movie').on(table.movieId),
		index('idx_subtitles_episode').on(table.episodeId)
	]
);

/**
 * Subtitle History - Audit trail of all subtitle actions
 */
export const subtitleHistory = sqliteTable('subtitle_history', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),

	// Link to media
	movieId: text('movie_id').references(() => movies.id, { onDelete: 'set null' }),
	episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'set null' }),

	// Action info: 'downloaded', 'deleted', 'synced', 'upgraded', 'manual_upload', 'discovered'
	action: text('action').notNull(),

	// Subtitle details
	language: text('language').notNull(),
	providerId: text('provider_id'),
	providerName: text('provider_name'),
	providerSubtitleId: text('provider_subtitle_id'),

	// Score at time of download
	matchScore: integer('match_score'),
	wasHashMatch: integer('was_hash_match', { mode: 'boolean' }).default(false),

	// What was replaced (for upgrades)
	replacedSubtitleId: text('replaced_subtitle_id'),

	// Error message if failed
	errorMessage: text('error_message'),

	createdAt: text('created_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Subtitle Blacklist - Subtitles that should not be downloaded again
 */
export const subtitleBlacklist = sqliteTable('subtitle_blacklist', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),

	// Link to media
	movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
	episodeId: text('episode_id').references(() => episodes.id, { onDelete: 'cascade' }),

	// Provider info
	providerId: text('provider_id').references(() => subtitleProviders.id, { onDelete: 'cascade' }),
	providerSubtitleId: text('provider_subtitle_id').notNull(),

	// Why blacklisted: 'wrong_content', 'out_of_sync', 'poor_quality', 'manual'
	reason: text('reason'),

	language: text('language').notNull(),

	createdAt: text('created_at').$defaultFn(() => new Date().toISOString())
});

/**
 * Subtitle Settings - Global configuration for subtitle system
 */
export const subtitleSettings = sqliteTable('subtitle_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// Default subtitle settings keys:
// - 'search_interval_hours': How often to search for missing subtitles (default: 6)
// - 'upgrade_interval_hours': How often to search for upgrades (default: 24)
// - 'auto_sync_enabled': Whether to automatically apply sync corrections (default: true)
// - 'auto_sync_threshold': Score threshold below which to auto-sync (default: 80)
// - 'search_on_import': Whether to auto-search when new media is imported (default: true)
// - 'embed_subtitles': Whether to embed subs in media files - future (default: false)
// - 'default_language_profile_id': Default profile for new media
// - 'subtitle_folder': Where to place subtitles ('alongside' or relative path)

// ============================================================================
// SYSTEM TASKS TABLE
// ============================================================================

/**
 * Task History - Tracks execution of manual system tasks
 * Used by the Tasks page to show task run history and prevent concurrent execution
 */
export const taskHistory = sqliteTable('task_history', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	// Task identifier (e.g., 'update-strm-urls')
	taskId: text('task_id').notNull(),
	// Execution status: 'running', 'completed', 'failed'
	status: text('status').notNull(),
	// Task-specific results as JSON
	results: text('results', { mode: 'json' }).$type<Record<string, unknown>>(),
	// Error messages if failed
	errors: text('errors', { mode: 'json' }).$type<string[]>(),
	// Timestamps
	startedAt: text('started_at').$defaultFn(() => new Date().toISOString()),
	completedAt: text('completed_at')
});

// ============================================================================
// RELATIONS
// ============================================================================

/**
 * Movies Relations
 */
export const moviesRelations = relations(movies, ({ one, many }) => ({
	scoringProfile: one(scoringProfiles, {
		fields: [movies.scoringProfileId],
		references: [scoringProfiles.id]
	}),
	rootFolder: one(rootFolders, {
		fields: [movies.rootFolderId],
		references: [rootFolders.id]
	}),
	qualityPreset: one(qualityPresets, {
		fields: [movies.qualityPresetId],
		references: [qualityPresets.id]
	}),
	languageProfile: one(languageProfiles, {
		fields: [movies.languageProfileId],
		references: [languageProfiles.id]
	}),
	subtitles: many(subtitles)
}));

/**
 * Series Relations
 */
export const seriesRelations = relations(series, ({ one, many }) => ({
	scoringProfile: one(scoringProfiles, {
		fields: [series.scoringProfileId],
		references: [scoringProfiles.id]
	}),
	rootFolder: one(rootFolders, {
		fields: [series.rootFolderId],
		references: [rootFolders.id]
	}),
	qualityPreset: one(qualityPresets, {
		fields: [series.qualityPresetId],
		references: [qualityPresets.id]
	}),
	languageProfile: one(languageProfiles, {
		fields: [series.languageProfileId],
		references: [languageProfiles.id]
	}),
	seasons: many(seasons),
	episodes: many(episodes)
}));

/**
 * Seasons Relations
 */
export const seasonsRelations = relations(seasons, ({ one, many }) => ({
	series: one(series, {
		fields: [seasons.seriesId],
		references: [series.id]
	}),
	episodes: many(episodes)
}));

/**
 * Episodes Relations
 */
export const episodesRelations = relations(episodes, ({ one, many }) => ({
	series: one(series, {
		fields: [episodes.seriesId],
		references: [series.id]
	}),
	season: one(seasons, {
		fields: [episodes.seasonId],
		references: [seasons.id]
	}),
	subtitles: many(subtitles)
}));

/**
 * Movie Files Relations
 */
export const movieFilesRelations = relations(movieFiles, ({ one }) => ({
	movie: one(movies, {
		fields: [movieFiles.movieId],
		references: [movies.id]
	})
}));

/**
 * Episode Files Relations
 */
export const episodeFilesRelations = relations(episodeFiles, ({ one }) => ({
	series: one(series, {
		fields: [episodeFiles.seriesId],
		references: [series.id]
	})
}));

/**
 * Download Queue Relations
 */
export const downloadQueueRelations = relations(downloadQueue, ({ one }) => ({
	downloadClient: one(downloadClients, {
		fields: [downloadQueue.downloadClientId],
		references: [downloadClients.id]
	}),
	movie: one(movies, {
		fields: [downloadQueue.movieId],
		references: [movies.id]
	}),
	series: one(series, {
		fields: [downloadQueue.seriesId],
		references: [series.id]
	})
}));

/**
 * Download History Relations
 */
export const downloadHistoryRelations = relations(downloadHistory, ({ one }) => ({
	movie: one(movies, {
		fields: [downloadHistory.movieId],
		references: [movies.id]
	}),
	series: one(series, {
		fields: [downloadHistory.seriesId],
		references: [series.id]
	}),
	movieFile: one(movieFiles, {
		fields: [downloadHistory.movieFileId],
		references: [movieFiles.id]
	})
}));

/**
 * Monitoring History Relations
 */
export const monitoringHistoryRelations = relations(monitoringHistory, ({ one }) => ({
	movie: one(movies, {
		fields: [monitoringHistory.movieId],
		references: [movies.id]
	}),
	series: one(series, {
		fields: [monitoringHistory.seriesId],
		references: [series.id]
	}),
	episode: one(episodes, {
		fields: [monitoringHistory.episodeId],
		references: [episodes.id]
	})
}));

/**
 * Unmatched Files Relations
 */
export const unmatchedFilesRelations = relations(unmatchedFiles, ({ one }) => ({
	rootFolder: one(rootFolders, {
		fields: [unmatchedFiles.rootFolderId],
		references: [rootFolders.id]
	})
}));

/**
 * Library Scan History Relations
 */
export const libraryScanHistoryRelations = relations(libraryScanHistory, ({ one }) => ({
	rootFolder: one(rootFolders, {
		fields: [libraryScanHistory.rootFolderId],
		references: [rootFolders.id]
	})
}));

// ============================================================================
// SUBTITLE RELATIONS
// ============================================================================

/**
 * Language Profiles Relations
 */
export const languageProfilesRelations = relations(languageProfiles, ({ many }) => ({
	movies: many(movies),
	series: many(series)
}));

/**
 * Subtitle Providers Relations
 */
export const subtitleProvidersRelations = relations(subtitleProviders, ({ many }) => ({
	subtitles: many(subtitles),
	blacklist: many(subtitleBlacklist)
}));

/**
 * Subtitles Relations
 */
export const subtitlesRelations = relations(subtitles, ({ one }) => ({
	movie: one(movies, {
		fields: [subtitles.movieId],
		references: [movies.id]
	}),
	episode: one(episodes, {
		fields: [subtitles.episodeId],
		references: [episodes.id]
	}),
	provider: one(subtitleProviders, {
		fields: [subtitles.providerId],
		references: [subtitleProviders.id]
	})
}));

/**
 * Subtitle History Relations
 */
export const subtitleHistoryRelations = relations(subtitleHistory, ({ one }) => ({
	movie: one(movies, {
		fields: [subtitleHistory.movieId],
		references: [movies.id]
	}),
	episode: one(episodes, {
		fields: [subtitleHistory.episodeId],
		references: [episodes.id]
	})
}));

/**
 * Subtitle Blacklist Relations
 */
export const subtitleBlacklistRelations = relations(subtitleBlacklist, ({ one }) => ({
	movie: one(movies, {
		fields: [subtitleBlacklist.movieId],
		references: [movies.id]
	}),
	episode: one(episodes, {
		fields: [subtitleBlacklist.episodeId],
		references: [episodes.id]
	}),
	provider: one(subtitleProviders, {
		fields: [subtitleBlacklist.providerId],
		references: [subtitleProviders.id]
	})
}));

// ============================================================================
// SMART LISTS FEATURE TABLES
// ============================================================================

/**
 * Smart List Filters - Type definition for JSON column
 * Maps to TMDB Discover API parameters
 */
export interface SmartListFilters {
	// Genres
	withGenres?: number[];
	withoutGenres?: number[];
	genreMode?: 'and' | 'or';

	// Year/Date
	yearMin?: number;
	yearMax?: number;
	releaseDateMin?: string;
	releaseDateMax?: string;

	// Rating
	voteAverageMin?: number;
	voteAverageMax?: number;
	voteCountMin?: number;

	// Popularity
	popularityMin?: number;
	popularityMax?: number;

	// People
	withCast?: number[];
	withCrew?: number[];

	// Keywords
	withKeywords?: number[];
	withoutKeywords?: number[];

	// Watch Providers
	withWatchProviders?: number[];
	watchRegion?: string;

	// Certification
	certification?: string;
	certificationCountry?: string;

	// Runtime
	runtimeMin?: number;
	runtimeMax?: number;

	// Language
	withOriginalLanguage?: string;

	// TV-specific
	withStatus?: string;

	// Movie-specific
	withReleaseType?: number[];
}

/**
 * Smart Lists - User-defined TMDB discover query lists
 *
 * Smart lists are dynamic lists that query TMDB's discover API using
 * user-defined filter criteria. Results are cached and periodically refreshed.
 */
export const smartLists = sqliteTable(
	'smart_lists',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),

		// === BASIC INFO ===
		name: text('name').notNull(),
		description: text('description'),

		// Media type: 'movie' or 'tv' (not mixed - TMDB discover is type-specific)
		mediaType: text('media_type', { enum: ['movie', 'tv'] }).notNull(),

		enabled: integer('enabled', { mode: 'boolean' }).default(true),

		// === TMDB DISCOVER FILTERS ===
		// Stored as JSON for flexibility
		filters: text('filters', { mode: 'json' }).$type<SmartListFilters>().notNull(),

		// Sort configuration
		sortBy: text('sort_by').default('popularity.desc'),

		// Item limit (how many items to fetch and cache)
		itemLimit: integer('item_limit').default(100).notNull(),

		// === LIBRARY-AWARE FILTERS ===
		// Whether to exclude items already in library
		excludeInLibrary: integer('exclude_in_library', { mode: 'boolean' }).default(true),
		// Whether to show only items that could be upgraded
		showUpgradeableOnly: integer('show_upgradeable_only', { mode: 'boolean' }).default(false),
		// Manually excluded TMDB IDs (JSON array)
		excludedTmdbIds: text('excluded_tmdb_ids', { mode: 'json' }).$type<number[]>().default([]),

		// === QUALITY/SCORING ===
		// Scoring profile for quality preferences
		scoringProfileId: text('scoring_profile_id').references(() => scoringProfiles.id, {
			onDelete: 'set null'
		}),

		// === AUTO-ADD CONFIGURATION ===
		// Auto-add behavior: 'disabled' | 'add_only' | 'add_and_search'
		autoAddBehavior: text('auto_add_behavior', {
			enum: ['disabled', 'add_only', 'add_and_search']
		}).default('disabled'),
		// Root folder for auto-added items
		rootFolderId: text('root_folder_id').references(() => rootFolders.id, {
			onDelete: 'set null'
		}),
		// Monitored state for auto-added items
		autoAddMonitored: integer('auto_add_monitored', { mode: 'boolean' }).default(true),
		// Minimum availability for auto-added movies
		minimumAvailability: text('minimum_availability').default('released'),
		// Whether to want subtitles for auto-added items
		wantsSubtitles: integer('wants_subtitles', { mode: 'boolean' }).default(true),
		// Language profile for auto-added items
		languageProfileId: text('language_profile_id'),

		// === REFRESH CONFIGURATION ===
		// Refresh interval in hours (1-168)
		refreshIntervalHours: integer('refresh_interval_hours').default(24).notNull(),

		// === SYNC STATE ===
		lastRefreshTime: text('last_refresh_time'),
		lastRefreshStatus: text('last_refresh_status'), // 'success' | 'partial' | 'failed'
		lastRefreshError: text('last_refresh_error'),
		nextRefreshTime: text('next_refresh_time'),

		// === CACHED STATS ===
		cachedItemCount: integer('cached_item_count').default(0),
		itemsInLibrary: integer('items_in_library').default(0),
		itemsAutoAdded: integer('items_auto_added').default(0),

		// === TIMESTAMPS ===
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_smart_lists_enabled').on(table.enabled),
		index('idx_smart_lists_next_refresh').on(table.nextRefreshTime),
		index('idx_smart_lists_media_type').on(table.mediaType)
	]
);

export type SmartListRecord = typeof smartLists.$inferSelect;
export type NewSmartListRecord = typeof smartLists.$inferInsert;

/**
 * Smart List Items - Cached results from TMDB discover queries
 */
export const smartListItems = sqliteTable(
	'smart_list_items',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),

		// Parent smart list
		smartListId: text('smart_list_id')
			.notNull()
			.references(() => smartLists.id, { onDelete: 'cascade' }),

		// Media type (inherited from smart list)
		mediaType: text('media_type', { enum: ['movie', 'tv'] }).notNull(),

		// === TMDB DATA ===
		tmdbId: integer('tmdb_id').notNull(),

		// Cached metadata for display
		title: text('title').notNull(),
		originalTitle: text('original_title'),
		overview: text('overview'),
		posterPath: text('poster_path'),
		backdropPath: text('backdrop_path'),
		releaseDate: text('release_date'), // or first_air_date for TV
		year: integer('year'),
		voteAverage: text('vote_average'), // stored as text for precision
		voteCount: integer('vote_count'),
		popularity: text('popularity'),
		genreIds: text('genre_ids', { mode: 'json' }).$type<number[]>(),
		originalLanguage: text('original_language'),

		// === LIBRARY STATUS ===
		// Local library reference (if in library)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'set null' }),
		seriesId: text('series_id').references(() => series.id, { onDelete: 'set null' }),
		// Whether this item is in the library
		inLibrary: integer('in_library', { mode: 'boolean' }).default(false),
		// Whether this item was auto-added by this smart list
		wasAutoAdded: integer('was_auto_added', { mode: 'boolean' }).default(false),
		autoAddedAt: text('auto_added_at'),

		// === POSITION ===
		// Position in the list (based on sort order from TMDB)
		position: integer('position').notNull(),

		// === EXCLUSION ===
		// User manually excluded this item
		isExcluded: integer('is_excluded', { mode: 'boolean' }).default(false),
		excludedAt: text('excluded_at'),

		// === TIMESTAMPS ===
		firstSeenAt: text('first_seen_at').$defaultFn(() => new Date().toISOString()),
		lastSeenAt: text('last_seen_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_smart_list_items_list').on(table.smartListId),
		index('idx_smart_list_items_tmdb').on(table.tmdbId, table.mediaType),
		index('idx_smart_list_items_in_library').on(table.inLibrary),
		index('idx_smart_list_items_position').on(table.smartListId, table.position)
	]
);

export type SmartListItemRecord = typeof smartListItems.$inferSelect;
export type NewSmartListItemRecord = typeof smartListItems.$inferInsert;

/**
 * Smart List Refresh History - Tracks refresh operations
 */
export const smartListRefreshHistory = sqliteTable(
	'smart_list_refresh_history',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),

		smartListId: text('smart_list_id')
			.notNull()
			.references(() => smartLists.id, { onDelete: 'cascade' }),

		// Refresh type
		refreshType: text('refresh_type', { enum: ['automatic', 'manual'] }).notNull(),

		// Status
		status: text('status', { enum: ['running', 'success', 'partial', 'failed'] }).notNull(),

		// Results
		itemsFound: integer('items_found').default(0),
		itemsNew: integer('items_new').default(0),
		itemsRemoved: integer('items_removed').default(0),
		itemsAutoAdded: integer('items_auto_added').default(0),
		itemsFailed: integer('items_failed').default(0),

		// Failure details
		failureDetails: text('failure_details', { mode: 'json' }).$type<
			Array<{ tmdbId: number; title: string; error: string }>
		>(),

		// Timing
		startedAt: text('started_at').$defaultFn(() => new Date().toISOString()),
		completedAt: text('completed_at'),
		durationMs: integer('duration_ms'),

		// Error
		errorMessage: text('error_message')
	},
	(table) => [
		index('idx_smart_list_refresh_history_list').on(table.smartListId),
		index('idx_smart_list_refresh_history_status').on(table.status)
	]
);

export type SmartListRefreshHistoryRecord = typeof smartListRefreshHistory.$inferSelect;
export type NewSmartListRefreshHistoryRecord = typeof smartListRefreshHistory.$inferInsert;

// ============================================================================
// SMART LISTS RELATIONS
// ============================================================================

/**
 * Smart Lists Relations
 */
export const smartListsRelations = relations(smartLists, ({ one, many }) => ({
	scoringProfile: one(scoringProfiles, {
		fields: [smartLists.scoringProfileId],
		references: [scoringProfiles.id]
	}),
	rootFolder: one(rootFolders, {
		fields: [smartLists.rootFolderId],
		references: [rootFolders.id]
	}),
	languageProfile: one(languageProfiles, {
		fields: [smartLists.languageProfileId],
		references: [languageProfiles.id]
	}),
	items: many(smartListItems),
	refreshHistory: many(smartListRefreshHistory)
}));

/**
 * Smart List Items Relations
 */
export const smartListItemsRelations = relations(smartListItems, ({ one }) => ({
	smartList: one(smartLists, {
		fields: [smartListItems.smartListId],
		references: [smartLists.id]
	}),
	movie: one(movies, {
		fields: [smartListItems.movieId],
		references: [movies.id]
	}),
	series: one(series, {
		fields: [smartListItems.seriesId],
		references: [series.id]
	})
}));

/**
 * Smart List Refresh History Relations
 */
export const smartListRefreshHistoryRelations = relations(smartListRefreshHistory, ({ one }) => ({
	smartList: one(smartLists, {
		fields: [smartListRefreshHistory.smartListId],
		references: [smartLists.id]
	})
}));
