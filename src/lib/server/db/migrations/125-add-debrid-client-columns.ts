import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v125: MigrationDefinition = {
	version: 125,
	name: 'add_debrid_client_columns',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'download_clients', 'api_token')) {
			sqlite.prepare(`ALTER TABLE "download_clients" ADD COLUMN "api_token" text`).run();
		}
		if (!columnExists(sqlite, 'download_clients', 'remove_after_import')) {
			sqlite
				.prepare(
					`ALTER TABLE "download_clients" ADD COLUMN "remove_after_import" integer DEFAULT 0`
				)
				.run();
		}
	}
};
