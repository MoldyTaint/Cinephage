import {
	blob,
	integer,
	real,
	sqliteTable,
	text,
	primaryKey,
	index,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export const user = sqliteTable('user', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID())
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
	urlBase: text('url_base'),
	mountMode: text('mount_mode'),

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
	// Client's reported path (for completed downloads)
	downloadPathRemote: text('download_path_remote'),
	// SABnzbd temp folder paths (for incomplete downloads)
	tempPathLocal: text('temp_path_local'),
	tempPathRemote: text('temp_path_remote'),

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
	// When true, content added by scan or manual match is monitored; when false, unmonitored (Issue #81)
	defaultMonitored: integer('default_monitored', { mode: 'boolean' }).default(true),
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
	languages: text('languages', { mode: 'json' }).$type<string[]>(),
	// Info hash of the torrent used to download this file (for duplicate detection)
	infoHash: text('info_hash')
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
	languages: text('languages', { mode: 'json' }).$type<string[]>(),
	// Info hash of the torrent used to download this file (for duplicate detection)
	infoHash: text('info_hash')
});

// ============================================================================
// Alternate Titles - For multi-title search support
// ============================================================================

/**
 * Alternate Titles - Stores alternate/translated titles for movies and series.
 * Used to search with multiple title variants for better results on regional trackers.
 * Titles can be auto-fetched from TMDB or manually added by users.
 */
export const alternateTitles = sqliteTable(
	'alternate_titles',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		// Media type: 'movie' or 'series'
		mediaType: text('media_type', { enum: ['movie', 'series'] }).notNull(),
		// Foreign key to movies.id or series.id (text UUID)
		mediaId: text('media_id').notNull(),
		// The alternate title
		title: text('title').notNull(),
		// Normalized title for matching (lowercase, no special chars)
		cleanTitle: text('clean_title').notNull(),
		// Source of this title: 'tmdb' (auto-fetched) or 'user' (manually added)
		source: text('source', { enum: ['tmdb', 'user'] }).notNull(),
		// ISO 639-1 language code (e.g., 'en', 'cs', 'de')
		language: text('language'),
		// ISO 3166-1 country code (e.g., 'US', 'CZ', 'DE')
		country: text('country'),
		// When this title was added
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_alternate_titles_media').on(table.mediaType, table.mediaId),
		index('idx_alternate_titles_source').on(table.source)
	]
);

export type AlternateTitle = typeof alternateTitles.$inferSelect;
export type NewAlternateTitle = typeof alternateTitles.$inferInsert;

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

		// Release group (extracted from release title at grab time)
		releaseGroup: text('release_group'),

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

	// Release group (extracted from release title at grab time)
	releaseGroup: text('release_group'),

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

// ============================================================================
// CAPTCHA SOLVER SETTINGS
// ============================================================================

/**
 * Captcha Solver Settings - Configuration for anti-bot/captcha bypass system
 * Controls browser automation settings for solving Cloudflare, Turnstile, etc.
 *
 * Settings keys:
 * - 'enabled': boolean - Master toggle for captcha solving (default: true)
 * - 'timeout_seconds': number - Max time to wait for challenge solve (default: 60)
 * - 'cache_ttl_seconds': number - How long to cache solved cookies (default: 3600)
 * - 'headless': boolean - Run browser in headless mode (default: true)
 * - 'proxy_url': string - Optional proxy URL for browser requests
 * - 'proxy_username': string - Proxy authentication username
 * - 'proxy_password': string - Proxy authentication password
 */
