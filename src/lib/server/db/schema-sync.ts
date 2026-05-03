/**
 * Embedded Schema Synchronization
 *
 * This module handles database schema management without external migration files.
 * Similar to Radarr/Sonarr's approach - all schema definitions are embedded in code.
 *
 * On startup:
 * 1. Ensures all tables exist (CREATE TABLE IF NOT EXISTS)
 * 2. Checks schema version and applies incremental updates if needed
 * 3. Creates indexes for performance
 */

import Database from 'better-sqlite3';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'system' as const });
// Import extracted migrations and helpers
import { MIGRATIONS } from './migrations/index.js';
import {
	createBetterAuthIndexes,
	hasLegacyLiveTvSchema,
	cleanupLiveTvTables,
	setSchemaVersion,
	getAppliedMigrations,
	backfillMigrationRecords,
	detectAndFixSchemaDrift,
	verifySchemaIntegrity,
	applyMigration,
	BETTER_AUTH_TABLE_DEFINITIONS
} from './migration-helpers.js';
/**
 * Current schema version - increment when adding schema changes
 * Version 1: Initial complete schema
 * Version 2: Added profile_size_limits, custom_formats, naming_presets tables
 * Version 3: Added read_only column to root_folders for virtual mount support (NZBDav)
 * Version 4: Fix invalid scoring profile references and ensure default profile exists
 * Version 5: Added preserve_symlinks column to root_folders for NZBDav/rclone symlink preservation
 * Version 6: Added nntp_servers and nzb_stream_mounts tables for NZB streaming
 * Version 7: Added streamability, extraction columns to nzb_stream_mounts for compressed archive support
 * Version 8: Fixed nzb_stream_mounts status CHECK constraint to include all extraction states
 * Version 9: Remove deprecated qualityPresets system in favor of scoringProfiles
 * Version 10: Flag series with broken episode metadata for automatic repair
 * Version 11: Added temp path columns to download_clients for SABnzbd dual folder support
 * Version 12: Added media_browser_servers table for Jellyfin/Emby integration
 * Version 13: Removed Live TV feature
 * Version 14: Added new Live TV feature (external API-based)
 * Version 15: Removed Live TV EPG cache (unused - API does not provide EPG)
 * Version 16: Added Live TV stream health tracking table
 * Version 17: Added Live TV EPG with XMLTV support (sources, channel mapping, programs)
 * Version 18: Added EPG performance optimization indexes
 * Version 19: Added EPG search optimization indexes (composite source+name, xmltv lookups)
 * Version 20: Added DaddyHD provider support (provider column on channels cache)
 * Version 21: Added cached_server column to livetv_channels_cache for DaddyHD server caching
 * Version 22: Removed all Live TV tables (feature rewrite)
 * Version 23: Added stalker_accounts table for Live TV Stalker Portal support
 * Version 24: Added stalker_categories and stalker_channels tables for channel caching
 * Version 25: Added channel_categories and channel_lineup_items tables for user lineup management
 * Version 26: Added epg_programs table for storing EPG data from Stalker portals
 * Version 27: Added channel_lineup_backups table for backup channel sources
 * Version 28: Dropped old live_tv_settings table (replaced by EPG scheduler settings)
 * Version 29: Clean break migration - drops all orphaned Live TV tables from intermediate rewrites
 * Version 30: Add device parameters to stalker_accounts for proper Stalker protocol support
 * Version 31: Add portal scanner tables (stalker_portals, portal_scan_results, portal_scan_history)
 * Version 32: Add EPG tracking columns to stalker_accounts for visibility and sync status
 * Version 33: Add EPG source override column to channel_lineup_items
 * Version 34: Add url_base column to download_clients
 * Version 35: Add mount_mode column to download_clients
 * Version 36: Add nzb_segment_cache table for persistent prefetched segments
 * Version 37: Add stream_url_type column to stalker_accounts for tracking URL resolution method
 * Version 38: Add alternate_titles table for multi-title search support
 * Version 39: Add release_group column to download_queue and download_history
 * Version 40: Add captcha_solver_settings table for anti-bot configuration
 * Version 41: Add default_monitored to root_folders for unmonitor-by-default on scan (Issue #81)
 * Version 42: Add activities table for unified activity tracking
 * Version 43: Add activity_details table for granular activity logging
 * Version 44: Add list_metadata table for external list synchronization tracking
 * Version 45: Add smart_lists table for dynamic content lists
 * Version 46: Add activities and activity_details tables for unified activity tracking
 * Version 47: Add task_settings table for per-task configuration with migration from monitoring_settings
 * Version 48: Dedupe episode_files and enforce unique series/path constraint
 * Version 49: Backfill orphaned download_history imported/streaming rows to removed status
 * Version 50: Fresh start for Live TV with multi-provider support (Stalker, XStream, M3U)
 * Version 51: Fix channel lineup foreign key references
 * Version 52: Fix epg_programs table schema for multi-provider support
 * Version 53: Add iptv_org_config column to livetv_accounts for IPTV-Org provider support
 * Version 54: Add cookies and cookies_expiration_date columns to indexer_status for persistent session storage
 * Version 55: Add health tracking columns to download_clients
 * Version 56: Reserved - retired during Better Auth schema refactor
 * Version 57: Reserved - retired during Better Auth schema refactor
 * Version 58: Reserved - retired during Better Auth schema refactor
 * Version 59: Reserved - retired during Better Auth schema refactor
 * Version 60: Add user_api_key_secrets table for encrypted API key storage
 * Version 61: Rename Live TV API Key to Media Streaming API Key
 * Version 62: Add role column to user table for RBAC
 * Version 63: Repair Better Auth schema drift and add missing plugin tables
 * Version 64: Promote the sole bootstrap user to admin if older auth code created it as user
 * Version 65: Migrate Better Auth apikey schema from userId -> referenceId and add configId
 * Version 66: Fix apikey schema migration for databases stuck after v65
 * Version 67: Add Better Auth rateLimit.id column required by adapter-generated IDs
 * Version 68: Add edition column to episode_files for rename preservation
 * Version 69: Add indexes on download_history for activity query performance
 * Version 70: Drop unused activities scaffolding tables (activities, activity_details)
 * Version 71: Add download_queue_tombstones table for local-removal suppression window
 * Version 72: Add adaptive subtitle searching columns for movies and episodes
 * Version 73: Allow Plex in media_browser_servers server_type constraint
 * Version 74: Consolidate legacy nzb-mount clients into sabnzbd mount mode
 * Version 75: Add language column to user table for UI localization preference
 * Version 76: Add media_sub_type to root_folders for anime library routing
 * Version 77: Add first-class libraries table with media library linkage
 * Version 78: Backfill existing movies and series to seeded system libraries
 * Version 79: Migrate custom format audio conditions to canonical audio schema
 * Version 80: Built-in profile score overrides table
 * Version 81: Unify scoring profile architecture - add isBuiltIn, min/max resolution, source columns
 * Version 82: Add media server sync tables
 * Version 83: Add movie collection columns
 * Version 84: Add release_date to movies and first_air_date to series
 */
