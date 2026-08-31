import { columnExists } from '../migration-helpers.js';
import type { MigrationDefinition } from '../migration-helpers.js';

export const migration_v134: MigrationDefinition = {
	version: 134,
	name: 'add_download_history_info_hash',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'download_history', 'info_hash')) {
			sqlite.prepare(`ALTER TABLE "download_history" ADD COLUMN "info_hash" text`).run();
		}
		sqlite
			.prepare(
				`CREATE INDEX IF NOT EXISTS "idx_download_history_info_hash" ON "download_history" ("info_hash")`
			)
			.run();
		sqlite
			.prepare(
				`UPDATE download_history
				 SET info_hash = (
					 SELECT info_hash
					 FROM download_queue
					 WHERE download_queue.download_id = download_history.download_id
					   AND download_queue.info_hash IS NOT NULL
					 LIMIT 1
				 )
				 WHERE info_hash IS NULL`
			)
			.run();
	}
};