export const captchaSolverSettings = sqliteTable('captcha_solver_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

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

		// === LIST SOURCE TYPE ===
		// Source of list items: 'tmdb-discover', 'external-json', 'trakt-list', 'custom-manual'
		listSourceType: text('list_source_type', {
			enum: ['tmdb-discover', 'external-json', 'trakt-list', 'custom-manual']
		})
			.default('tmdb-discover')
			.notNull(),

		// === EXTERNAL SOURCE CONFIGURATION ===
		// Configuration for external list sources (URL, auth headers, list IDs, etc.)
		externalSourceConfig: text('external_source_config', { mode: 'json' })
			.$type<{
				url?: string;
				headers?: Record<string, string>;
				listId?: string;
				username?: string;
			}>()
			.default({}),

		// === PRESET CONFIGURATION ===
		// For external lists using curated presets (e.g., 'stevenlu:standard')
		presetId: text('preset_id'),
		presetProvider: text('preset_provider'),
		presetSettings: text('preset_settings', { mode: 'json' }).default({}),

		// === REFRESH CONFIGURATION ===
		// Refresh interval in hours (1-168)
		refreshIntervalHours: integer('refresh_interval_hours').default(24).notNull(),

		// === SYNC STATE ===
		lastRefreshTime: text('last_refresh_time'),
		lastRefreshStatus: text('last_refresh_status'), // 'success' | 'partial' | 'failed'
		lastRefreshError: text('last_refresh_error'),
		nextRefreshTime: text('next_refresh_time'),

		// === EXTERNAL SYNC STATE ===
		// Tracking for external list synchronization
		lastExternalSyncTime: text('last_external_sync_time'),
		externalSyncError: text('external_sync_error'),

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
// STREAMING CACHE TABLES
// ============================================================================

/**
 * Stream Extraction Cache - Persistent cache for successful stream extractions
 *
 * Survives server restarts by persisting popular cache entries to SQLite.
 * On startup, in-memory cache is warmed from the top entries by hit count.
 */
export const streamExtractionCache = sqliteTable(
	'stream_extraction_cache',
	{
		// Cache key (same format as in-memory cache: stream:tmdbId:type:s1:e2:provider)
		id: text('id').primaryKey(),

		// Media identification for queries
		tmdbId: integer('tmdb_id').notNull(),
		mediaType: text('media_type', { enum: ['movie', 'tv'] }).notNull(),
		seasonNumber: integer('season_number'),
		episodeNumber: integer('episode_number'),

		// The actual extraction result as JSON (ExtractionResult structure)
		extractionResult: text('extraction_result', { mode: 'json' }).$type<{
			success: boolean;
			sources: Array<{
				url: string;
				referer: string;
				provider: string;
				server?: string;
				quality?: string;
				language?: string;
				subtitles?: Array<{
					url: string;
					language: string;
					format?: string;
				}>;
			}>;
		}>(),

		// Which provider produced this result
		provider: text('provider'),

		// Timestamps
		cachedAt: text('cached_at').$defaultFn(() => new Date().toISOString()),
		expiresAt: text('expires_at').notNull(),

		// Access tracking for cache warming priority
		hitCount: integer('hit_count').default(0),
		lastAccessAt: text('last_access_at')
	},
	(table) => [
		index('idx_stream_cache_tmdb').on(table.tmdbId, table.mediaType),
		index('idx_stream_cache_expires').on(table.expiresAt),
		index('idx_stream_cache_hit_count').on(table.hitCount)
	]
);

export type StreamExtractionCacheRecord = typeof streamExtractionCache.$inferSelect;
export type NewStreamExtractionCacheRecord = typeof streamExtractionCache.$inferInsert;

// ============================================================================
// NZB STREAMING TABLES
// ============================================================================

/**
 * NNTP Servers - Configuration for Usenet news server connections
 * Used for direct NZB streaming without download clients
 */
export const nntpServers = sqliteTable(
	'nntp_servers',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		name: text('name').notNull(),
		host: text('host').notNull(),
		port: integer('port').notNull().default(563),
		useSsl: integer('use_ssl', { mode: 'boolean' }).default(true),
		username: text('username'),
		password: text('password'),
		maxConnections: integer('max_connections').default(10),
		// Priority for server selection (lower = try first)
		priority: integer('priority').default(1),
		enabled: integer('enabled', { mode: 'boolean' }).default(true),
		// Optional link to download client for auto-fetch
		downloadClientId: text('download_client_id').references(() => downloadClients.id, {
			onDelete: 'set null'
		}),
		// Whether this was auto-fetched from SABnzbd/NZBGet
		autoFetched: integer('auto_fetched', { mode: 'boolean' }).default(false),
		// Connection testing
		lastTestedAt: text('last_tested_at'),
		testResult: text('test_result'), // 'success' | 'failed' | null
		testError: text('test_error'),
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_nntp_servers_enabled').on(table.enabled),
		index('idx_nntp_servers_priority').on(table.priority),
		index('idx_nntp_servers_download_client').on(table.downloadClientId)
	]
);