export const CURRENT_SCHEMA_VERSION = 84;

export const SYSTEM_LIBRARY_SEEDS = [
	{
		id: 'lib-movies-standard',
		slug: 'movies',
		sortOrder: 0,
		mediaType: 'movie',
		mediaSubType: 'standard',
		systemKey: 'movies_standard'
	},
	{
		id: 'lib-movies-anime',
		slug: 'anime-movies',
		sortOrder: 10,
		mediaType: 'movie',
		mediaSubType: 'anime',
		systemKey: 'movies_anime'
	},
	{
		id: 'lib-tv-standard',
		slug: 'tv-shows',
		sortOrder: 0,
		mediaType: 'tv',
		mediaSubType: 'standard',
		systemKey: 'tv_standard'
	},
	{
		id: 'lib-tv-anime',
		slug: 'anime-series',
		sortOrder: 10,
		mediaType: 'tv',
		mediaSubType: 'anime',
		systemKey: 'tv_anime'
	}
] as const;

const TABLE_DEFINITIONS: string[] = [
	// Core tables (no foreign keys)

	// Better Auth tables - we manage these to have full control over schema
	// Better Auth expects camelCase column names
	...BETTER_AUTH_TABLE_DEFINITIONS.map(({ sql }) => sql),

	`CREATE TABLE IF NOT EXISTS "settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
	)`,

	// Migration tracking table - tracks each migration individually
	`CREATE TABLE IF NOT EXISTS "schema_migrations" (
		"version" integer PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"checksum" text NOT NULL,
		"applied_at" text NOT NULL,
		"execution_time_ms" integer,
		"success" integer DEFAULT 1
	)`,

	`CREATE TABLE IF NOT EXISTS "indexer_definitions" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"description" text,
		"protocol" text NOT NULL CHECK ("protocol" IN ('torrent', 'usenet', 'streaming')),
		"type" text NOT NULL CHECK ("type" IN ('public', 'semi-private', 'private')),
		"language" text DEFAULT 'en-US',
		"urls" text NOT NULL,
		"legacy_urls" text,
		"settings_schema" text,
		"capabilities" text NOT NULL,
		"file_path" text,
		"file_hash" text,
		"loaded_at" text NOT NULL,
		"updated_at" text NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS "scoring_profiles" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"description" text,
		"tags" text,
		"upgrades_allowed" integer DEFAULT true,
		"min_score" integer DEFAULT 0,
		"upgrade_until_score" integer DEFAULT -1,
		"min_score_increment" integer DEFAULT 0,
		"resolution_order" text,
		"format_scores" text,
		"allowed_protocols" text,
		"is_default" integer DEFAULT false,
		"movie_min_size_gb" real,
		"movie_max_size_gb" real,
		"episode_min_size_mb" real,
		"episode_max_size_mb" real,
		"is_built_in" integer DEFAULT 0,
		"min_resolution" text,
		"max_resolution" text,
		"allowed_sources" text,
		"excluded_sources" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "profile_size_limits" (
		"profile_id" text PRIMARY KEY NOT NULL,
		"movie_min_size_gb" real,
		"movie_max_size_gb" real,
		"episode_min_size_mb" real,
		"episode_max_size_mb" real,
		"is_default" integer DEFAULT false,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "custom_formats" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"description" text,
		"category" text NOT NULL DEFAULT 'other',
		"tags" text,
		"conditions" text,
		"enabled" integer DEFAULT true,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "external_id_cache" (
		"tmdb_id" integer NOT NULL,
		"media_type" text NOT NULL,
		"imdb_id" text,
		"tvdb_id" integer,
		"cached_at" text,
		PRIMARY KEY ("tmdb_id", "media_type")
	)`,

	`CREATE TABLE IF NOT EXISTS "download_clients" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"implementation" text NOT NULL,
		"enabled" integer DEFAULT true,
		"host" text NOT NULL,
		"port" integer NOT NULL,
		"use_ssl" integer DEFAULT false,
		"username" text,
		"password" text,
		"url_base" text,
		"mount_mode" text,
		"movie_category" text DEFAULT 'movies',
		"tv_category" text DEFAULT 'tv',
		"recent_priority" text DEFAULT 'normal',
		"older_priority" text DEFAULT 'normal',
		"initial_state" text DEFAULT 'start',
		"seed_ratio_limit" text,
		"seed_time_limit" integer,
		"download_path_local" text,
		"download_path_remote" text,
		"temp_path_local" text,
		"temp_path_remote" text,
		"priority" integer DEFAULT 1,
		"health" text DEFAULT 'healthy',
		"consecutive_failures" integer DEFAULT 0,
		"last_success" text,
		"last_failure" text,
		"last_failure_message" text,
		"last_checked_at" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "root_folders" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"path" text NOT NULL UNIQUE,
		"media_type" text NOT NULL,
		"media_sub_type" text DEFAULT 'standard' NOT NULL,
		"is_default" integer DEFAULT false,
		"read_only" integer DEFAULT false,
		"preserve_symlinks" integer DEFAULT false,
		"default_monitored" integer DEFAULT true,
		"free_space_bytes" integer,
		"last_checked_at" text,
		"created_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "libraries" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"slug" text NOT NULL UNIQUE,
		"media_type" text NOT NULL CHECK ("media_type" IN ('movie', 'tv')),
		"media_sub_type" text DEFAULT 'custom' NOT NULL CHECK ("media_sub_type" IN ('standard', 'anime', 'custom')),
		"is_system" integer DEFAULT false NOT NULL,
		"system_key" text UNIQUE,
		"is_default" integer DEFAULT false NOT NULL,
		"default_root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
		"default_monitored" integer DEFAULT true NOT NULL,
		"default_search_on_add" integer DEFAULT true NOT NULL,
		"default_wants_subtitles" integer DEFAULT true NOT NULL,
		"sort_order" integer DEFAULT 0 NOT NULL,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "library_root_folders" (
		"library_id" text NOT NULL REFERENCES "libraries"("id") ON DELETE CASCADE,
		"root_folder_id" text NOT NULL REFERENCES "root_folders"("id") ON DELETE CASCADE,
		"is_default" integer DEFAULT false NOT NULL,
		"created_at" text,
		PRIMARY KEY ("library_id", "root_folder_id")
	)`,

	`CREATE TABLE IF NOT EXISTS "language_profiles" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"languages" text NOT NULL,
		"cutoff_index" integer DEFAULT 0,
		"upgrades_allowed" integer DEFAULT true,
		"minimum_score" integer DEFAULT 60,
		"is_default" integer DEFAULT false,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "delay_profiles" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"sort_order" integer DEFAULT 0 NOT NULL,
		"enabled" integer DEFAULT true,
		"usenet_delay" integer DEFAULT 0 NOT NULL,
		"torrent_delay" integer DEFAULT 0 NOT NULL,
		"quality_delays" text,
		"preferred_protocol" text,
		"tags" text,
		"bypass_if_highest_quality" integer DEFAULT true,
		"bypass_if_above_score" integer,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "subtitle_providers" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"implementation" text NOT NULL,
		"enabled" integer DEFAULT true,
		"priority" integer DEFAULT 25,
		"api_key" text,
		"username" text,
		"password" text,
		"settings" text,
		"requests_per_minute" integer DEFAULT 60,
		"last_error" text,
		"last_error_at" text,
		"consecutive_failures" integer DEFAULT 0,
		"throttled_until" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "library_settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS "naming_settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS "naming_presets" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"description" text,
		"config" text NOT NULL,
		"is_built_in" integer DEFAULT false,
		"created_at" integer
	)`,

	`CREATE TABLE IF NOT EXISTS "monitoring_settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS "captcha_solver_settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS "subtitle_settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
	)`,

	`CREATE TABLE IF NOT EXISTS "task_history" (
		"id" text PRIMARY KEY NOT NULL,
		"task_id" text NOT NULL,
		"status" text NOT NULL,
		"results" text,
		"errors" text,
		"started_at" text,
		"completed_at" text
	)`,

	// Task Settings - stores per-task configuration (enabled, intervals, etc.)
	`CREATE TABLE IF NOT EXISTS "task_settings" (
		"id" text PRIMARY KEY NOT NULL,
		"enabled" integer DEFAULT 1 NOT NULL,
		"interval_hours" real,
		"min_interval_hours" real DEFAULT 0.25 NOT NULL,
		"last_run_at" text,
		"next_run_at" text,
		"created_at" text,
		"updated_at" text
	)`,

	// Tables with foreign keys to root_folders, scoring_profiles, quality_presets
	`CREATE TABLE IF NOT EXISTS "indexers" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"definition_id" text NOT NULL,
		"enabled" integer DEFAULT true,
		"base_url" text NOT NULL,
		"alternate_urls" text,
		"priority" integer DEFAULT 25,
		"enable_automatic_search" integer DEFAULT true,
		"enable_interactive_search" integer DEFAULT true,
		"settings" text,
		"protocol_settings" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "indexer_status" (
		"indexer_id" text PRIMARY KEY NOT NULL REFERENCES "indexers"("id") ON DELETE CASCADE,
		"health" text DEFAULT 'healthy' NOT NULL CHECK ("health" IN ('healthy', 'warning', 'failing', 'disabled')),
		"consecutive_failures" integer DEFAULT 0 NOT NULL,
		"total_requests" integer DEFAULT 0 NOT NULL,
		"total_failures" integer DEFAULT 0 NOT NULL,
		"is_disabled" integer DEFAULT false NOT NULL,
		"disabled_at" text,
		"disabled_until" text,
		"last_success" text,
		"last_failure" text,
		"last_error_message" text,
		"avg_response_time" integer,
		"recent_failures" text DEFAULT '[]',
		"cookies" text,
		"cookies_expiration_date" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "movies" (
		"id" text PRIMARY KEY NOT NULL,
		"tmdb_id" integer NOT NULL UNIQUE,
		"imdb_id" text,
		"title" text NOT NULL,
		"original_title" text,
		"year" integer,
		"overview" text,
		"poster_path" text,
		"backdrop_path" text,
		"runtime" integer,
		"genres" text,
		"path" text NOT NULL,
		"library_id" text REFERENCES "libraries"("id") ON DELETE SET NULL,
		"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
		"scoring_profile_id" text REFERENCES "scoring_profiles"("id") ON DELETE SET NULL,
		"language_profile_id" text,
		"monitored" integer DEFAULT true,
		"minimum_availability" text DEFAULT 'released',
		"added" text,
		"has_file" integer DEFAULT false,
		"wants_subtitles" integer DEFAULT true,
		"last_search_time" text,
		"failed_subtitle_attempts" integer DEFAULT 0,
		"first_subtitle_search_at" text,
		"tmdb_collection_id" integer,
		"collection_name" text,
		"release_date" text
	)`,

	`CREATE TABLE IF NOT EXISTS "movie_files" (
		"id" text PRIMARY KEY NOT NULL,
		"movie_id" text NOT NULL REFERENCES "movies"("id") ON DELETE CASCADE,
		"relative_path" text NOT NULL,
		"size" integer,
		"date_added" text,
		"scene_name" text,
		"release_group" text,
		"quality" text,
		"media_info" text,
		"edition" text,
		"languages" text,
		"info_hash" text
	)`,

	`CREATE TABLE IF NOT EXISTS "series" (
		"id" text PRIMARY KEY NOT NULL,
		"tmdb_id" integer NOT NULL UNIQUE,
		"tvdb_id" integer,
		"imdb_id" text,
		"title" text NOT NULL,
		"original_title" text,
		"year" integer,
		"overview" text,
		"poster_path" text,
		"backdrop_path" text,
		"status" text,
		"network" text,
		"genres" text,
		"path" text NOT NULL,
		"library_id" text REFERENCES "libraries"("id") ON DELETE SET NULL,
		"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
		"scoring_profile_id" text REFERENCES "scoring_profiles"("id") ON DELETE SET NULL,
		"language_profile_id" text,
		"monitored" integer DEFAULT true,
		"monitor_new_items" text DEFAULT 'all',
		"monitor_specials" integer DEFAULT false,
		"season_folder" integer DEFAULT true,
		"series_type" text DEFAULT 'standard',
		"added" text,
		"episode_count" integer DEFAULT 0,
		"episode_file_count" integer DEFAULT 0,
		"wants_subtitles" integer DEFAULT true,
		"first_air_date" text
	)`,

	`CREATE TABLE IF NOT EXISTS "seasons" (
		"id" text PRIMARY KEY NOT NULL,
		"series_id" text NOT NULL REFERENCES "series"("id") ON DELETE CASCADE,
		"season_number" integer NOT NULL,
		"monitored" integer DEFAULT true,
		"name" text,
		"overview" text,
		"poster_path" text,
		"air_date" text,
		"episode_count" integer DEFAULT 0,
		"episode_file_count" integer DEFAULT 0
	)`,

	`CREATE TABLE IF NOT EXISTS "episodes" (
		"id" text PRIMARY KEY NOT NULL,
		"series_id" text NOT NULL REFERENCES "series"("id") ON DELETE CASCADE,
		"season_id" text REFERENCES "seasons"("id") ON DELETE SET NULL,
		"tmdb_id" integer,
		"tvdb_id" integer,
		"season_number" integer NOT NULL,
		"episode_number" integer NOT NULL,
		"absolute_episode_number" integer,
		"title" text,
		"overview" text,
		"air_date" text,
		"runtime" integer,
		"monitored" integer DEFAULT true,
		"has_file" integer DEFAULT false,
		"wants_subtitles_override" integer,
		"last_search_time" text
	)`,

	`CREATE TABLE IF NOT EXISTS "episode_files" (
		"id" text PRIMARY KEY NOT NULL,
		"series_id" text NOT NULL REFERENCES "series"("id") ON DELETE CASCADE,
		"season_number" integer NOT NULL,
		"episode_ids" text,
		"relative_path" text NOT NULL,
		"size" integer,
		"date_added" text,
		"scene_name" text,
		"release_group" text,
		"edition" text,
		"release_type" text,
		"quality" text,
		"media_info" text,
		"languages" text,
		"info_hash" text
	)`,

	`CREATE TABLE IF NOT EXISTS "alternate_titles" (
		"id" integer PRIMARY KEY AUTOINCREMENT,
		"media_type" text NOT NULL CHECK ("media_type" IN ('movie', 'series')),
		"media_id" text NOT NULL,
		"title" text NOT NULL,
		"clean_title" text NOT NULL,
		"source" text NOT NULL CHECK ("source" IN ('tmdb', 'user')),
		"language" text,
		"country" text,
		"created_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "unmatched_files" (
		"id" text PRIMARY KEY NOT NULL,
		"path" text NOT NULL UNIQUE,
		"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE CASCADE,
		"media_type" text NOT NULL,
		"size" integer,
		"parsed_title" text,
		"parsed_year" integer,
		"parsed_season" integer,
		"parsed_episode" integer,
		"suggested_matches" text,
		"reason" text,
		"discovered_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "library_scan_history" (
		"id" text PRIMARY KEY NOT NULL,
		"scan_type" text NOT NULL,
		"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
		"status" text NOT NULL,
		"started_at" text,
		"completed_at" text,
		"files_scanned" integer DEFAULT 0,
		"files_added" integer DEFAULT 0,
		"files_updated" integer DEFAULT 0,
		"files_removed" integer DEFAULT 0,
		"unmatched_files" integer DEFAULT 0,
		"error_message" text
	)`,

	`CREATE TABLE IF NOT EXISTS "download_queue" (
		"id" text PRIMARY KEY NOT NULL,
		"download_client_id" text NOT NULL REFERENCES "download_clients"("id") ON DELETE CASCADE,
		"download_id" text NOT NULL,
		"info_hash" text,
		"title" text NOT NULL,
		"indexer_id" text,
		"indexer_name" text,
		"download_url" text,
		"magnet_url" text,
		"protocol" text DEFAULT 'torrent' NOT NULL,
		"movie_id" text REFERENCES "movies"("id") ON DELETE SET NULL,
		"series_id" text REFERENCES "series"("id") ON DELETE SET NULL,
		"episode_ids" text,
		"season_number" integer,
		"status" text DEFAULT 'queued' NOT NULL,
		"progress" text DEFAULT '0',
		"size" integer,
		"download_speed" integer DEFAULT 0,
		"upload_speed" integer DEFAULT 0,
		"eta" integer,
		"ratio" text DEFAULT '0',
		"client_download_path" text,
		"output_path" text,
		"imported_path" text,
		"quality" text,
		"added_at" text,
		"started_at" text,
		"completed_at" text,
		"imported_at" text,
		"error_message" text,
		"import_attempts" integer DEFAULT 0,
		"last_attempt_at" text,
		"is_automatic" integer DEFAULT false,
		"is_upgrade" integer DEFAULT false
	)`,

	`CREATE TABLE IF NOT EXISTS "download_queue_tombstones" (
		"id" text PRIMARY KEY NOT NULL,
		"download_client_id" text NOT NULL REFERENCES "download_clients"("id") ON DELETE CASCADE,
		"protocol" text DEFAULT 'torrent' NOT NULL,
		"remote_id" text NOT NULL,
		"reason" text,
		"suppressed_until" text NOT NULL,
		"last_seen_at" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "download_history" (
		"id" text PRIMARY KEY NOT NULL,
		"download_client_id" text,
		"download_client_name" text,
		"download_id" text,
		"title" text NOT NULL,
		"indexer_id" text,
		"indexer_name" text,
		"protocol" text,
		"movie_id" text REFERENCES "movies"("id") ON DELETE SET NULL,
		"series_id" text REFERENCES "series"("id") ON DELETE SET NULL,
		"episode_ids" text,
		"season_number" integer,
		"status" text NOT NULL,
		"status_reason" text,
		"size" integer,
		"download_time_seconds" integer,
		"final_ratio" text,
		"quality" text,
		"imported_path" text,
		"movie_file_id" text REFERENCES "movie_files"("id") ON DELETE SET NULL,
		"episode_file_ids" text,
		"grabbed_at" text,
		"completed_at" text,
		"imported_at" text,
		"created_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "blocklist" (
		"id" text PRIMARY KEY NOT NULL,
		"title" text NOT NULL,
		"info_hash" text,
		"indexer_id" text REFERENCES "indexers"("id") ON DELETE SET NULL,
		"movie_id" text REFERENCES "movies"("id") ON DELETE CASCADE,
		"series_id" text REFERENCES "series"("id") ON DELETE CASCADE,
		"episode_ids" text,
		"reason" text NOT NULL,
		"message" text,
		"source_title" text,
		"quality" text,
		"size" integer,
		"protocol" text,
		"created_at" text,
		"expires_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "pending_releases" (
		"id" text PRIMARY KEY NOT NULL,
		"title" text NOT NULL,
		"info_hash" text,
		"indexer_id" text REFERENCES "indexers"("id") ON DELETE SET NULL,
		"download_url" text,
		"magnet_url" text,
		"movie_id" text REFERENCES "movies"("id") ON DELETE CASCADE,
		"series_id" text REFERENCES "series"("id") ON DELETE CASCADE,
		"episode_ids" text,
		"score" integer NOT NULL,
		"size" integer,
		"protocol" text NOT NULL,
		"quality" text,
		"delay_profile_id" text REFERENCES "delay_profiles"("id") ON DELETE SET NULL,
		"added_at" text,
		"process_at" text NOT NULL,
		"status" text DEFAULT 'pending' NOT NULL,
		"superseded_by" text
	)`,

	`CREATE TABLE IF NOT EXISTS "monitoring_history" (
		"id" text PRIMARY KEY NOT NULL,
		"task_history_id" text REFERENCES "task_history"("id") ON DELETE CASCADE,
		"task_type" text NOT NULL,
		"movie_id" text REFERENCES "movies"("id") ON DELETE CASCADE,
		"series_id" text REFERENCES "series"("id") ON DELETE CASCADE,
		"season_number" integer,
		"episode_id" text REFERENCES "episodes"("id") ON DELETE CASCADE,
		"status" text NOT NULL,
		"releases_found" integer DEFAULT 0,
		"release_grabbed" text,
		"queue_item_id" text,
		"is_upgrade" integer DEFAULT false,
		"old_score" integer,
		"new_score" integer,
		"executed_at" text,
		"error_message" text
	)`,

	`CREATE TABLE IF NOT EXISTS "subtitles" (
		"id" text PRIMARY KEY NOT NULL,
		"movie_id" text REFERENCES "movies"("id") ON DELETE CASCADE,
		"episode_id" text REFERENCES "episodes"("id") ON DELETE CASCADE,
		"relative_path" text NOT NULL,
		"language" text NOT NULL,
		"is_forced" integer DEFAULT false,
		"is_hearing_impaired" integer DEFAULT false,
		"format" text NOT NULL,
		"provider_id" text REFERENCES "subtitle_providers"("id") ON DELETE SET NULL,
		"provider_subtitle_id" text,
		"match_score" integer,
		"is_hash_match" integer DEFAULT false,
		"size" integer,
		"sync_offset" integer DEFAULT 0,
		"was_synced" integer DEFAULT false,
		"date_added" text
	)`,

	`CREATE TABLE IF NOT EXISTS "subtitle_history" (
		"id" text PRIMARY KEY NOT NULL,
		"movie_id" text REFERENCES "movies"("id") ON DELETE SET NULL,
		"episode_id" text REFERENCES "episodes"("id") ON DELETE SET NULL,
		"action" text NOT NULL,
		"language" text NOT NULL,
		"provider_id" text,
		"provider_name" text,
		"provider_subtitle_id" text,
		"match_score" integer,
		"was_hash_match" integer DEFAULT false,
		"replaced_subtitle_id" text,
		"error_message" text,
		"created_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "subtitle_blacklist" (
		"id" text PRIMARY KEY NOT NULL,
		"movie_id" text REFERENCES "movies"("id") ON DELETE CASCADE,
		"episode_id" text REFERENCES "episodes"("id") ON DELETE CASCADE,
		"provider_id" text REFERENCES "subtitle_providers"("id") ON DELETE CASCADE,
		"provider_subtitle_id" text NOT NULL,
		"reason" text,
		"language" text NOT NULL,
		"created_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "smart_lists" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"description" text,
		"media_type" text NOT NULL CHECK ("media_type" IN ('movie', 'tv')),
		"enabled" integer DEFAULT true,
		"filters" text NOT NULL,
		"sort_by" text DEFAULT 'popularity.desc',
		"item_limit" integer DEFAULT 100 NOT NULL,
		"exclude_in_library" integer DEFAULT true,
		"show_upgradeable_only" integer DEFAULT false,
		"excluded_tmdb_ids" text DEFAULT '[]',
		"scoring_profile_id" text REFERENCES "scoring_profiles"("id") ON DELETE SET NULL,
		"auto_add_behavior" text DEFAULT 'disabled' CHECK ("auto_add_behavior" IN ('disabled', 'add_only', 'add_and_search')),
		"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
		"auto_add_monitored" integer DEFAULT true,
		"minimum_availability" text DEFAULT 'released',
		"wants_subtitles" integer DEFAULT true,
		"language_profile_id" text,
		"refresh_interval_hours" integer DEFAULT 24 NOT NULL,
		"last_refresh_time" text,
		"last_refresh_status" text,
		"last_refresh_error" text,
		"next_refresh_time" text,
		"cached_item_count" integer DEFAULT 0,
		"items_in_library" integer DEFAULT 0,
		"items_auto_added" integer DEFAULT 0,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "smart_list_items" (
		"id" text PRIMARY KEY NOT NULL,
		"smart_list_id" text NOT NULL REFERENCES "smart_lists"("id") ON DELETE CASCADE,
		"media_type" text NOT NULL CHECK ("media_type" IN ('movie', 'tv')),
		"tmdb_id" integer NOT NULL,
		"title" text NOT NULL,
		"original_title" text,
		"overview" text,
		"poster_path" text,
		"backdrop_path" text,
		"release_date" text,
		"year" integer,
		"vote_average" text,
		"vote_count" integer,
		"popularity" text,
		"genre_ids" text,
		"original_language" text,
		"movie_id" text REFERENCES "movies"("id") ON DELETE SET NULL,
		"series_id" text REFERENCES "series"("id") ON DELETE SET NULL,
		"in_library" integer DEFAULT false,
		"was_auto_added" integer DEFAULT false,
		"auto_added_at" text,
		"position" integer NOT NULL,
		"is_excluded" integer DEFAULT false,
		"excluded_at" text,
		"first_seen_at" text,
		"last_seen_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "smart_list_refresh_history" (
		"id" text PRIMARY KEY NOT NULL,
		"smart_list_id" text NOT NULL REFERENCES "smart_lists"("id") ON DELETE CASCADE,
		"refresh_type" text NOT NULL CHECK ("refresh_type" IN ('automatic', 'manual')),
		"status" text NOT NULL CHECK ("status" IN ('running', 'success', 'partial', 'failed')),
		"items_found" integer DEFAULT 0,
		"items_new" integer DEFAULT 0,
		"items_removed" integer DEFAULT 0,
		"items_auto_added" integer DEFAULT 0,
		"items_failed" integer DEFAULT 0,
		"failure_details" text,
		"started_at" text,
		"completed_at" text,
		"duration_ms" integer,
		"error_message" text
	)`,

	// Streaming cache
	`CREATE TABLE IF NOT EXISTS "stream_extraction_cache" (
		"id" text PRIMARY KEY NOT NULL,
		"tmdb_id" integer NOT NULL,
		"media_type" text NOT NULL CHECK ("media_type" IN ('movie', 'tv')),
		"season_number" integer,
		"episode_number" integer,
		"extraction_result" text,
		"provider" text,
		"cached_at" text,
		"expires_at" text NOT NULL,
		"hit_count" integer DEFAULT 0,
		"last_access_at" text
	)`,

	// NZB Streaming tables
	`CREATE TABLE IF NOT EXISTS "nntp_servers" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"host" text NOT NULL,
		"port" integer NOT NULL DEFAULT 563,
		"use_ssl" integer DEFAULT true,
		"username" text,
		"password" text,
		"max_connections" integer DEFAULT 10,
		"priority" integer DEFAULT 1,
		"enabled" integer DEFAULT true,
		"download_client_id" text REFERENCES "download_clients"("id") ON DELETE SET NULL,
		"auto_fetched" integer DEFAULT false,
		"last_tested_at" text,
		"test_result" text,
		"test_error" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "nzb_stream_mounts" (
		"id" text PRIMARY KEY NOT NULL,
		"nzb_hash" text NOT NULL UNIQUE,
		"title" text NOT NULL,
		"indexer_id" text REFERENCES "indexers"("id") ON DELETE SET NULL,
		"release_guid" text,
		"download_url" text,
		"movie_id" text REFERENCES "movies"("id") ON DELETE CASCADE,
		"series_id" text REFERENCES "series"("id") ON DELETE CASCADE,
		"season_number" integer,
		"episode_ids" text,
		"file_count" integer NOT NULL,
		"total_size" integer NOT NULL,
		"media_files" text NOT NULL,
		"rar_info" text,
		"password" text,
		"status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'parsing', 'ready', 'requires_extraction', 'downloading', 'extracting', 'error', 'expired')),
		"error_message" text,
		"streamability" text,
		"extracted_file_path" text,
		"extraction_progress" integer,
		"last_accessed_at" text,
		"access_count" integer DEFAULT 0,
		"expires_at" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "nzb_segment_cache" (
		"id" text PRIMARY KEY NOT NULL,
		"mount_id" text NOT NULL REFERENCES "nzb_stream_mounts"("id") ON DELETE CASCADE,
		"file_index" integer NOT NULL,
		"segment_index" integer NOT NULL,
		"data" blob NOT NULL,
		"size" integer NOT NULL,
		"created_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "media_browser_servers" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"server_type" text NOT NULL CHECK ("server_type" IN ('jellyfin', 'emby', 'plex')),
		"host" text NOT NULL,
		"api_key" text NOT NULL,
		"enabled" integer DEFAULT 1,
		"on_import" integer DEFAULT 1,
		"on_upgrade" integer DEFAULT 1,
		"on_rename" integer DEFAULT 1,
		"on_delete" integer DEFAULT 1,
		"path_mappings" text,
		"server_name" text,
		"server_version" text,
		"server_id" text,
		"last_tested_at" text,
		"test_result" text,
		"test_error" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "media_server_synced_items" (
		"id" text PRIMARY KEY NOT NULL,
		"server_id" text NOT NULL REFERENCES "media_browser_servers"("id") ON DELETE CASCADE,
		"server_item_id" text NOT NULL,
		"tmdb_id" integer,
		"tvdb_id" integer,
		"imdb_id" text,
		"title" text NOT NULL,
		"year" integer,
		"item_type" text NOT NULL,
		"series_name" text,
		"season_number" integer,
		"episode_number" integer,
		"play_count" integer DEFAULT 0,
		"last_played_date" text,
		"played_percentage" real,
		"is_played" integer DEFAULT 0,
		"video_codec" text,
		"video_profile" text,
		"video_bit_depth" integer,
		"width" integer,
		"height" integer,
		"is_hdr" integer DEFAULT 0,
		"hdr_format" text,
		"video_bitrate" integer,
		"audio_codec" text,
		"audio_channels" integer,
		"audio_channel_layout" text,
		"audio_bitrate" integer,
		"audio_languages" text DEFAULT '[]',
		"subtitle_languages" text DEFAULT '[]',
		"container_format" text,
		"file_size" integer,
		"bitrate" integer,
		"duration" integer,
		"last_synced_at" text NOT NULL,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "media_server_synced_runs" (
		"id" text PRIMARY KEY NOT NULL,
		"server_id" text NOT NULL REFERENCES "media_browser_servers"("id") ON DELETE CASCADE,
		"status" text NOT NULL,
		"items_synced" integer DEFAULT 0,
		"items_added" integer DEFAULT 0,
		"items_updated" integer DEFAULT 0,
		"items_removed" integer DEFAULT 0,
		"error_message" text,
		"started_at" text NOT NULL,
		"completed_at" text,
		"duration" integer,
		"created_at" text
	)`,

	// Live TV - Stalker Portals (for scanning)
	`CREATE TABLE IF NOT EXISTS "stalker_portals" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"url" text NOT NULL UNIQUE,
		"endpoint" text,
		"server_timezone" text,
		"last_scanned_at" text,
		"last_scan_results" text,
		"enabled" integer DEFAULT 1,
		"created_at" text,
		"updated_at" text
	)`,

	// Live TV - Stalker Portal Accounts
	`CREATE TABLE IF NOT EXISTS "stalker_accounts" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"portal_url" text NOT NULL,
		"mac_address" text NOT NULL,
		"enabled" integer DEFAULT 1,
		"portal_id" text REFERENCES "stalker_portals"("id") ON DELETE SET NULL,
		"discovered_from_scan" integer DEFAULT 0,
		"serial_number" text,
		"device_id" text,
		"device_id2" text,
		"model" text DEFAULT 'MAG254',
		"timezone" text DEFAULT 'Europe/London',
		"token" text,
		"username" text,
		"password" text,
		"playback_limit" integer,
		"channel_count" integer,
		"category_count" integer,
		"expires_at" text,
		"server_timezone" text,
		"last_tested_at" text,
		"last_test_success" integer,
		"last_test_error" text,
		"last_sync_at" text,
		"last_sync_error" text,
		"sync_status" text DEFAULT 'never',
		"created_at" text,
		"updated_at" text
	)`,

	// Live TV - Portal Scan Results (pending approval)
	`CREATE TABLE IF NOT EXISTS "portal_scan_results" (
		"id" text PRIMARY KEY NOT NULL,
		"portal_id" text NOT NULL REFERENCES "stalker_portals"("id") ON DELETE CASCADE,
		"mac_address" text NOT NULL,
		"status" text NOT NULL DEFAULT 'pending',
		"channel_count" integer,
		"category_count" integer,
		"expires_at" text,
		"account_status" text,
		"playback_limit" integer,
		"server_timezone" text,
		"raw_profile" text,
		"discovered_at" text NOT NULL,
		"processed_at" text
	)`,

	// Live TV - Portal Scan History
	`CREATE TABLE IF NOT EXISTS "portal_scan_history" (
		"id" text PRIMARY KEY NOT NULL,
		"portal_id" text NOT NULL REFERENCES "stalker_portals"("id") ON DELETE CASCADE,
		"worker_id" text,
		"scan_type" text NOT NULL,
		"mac_prefix" text,
		"mac_range_start" text,
		"mac_range_end" text,
		"macs_to_test" integer,
		"macs_tested" integer DEFAULT 0,
		"macs_found" integer DEFAULT 0,
		"status" text NOT NULL DEFAULT 'running',
		"error" text,
		"started_at" text NOT NULL,
		"completed_at" text
	)`,

	// Live TV - Stalker Portal Categories (cached from portal)
	`CREATE TABLE IF NOT EXISTS "stalker_categories" (
		"id" text PRIMARY KEY NOT NULL,
		"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
		"stalker_id" text NOT NULL,
		"title" text NOT NULL,
		"alias" text,
		"censored" integer DEFAULT 0,
		"channel_count" integer DEFAULT 0,
		"created_at" text,
		"updated_at" text
	)`,

	// Live TV - Stalker Portal Channels (cached from portal)
	`CREATE TABLE IF NOT EXISTS "stalker_channels" (
		"id" text PRIMARY KEY NOT NULL,
		"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
		"stalker_id" text NOT NULL,
		"name" text NOT NULL,
		"number" text,
		"logo" text,
		"category_id" text REFERENCES "stalker_categories"("id") ON DELETE SET NULL,
		"stalker_genre_id" text,
		"cmd" text NOT NULL,
		"tv_archive" integer DEFAULT 0,
		"archive_duration" integer DEFAULT 0,
		"created_at" text,
		"updated_at" text
	)`,

	// Live TV - User Channel Categories
	`CREATE TABLE IF NOT EXISTS "channel_categories" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"position" integer NOT NULL,
		"color" text,
		"icon" text,
		"created_at" text,
		"updated_at" text
	)`,

	// Live TV - User Channel Lineup (legacy v1 - FKs removed to allow creation before referenced tables exist)
	`CREATE TABLE IF NOT EXISTS "channel_lineup_items" (
		"id" text PRIMARY KEY NOT NULL,
		"account_id" text NOT NULL,
		"channel_id" text NOT NULL,
		"position" integer NOT NULL,
		"channel_number" integer,
		"custom_name" text,
		"custom_logo" text,
		"epg_id" text,
		"epg_source_channel_id" text,
		"category_id" text,
		"added_at" text,
		"updated_at" text
	)`,

	// Live TV - EPG Programs
	`CREATE TABLE IF NOT EXISTS "epg_programs" (
		"id" text PRIMARY KEY NOT NULL,
		"channel_id" text NOT NULL REFERENCES "stalker_channels"("id") ON DELETE CASCADE,
		"stalker_channel_id" text NOT NULL,
		"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
		"title" text NOT NULL,
		"description" text,
		"category" text,
		"director" text,
		"actor" text,
		"start_time" text NOT NULL,
		"end_time" text NOT NULL,
		"duration" integer NOT NULL,
		"has_archive" integer DEFAULT 0,
		"cached_at" text,
		"updated_at" text
	)`,

	// Live TV - Channel Lineup Backups (legacy v1 - FKs removed to allow creation before referenced tables exist)
	`CREATE TABLE IF NOT EXISTS "channel_lineup_backups" (
		"id" text PRIMARY KEY NOT NULL,
		"lineup_item_id" text NOT NULL,
		"account_id" text NOT NULL,
		"channel_id" text NOT NULL,
		"priority" integer NOT NULL,
		"created_at" text,
		"updated_at" text
	)`
];

