import type { MigrationDefinition } from '../migration-helpers.js';
// V80: Built-in profile score overrides - stores user-editable format score diffs for built-in profiles
// Built-in profiles (quality, balanced, compact, streamer) have shipped defaults in code.
// User edits to those scores are stored here as diffs only (entries different from shipped defaults).

export const migration_v080: MigrationDefinition = {
	version: 80,
	name: 'built_in_profile_score_overrides',
	apply: (sqlite) => {
		sqlite
			.prepare(
				`
			CREATE TABLE IF NOT EXISTS "built_in_profile_score_overrides" (
				"profile_id" text PRIMARY KEY,
				"format_scores" text,
				"updated_at" text
			)
		`
			)
			.run();
	}
};
