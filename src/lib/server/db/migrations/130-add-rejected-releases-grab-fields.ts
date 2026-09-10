import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v130: MigrationDefinition = {
	version: 130,
	name: 'add_rejected_releases_grab_fields',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'rejected_releases', 'download_url')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "download_url" text`).run();
		}
		if (!columnExists(sqlite, 'rejected_releases', 'magnet_url')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "magnet_url" text`).run();
		}
		if (!columnExists(sqlite, 'rejected_releases', 'info_hash')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "info_hash" text`).run();
		}
		if (!columnExists(sqlite, 'rejected_releases', 'indexer_guid')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "indexer_guid" text`).run();
		}
		if (!columnExists(sqlite, 'rejected_releases', 'indexer_id')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "indexer_id" text`).run();
		}
	}
};
