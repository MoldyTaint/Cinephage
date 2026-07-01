import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v101: MigrationDefinition = {
	version: 101,
	name: 'add_download_queue_stalled_since',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'download_queue', 'stalled_since')) {
			sqlite.prepare(`ALTER TABLE "download_queue" ADD COLUMN "stalled_since" text`).run();
		}

		// Backfill currently-stalled rows so existing dead torrents start their timer
		// immediately rather than waiting for the next status transition.
		sqlite
			.prepare(
				`UPDATE "download_queue" SET "stalled_since" = ? WHERE "status" = 'stalled' AND "stalled_since" IS NULL`
			)
			.run(new Date().toISOString());
	}
};
