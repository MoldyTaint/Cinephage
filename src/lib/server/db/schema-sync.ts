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
import { createHash } from 'crypto';
import { logger } from '$lib/logging';

/**
 * Migration definition with metadata for tracking
 */
interface MigrationDefinition {
	version: number;
	name: string;
	apply: (sqlite: Database.Database) => void;
}

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
 */
export const CURRENT_SCHEMA_VERSION = 38;

/**
 * All table definitions with CREATE TABLE IF NOT EXISTS
 * Order matters for foreign key constraints
 */
const TABLE_DEFINITIONS: string[] = [
	// Core tables (no foreign keys)
	`CREATE TABLE IF NOT EXISTS "user" (
		"id" text PRIMARY KEY NOT NULL
	)`,

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
		"movie_min_size_gb" text,
		"movie_max_size_gb" text,
		"episode_min_size_mb" text,
		"episode_max_size_mb" text,
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
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "root_folders" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"path" text NOT NULL UNIQUE,
		"media_type" text NOT NULL,
		"is_default" integer DEFAULT false,
		"read_only" integer DEFAULT false,
		"preserve_symlinks" integer DEFAULT false,
		"free_space_bytes" integer,
		"last_checked_at" text,
		"created_at" text
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
		"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
		"scoring_profile_id" text REFERENCES "scoring_profiles"("id") ON DELETE SET NULL,
		"language_profile_id" text,
		"monitored" integer DEFAULT true,
		"minimum_availability" text DEFAULT 'released',
		"added" text,
		"has_file" integer DEFAULT false,
		"wants_subtitles" integer DEFAULT true,
		"last_search_time" text
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
		"languages" text
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
		"wants_subtitles" integer DEFAULT true
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
		"release_type" text,
		"quality" text,
		"media_info" text,
		"languages" text
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
		"server_type" text NOT NULL CHECK ("server_type" IN ('jellyfin', 'emby')),
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

	// Live TV - User Channel Lineup
	`CREATE TABLE IF NOT EXISTS "channel_lineup_items" (
		"id" text PRIMARY KEY NOT NULL,
		"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
		"channel_id" text NOT NULL REFERENCES "stalker_channels"("id") ON DELETE CASCADE,
		"position" integer NOT NULL,
		"channel_number" integer,
		"custom_name" text,
		"custom_logo" text,
		"epg_id" text,
		"epg_source_channel_id" text REFERENCES "stalker_channels"("id") ON DELETE SET NULL,
		"category_id" text REFERENCES "channel_categories"("id") ON DELETE SET NULL,
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

	// Live TV - Channel Lineup Backups
	`CREATE TABLE IF NOT EXISTS "channel_lineup_backups" (
		"id" text PRIMARY KEY NOT NULL,
		"lineup_item_id" text NOT NULL REFERENCES "channel_lineup_items"("id") ON DELETE CASCADE,
		"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
		"channel_id" text NOT NULL REFERENCES "stalker_channels"("id") ON DELETE CASCADE,
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
	`CREATE INDEX IF NOT EXISTS "idx_movies_monitored_hasfile" ON "movies" ("monitored", "has_file")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "idx_movie_files_unique_path" ON "movie_files" ("movie_id", "relative_path")`,
	`CREATE INDEX IF NOT EXISTS "idx_series_monitored" ON "series" ("monitored")`,
	`CREATE INDEX IF NOT EXISTS "idx_episodes_series_season" ON "episodes" ("series_id", "season_number")`,
	`CREATE INDEX IF NOT EXISTS "idx_episodes_monitored_hasfile" ON "episodes" ("monitored", "has_file")`,
	`CREATE INDEX IF NOT EXISTS "idx_episodes_airdate" ON "episodes" ("air_date")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_status" ON "download_queue" ("status")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_movie" ON "download_queue" ("movie_id")`,
	`CREATE INDEX IF NOT EXISTS "idx_download_queue_series" ON "download_queue" ("series_id")`,
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
	`CREATE INDEX IF NOT EXISTS "idx_alternate_titles_source" ON "alternate_titles" ("source")`
];

/**
 * All migrations with metadata for tracking.
 * Each migration is tracked individually in the schema_migrations table.
 * Version 1 is the initial schema - handled by TABLE_DEFINITIONS.
 */
const MIGRATIONS: MigrationDefinition[] = [
	// Version 2: Add missing tables that were defined in schema.ts but not in schema-sync.ts
	{
		version: 2,
		name: 'add_profile_tables',
		apply: (sqlite) => {
			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "profile_size_limits" (
			"profile_id" text PRIMARY KEY NOT NULL,
			"movie_min_size_gb" real,
			"movie_max_size_gb" real,
			"episode_min_size_mb" real,
			"episode_max_size_mb" real,
			"is_default" integer DEFAULT false,
			"updated_at" text
		)`
				)
				.run();

			sqlite
				.prepare(
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
		)`
				)
				.run();

			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "naming_presets" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text NOT NULL,
			"description" text,
			"config" text NOT NULL,
			"is_built_in" integer DEFAULT false,
			"created_at" integer
		)`
				)
				.run();
		}
	},

	// Version 3: Add read_only column to root_folders for virtual mount support (NZBDav)
	{
		version: 3,
		name: 'add_root_folders_read_only',
		apply: (sqlite) => {
			// Only add column if it doesn't exist (may already exist from fresh TABLE_DEFINITIONS)
			if (!columnExists(sqlite, 'root_folders', 'read_only')) {
				sqlite.prepare(`ALTER TABLE root_folders ADD COLUMN read_only INTEGER DEFAULT 0`).run();
			}
		}
	},

	// Version 4: Fix invalid scoring profile references and ensure default profile exists
	{
		version: 4,
		name: 'fix_scoring_profile_references',
		apply: (sqlite) => {
			// Ensure a default profile exists (set 'compact' as default if none)
			const hasDefault = sqlite
				.prepare(`SELECT id FROM scoring_profiles WHERE is_default = 1`)
				.get();

			if (!hasDefault) {
				const validProfiles = sqlite.prepare(`SELECT id FROM scoring_profiles`).all() as {
					id: string;
				}[];
				const validIds = new Set(validProfiles.map((p) => p.id));

				if (validProfiles.length > 0) {
					const defaultId = validIds.has('compact') ? 'compact' : validProfiles[0].id;
					sqlite.prepare(`UPDATE scoring_profiles SET is_default = 1 WHERE id = ?`).run(defaultId);
					logger.info(`[SchemaSync] Set default scoring profile to '${defaultId}'`);
				}
			}

			// Clear invalid profile references (set to NULL so user can choose)
			// This prevents auto-downloads with unwanted profiles
			const invalidMovies = sqlite
				.prepare(
					`UPDATE movies SET scoring_profile_id = NULL
				 WHERE scoring_profile_id IS NOT NULL
				 AND scoring_profile_id != ''
				 AND scoring_profile_id NOT IN (SELECT id FROM scoring_profiles)`
				)
				.run();

			if (invalidMovies.changes > 0) {
				logger.info(
					`[SchemaSync] Cleared ${invalidMovies.changes} movies with invalid profile references`
				);
			}

			const invalidSeries = sqlite
				.prepare(
					`UPDATE series SET scoring_profile_id = NULL
				 WHERE scoring_profile_id IS NOT NULL
				 AND scoring_profile_id != ''
				 AND scoring_profile_id NOT IN (SELECT id FROM scoring_profiles)`
				)
				.run();

			if (invalidSeries.changes > 0) {
				logger.info(
					`[SchemaSync] Cleared ${invalidSeries.changes} series with invalid profile references`
				);
			}
		}
	},

	// Version 5: Add preserve_symlinks column to root_folders for NZBDav/rclone symlink preservation
	{
		version: 5,
		name: 'add_root_folders_preserve_symlinks',
		apply: (sqlite) => {
			// Only add column if it doesn't exist (may already exist from fresh TABLE_DEFINITIONS)
			if (!columnExists(sqlite, 'root_folders', 'preserve_symlinks')) {
				sqlite
					.prepare(`ALTER TABLE root_folders ADD COLUMN preserve_symlinks INTEGER DEFAULT 0`)
					.run();
				logger.info('[SchemaSync] Added preserve_symlinks column to root_folders');
			}
		}
	},

	// Version 6: Add NZB streaming tables
	{
		version: 6,
		name: 'add_nzb_streaming_tables',
		apply: (sqlite) => {
			// Create NNTP servers table
			sqlite
				.prepare(
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
				)`
				)
				.run();

			// Create NZB stream mounts table
			sqlite
				.prepare(
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
					"last_accessed_at" text,
					"access_count" integer DEFAULT 0,
					"expires_at" text,
					"created_at" text,
					"updated_at" text
				)`
				)
				.run();

			// Create indexes
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nntp_servers_enabled" ON "nntp_servers" ("enabled")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nntp_servers_priority" ON "nntp_servers" ("priority")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nntp_servers_download_client" ON "nntp_servers" ("download_client_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_status" ON "nzb_stream_mounts" ("status")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_movie" ON "nzb_stream_mounts" ("movie_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_series" ON "nzb_stream_mounts" ("series_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_expires" ON "nzb_stream_mounts" ("expires_at")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_hash" ON "nzb_stream_mounts" ("nzb_hash")`
				)
				.run();

			logger.info('[SchemaSync] Created NZB streaming tables (nntp_servers, nzb_stream_mounts)');
		}
	},

	// Version 7: Add streamability and extraction columns for compressed archive support
	{
		version: 7,
		name: 'add_nzb_extraction_columns',
		apply: (sqlite) => {
			// Add new columns to nzb_stream_mounts (only if they don't exist)
			if (!columnExists(sqlite, 'nzb_stream_mounts', 'streamability')) {
				sqlite.prepare(`ALTER TABLE "nzb_stream_mounts" ADD COLUMN "streamability" text`).run();
			}
			if (!columnExists(sqlite, 'nzb_stream_mounts', 'extracted_file_path')) {
				sqlite
					.prepare(`ALTER TABLE "nzb_stream_mounts" ADD COLUMN "extracted_file_path" text`)
					.run();
			}
			if (!columnExists(sqlite, 'nzb_stream_mounts', 'extraction_progress')) {
				sqlite
					.prepare(`ALTER TABLE "nzb_stream_mounts" ADD COLUMN "extraction_progress" integer`)
					.run();
			}

			logger.info('[SchemaSync] Added streamability and extraction columns to nzb_stream_mounts');
		}
	},

	// Version 8: Fix nzb_stream_mounts status CHECK constraint to include extraction states
	{
		version: 8,
		name: 'fix_nzb_mounts_check_constraint',
		apply: (sqlite) => {
			// SQLite doesn't support ALTER TABLE to modify CHECK constraints
			// Need to recreate the table with the correct constraint

			// Create new table with correct CHECK constraint
			sqlite
				.prepare(
					`CREATE TABLE "nzb_stream_mounts_new" (
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
			)`
				)
				.run();

			// Copy data from old table
			sqlite
				.prepare(
					`INSERT INTO "nzb_stream_mounts_new" SELECT
				id, nzb_hash, title, indexer_id, release_guid, download_url,
				movie_id, series_id, season_number, episode_ids,
				file_count, total_size, media_files, rar_info, password,
				status, error_message, streamability, extracted_file_path, extraction_progress,
				last_accessed_at, access_count, expires_at, created_at, updated_at
			FROM "nzb_stream_mounts"`
				)
				.run();

			// Drop old table
			sqlite.prepare(`DROP TABLE "nzb_stream_mounts"`).run();

			// Rename new table
			sqlite.prepare(`ALTER TABLE "nzb_stream_mounts_new" RENAME TO "nzb_stream_mounts"`).run();

			// Recreate indexes
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_status" ON "nzb_stream_mounts" ("status")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_movie" ON "nzb_stream_mounts" ("movie_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_series" ON "nzb_stream_mounts" ("series_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_expires" ON "nzb_stream_mounts" ("expires_at")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_nzb_mounts_hash" ON "nzb_stream_mounts" ("nzb_hash")`
				)
				.run();

			logger.info(
				'[SchemaSync] Fixed nzb_stream_mounts status CHECK constraint to include extraction states'
			);
		}
	},

	// Version 9: Remove deprecated qualityPresets system in favor of scoringProfiles
	{
		version: 9,
		name: 'remove_quality_presets',
		apply: (sqlite) => {
			// Step 1: Ensure default scoring profile exists
			const hasDefault = sqlite
				.prepare(`SELECT id FROM scoring_profiles WHERE is_default = 1`)
				.get();
			let defaultProfileId = 'balanced';

			if (!hasDefault) {
				const validProfiles = sqlite.prepare(`SELECT id FROM scoring_profiles`).all() as {
					id: string;
				}[];
				if (validProfiles.length > 0) {
					const validIds = new Set(validProfiles.map((p) => p.id));
					defaultProfileId = validIds.has('balanced') ? 'balanced' : validProfiles[0].id;
					sqlite
						.prepare(`UPDATE scoring_profiles SET is_default = 1 WHERE id = ?`)
						.run(defaultProfileId);
				}
			} else {
				defaultProfileId = (hasDefault as { id: string }).id;
			}

			// Step 2: Migrate movies with quality_preset_id but no scoring_profile_id
			if (columnExists(sqlite, 'movies', 'quality_preset_id')) {
				const migratedMovies = sqlite
					.prepare(
						`UPDATE movies SET scoring_profile_id = ?
					 WHERE (scoring_profile_id IS NULL OR scoring_profile_id = '')
					 AND quality_preset_id IS NOT NULL`
					)
					.run(defaultProfileId);

				if (migratedMovies.changes > 0) {
					logger.info(
						`[SchemaSync] Migrated ${migratedMovies.changes} movies from qualityPresets to scoringProfiles`
					);
				}
			}

			// Step 3: Migrate series with quality_preset_id but no scoring_profile_id
			if (columnExists(sqlite, 'series', 'quality_preset_id')) {
				const migratedSeries = sqlite
					.prepare(
						`UPDATE series SET scoring_profile_id = ?
					 WHERE (scoring_profile_id IS NULL OR scoring_profile_id = '')
					 AND quality_preset_id IS NOT NULL`
					)
					.run(defaultProfileId);

				if (migratedSeries.changes > 0) {
					logger.info(
						`[SchemaSync] Migrated ${migratedSeries.changes} series from qualityPresets to scoringProfiles`
					);
				}
			}

			// Step 4: Drop quality_preset_id column from movies (requires table recreation)
			if (columnExists(sqlite, 'movies', 'quality_preset_id')) {
				sqlite
					.prepare(
						`CREATE TABLE "movies_new" (
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
					"root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL,
					"scoring_profile_id" text REFERENCES "scoring_profiles"("id") ON DELETE SET NULL,
					"language_profile_id" text,
					"monitored" integer DEFAULT true,
					"minimum_availability" text DEFAULT 'released',
					"added" text,
					"has_file" integer DEFAULT false,
					"wants_subtitles" integer DEFAULT true,
					"last_search_time" text
				)`
					)
					.run();

				sqlite
					.prepare(
						`INSERT INTO "movies_new" SELECT
					id, tmdb_id, imdb_id, title, original_title, year, overview,
					poster_path, backdrop_path, runtime, genres, path, root_folder_id,
					scoring_profile_id, language_profile_id, monitored, minimum_availability,
					added, has_file, wants_subtitles, last_search_time
				FROM "movies"`
					)
					.run();

				sqlite.prepare(`DROP TABLE "movies"`).run();
				sqlite.prepare(`ALTER TABLE "movies_new" RENAME TO "movies"`).run();

				// Recreate indexes
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_movies_monitored_hasfile" ON "movies" ("monitored", "has_file")`
					)
					.run();
			}

			// Step 5: Drop quality_preset_id column from series (requires table recreation)
			if (columnExists(sqlite, 'series', 'quality_preset_id')) {
				sqlite
					.prepare(
						`CREATE TABLE "series_new" (
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
					"wants_subtitles" integer DEFAULT true
				)`
					)
					.run();

				sqlite
					.prepare(
						`INSERT INTO "series_new" SELECT
					id, tmdb_id, tvdb_id, imdb_id, title, original_title, year, overview,
					poster_path, backdrop_path, status, network, genres, path, root_folder_id,
					scoring_profile_id, language_profile_id, monitored, monitor_new_items,
					monitor_specials, season_folder, series_type, added, episode_count,
					episode_file_count, wants_subtitles
				FROM "series"`
					)
					.run();

				sqlite.prepare(`DROP TABLE "series"`).run();
				sqlite.prepare(`ALTER TABLE "series_new" RENAME TO "series"`).run();

				// Recreate indexes
				sqlite
					.prepare(`CREATE INDEX IF NOT EXISTS "idx_series_monitored" ON "series" ("monitored")`)
					.run();
			}

			// Step 6: Drop quality_presets table
			if (tableExists(sqlite, 'quality_presets')) {
				sqlite.prepare(`DROP TABLE "quality_presets"`).run();
				logger.info('[SchemaSync] Dropped deprecated quality_presets table');
			}

			logger.info(
				'[SchemaSync] Completed migration from qualityPresets to scoringProfiles (Version 9)'
			);
		}
	},

	// Version 10: Flag series with broken episode metadata for automatic repair
	{
		version: 10,
		name: 'flag_broken_series_metadata',
		apply: (sqlite) => {
			logger.info('[SchemaSync] Checking for series with broken episode metadata...');

			// Find series that have episode_files but no episodes in the database
			// These series were created through the unmatched endpoint bug
			const brokenSeries = sqlite
				.prepare(
					`
				SELECT DISTINCT s.id, s.tmdb_id, s.title
				FROM series s
				INNER JOIN episode_files ef ON ef.series_id = s.id
				WHERE s.episode_count = 0 OR NOT EXISTS (
					SELECT 1 FROM episodes e WHERE e.series_id = s.id
				)
			`
				)
				.all() as Array<{ id: string; tmdb_id: number; title: string }>;

			if (brokenSeries.length === 0) {
				logger.info('[SchemaSync] No series need episode metadata repair');
				return;
			}

			logger.info('[SchemaSync] Found series needing episode metadata repair', {
				count: brokenSeries.length,
				series: brokenSeries.map((s) => s.title)
			});

			// Flag each series for repair by the DataRepairService on startup
			// We use settings table since TMDB API calls need to be async
			for (const series of brokenSeries) {
				sqlite
					.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
					.run(
						`repair_series_${series.id}`,
						JSON.stringify({ tmdbId: series.tmdb_id, title: series.title })
					);
			}

			logger.info('[SchemaSync] Queued series for metadata repair on next startup', {
				count: brokenSeries.length
			});
		}
	},

	// Version 11: Add temp path columns to download_clients for SABnzbd dual folder support
	{
		version: 11,
		name: 'add_download_client_temp_paths',
		apply: (sqlite) => {
			if (!columnExists(sqlite, 'download_clients', 'temp_path_local')) {
				sqlite.prepare(`ALTER TABLE download_clients ADD COLUMN temp_path_local TEXT`).run();
			}
			if (!columnExists(sqlite, 'download_clients', 'temp_path_remote')) {
				sqlite.prepare(`ALTER TABLE download_clients ADD COLUMN temp_path_remote TEXT`).run();
			}
			logger.info('[SchemaSync] Added temp path columns to download_clients for SABnzbd');
		}
	},

	// Version 12: Add media_browser_servers table for Jellyfin/Emby integration
	{
		version: 12,
		name: 'add_media_browser_servers',
		apply: (sqlite) => {
			if (!tableExists(sqlite, 'media_browser_servers')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "media_browser_servers" (
						"id" text PRIMARY KEY NOT NULL,
						"name" text NOT NULL,
						"server_type" text NOT NULL CHECK ("server_type" IN ('jellyfin', 'emby')),
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
					)`
					)
					.run();
			}
			logger.info('[SchemaSync] Added media_browser_servers table for Jellyfin/Emby integration');
		}
	},

	// Version 13: Remove Live TV feature - drop all related tables
	{
		version: 13,
		name: 'remove_live_tv_v1',
		apply: (sqlite) => {
			// Drop all Live TV related tables
			sqlite.prepare(`DROP TABLE IF EXISTS "channel_lineup_items"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "channel_categories"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "epg_programs"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "epg_sources"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "live_events"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "live_tv_settings"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "stalker_portal_accounts"`).run();

			logger.info('[SchemaSync] Removed Live TV feature - dropped all related tables');
		}
	},

	// Version 14: Add new Live TV feature (external API-based)
	{
		version: 14,
		name: 'add_live_tv_external_api',
		apply: (sqlite) => {
			// Create Live TV tables
			if (!tableExists(sqlite, 'livetv_channels_cache')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "livetv_channels_cache" (
						"id" text PRIMARY KEY NOT NULL,
						"name" text NOT NULL,
						"country" text NOT NULL,
						"country_name" text,
						"logo" text,
						"status" text DEFAULT 'online' CHECK ("status" IN ('online', 'offline')),
						"viewers" integer DEFAULT 0,
						"cached_at" text,
						"updated_at" text
					)`
					)
					.run();
			}

			if (!tableExists(sqlite, 'livetv_categories')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "livetv_categories" (
						"id" text PRIMARY KEY NOT NULL,
						"name" text NOT NULL,
						"position" integer NOT NULL DEFAULT 0,
						"color" text,
						"created_at" text
					)`
					)
					.run();
			}

			if (!tableExists(sqlite, 'livetv_lineup')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "livetv_lineup" (
						"id" text PRIMARY KEY NOT NULL,
						"channel_id" text NOT NULL,
						"display_name" text,
						"channel_number" integer,
						"category_id" text REFERENCES "livetv_categories"("id") ON DELETE SET NULL,
						"position" integer NOT NULL DEFAULT 0,
						"enabled" integer DEFAULT 1,
						"added_at" text
					)`
					)
					.run();
			}

			if (!tableExists(sqlite, 'livetv_events_cache')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "livetv_events_cache" (
						"id" text PRIMARY KEY NOT NULL,
						"sport" text NOT NULL,
						"home_team" text,
						"away_team" text,
						"home_team_logo" text,
						"away_team_logo" text,
						"tournament" text,
						"country" text,
						"status" text DEFAULT 'upcoming' CHECK ("status" IN ('live', 'upcoming', 'finished')),
						"start_time" text NOT NULL,
						"end_time" text,
						"channels" text,
						"cached_at" text
					)`
					)
					.run();
			}

			if (!tableExists(sqlite, 'livetv_settings')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "livetv_settings" (
						"key" text PRIMARY KEY NOT NULL,
						"value" text NOT NULL
					)`
					)
					.run();
			}

			// Create indexes
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_cache_country" ON "livetv_channels_cache" ("country")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_cache_status" ON "livetv_channels_cache" ("status")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_categories_position" ON "livetv_categories" ("position")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_lineup_position" ON "livetv_lineup" ("position")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_lineup_category" ON "livetv_lineup" ("category_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_lineup_channel" ON "livetv_lineup" ("channel_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_events_sport" ON "livetv_events_cache" ("sport")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_events_status" ON "livetv_events_cache" ("status")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_events_time" ON "livetv_events_cache" ("start_time")`
				)
				.run();

			logger.info('[SchemaSync] Added Live TV feature tables');
		}
	},

	// Version 15: Remove Live TV EPG cache (unused - API does not provide EPG)
	{
		version: 15,
		name: 'remove_live_tv_epg_cache',
		apply: (sqlite) => {
			sqlite.prepare(`DROP TABLE IF EXISTS "livetv_epg_cache"`).run();
			logger.info('[SchemaSync] Removed unused livetv_epg_cache table');
		}
	},

	// Version 16: Add Live TV stream health tracking table
	{
		version: 16,
		name: 'add_live_tv_stream_health',
		apply: (sqlite) => {
			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "livetv_stream_health" (
			"channel_id" text PRIMARY KEY NOT NULL,
			"health" text DEFAULT 'unknown' NOT NULL CHECK ("health" IN ('healthy', 'warning', 'failing', 'offline', 'unknown')),
			"api_status" text DEFAULT 'unknown' CHECK ("api_status" IN ('online', 'offline', 'unknown')),
			"api_status_changed_at" text,
			"last_validation_result" text CHECK ("last_validation_result" IN ('success', 'failed', 'timeout', 'error')),
			"last_validation_at" text,
			"last_validation_error" text,
			"validation_response_time_ms" integer,
			"consecutive_failures" integer DEFAULT 0 NOT NULL,
			"total_validations" integer DEFAULT 0 NOT NULL,
			"total_failures" integer DEFAULT 0 NOT NULL,
			"recent_failures" text DEFAULT '[]',
			"last_success" text,
			"last_failure" text,
			"avg_response_time" integer,
			"current_viewers" integer DEFAULT 0,
			"peak_viewers" integer DEFAULT 0,
			"peak_viewers_at" text,
			"created_at" text,
			"updated_at" text
		)`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_health_status" ON "livetv_stream_health" ("health")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_health_api_status" ON "livetv_stream_health" ("api_status")`
				)
				.run();
			logger.info('[SchemaSync] Added livetv_stream_health table for stream health tracking');
		}
	},

	// Version 17: Add Live TV EPG with XMLTV support
	{
		version: 17,
		name: 'add_live_tv_epg_xmltv',
		apply: (sqlite) => {
			// EPG Sources table
			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "livetv_epg_sources" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text NOT NULL,
			"url" text NOT NULL UNIQUE,
			"enabled" integer DEFAULT 1,
			"priority" integer DEFAULT 0,
			"last_refresh" text,
			"last_error" text,
			"channel_count" integer DEFAULT 0,
			"program_count" integer DEFAULT 0,
			"created_at" text,
			"updated_at" text
		)`
				)
				.run();

			// EPG Channel Map table
			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "livetv_epg_channel_map" (
			"id" text PRIMARY KEY NOT NULL,
			"source_id" text NOT NULL REFERENCES "livetv_epg_sources"("id") ON DELETE CASCADE,
			"xmltv_channel_id" text NOT NULL,
			"xmltv_channel_name" text NOT NULL,
			"channel_id" text,
			"match_score" real,
			"manual_override" integer DEFAULT 0
		)`
				)
				.run();

			// EPG Programs table
			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "livetv_epg_programs" (
			"id" text PRIMARY KEY NOT NULL,
			"source_id" text NOT NULL REFERENCES "livetv_epg_sources"("id") ON DELETE CASCADE,
			"xmltv_channel_id" text NOT NULL,
			"channel_id" text,
			"title" text NOT NULL,
			"description" text,
			"start_time" text NOT NULL,
			"end_time" text NOT NULL,
			"category" text,
			"cached_at" text
		)`
				)
				.run();

			// Create indexes
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_sources_enabled" ON "livetv_epg_sources" ("enabled")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_sources_priority" ON "livetv_epg_sources" ("priority")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_map_source" ON "livetv_epg_channel_map" ("source_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_map_channel" ON "livetv_epg_channel_map" ("channel_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_map_xmltv" ON "livetv_epg_channel_map" ("source_id", "xmltv_channel_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_source" ON "livetv_epg_programs" ("source_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_channel" ON "livetv_epg_programs" ("channel_id")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_time" ON "livetv_epg_programs" ("start_time", "end_time")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_channel_time" ON "livetv_epg_programs" ("channel_id", "start_time")`
				)
				.run();

			logger.info('[SchemaSync] Added Live TV EPG tables for XMLTV support');
		}
	},

	// Version 18: Add EPG performance optimization indexes
	{
		version: 18,
		name: 'add_epg_performance_indexes',
		apply: (sqlite) => {
			// Index for LIKE search on channel names (case-insensitive)
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_map_name_search" ON "livetv_epg_channel_map" ("xmltv_channel_name" COLLATE NOCASE)`
				)
				.run();

			// Covering index for getEpgNow query optimization
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_now" ON "livetv_epg_programs" ("channel_id", "end_time", "start_time")`
				)
				.run();

			// Index for cleanup query optimization (end_time-based filtering)
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_end" ON "livetv_epg_programs" ("end_time")`
				)
				.run();

			logger.info('[SchemaSync] Added EPG performance optimization indexes');
		}
	},

	// Version 19: Add EPG search optimization indexes
	{
		version: 19,
		name: 'add_epg_search_indexes',
		apply: (sqlite) => {
			// Composite index for EPG channel search (source_id + name)
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_map_source_name" ON "livetv_epg_channel_map" ("source_id", "xmltv_channel_name" COLLATE NOCASE)`
				)
				.run();

			// Index for EPG program lookups by xmltv_channel_id (for preview feature)
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_epg_programs_xmltv" ON "livetv_epg_programs" ("source_id", "xmltv_channel_id", "start_time")`
				)
				.run();

			logger.info('[SchemaSync] Added EPG search optimization indexes');
		}
	},

	// Version 20: Add DaddyHD provider support
	{
		version: 20,
		name: 'add_daddyhd_provider',
		apply: (sqlite) => {
			// Add provider column to livetv_channels_cache for DaddyHD support
			const cols = sqlite.prepare(`PRAGMA table_info(livetv_channels_cache)`).all() as {
				name: string;
			}[];
			const hasProvider = cols.some((col) => col.name === 'provider');

			if (!hasProvider) {
				sqlite
					.prepare(
						`ALTER TABLE "livetv_channels_cache" ADD COLUMN "provider" text DEFAULT 'cdnlive' CHECK ("provider" IN ('cdnlive', 'daddyhd'))`
					)
					.run();
			}

			// Create provider index
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_livetv_cache_provider" ON "livetv_channels_cache" ("provider")`
				)
				.run();

			logger.info('[SchemaSync] Added DaddyHD provider support to Live TV channels cache');
		}
	},

	// Version 21: Add cached_server column for DaddyHD server caching
	{
		version: 21,
		name: 'add_live_tv_cached_server',
		apply: (sqlite) => {
			if (!columnExists(sqlite, 'livetv_channels_cache', 'cached_server')) {
				sqlite.prepare(`ALTER TABLE "livetv_channels_cache" ADD COLUMN "cached_server" text`).run();
			}
			logger.info('[SchemaSync] Added cached_server column to livetv_channels_cache');
		}
	},

	// Version 22: Remove all Live TV tables (feature rewrite)
	{
		version: 22,
		name: 'remove_live_tv_v2',
		apply: (sqlite) => {
			const tables = [
				'livetv_epg_programs',
				'livetv_epg_channel_map',
				'livetv_epg_sources',
				'livetv_stream_health',
				'livetv_settings',
				'livetv_events_cache',
				'livetv_lineup',
				'livetv_categories',
				'livetv_channels_cache'
			];

			for (const table of tables) {
				if (tableExists(sqlite, table)) {
					sqlite.prepare(`DROP TABLE IF EXISTS "${table}"`).run();
					logger.info(`[SchemaSync] Dropped table: ${table}`);
				}
			}

			logger.info('[SchemaSync] Removed all Live TV tables');
		}
	},

	// Version 23: Add stalker_accounts table for Live TV Stalker Portal support
	{
		version: 23,
		name: 'add_stalker_accounts',
		apply: (sqlite) => {
			if (!tableExists(sqlite, 'stalker_accounts')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "stalker_accounts" (
						"id" text PRIMARY KEY NOT NULL,
						"name" text NOT NULL,
						"portal_url" text NOT NULL,
						"mac_address" text NOT NULL,
						"enabled" integer DEFAULT 1,
						"playback_limit" integer,
						"channel_count" integer,
						"category_count" integer,
						"expires_at" text,
						"server_timezone" text,
						"last_tested_at" text,
						"last_test_success" integer,
						"last_test_error" text,
						"created_at" text,
						"updated_at" text
					)`
					)
					.run();

				// Create indexes
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_stalker_accounts_enabled" ON "stalker_accounts" ("enabled")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_stalker_accounts_portal_mac" ON "stalker_accounts" ("portal_url", "mac_address")`
					)
					.run();

				logger.info('[SchemaSync] Added stalker_accounts table for Live TV');
			}
		}
	},

	// Version 24: Add stalker_categories and stalker_channels tables for channel caching
	{
		version: 24,
		name: 'add_stalker_channel_caching',
		apply: (sqlite) => {
			// Add sync tracking columns to stalker_accounts
			if (!columnExists(sqlite, 'stalker_accounts', 'last_sync_at')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "last_sync_at" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'last_sync_error')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "last_sync_error" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'sync_status')) {
				sqlite
					.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "sync_status" text DEFAULT 'never'`)
					.run();
			}

			// Create stalker_categories table
			if (!tableExists(sqlite, 'stalker_categories')) {
				sqlite
					.prepare(
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
					)`
					)
					.run();

				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_stalker_categories_account" ON "stalker_categories" ("account_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_stalker_categories_unique" ON "stalker_categories" ("account_id", "stalker_id")`
					)
					.run();

				logger.info('[SchemaSync] Added stalker_categories table');
			}

			// Create stalker_channels table
			if (!tableExists(sqlite, 'stalker_channels')) {
				sqlite
					.prepare(
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
					)`
					)
					.run();

				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_stalker_channels_account" ON "stalker_channels" ("account_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_stalker_channels_category" ON "stalker_channels" ("category_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_stalker_channels_name" ON "stalker_channels" ("name")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_stalker_channels_unique" ON "stalker_channels" ("account_id", "stalker_id")`
					)
					.run();

				logger.info('[SchemaSync] Added stalker_channels table');
			}

			logger.info('[SchemaSync] Added channel caching tables for Live TV');
		}
	},

	// Version 25: Add channel_categories and channel_lineup_items tables for user lineup management
	{
		version: 25,
		name: 'add_channel_lineup_tables',
		apply: (sqlite) => {
			// Create channel_categories table
			if (!tableExists(sqlite, 'channel_categories')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "channel_categories" (
						"id" text PRIMARY KEY NOT NULL,
						"name" text NOT NULL,
						"position" integer NOT NULL,
						"color" text,
						"icon" text,
						"created_at" text,
						"updated_at" text
					)`
					)
					.run();

				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_channel_categories_position" ON "channel_categories" ("position")`
					)
					.run();

				logger.info('[SchemaSync] Added channel_categories table');
			}

			// Create channel_lineup_items table
			if (!tableExists(sqlite, 'channel_lineup_items')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "channel_lineup_items" (
						"id" text PRIMARY KEY NOT NULL,
						"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
						"channel_id" text NOT NULL REFERENCES "stalker_channels"("id") ON DELETE CASCADE,
						"position" integer NOT NULL,
						"channel_number" integer,
						"custom_name" text,
						"custom_logo" text,
						"epg_id" text,
						"category_id" text REFERENCES "channel_categories"("id") ON DELETE SET NULL,
						"added_at" text,
						"updated_at" text
					)`
					)
					.run();

				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_lineup_account_channel" ON "channel_lineup_items" ("account_id", "channel_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_lineup_position" ON "channel_lineup_items" ("position")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_lineup_account" ON "channel_lineup_items" ("account_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_lineup_category" ON "channel_lineup_items" ("category_id")`
					)
					.run();

				logger.info('[SchemaSync] Added channel_lineup_items table');
			}

			logger.info('[SchemaSync] Added user lineup management tables for Live TV');
		}
	},

	// Version 26: Add epg_programs table for storing EPG data from Stalker portals
	{
		version: 26,
		name: 'add_epg_programs',
		apply: (sqlite) => {
			// Create epg_programs table
			if (!tableExists(sqlite, 'epg_programs')) {
				sqlite
					.prepare(
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
					)`
					)
					.run();

				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_epg_programs_channel" ON "epg_programs" ("channel_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_epg_programs_channel_time" ON "epg_programs" ("channel_id", "start_time")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_epg_programs_account" ON "epg_programs" ("account_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_epg_programs_end" ON "epg_programs" ("end_time")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_epg_programs_unique" ON "epg_programs" ("account_id", "stalker_channel_id", "start_time")`
					)
					.run();

				logger.info('[SchemaSync] Added epg_programs table');
			}

			logger.info('[SchemaSync] Added EPG support for Live TV');
		}
	},

	// Version 27: Add channel_lineup_backups table for backup channel sources
	{
		version: 27,
		name: 'add_channel_lineup_backups',
		apply: (sqlite) => {
			// Create channel_lineup_backups table
			if (!tableExists(sqlite, 'channel_lineup_backups')) {
				sqlite
					.prepare(
						`CREATE TABLE IF NOT EXISTS "channel_lineup_backups" (
						"id" text PRIMARY KEY NOT NULL,
						"lineup_item_id" text NOT NULL REFERENCES "channel_lineup_items"("id") ON DELETE CASCADE,
						"account_id" text NOT NULL REFERENCES "stalker_accounts"("id") ON DELETE CASCADE,
						"channel_id" text NOT NULL REFERENCES "stalker_channels"("id") ON DELETE CASCADE,
						"priority" integer NOT NULL,
						"created_at" text,
						"updated_at" text
					)`
					)
					.run();

				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_lineup_backups_item" ON "channel_lineup_backups" ("lineup_item_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_lineup_backups_priority" ON "channel_lineup_backups" ("lineup_item_id", "priority")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_lineup_backups_unique" ON "channel_lineup_backups" ("lineup_item_id", "channel_id")`
					)
					.run();

				logger.info('[SchemaSync] Added channel_lineup_backups table');
			}

			logger.info('[SchemaSync] Added backup links support for Live TV');
		}
	},

	// Version 28: Drop old live_tv_settings table (replaced by EPG scheduler settings)
	{
		version: 28,
		name: 'drop_old_live_tv_settings',
		apply: (sqlite) => {
			if (tableExists(sqlite, 'live_tv_settings')) {
				sqlite.prepare(`DROP TABLE "live_tv_settings"`).run();
				logger.info('[SchemaSync] Dropped old live_tv_settings table');
			}
		}
	},

	// Version 29: Clean break migration for Live TV
	// This drops any orphaned tables from intermediate rewrites (v14-21 external API system).
	// These tables are no longer used and may exist in databases that went through those versions.
	{
		version: 29,
		name: 'clean_break_live_tv',
		apply: (sqlite) => {
			const orphanedTables = [
				'livetv_channels_cache',
				'livetv_categories',
				'livetv_lineup',
				'livetv_events_cache',
				'livetv_settings',
				'livetv_stream_health',
				'livetv_epg_sources',
				'livetv_epg_channel_map',
				'livetv_epg_programs',
				'livetv_epg_cache',
				// Also clean up any remaining legacy tables
				'stalker_portal_accounts',
				'epg_sources',
				'live_events'
			];

			let droppedCount = 0;
			for (const table of orphanedTables) {
				if (tableExists(sqlite, table)) {
					sqlite.prepare(`DROP TABLE "${table}"`).run();
					droppedCount++;
				}
			}

			if (droppedCount > 0) {
				logger.info(`[SchemaSync] Dropped ${droppedCount} orphaned Live TV tables`);
			}
		}
	},

	// Version 30: Add device parameters to stalker_accounts for proper Stalker protocol support
	{
		version: 30,
		name: 'add_stalker_device_params',
		apply: (sqlite) => {
			// Add device emulation parameters
			if (!columnExists(sqlite, 'stalker_accounts', 'serial_number')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "serial_number" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'device_id')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "device_id" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'device_id2')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "device_id2" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'model')) {
				sqlite
					.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "model" text DEFAULT 'MAG254'`)
					.run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'timezone')) {
				sqlite
					.prepare(
						`ALTER TABLE "stalker_accounts" ADD COLUMN "timezone" text DEFAULT 'Europe/London'`
					)
					.run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'token')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "token" text`).run();
			}
			// Add optional credentials
			if (!columnExists(sqlite, 'stalker_accounts', 'username')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "username" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'password')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "password" text`).run();
			}
			logger.info('[SchemaSync] Added device parameters to stalker_accounts for Stalker protocol');
		}
	},

	// Version 31: Add portal scanner tables (stalker_portals, portal_scan_results, portal_scan_history)
	{
		version: 31,
		name: 'add_portal_scanner_tables',
		apply: (sqlite) => {
			// Create stalker_portals table if it doesn't exist
			if (!tableExists(sqlite, 'stalker_portals')) {
				sqlite
					.prepare(
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
					)`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_stalker_portals_enabled" ON "stalker_portals" ("enabled")`
					)
					.run();
				logger.info('[SchemaSync] Created stalker_portals table');
			}

			// Add portal_id and discovered_from_scan columns to stalker_accounts
			if (!columnExists(sqlite, 'stalker_accounts', 'portal_id')) {
				sqlite
					.prepare(
						`ALTER TABLE "stalker_accounts" ADD COLUMN "portal_id" text REFERENCES "stalker_portals"("id") ON DELETE SET NULL`
					)
					.run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'discovered_from_scan')) {
				sqlite
					.prepare(
						`ALTER TABLE "stalker_accounts" ADD COLUMN "discovered_from_scan" integer DEFAULT 0`
					)
					.run();
			}

			// Create portal_scan_results table if it doesn't exist
			if (!tableExists(sqlite, 'portal_scan_results')) {
				sqlite
					.prepare(
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
					)`
					)
					.run();
				sqlite
					.prepare(
						`CREATE UNIQUE INDEX IF NOT EXISTS "idx_scan_results_portal_mac" ON "portal_scan_results" ("portal_id", "mac_address")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_scan_results_portal_status" ON "portal_scan_results" ("portal_id", "status")`
					)
					.run();
				logger.info('[SchemaSync] Created portal_scan_results table');
			}

			// Create portal_scan_history table if it doesn't exist
			if (!tableExists(sqlite, 'portal_scan_history')) {
				sqlite
					.prepare(
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
					)`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_scan_history_portal" ON "portal_scan_history" ("portal_id")`
					)
					.run();
				sqlite
					.prepare(
						`CREATE INDEX IF NOT EXISTS "idx_scan_history_status" ON "portal_scan_history" ("status")`
					)
					.run();
				logger.info('[SchemaSync] Created portal_scan_history table');
			}

			logger.info('[SchemaSync] Added portal scanner tables');
		}
	},

	// Version 32: Add EPG tracking columns to stalker_accounts for visibility and sync status
	{
		version: 32,
		name: 'add_stalker_epg_tracking',
		apply: (sqlite) => {
			// Add EPG tracking columns to stalker_accounts
			if (!columnExists(sqlite, 'stalker_accounts', 'last_epg_sync_at')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "last_epg_sync_at" text`).run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'last_epg_sync_error')) {
				sqlite
					.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "last_epg_sync_error" text`)
					.run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'epg_program_count')) {
				sqlite
					.prepare(
						`ALTER TABLE "stalker_accounts" ADD COLUMN "epg_program_count" integer DEFAULT 0`
					)
					.run();
			}
			if (!columnExists(sqlite, 'stalker_accounts', 'has_epg')) {
				sqlite.prepare(`ALTER TABLE "stalker_accounts" ADD COLUMN "has_epg" integer`).run();
			}

			logger.info('[SchemaSync] Added EPG tracking columns to stalker_accounts');
		}
	},

	// Version 33: Add EPG source override column to channel_lineup_items
	{
		version: 33,
		name: 'add_epg_source_override',
		apply: (sqlite) => {
			if (!columnExists(sqlite, 'channel_lineup_items', 'epg_source_channel_id')) {
				sqlite
					.prepare(
						`ALTER TABLE "channel_lineup_items" ADD COLUMN "epg_source_channel_id" text REFERENCES "stalker_channels"("id") ON DELETE SET NULL`
					)
					.run();
				logger.info('[SchemaSync] Added epg_source_channel_id column to channel_lineup_items');
			}
		}
	},

	// Version 34: Add url_base column to download_clients
	{
		version: 34,
		name: 'add_download_client_url_base',
		apply: (sqlite) => {
			if (!columnExists(sqlite, 'download_clients', 'url_base')) {
				sqlite.prepare(`ALTER TABLE "download_clients" ADD COLUMN "url_base" text`).run();
				logger.info('[SchemaSync] Added url_base column to download_clients');
			}
		}
	},

	// Version 35: Add mount_mode column to download_clients
	{
		version: 35,
		name: 'add_download_client_mount_mode',
		apply: (sqlite) => {
			if (!columnExists(sqlite, 'download_clients', 'mount_mode')) {
				sqlite.prepare(`ALTER TABLE "download_clients" ADD COLUMN "mount_mode" text`).run();
				logger.info('[SchemaSync] Added mount_mode column to download_clients');
			}
		}
	},

	// Version 36: Add nzb_segment_cache table for persistent prefetched segments
	{
		version: 36,
		name: 'add_nzb_segment_cache',
		apply: (sqlite) => {
			sqlite
				.prepare(
					`CREATE TABLE IF NOT EXISTS "nzb_segment_cache" (
				"id" text PRIMARY KEY NOT NULL,
				"mount_id" text NOT NULL REFERENCES "nzb_stream_mounts"("id") ON DELETE CASCADE,
				"file_index" integer NOT NULL,
				"segment_index" integer NOT NULL,
				"data" blob NOT NULL,
				"size" integer NOT NULL,
				"created_at" text
			)`
				)
				.run();

			// Create indexes
			sqlite
				.prepare(
					`CREATE UNIQUE INDEX IF NOT EXISTS "idx_segment_cache_lookup" ON "nzb_segment_cache" ("mount_id", "file_index", "segment_index")`
				)
				.run();
			sqlite
				.prepare(
					`CREATE INDEX IF NOT EXISTS "idx_segment_cache_mount" ON "nzb_segment_cache" ("mount_id")`
				)
				.run();

			logger.info(
				'[SchemaSync] Created nzb_segment_cache table for persistent prefetched segments'
			);
		}
	},
	// Version 37: Add stream_url_type to stalker_accounts
	{
		version: 37,
		name: 'add_stream_url_type',
		apply: (sqlite) => {
			// Add column for tracking URL resolution method
			// 'direct' = URLs from get_all_channels work directly
			// 'create_link' = Need to call create_link API to resolve URLs
			sqlite
				.prepare(
					`ALTER TABLE "stalker_accounts" ADD COLUMN "stream_url_type" text DEFAULT 'unknown'`
				)
				.run();

			logger.info(
				'[SchemaSync] Added stream_url_type column to stalker_accounts for URL resolution tracking'
			);
		}
	},
	// Version 38: Add alternate_titles table for multi-title search support
	{
		version: 38,
		name: 'add_alternate_titles',
		apply: (sqlite) => {
			// Create the alternate_titles table if it doesn't exist
			if (!tableExists(sqlite, 'alternate_titles')) {
				sqlite
					.prepare(
						`CREATE TABLE "alternate_titles" (
							"id" integer PRIMARY KEY AUTOINCREMENT,
							"media_type" text NOT NULL CHECK ("media_type" IN ('movie', 'series')),
							"media_id" text NOT NULL,
							"title" text NOT NULL,
							"clean_title" text NOT NULL,
							"source" text NOT NULL CHECK ("source" IN ('tmdb', 'user')),
							"language" text,
							"country" text,
							"created_at" text
						)`
					)
					.run();

				// Create indexes for efficient lookup
				sqlite
					.prepare(
						`CREATE INDEX "idx_alternate_titles_media" ON "alternate_titles" ("media_type", "media_id")`
					)
					.run();
				sqlite
					.prepare(`CREATE INDEX "idx_alternate_titles_source" ON "alternate_titles" ("source")`)
					.run();

				logger.info('[SchemaSync] Created alternate_titles table for multi-title search support');
			}
		}
	}
];