export type NntpServerRecord = typeof nntpServers.$inferSelect;
export type NewNntpServerRecord = typeof nntpServers.$inferInsert;

/**
 * NZB Stream Mounts - Active NZB streaming sessions
 * Stores parsed NZB metadata for streaming without downloads
 */
export const nzbStreamMounts = sqliteTable(
	'nzb_stream_mounts',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// Unique hash of NZB content for deduplication
		nzbHash: text('nzb_hash').notNull().unique(),
		title: text('title').notNull(),
		// Source info
		indexerId: text('indexer_id').references(() => indexers.id, { onDelete: 'set null' }),
		releaseGuid: text('release_guid'),
		downloadUrl: text('download_url'),
		// Media linkage (at least one should be set)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
		seriesId: text('series_id').references(() => series.id, { onDelete: 'cascade' }),
		seasonNumber: integer('season_number'),
		episodeIds: text('episode_ids', { mode: 'json' }).$type<string[]>(),
		// NZB metadata (cached parsing results)
		fileCount: integer('file_count').notNull(),
		totalSize: integer('total_size').notNull(),
		// Parsed media files with segment info
		mediaFiles: text('media_files', { mode: 'json' })
			.$type<
				Array<{
					index: number;
					name: string;
					size: number;
					isRar: boolean;
					segments: Array<{
						messageId: string;
						bytes: number;
						number: number;
					}>;
					groups: string[];
				}>
			>()
			.notNull(),
		// RAR info if applicable
		rarInfo: text('rar_info', { mode: 'json' }).$type<{
			isMultiPart: boolean;
			isEncrypted: boolean;
			compressionMethod: number;
			format: 'rar4' | 'rar5';
			innerFiles: Array<{
				name: string;
				size: number;
				dataOffset: number;
			}>;
		}>(),
		// RAR password if needed (encrypted)
		password: text('password'),
		// Stream state
		status: text('status', {
			enum: [
				'pending',
				'parsing',
				'ready',
				'requires_extraction',
				'downloading',
				'extracting',
				'error',
				'expired'
			]
		})
			.notNull()
			.default('pending'),
		errorMessage: text('error_message'),
		// Streamability info (populated after checkStreamability is called)
		streamability: text('streamability', { mode: 'json' }).$type<{
			canStream: boolean;
			archiveType?: 'rar' | '7z' | 'zip' | 'none';
			compressionMethod?: number;
			requiresPassword?: boolean;
			error?: string;
		}>(),
		// Extraction state
		extractedFilePath: text('extracted_file_path'),
		extractionProgress: integer('extraction_progress'),
		// Usage tracking
		lastAccessedAt: text('last_accessed_at'),
		accessCount: integer('access_count').default(0),
		// Expiration for cleanup
		expiresAt: text('expires_at'),
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_nzb_mounts_status').on(table.status),
		index('idx_nzb_mounts_movie').on(table.movieId),
		index('idx_nzb_mounts_series').on(table.seriesId),
		index('idx_nzb_mounts_expires').on(table.expiresAt),
		index('idx_nzb_mounts_hash').on(table.nzbHash)
	]
);

export type NzbStreamMountRecord = typeof nzbStreamMounts.$inferSelect;
export type NewNzbStreamMountRecord = typeof nzbStreamMounts.$inferInsert;

/**
 * NZB Segment Cache - Persistent storage for pre-fetched critical segments.
 *
 * Stores decoded segment data (first + last segments of video files) to enable
 * fast FFmpeg probing. Without this, FFmpeg must fetch segments on-demand to
 * read MKV headers and Cues, causing 1-2 minute playback delays.
 */
