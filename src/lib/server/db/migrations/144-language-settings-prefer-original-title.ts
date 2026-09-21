import type Database from 'better-sqlite3';
import type { MigrationDefinition } from '../migration-helpers.js';
import { ensureColumn } from '../migration-helpers.js';

/**
 * Version 141: Instance default for original-title display.
 *
 * Adds language_settings.prefer_original_title (boolean, NOT NULL, default 0)
 * as the instance-wide fallback for the per-item prefer_original_title flags
 * on movies and series (migration 126). Resolution at display time is
 * per-item value ?? instance default; existing rows and fresh singletons
 * default to 0 (show the localized title), which preserves prior behavior
 * wherever a per-item value is unset.
 */
export const migration_v144: MigrationDefinition = {
	version: 144,
	name: 'language_settings_prefer_original_title',
	apply: (sqlite: Database.Database) => {
		ensureColumn(
			sqlite,
			'language_settings',
			'prefer_original_title',
			'"prefer_original_title" integer DEFAULT 0 NOT NULL'
		);
	}
};
