import type { MigrationDefinition } from '../migration-helpers.js';

export const migration_v136: MigrationDefinition = {
	version: 136,
	name: 'add_storage_items_file_id_indexes',
	apply: (sqlite) => {
		sqlite
			.prepare(
				`CREATE INDEX IF NOT EXISTS "idx_storage_items_episode_file"
				 ON "storage_items" ("episode_file_id")`
			)
			.run();
		sqlite
			.prepare(
				`CREATE INDEX IF NOT EXISTS "idx_storage_items_movie_file"
				 ON "storage_items" ("movie_file_id")`
			)
			.run();
	}
};