export const nzbSegmentCache = sqliteTable(
	'nzb_segment_cache',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// Reference to parent mount
		mountId: text('mount_id')
			.notNull()
			.references(() => nzbStreamMounts.id, { onDelete: 'cascade' }),
		// Which file within the mount (0-indexed)
		fileIndex: integer('file_index').notNull(),
		// Which segment within the file (0-indexed)
		segmentIndex: integer('segment_index').notNull(),
		// Decoded segment data (binary)
		data: blob('data', { mode: 'buffer' }).notNull(),
		// Size in bytes (for stats)
		size: integer('size').notNull(),
		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		// Fast lookup by mount + file + segment
		uniqueIndex('idx_segment_cache_lookup').on(table.mountId, table.fileIndex, table.segmentIndex),
		// For cleanup when mount is deleted (cascade handles this, but useful for queries)
		index('idx_segment_cache_mount').on(table.mountId)
	]
);

export type NzbSegmentCacheRecord = typeof nzbSegmentCache.$inferSelect;
export type NewNzbSegmentCacheRecord = typeof nzbSegmentCache.$inferInsert;

// ============================================================================
// NZB STREAMING RELATIONS
// ============================================================================

/**
 * NNTP Servers Relations
 */
export const nntpServersRelations = relations(nntpServers, ({ one }) => ({
	downloadClient: one(downloadClients, {
		fields: [nntpServers.downloadClientId],
		references: [downloadClients.id]
	})
}));

/**
 * NZB Stream Mounts Relations
 */
export const nzbStreamMountsRelations = relations(nzbStreamMounts, ({ one, many }) => ({
	indexer: one(indexers, {
		fields: [nzbStreamMounts.indexerId],
		references: [indexers.id]
	}),
	movie: one(movies, {
		fields: [nzbStreamMounts.movieId],
		references: [movies.id]
	}),
	series: one(series, {
		fields: [nzbStreamMounts.seriesId],
		references: [series.id]
	}),
	cachedSegments: many(nzbSegmentCache)
}));

/**
 * NZB Segment Cache Relations
 */
export const nzbSegmentCacheRelations = relations(nzbSegmentCache, ({ one }) => ({
	mount: one(nzbStreamMounts, {
		fields: [nzbSegmentCache.mountId],
		references: [nzbStreamMounts.id]
	})
}));

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

// ============================================================================
// MEDIA BROWSER (JELLYFIN/EMBY) INTEGRATION
// ============================================================================

/**
 * Path mapping for MediaBrowser servers.
 * Translates local paths (Cinephage) to remote paths (Jellyfin/Emby).
 */
export interface MediaBrowserPathMapping {
	/** Local path as seen by Cinephage */
	localPath: string;
	/** Remote path as seen by Jellyfin/Emby */
	remotePath: string;
}

/**
 * MediaBrowser Servers - Jellyfin and Emby server configurations.
 * Used to notify media servers when content is added, updated, or deleted.
 */
export const mediaBrowserServers = sqliteTable('media_browser_servers', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	name: text('name').notNull(),
	serverType: text('server_type', { enum: ['jellyfin', 'emby'] }).notNull(),
	host: text('host').notNull(),
	apiKey: text('api_key').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).default(true),
	onImport: integer('on_import', { mode: 'boolean' }).default(true),
	onUpgrade: integer('on_upgrade', { mode: 'boolean' }).default(true),
	onRename: integer('on_rename', { mode: 'boolean' }).default(true),
	onDelete: integer('on_delete', { mode: 'boolean' }).default(true),
	pathMappings: text('path_mappings', { mode: 'json' }).$type<MediaBrowserPathMapping[]>(),
	serverName: text('server_name'),
	serverVersion: text('server_version'),
	serverId: text('server_id'),
	lastTestedAt: text('last_tested_at'),
	testResult: text('test_result'),
	testError: text('test_error'),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
});

export type MediaBrowserServerRecord = typeof mediaBrowserServers.$inferSelect;
export type NewMediaBrowserServerRecord = typeof mediaBrowserServers.$inferInsert;

// ============================================================================
// LIVE TV - STALKER PORTALS
// ============================================================================

/**
 * Stalker Portals - Saved portal URLs for scanning and account discovery.
 * Portals can be scanned to find valid MAC addresses.
 */