/**
 * Get current schema version from database
 */
function getSchemaVersion(sqlite: Database.Database): number {
	try {
		const result = sqlite
			.prepare(`SELECT value FROM settings WHERE key = 'schema_version'`)
			.get() as { value: string } | undefined;
		return result ? parseInt(result.value, 10) : 0;
	} catch {
		// Table doesn't exist yet
		return 0;
	}
}

/**
 * Set schema version in database
 */
function setSchemaVersion(sqlite: Database.Database, version: number): void {
	sqlite
		.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)`)
		.run(version.toString());
}

/**
 * Check if a table exists in the database
 */
function tableExists(sqlite: Database.Database, tableName: string): boolean {
	const result = sqlite
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
		.get(tableName);
	return !!result;
}

/**
 * Check if a column exists in a table
 */
function columnExists(sqlite: Database.Database, tableName: string, columnName: string): boolean {
	const result = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
	return result.some((col) => col.name === columnName);
}

/**
 * Check if database has legacy Live TV schema from before the rewrite.
 * This detects databases that need cleanup before migrations can run safely.
 *
 * Legacy indicators:
 * - stalker_portal_accounts: Old table structure (v11-16 GitHub version)
 * - epg_sources: Old XMLTV-based EPG system
 * - livetv_channels_cache: Intermediate external API system (v14-21)
 */
function hasLegacyLiveTvSchema(sqlite: Database.Database): boolean {
	return (
		tableExists(sqlite, 'stalker_portal_accounts') ||
		tableExists(sqlite, 'epg_sources') ||
		tableExists(sqlite, 'livetv_channels_cache')
	);
}

/**
 * Clean up all Live TV related tables (legacy and current).
 * This is used when migrating from incompatible schema versions.
 * Tables will be recreated fresh from TABLE_DEFINITIONS.
 */
function cleanupLiveTvTables(sqlite: Database.Database): void {
	const liveTvTables = [
		// Old v11-16 GitHub tables
		'stalker_portal_accounts',
		'epg_sources',
		'live_events',
		// Intermediate v14-21 external API tables
		'livetv_channels_cache',
		'livetv_categories',
		'livetv_lineup',
		'livetv_events_cache',
		'livetv_settings',
		'livetv_stream_health',
		'livetv_epg_sources',
		'livetv_epg_channel_map',
		'livetv_epg_programs',
		'livetv_epg_cache',
		// Current v23-28 tables (will be recreated from TABLE_DEFINITIONS)
		'channel_lineup_backups',
		'epg_programs',
		'channel_lineup_items',
		'channel_categories',
		'stalker_channels',
		'stalker_categories',
		'stalker_accounts',
		// Old settings table
		'live_tv_settings'
	];

	// Drop in reverse dependency order (children before parents)
	for (const table of liveTvTables) {
		if (tableExists(sqlite, table)) {
			sqlite.prepare(`DROP TABLE "${table}"`).run();
			logger.info(`[SchemaSync] Dropped legacy Live TV table: ${table}`);
		}
	}

	// Clean up orphaned indexes that might reference old tables
	const orphanedIndexes = [
		'idx_stalker_accounts_priority',
		'idx_epg_sources_enabled',
		'idx_epg_sources_priority',
		'idx_livetv_cache_country',
		'idx_livetv_cache_status',
		'idx_livetv_categories_position',
		'idx_livetv_lineup_position',
		'idx_livetv_lineup_category',
		'idx_livetv_lineup_channel',
		'idx_livetv_events_sport',
		'idx_livetv_events_status',
		'idx_livetv_events_time',
		'idx_livetv_health_status',
		'idx_livetv_epg_sources_enabled',
		'idx_livetv_epg_channel_map_source',
		'idx_livetv_epg_channel_map_channel',
		'idx_livetv_epg_programs_channel',
		'idx_livetv_epg_programs_source',
		'idx_livetv_epg_programs_time',
		'idx_livetv_epg_source_name',
		'idx_livetv_epg_xmltv_lookup'
	];

	for (const index of orphanedIndexes) {
		try {
			sqlite.prepare(`DROP INDEX IF EXISTS "${index}"`).run();
		} catch {
			// Index might not exist, that's fine
		}
	}
}

/**
 * Critical columns that must exist for the app to function.
 * Used to verify schema integrity after migrations.
 */
const CRITICAL_COLUMNS: Record<string, string[]> = {
	download_clients: ['id', 'name', 'implementation', 'host', 'port', 'url_base', 'mount_mode'],
	root_folders: ['id', 'path', 'read_only', 'preserve_symlinks'],
	movies: ['id', 'tmdb_id', 'title', 'path', 'monitored'],
	series: ['id', 'tmdb_id', 'title', 'path', 'monitored'],
	episodes: ['id', 'series_id', 'season_number', 'episode_number'],
	indexers: ['id', 'name', 'definition_id', 'enabled'],
	scoring_profiles: ['id', 'name', 'is_default']
};

/**
 * Compute a checksum for a migration (used for tracking changes)
 */
function computeMigrationChecksum(migration: MigrationDefinition): string {
	const content = `${migration.version}:${migration.name}:${migration.apply.toString()}`;
	return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Get all applied migrations from the schema_migrations table
 */
function getAppliedMigrations(
	sqlite: Database.Database
): Map<number, { checksum: string; success: number }> {
	const applied = new Map<number, { checksum: string; success: number }>();
	if (!tableExists(sqlite, 'schema_migrations')) return applied;

	const rows = sqlite
		.prepare(`SELECT version, checksum, success FROM schema_migrations`)
		.all() as Array<{ version: number; checksum: string; success: number }>;
	for (const row of rows) {
		applied.set(row.version, { checksum: row.checksum, success: row.success });
	}
	return applied;
}

/**
 * Backfill migration records for existing databases that were using the legacy schema_version system.
 * This ensures backward compatibility when upgrading from the old single-version tracking.
 */
function backfillMigrationRecords(sqlite: Database.Database): void {
	const legacyVersion = getSchemaVersion(sqlite);
	if (legacyVersion === 0) return;

	// Check if we already have migration records
	const existingRecords = sqlite
		.prepare(`SELECT COUNT(*) as count FROM schema_migrations`)
		.get() as { count: number };
	if (existingRecords.count > 0) return;

	logger.info('[SchemaSync] Backfilling migration records for legacy database', { legacyVersion });

	const now = new Date().toISOString();
	const stmt = sqlite.prepare(`
		INSERT OR IGNORE INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms, success)
		VALUES (?, ?, ?, ?, 0, 1)
	`);

	for (const migration of MIGRATIONS) {
		if (migration.version <= legacyVersion) {
			stmt.run(migration.version, migration.name, computeMigrationChecksum(migration), now);
		}
	}
}

/**
 * Map of migration versions to the columns they should create.
 * Used for drift detection - if a migration is marked as applied but the column doesn't exist,
 * we mark it as failed so it re-runs.
 */
const MIGRATION_COLUMN_MAP: Record<number, Array<{ table: string; column: string }>> = {
	3: [{ table: 'root_folders', column: 'read_only' }],
	5: [{ table: 'root_folders', column: 'preserve_symlinks' }],
	11: [
		{ table: 'download_clients', column: 'temp_path_local' },
		{ table: 'download_clients', column: 'temp_path_remote' }
	],
	34: [{ table: 'download_clients', column: 'url_base' }],
	35: [{ table: 'download_clients', column: 'mount_mode' }]
};

/**
 * Detect schema drift and mark affected migrations for re-run.
 * This handles the case where schema_version says X but columns from migration X are missing.
 */
function detectAndFixSchemaDrift(sqlite: Database.Database): void {
	let driftFound = false;

	for (const [versionStr, columns] of Object.entries(MIGRATION_COLUMN_MAP)) {
		const version = parseInt(versionStr, 10);

		for (const { table, column } of columns) {
			if (tableExists(sqlite, table) && !columnExists(sqlite, table, column)) {
				// Column should exist but doesn't - mark migration as failed so it re-runs
				logger.warn(
					`[SchemaSync] Schema drift detected: ${table}.${column} missing (migration v${version})`
				);
				sqlite.prepare(`UPDATE schema_migrations SET success = 0 WHERE version = ?`).run(version);
				driftFound = true;
			}
		}
	}

	if (driftFound) {
		logger.info('[SchemaSync] Schema drift detected and migrations marked for re-run');
	}
}

/**
 * Verify schema integrity by checking that critical columns exist.
 * Throws an error if any critical columns are missing.
 */
function verifySchemaIntegrity(sqlite: Database.Database): void {
	const issues: string[] = [];

	for (const [table, columns] of Object.entries(CRITICAL_COLUMNS)) {
		if (!tableExists(sqlite, table)) {
			// Some tables may not exist yet (e.g., if no movies added)
			// Only flag as issue if other parts of the table exist
			continue;
		}

		for (const column of columns) {
			if (!columnExists(sqlite, table, column)) {
				issues.push(`Missing column: ${table}.${column}`);
			}
		}
	}

	if (issues.length > 0) {
		logger.error('[SchemaSync] Schema integrity check failed', { issues });
		throw new Error(`Schema integrity check failed: ${issues.join(', ')}`);
	}
}

/**
 * Apply a single migration with transaction wrapping and tracking
 */
function applyMigration(sqlite: Database.Database, migration: MigrationDefinition): void {
	const checksum = computeMigrationChecksum(migration);
	const startTime = Date.now();

	logger.info(`[SchemaSync] Applying migration v${migration.version}: ${migration.name}`);

	// Mark as in-progress (success=0)
	sqlite
		.prepare(
			`
		INSERT OR REPLACE INTO schema_migrations (version, name, checksum, applied_at, success)
		VALUES (?, ?, ?, ?, 0)
	`
		)
		.run(migration.version, migration.name, checksum, new Date().toISOString());

	try {
		// Run migration in a transaction
		sqlite.transaction(() => {
			migration.apply(sqlite);
		})();

		const executionTime = Date.now() - startTime;

		// Mark as successful
		sqlite
			.prepare(`UPDATE schema_migrations SET success = 1, execution_time_ms = ? WHERE version = ?`)
			.run(executionTime, migration.version);

		logger.info(`[SchemaSync] Migration v${migration.version} completed in ${executionTime}ms`);
	} catch (error) {
		logger.error(`[SchemaSync] Migration v${migration.version} failed`, {
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
}

/**
 * Synchronize database schema using per-migration tracking.
 *
 * This approach provides:
 * - Individual tracking of each migration
 * - Automatic retry of failed migrations on restart
 * - Backward compatibility with legacy schema_version
 * - Schema integrity verification
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
			logger.error('[SchemaSync] Failed to create table', {
				error: error instanceof Error ? error.message : String(error),
				sql: tableDef.substring(0, 100) + '...'
			});
			throw error;
		}
	}

	// 5. Create all indexes
	logger.info('[SchemaSync] Creating indexes...');
	for (const indexDef of INDEX_DEFINITIONS) {
		try {
			sqlite.prepare(indexDef).run();
		} catch (error) {
			logger.warn('[SchemaSync] Index creation warning', {
				error: error instanceof Error ? error.message : String(error)
			});
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
		logger.info('[SchemaSync] Applying migrations', {
			count: pending.length,
			versions: pending.map((m) => m.version)
		});

		for (const migration of pending) {
			applyMigration(sqlite, migration);
		}
	}

	// 8. Verify schema integrity
	verifySchemaIntegrity(sqlite);

	// 9. Update legacy schema_version for backward compatibility
	setSchemaVersion(sqlite, CURRENT_SCHEMA_VERSION);

	logger.info('[SchemaSync] Schema synchronization complete', {
		version: CURRENT_SCHEMA_VERSION
	});
}
