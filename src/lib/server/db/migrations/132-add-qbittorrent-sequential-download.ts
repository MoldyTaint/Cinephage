import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v132: MigrationDefinition = {
	version: 132,
	name: 'add_qbittorrent_sequential_download',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'download_clients', 'sequential_download')) {
			sqlite
				.prepare(
					`ALTER TABLE "download_clients" ADD COLUMN "sequential_download" integer DEFAULT 0`
				)
				.run();
		}
	}
};