export const stalkerPortals = sqliteTable(
	'stalker_portals',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		name: text('name').notNull(),
		url: text('url').notNull().unique(),
		endpoint: text('endpoint'), // 'portal.php' or 'stalker_portal/server/load.php'
		serverTimezone: text('server_timezone'),
		lastScannedAt: text('last_scanned_at'),
		lastScanResults: text('last_scan_results'), // JSON summary
		enabled: integer('enabled', { mode: 'boolean' }).default(true),
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [index('idx_stalker_portals_enabled').on(table.enabled)]
);

export type StalkerPortalRecord = typeof stalkerPortals.$inferSelect;
export type NewStalkerPortalRecord = typeof stalkerPortals.$inferInsert;

// ============================================================================
// LIVE TV - STALKER PORTAL ACCOUNTS
// ============================================================================

/**
 * Stalker Portal Accounts - IPTV provider accounts using Stalker/Ministra protocol.
 * Each account connects to a portal server using a MAC address for authentication.
 */
export const stalkerAccounts = sqliteTable(
	'stalker_accounts',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		name: text('name').notNull(),
		portalUrl: text('portal_url').notNull(),
		macAddress: text('mac_address').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).default(true),

		// Optional link to saved portal (for scanner-discovered accounts)
		portalId: text('portal_id').references(() => stalkerPortals.id, { onDelete: 'set null' }),
		discoveredFromScan: integer('discovered_from_scan', { mode: 'boolean' }).default(false),

		// Device parameters for STB emulation (required for Stalker protocol)
		serialNumber: text('serial_number'),
		deviceId: text('device_id'),
		deviceId2: text('device_id2'),
		model: text('model').default('MAG254'),
		timezone: text('timezone').default('Europe/London'),
		token: text('token'), // Cached session token

		// Optional credentials (alternative to device ID auth)
		username: text('username'),
		password: text('password'),

		// Metadata from portal (fetched on test/save)
		playbackLimit: integer('playback_limit'),
		channelCount: integer('channel_count'),
		categoryCount: integer('category_count'),
		expiresAt: text('expires_at'),
		serverTimezone: text('server_timezone'),

		// Health tracking
		lastTestedAt: text('last_tested_at'),
		lastTestSuccess: integer('last_test_success', { mode: 'boolean' }),
		lastTestError: text('last_test_error'),

		// Sync tracking (channel sync)
		lastSyncAt: text('last_sync_at'),
		lastSyncError: text('last_sync_error'),
		syncStatus: text('sync_status')
			.$type<'never' | 'syncing' | 'success' | 'failed'>()
			.default('never'),

		// EPG tracking (separate from channel sync)
		lastEpgSyncAt: text('last_epg_sync_at'),
		lastEpgSyncError: text('last_epg_sync_error'),
		epgProgramCount: integer('epg_program_count').default(0),
		hasEpg: integer('has_epg', { mode: 'boolean' }), // null=unknown, true/false after first sync

		// Stream URL resolution method (detected during sync)
		// 'direct' = URLs from get_all_channels work directly (most portals)
		// 'create_link' = Need to call create_link API to resolve localhost templates
		// 'unknown' = Not yet detected
		streamUrlType: text('stream_url_type')
			.$type<'direct' | 'create_link' | 'unknown'>()
			.default('unknown'),

		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_stalker_accounts_enabled').on(table.enabled),
		uniqueIndex('idx_stalker_accounts_portal_mac').on(table.portalUrl, table.macAddress)
	]
);

export type StalkerAccountRecord = typeof stalkerAccounts.$inferSelect;
export type NewStalkerAccountRecord = typeof stalkerAccounts.$inferInsert;

// ============================================================================
// LIVE TV - PORTAL SCAN RESULTS
// ============================================================================

/**
 * Portal Scan Results - Discovered accounts pending user approval.
 * Stores MAC addresses found during portal scanning along with their profile data.
 */
