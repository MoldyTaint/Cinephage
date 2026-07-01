import type { MigrationDefinition } from '../migration-helpers.js';
import { tableExists } from '../migration-helpers.js';

export const migration_v102: MigrationDefinition = {
	version: 102,
	name: 'add_stalled_orphan_tracking_table',
	apply: (sqlite) => {
		if (!tableExists(sqlite, 'stalled_orphan_tracking')) {
			sqlite
				.prepare(
					`CREATE TABLE "stalled_orphan_tracking" (
						"download_client_id" text NOT NULL REFERENCES "download_clients"("id") ON DELETE CASCADE,
						"info_hash" text NOT NULL,
						"first_stalled_at" text NOT NULL,
						PRIMARY KEY ("download_client_id", "info_hash")
					)`
				)
				.run();
		}
	}
};