/**
 * Index definitions for performance
 */
const INDEX_DEFINITIONS: string[] = [
	`CREATE INDEX IF NOT EXISTS "idx_indexer_definitions_protocol" ON "indexer_definitions" ("protocol")`,
	`CREATE INDEX IF NOT EXISTS "idx_indexer_definitions_type" ON "indexer_definitions" ("type")`,
	`CREATE INDEX IF NOT EXISTS "idx_indexers_definition" ON "indexers" ("definition_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_indexers_enabled" ON "indexers" ("enabled")`,
	`CREATE INDEX IF NOT EXISTS "idx_indexer_status_health" ON "indexer_status" ("health", "is_disabled")`,
	`CREATE INDEX IF NOT EXISTS "idx_libraries_media_type" ON "libraries" ("media_type")`,
	`CREATE INDEX IF NOT EXISTS "idx_libraries_media_sub_type" ON "libraries" ("media_sub_type")`,
	`CREATE INDEX IF NOT EXISTS "idx_libraries_sort_order" ON "libraries" ("sort_order")`,
	`CREATE INDEX IF NOT EXISTS "idx_library_root_folders_library" ON "library_root_folders" ("library_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_library_root_folders_root_folder" ON "library_root_folders" ("root_folder_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_movies_monitored_hasfile" ON "movies" ("monitored", "has_file")`,
	`CREATE INDEX IF NOT EXISTS "idx_movies_release_date" ON "movies" ("release_date")`,
	`CREATE INDEX IF NOT EXISTS "idx_movies_library_id" ON "movies" ("library_id")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_movie_files_unique_path" ON "movie_files" ("movie_id", "relative_path")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_episode_files_unique_path" ON "episode_files" ("series_id", "relative_path")`,
	`CREATE INDEX IF NOT EXISTS "idx_series_monitored" ON "series" ("monitored")`,
	`CREATE INDEX IF NOT EXISTS "idx_series_first_air_date" ON "series" ("first_air_date")`,
	`CREATE INDEX IF NOT EXISTS "idx_series_library_id" ON "series" ("library_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_episodes_series_season" ON "episodes" ("series_id", "season_number")`,
	`CREATE INDEX IF NOT EXISTS "idx_episodes_monitored_hasfile" ON "episodes" ("monitored", "has_file")`,
	`CREATE INDEX IF NOT EXISTS "idx_episodes_airdate" ON "episodes" ("air_date")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_status" ON "download_queue" ("status")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_movie" ON "download_queue" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_series" ON "download_queue" ("series_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_tombstones_client" ON "download_queue_tombstones" ("download_client_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_tombstones_suppressed_until" ON "download_queue_tombstones" ("suppressed_until")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_download_queue_tombstones_unique" ON "download_queue_tombstones" ("download_client_id", "protocol", "remote_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_blocklist_movie" ON "blocklist" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_blocklist_series" ON "blocklist" ("series_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_blocklist_infohash" ON "blocklist" ("info_hash")`,
	`CREATE INDEX IF NOT EXISTS "idx_monitoring_history_task_history" ON "monitoring_history" ("task_history_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_monitoring_history_movie" ON "monitoring_history" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_monitoring_history_series" ON "monitoring_history" ("series_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_monitoring_history_episode" ON "monitoring_history" ("episode_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_subtitles_movie" ON "subtitles" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_subtitles_episode" ON "subtitles" ("episode_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_lists_enabled" ON "smart_lists" ("enabled")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_lists_next_refresh" ON "smart_lists" ("next_refresh_time")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_lists_media_type" ON "smart_lists" ("media_type")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_list_items_list" ON "smart_list_items" ("smart_list_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_list_items_tmdb" ON "smart_list_items" ("tmdb_id", "media_type")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_list_items_in_library" ON "smart_list_items" ("in_library")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_list_items_position" ON "smart_list_items" ("smart_list_id", "position")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_list_refresh_history_list" ON "smart_list_refresh_history" ("smart_list_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_smart_list_refresh_history_status" ON "smart_list_refresh_history" ("status")`,
	// Stream extraction cache indexes
	`CREATE INDEX IF NOT EXISTS "idx_stream_cache_tmdb" ON "stream_extraction_cache" ("tmdb_id", "media_type")`,
	`CREATE INDEX IF NOT EXISTS "idx_stream_cache_expires" ON "stream_extraction_cache" ("expires_at")`,
	`CREATE INDEX IF NOT EXISTS "idx_stream_cache_hit_count" ON "stream_extraction_cache" ("hit_count")`,
	// NZB streaming indexes
	`CREATE INDEX IF NOT EXISTS "idx_nntp_servers_enabled" ON "nntp_servers" ("enabled")`,
	`CREATE INDEX IF NOT EXISTS "idx_nntp_servers_priority" ON "nntp_servers" ("priority")`,
	`CREATE INDEX IF NOT EXISTS "idx_nntp_servers_download_client" ON "nntp_servers" ("download_client_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_status" ON "nzb_stream_mounts" ("status")`,
	`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_movie" ON "nzb_stream_mounts" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_series" ON "nzb_stream_mounts" ("series_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_expires" ON "nzb_stream_mounts" ("expires_at")`,
	`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_hash" ON "nzb_stream_mounts" ("nzb_hash")`,
	// NZB segment cache indexes
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_segment_cache_lookup" ON "nzb_segment_cache" ("mount_id", "file_index", "segment_index")`,
	`CREATE INDEX IF NOT EXISTS "idx_segment_cache_mount" ON "nzb_segment_cache" ("mount_id")`,
	// Stalker Portal indexes
	`CREATE INDEX IF NOT EXISTS "idx_stalker_portals_enabled" ON "stalker_portals" ("enabled")`,
	// Stalker Portal accounts indexes
	`CREATE INDEX IF NOT EXISTS "idx_stalker_accounts_enabled" ON "stalker_accounts" ("enabled")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_stalker_accounts_portal_mac" ON "stalker_accounts" ("portal_url", "mac_address")`,
	// Portal scan results indexes
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_scan_results_portal_mac" ON "portal_scan_results" ("portal_id", "mac_address")`,
	`CREATE INDEX IF NOT EXISTS "idx_scan_results_portal_status" ON "portal_scan_results" ("portal_id", "status")`,
	// Portal scan history indexes
	`CREATE INDEX IF NOT EXISTS "idx_scan_history_portal" ON "portal_scan_history" ("portal_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_scan_history_status" ON "portal_scan_history" ("status")`,
	// Stalker Portal categories indexes
	`CREATE INDEX IF NOT EXISTS "idx_stalker_categories_account" ON "stalker_categories" ("account_id")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_stalker_categories_unique" ON "stalker_categories" ("account_id", "stalker_id")`,
	// Stalker Portal channels indexes
	`CREATE INDEX IF NOT EXISTS "idx_stalker_channels_account" ON "stalker_channels" ("account_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_stalker_channels_category" ON "stalker_channels" ("category_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_stalker_channels_name" ON "stalker_channels" ("name")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_stalker_channels_unique" ON "stalker_channels" ("account_id", "stalker_id")`,
	// User channel categories indexes
	`CREATE INDEX IF NOT EXISTS "idx_channel_categories_position" ON "channel_categories" ("position")`,
	// User channel lineup indexes
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_lineup_account_channel" ON "channel_lineup_items" ("account_id", "channel_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_lineup_position" ON "channel_lineup_items" ("position")`,
	`CREATE INDEX IF NOT EXISTS "idx_lineup_account" ON "channel_lineup_items" ("account_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_lineup_category" ON "channel_lineup_items" ("category_id")`,
	// EPG programs indexes
	`CREATE INDEX IF NOT EXISTS "idx_epg_programs_channel" ON "epg_programs" ("channel_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_epg_programs_channel_time" ON "epg_programs" ("channel_id", "start_time")`,
	`CREATE INDEX IF NOT EXISTS "idx_epg_programs_account" ON "epg_programs" ("account_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_epg_programs_end" ON "epg_programs" ("end_time")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_epg_programs_unique" ON "epg_programs" ("account_id", "stalker_channel_id", "start_time")`,
	// Channel lineup backups indexes
	`CREATE INDEX IF NOT EXISTS "idx_lineup_backups_item" ON "channel_lineup_backups" ("lineup_item_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_lineup_backups_priority" ON "channel_lineup_backups" ("lineup_item_id", "priority")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_lineup_backups_unique" ON "channel_lineup_backups" ("lineup_item_id", "channel_id")`,
	// Alternate titles indexes for multi-title search
	`CREATE INDEX IF NOT EXISTS "idx_alternate_titles_media" ON "alternate_titles" ("media_type", "media_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_alternate_titles_source" ON "alternate_titles" ("source")`,

	// download_history indexes for activity query performance
	`CREATE INDEX IF NOT EXISTS "idx_dh_status" ON "download_history" ("status")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_movie" ON "download_history" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_series" ON "download_history" ("series_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_created_at" ON "download_history" ("created_at")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_protocol" ON "download_history" ("protocol")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_indexer_name" ON "download_history" ("indexer_name")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_download_client" ON "download_history" ("download_client_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_dh_status_created" ON "download_history" ("status", "created_at")`,
	// Media server synced items indexes
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_synced_items_unique" ON "media_server_synced_items" ("server_id", "server_item_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_synced_items_tmdb_id" ON "media_server_synced_items" ("tmdb_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_synced_items_tvdb_id" ON "media_server_synced_items" ("tvdb_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_synced_items_item_type" ON "media_server_synced_items" ("item_type")`
];