export const portalScanResults = sqliteTable(
	'portal_scan_results',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		portalId: text('portal_id')
			.notNull()
			.references(() => stalkerPortals.id, { onDelete: 'cascade' }),
		macAddress: text('mac_address').notNull(),
		status: text('status')
			.$type<'pending' | 'approved' | 'ignored' | 'expired'>()
			.notNull()
			.default('pending'),

		// Account metadata discovered during scan
		channelCount: integer('channel_count'),
		categoryCount: integer('category_count'),
		expiresAt: text('expires_at'),
		accountStatus: text('account_status').$type<'active' | 'blocked' | 'expired'>(),
		playbackLimit: integer('playback_limit'),
		serverTimezone: text('server_timezone'),
		rawProfile: text('raw_profile'), // JSON - full profile data for review

		// Timestamps
		discoveredAt: text('discovered_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		processedAt: text('processed_at') // When user took action
	},
	(table) => [
		uniqueIndex('idx_scan_results_portal_mac').on(table.portalId, table.macAddress),
		index('idx_scan_results_portal_status').on(table.portalId, table.status)
	]
);

export type PortalScanResultRecord = typeof portalScanResults.$inferSelect;
export type NewPortalScanResultRecord = typeof portalScanResults.$inferInsert;

// ============================================================================
// LIVE TV - PORTAL SCAN HISTORY
// ============================================================================

/**
 * Portal Scan History - Execution history for portal scans.
 * Tracks each scan operation with configuration and results.
 */
export const portalScanHistory = sqliteTable(
	'portal_scan_history',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		portalId: text('portal_id')
			.notNull()
			.references(() => stalkerPortals.id, { onDelete: 'cascade' }),
		workerId: text('worker_id'), // Reference to worker for active scans
		scanType: text('scan_type').$type<'random' | 'sequential' | 'import'>().notNull(),
		macPrefix: text('mac_prefix'), // For random/sequential scans
		macRangeStart: text('mac_range_start'), // For sequential
		macRangeEnd: text('mac_range_end'), // For sequential
		macsToTest: integer('macs_to_test'),
		macsTested: integer('macs_tested').default(0),
		macsFound: integer('macs_found').default(0),
		status: text('status')
			.$type<'running' | 'completed' | 'cancelled' | 'failed'>()
			.notNull()
			.default('running'),
		error: text('error'),
		startedAt: text('started_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		completedAt: text('completed_at')
	},
	(table) => [
		index('idx_scan_history_portal').on(table.portalId),
		index('idx_scan_history_status').on(table.status)
	]
);

export type PortalScanHistoryRecord = typeof portalScanHistory.$inferSelect;
export type NewPortalScanHistoryRecord = typeof portalScanHistory.$inferInsert;

// ============================================================================
// LIVE TV - STALKER PORTAL CATEGORIES (CACHED)
// ============================================================================

/**
 * Stalker Categories - Cached channel categories/genres from portal.
 * Synced from the portal and stored locally for fast filtering.
 */
export const stalkerCategories = sqliteTable(
	'stalker_categories',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		accountId: text('account_id')
			.notNull()
			.references(() => stalkerAccounts.id, { onDelete: 'cascade' }),
		stalkerId: text('stalker_id').notNull(), // Original ID from portal
		title: text('title').notNull(),
		alias: text('alias'),
		censored: integer('censored', { mode: 'boolean' }).default(false),
		channelCount: integer('channel_count').default(0),

		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_stalker_categories_account').on(table.accountId),
		uniqueIndex('idx_stalker_categories_unique').on(table.accountId, table.stalkerId)
	]
);

export type StalkerCategoryRecord = typeof stalkerCategories.$inferSelect;
export type NewStalkerCategoryRecord = typeof stalkerCategories.$inferInsert;

// ============================================================================
// LIVE TV - STALKER PORTAL CHANNELS (CACHED)
// ============================================================================

/**
 * Stalker Channels - Cached channel data from portal.
 * Synced from the portal and stored locally for fast browsing and filtering.
 */
export const stalkerChannels = sqliteTable(
	'stalker_channels',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		accountId: text('account_id')
			.notNull()
			.references(() => stalkerAccounts.id, { onDelete: 'cascade' }),
		stalkerId: text('stalker_id').notNull(), // Original ID from portal
		name: text('name').notNull(),
		number: text('number'), // Channel number (string for flexibility)
		logo: text('logo'), // Logo URL
		categoryId: text('category_id').references(() => stalkerCategories.id, {
			onDelete: 'set null'
		}),
		stalkerGenreId: text('stalker_genre_id'), // Original genre ID from portal (for reference)
		cmd: text('cmd').notNull(), // Stream command (required for playback)
		tvArchive: integer('tv_archive', { mode: 'boolean' }).default(false),
		archiveDuration: integer('archive_duration').default(0), // Days of archive

		// Timestamps
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_stalker_channels_account').on(table.accountId),
		index('idx_stalker_channels_category').on(table.categoryId),
		index('idx_stalker_channels_name').on(table.name),
		uniqueIndex('idx_stalker_channels_unique').on(table.accountId, table.stalkerId)
	]
);

