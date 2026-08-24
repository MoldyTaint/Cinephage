/**
 * Migration 131: purge legacy orphaned unmatched_files rows.
 *
 * unmatched_files.root_folder_id now carries ON DELETE CASCADE, but rows
 * created before foreign-key enforcement was enabled can still reference
 * root folders that no longer exist. Those orphans surface in the Unmatched
 * UI as "root folder missing" entries and can never be matched (#513).
 *
 * The files themselves are re-discovered (and re-inserted with a valid root
 * folder) on the next scan, so deleting the dead references is safe.
 */
import type { MigrationDefinition } from '../migration-helpers.js';

export const migration_v131: MigrationDefinition = {
	version: 131,
	name: 'purge_orphaned_unmatched_files',
	apply: (sqlite) => {
		sqlite
			.prepare(
				`DELETE FROM "unmatched_files"
				 WHERE "root_folder_id" IS NOT NULL
				   AND NOT EXISTS (
				       SELECT 1 FROM "root_folders" WHERE "root_folders"."id" = "unmatched_files"."root_folder_id"
				   )`
			)
			.run();
	}
};
