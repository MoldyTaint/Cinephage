import type { MigrationDefinition } from '../migration-helpers.js';
// Version 2: Add missing tables that were defined in schema.ts but not in schema-sync.ts

export const migration_v002: MigrationDefinition = {
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
};