export type StalkerChannelRecord = typeof stalkerChannels.$inferSelect;
export type NewStalkerChannelRecord = typeof stalkerChannels.$inferInsert;

// ============================================================================
// LIVE TV - USER CHANNEL CATEGORIES
// ============================================================================

/**
 * Channel Categories - User-defined categories for organizing their channel lineup.
 * Separate from portal categories - allows custom organization.
 */
export const channelCategories = sqliteTable(
	'channel_categories',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		name: text('name').notNull(),
		position: integer('position').notNull(),
		color: text('color'), // Hex color for UI badge
		icon: text('icon'), // Lucide icon name
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [index('idx_channel_categories_position').on(table.position)]
);

export type ChannelCategoryRecord = typeof channelCategories.$inferSelect;
export type NewChannelCategoryRecord = typeof channelCategories.$inferInsert;

// ============================================================================
// LIVE TV - USER CHANNEL LINEUP
// ============================================================================

/**
 * Channel Lineup Items - User's custom channel lineup for Live TV.
 * Stores references to cached channels with custom ordering and overrides.
 */
export const channelLineupItems = sqliteTable(
	'channel_lineup_items',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// Reference to the source account
		accountId: text('account_id')
			.notNull()
			.references(() => stalkerAccounts.id, { onDelete: 'cascade' }),
		// Reference to the cached channel
		channelId: text('channel_id')
			.notNull()
			.references(() => stalkerChannels.id, { onDelete: 'cascade' }),
		// Position in the lineup (1-based, for drag-to-reorder)
		position: integer('position').notNull(),
		// Custom channel number for EPG/remote control
		channelNumber: integer('channel_number'),
		// User customizations (override cached values when set)
		customName: text('custom_name'),
		customLogo: text('custom_logo'),
		epgId: text('epg_id'), // XMLTV EPG ID for Jellyfin/Plex matching
		// EPG source override - use EPG data from a different channel
		epgSourceChannelId: text('epg_source_channel_id').references(() => stalkerChannels.id, {
			onDelete: 'set null'
		}),
		// User-created category (separate from portal category)
		categoryId: text('category_id').references(() => channelCategories.id, {
			onDelete: 'set null'
		}),
		addedAt: text('added_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		uniqueIndex('idx_lineup_account_channel').on(table.accountId, table.channelId),
		index('idx_lineup_position').on(table.position),
		index('idx_lineup_account').on(table.accountId),
		index('idx_lineup_category').on(table.categoryId)
	]
);

export type ChannelLineupItemRecord = typeof channelLineupItems.$inferSelect;
export type NewChannelLineupItemRecord = typeof channelLineupItems.$inferInsert;

// ============================================================================
// LIVE TV - CHANNEL LINEUP BACKUPS
// ============================================================================

/**
 * Channel Lineup Backups - Alternative channel sources for failover.
 * Each lineup item can have multiple backup links from any synced account.
 * When the primary source fails, the system can try backups in priority order.
 */
export const channelLineupBackups = sqliteTable(
	'channel_lineup_backups',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// Reference to the lineup item this backup belongs to
		lineupItemId: text('lineup_item_id')
			.notNull()
			.references(() => channelLineupItems.id, { onDelete: 'cascade' }),
		// Reference to the backup source account (can be different from primary)
		accountId: text('account_id')
			.notNull()
			.references(() => stalkerAccounts.id, { onDelete: 'cascade' }),
		// Reference to the backup channel
		channelId: text('channel_id')
			.notNull()
			.references(() => stalkerChannels.id, { onDelete: 'cascade' }),
		// Priority order (1 = first backup, 2 = second, etc.)
		priority: integer('priority').notNull(),
		createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_lineup_backups_item').on(table.lineupItemId),
		index('idx_lineup_backups_priority').on(table.lineupItemId, table.priority),
		uniqueIndex('idx_lineup_backups_unique').on(table.lineupItemId, table.channelId)
	]
);