/**
 * All migrations with metadata for tracking.
 * Each migration is tracked individually in the schema_migrations table.
 * Version 1 is the initial schema - handled by TABLE_DEFINITIONS.
 */

export function syncSchema(sqlite: Database.Database): void {
	logger.info('[SchemaSync] Starting schema synchronization');

	// 1. Create the schema_migrations table first (if not exists)
	sqlite
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS "schema_migrations" (
			"version" integer PRIMARY KEY NOT NULL,
			"name" text NOT NULL,
			"checksum" text NOT NULL,
			"applied_at" text NOT NULL,
			"execution_time_ms" integer,
			"success" integer DEFAULT 1
		)
	`
		)
		.run();

	// 2. Backfill records for legacy databases
	backfillMigrationRecords(sqlite);

	// 2.5. Detect and fix schema drift (columns missing despite version saying they should exist)
	detectAndFixSchemaDrift(sqlite);

	// 3. Legacy Live TV cleanup
	if (hasLegacyLiveTvSchema(sqlite)) {
		logger.info('[SchemaSync] Cleaning up legacy Live TV schema');
		cleanupLiveTvTables(sqlite);
	}

	// 4. Create all tables (IF NOT EXISTS)
	logger.info('[SchemaSync] Ensuring all tables exist...');
	for (const tableDef of TABLE_DEFINITIONS) {
		try {
			sqlite.prepare(tableDef).run();
		} catch (error) {
			logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					sql: tableDef.substring(0, 100) + '...'
				},
				'[SchemaSync] Failed to create table'
			);
			throw error;
		}
	}

	// 5. Create all indexes
	logger.info('[SchemaSync] Creating indexes...');
	for (const indexDef of INDEX_DEFINITIONS) {
		try {
			sqlite.prepare(indexDef).run();
		} catch (error) {
			logger.warn(
				{
					error: error instanceof Error ? error.message : String(error)
				},
				'[SchemaSync] Index creation warning'
			);
		}
	}

	// 6. Get applied migrations and find pending ones
	const applied = getAppliedMigrations(sqlite);
	const pending = MIGRATIONS.filter((m) => {
		const record = applied.get(m.version);
		// Run if not applied OR if previously failed (success=0)
		return !record || record.success === 0;
	});

	// 7. Apply pending migrations
	if (pending.length > 0) {
		logger.info(
			{
				count: pending.length,
				versions: pending.map((m) => m.version)
			},
			'[SchemaSync] Applying migrations'
		);

		for (const migration of pending) {
			applyMigration(sqlite, migration);
		}
	}

	// 8. Ensure Better Auth indexes exist after any auth schema repair
	createBetterAuthIndexes(sqlite);

	// 9. Verify schema integrity
	verifySchemaIntegrity(sqlite);

	// 10. Update legacy schema_version for backward compatibility
	setSchemaVersion(sqlite, CURRENT_SCHEMA_VERSION);

	logger.info(
		{
			version: CURRENT_SCHEMA_VERSION
		},
		'[SchemaSync] Schema synchronization complete'
	);
}
