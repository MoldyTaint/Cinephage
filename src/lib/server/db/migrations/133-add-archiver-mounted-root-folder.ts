import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists, tableExists } from '../migration-helpers.js';

export const migration_v133: MigrationDefinition = {
	version: 133,
	name: 'add_archiver_mounted_root_folder',
	apply: (sqlite) => {
		if (
			!tableExists(sqlite, 'archivers') ||
			columnExists(sqlite, 'archivers', 'mounted_root_folder_id')
		) {
			return;
		}
		sqlite
			.prepare(
				'ALTER TABLE "archivers" ADD COLUMN "mounted_root_folder_id" text REFERENCES "root_folders"("id") ON DELETE SET NULL'
			)
			.run();
	}
};
