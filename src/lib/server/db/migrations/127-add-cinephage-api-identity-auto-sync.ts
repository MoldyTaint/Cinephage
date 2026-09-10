import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

/**
 * Add auto-synced identity columns to cinephage_api_config.
 *
 * The api.cinephage.net gateway only accepts the newest published release as
 * X-Cinephage-Version / X-Cinephage-Commit, so previously-migrated override
 * values (e.g. 0.14.2/9bb5561) went stale after the next release and broke
 * stream resolution with HTTP 401.
 *
 * This migration:
 *   - adds latest_version / latest_commit / auto_update columns
 *   - moves existing override values into latest_* (they become the seed for
 *     the identity sync) and clears the manual overrides
 */
export const migration_v127: MigrationDefinition = {
	version: 127,
	name: 'add_cinephage_api_identity_auto_sync',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'cinephage_api_config', 'latest_version')) {
			sqlite.prepare(`ALTER TABLE "cinephage_api_config" ADD COLUMN "latest_version" text`).run();
		}
		if (!columnExists(sqlite, 'cinephage_api_config', 'latest_commit')) {
			sqlite.prepare(`ALTER TABLE "cinephage_api_config" ADD COLUMN "latest_commit" text`).run();
		}
		if (!columnExists(sqlite, 'cinephage_api_config', 'auto_update')) {
			sqlite
				.prepare(`ALTER TABLE "cinephage_api_config" ADD COLUMN "auto_update" integer DEFAULT 1`)
				.run();
		}

		const row = sqlite
			.prepare(`SELECT version_override, commit_override FROM cinephage_api_config WHERE id = 1`)
			.get() as { version_override: string | null; commit_override: string | null } | undefined;

		if (row && (row.version_override || row.commit_override)) {
			sqlite
				.prepare(
					`UPDATE "cinephage_api_config" SET latest_version = ?, latest_commit = ?, version_override = NULL, commit_override = NULL, updated_at = ? WHERE id = 1`
				)
				.run(row.version_override, row.commit_override, new Date().toISOString());
		}
	}
};