export type ChannelLineupBackupRecord = typeof channelLineupBackups.$inferSelect;
export type NewChannelLineupBackupRecord = typeof channelLineupBackups.$inferInsert;

// ============================================================================
// LIVE TV - EPG (Electronic Program Guide)
// ============================================================================

/**
 * EPG Programs - Stores program guide data fetched from Stalker portal accounts.
 * Linked to channels for now/next and guide queries.
 */
export const epgPrograms = sqliteTable(
	'epg_programs',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		// Reference to the cached channel
		channelId: text('channel_id')
			.notNull()
			.references(() => stalkerChannels.id, { onDelete: 'cascade' }),
		// Original Stalker channel ID (for API matching during sync)
		stalkerChannelId: text('stalker_channel_id').notNull(),
		// Reference to the source account
		accountId: text('account_id')
			.notNull()
			.references(() => stalkerAccounts.id, { onDelete: 'cascade' }),
		// Program metadata
		title: text('title').notNull(),
		description: text('description'),
		category: text('category'),
		director: text('director'),
		actor: text('actor'),
		// Timing (ISO 8601 strings)
		startTime: text('start_time').notNull(),
		endTime: text('end_time').notNull(),
		// Duration in seconds
		duration: integer('duration').notNull(),
		// Archive availability
		hasArchive: integer('has_archive', { mode: 'boolean' }).default(false),
		// Timestamps
		cachedAt: text('cached_at').$defaultFn(() => new Date().toISOString()),
		updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		index('idx_epg_programs_channel').on(table.channelId),
		index('idx_epg_programs_channel_time').on(table.channelId, table.startTime),
		index('idx_epg_programs_account').on(table.accountId),
		index('idx_epg_programs_end').on(table.endTime),
		// Unique constraint: one program per channel per start time per account
		uniqueIndex('idx_epg_programs_unique').on(
			table.accountId,
			table.stalkerChannelId,
			table.startTime
		)
	]
);

export type EpgProgramRecord = typeof epgPrograms.$inferSelect;
export type NewEpgProgramRecord = typeof epgPrograms.$inferInsert;

// ============================================================================
// LIVE TV - RELATIONS
// ============================================================================

/**
 * Channel Categories Relations
 */
export const channelCategoriesRelations = relations(channelCategories, ({ many }) => ({
	lineupItems: many(channelLineupItems)
}));

/**
 * Channel Lineup Items Relations
 */
export const channelLineupItemsRelations = relations(channelLineupItems, ({ one, many }) => ({
	account: one(stalkerAccounts, {
		fields: [channelLineupItems.accountId],
		references: [stalkerAccounts.id]
	}),
	channel: one(stalkerChannels, {
		fields: [channelLineupItems.channelId],
		references: [stalkerChannels.id]
	}),
	category: one(channelCategories, {
		fields: [channelLineupItems.categoryId],
		references: [channelCategories.id]
	}),
	backups: many(channelLineupBackups)
}));

/**
 * Channel Lineup Backups Relations
 */
export const channelLineupBackupsRelations = relations(channelLineupBackups, ({ one }) => ({
	lineupItem: one(channelLineupItems, {
		fields: [channelLineupBackups.lineupItemId],
		references: [channelLineupItems.id]
	}),
	account: one(stalkerAccounts, {
		fields: [channelLineupBackups.accountId],
		references: [stalkerAccounts.id]
	}),
	channel: one(stalkerChannels, {
		fields: [channelLineupBackups.channelId],
		references: [stalkerChannels.id]
	})
}));

/**
 * EPG Programs Relations
 */
export const epgProgramsRelations = relations(epgPrograms, ({ one }) => ({
	channel: one(stalkerChannels, {
		fields: [epgPrograms.channelId],
		references: [stalkerChannels.id]
	}),
	account: one(stalkerAccounts, {
		fields: [epgPrograms.accountId],
		references: [stalkerAccounts.id]
	})
}));
