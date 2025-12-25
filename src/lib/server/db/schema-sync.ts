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
import { logger } from '$lib/logging';

/**
 * Current schema version - increment when adding schema changes
 * Version 1: Initial complete schema
 * Version 2: Added profile_size_limits, custom_formats, naming_presets tables
 * Version 3: Added read_only column to root_folders for virtual mount support (NZBDav)
 * Version 4: Fix invalid scoring profile references and ensure default profile exists
 * Version 5: Added preserve_symlinks column to root_folders for NZBDav/rclone symlink preservation
 */
export const CURRENT_SCHEMA_VERSION = 5;

/**
 * All table definitions with CREATE TABLE IF NOT EXISTS
 * Order matters for foreign key constraints
 */
const TABLE_DEFINITIONS: string[] = [
	// Core tables (no foreign keys)
	`CREATE TABLE IF NOT EXISTS "user" (
		"id" text PRIMARY KEY NOT NULL,
		"age" integer
	)`,

	`CREATE TABLE IF NOT EXISTS "settings" (
		"key" text PRIMARY KEY NOT NULL,
		"value" text NOT NULL
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

	`CREATE TABLE IF NOT EXISTS "quality_definitions" (
		"id" text PRIMARY KEY NOT NULL,
		"resolution" text NOT NULL UNIQUE,
		"title" text NOT NULL,
		"weight" integer DEFAULT 0 NOT NULL,
		"min_size_mb_per_minute" text,
		"max_size_mb_per_minute" text,
		"preferred_size_mb_per_minute" text,
		"created_at" text,
		"updated_at" text
	)`,

	`CREATE TABLE IF NOT EXISTS "quality_presets" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"min_resolution" text,
		"preferred_resolution" text,
		"max_resolution" text,
		"allowed_sources" text,
		"excluded_sources" text,
		"prefer_hdr" integer DEFAULT false,
		"is_default" integer DEFAULT false,
		"min_size_mb" integer,
		"max_size_mb" integer,
		"created_at" text,
		"updated_at" text
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
		"movie_category" text DEFAULT 'movies',
		"tv_category" text DEFAULT 'tv',
		"recent_priority" text DEFAULT 'normal',
		"older_priority" text DEFAULT 'normal',
		"initial_state" text DEFAULT 'start',
		"seed_ratio_limit" text,
		"seed_time_limit" integer,
		"download_path_local" text,
		"download_path_remote" text,
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
		"quality_preset_id" text REFERENCES "quality_presets"("id") ON DELETE SET NULL,
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
		"quality_preset_id" text REFERENCES "quality_presets"("id") ON DELETE SET NULL,
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
	`CREATE INDEX IF NOT EXISTS "idx_stream_cache_hit_count" ON "stream_extraction_cache" ("hit_count")`
];

/**
 * Schema updates keyed by version number
 * Each function runs when upgrading TO that version
 *
 * Example for future updates:
 * 2: (sqlite) => {
 *   sqlite.prepare(`ALTER TABLE movies ADD COLUMN new_field TEXT`).run();
 * }
 */
const SCHEMA_UPDATES: Record<number, (sqlite: Database.Database) => void> = {
	// Version 1 is the initial schema - handled by TABLE_DEFINITIONS
	// Version 2: Add missing tables that were defined in schema.ts but not in schema-sync.ts
	2: (sqlite) => {
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
	},

	// Version 3: Add read_only column to root_folders for virtual mount support (NZBDav)
	3: (sqlite) => {
		// Only add column if it doesn't exist (may already exist from fresh TABLE_DEFINITIONS)
		if (!columnExists(sqlite, 'root_folders', 'read_only')) {
			sqlite.prepare(`ALTER TABLE root_folders ADD COLUMN read_only INTEGER DEFAULT 0`).run();
		}
	},

	// Version 4: Fix invalid scoring profile references and ensure default profile exists
	4: (sqlite) => {
		// Ensure a default profile exists (set 'compact' as default if none)
		const hasDefault = sqlite.prepare(`SELECT id FROM scoring_profiles WHERE is_default = 1`).get();

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
	},

	// Version 5: Add preserve_symlinks column to root_folders for NZBDav/rclone symlink preservation
	5: (sqlite) => {
		// Only add column if it doesn't exist (may already exist from fresh TABLE_DEFINITIONS)
		if (!columnExists(sqlite, 'root_folders', 'preserve_symlinks')) {
			sqlite
				.prepare(`ALTER TABLE root_folders ADD COLUMN preserve_symlinks INTEGER DEFAULT 0`)
				.run();
			logger.info('[SchemaSync] Added preserve_symlinks column to root_folders');
		}
	}
};

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
 * Synchronize database schema
 * - Creates missing tables
 * - Runs version-based updates
 * - Sets schema version
 */
export function syncSchema(sqlite: Database.Database): void {
	const currentVersion = getSchemaVersion(sqlite);

	logger.info('[SchemaSync] Starting schema synchronization', {
		currentVersion,
		targetVersion: CURRENT_SCHEMA_VERSION
	});

	// Check if this is an existing database from the migration era
	const hasDrizzleMigrations = tableExists(sqlite, '__drizzle_migrations');
	const _hasSettingsTable = tableExists(sqlite, 'settings');

	if (hasDrizzleMigrations && currentVersion === 0) {
		// This is an existing database that was using migrations
		// All tables should exist, just need to set version
		logger.info('[SchemaSync] Detected existing database from migration era');
	}

	// Create all tables (IF NOT EXISTS makes this safe)
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

	// Create all indexes
	logger.info('[SchemaSync] Creating indexes...');
	for (const indexDef of INDEX_DEFINITIONS) {
		try {
			sqlite.prepare(indexDef).run();
		} catch (error) {
			// Index errors are usually not fatal (might already exist differently)
			logger.warn('[SchemaSync] Index creation warning', {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	// Run incremental updates if needed
	if (currentVersion < CURRENT_SCHEMA_VERSION) {
		logger.info('[SchemaSync] Running schema updates...', {
			from: currentVersion,
			to: CURRENT_SCHEMA_VERSION
		});

		for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
			const update = SCHEMA_UPDATES[v];
			if (update) {
				logger.info(`[SchemaSync] Applying update to version ${v}`);
				try {
					update(sqlite);
				} catch (error) {
					logger.error(`[SchemaSync] Failed to apply update ${v}`, {
						error: error instanceof Error ? error.message : String(error)
					});
					throw error;
				}
			}
		}
	}

	// Set the schema version
	setSchemaVersion(sqlite, CURRENT_SCHEMA_VERSION);

	// Clean up old drizzle migrations table if it exists (optional)
	// We keep it for now as it doesn't hurt anything

	logger.info('[SchemaSync] Schema synchronization complete', {
		version: CURRENT_SCHEMA_VERSION
	});
}
