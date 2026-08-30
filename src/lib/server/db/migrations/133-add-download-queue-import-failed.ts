import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v133: MigrationDefinition = {
	version: 133,
	name: 'add_download_queue_import_failed',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'download_queue', 'import_failed')) {
			sqlite
				.prepare(
					`ALTER TABLE "download_queue" ADD COLUMN "import_failed" integer NOT NULL DEFAULT 0`
				)
				.run();
		}
	}
};
