import type { MigrationDefinition } from '../migration-helpers.js';
import { tableExists } from '../migration-helpers.js';

export const migration_v139: MigrationDefinition = {
	version: 139,
	name: 'add_arr_notification_configs',
	apply: (sqlite) => {
		if (!tableExists(sqlite, 'arr_notification_configs')) {
			sqlite
				.prepare(
					`CREATE TABLE "arr_notification_configs" (
						"id" text PRIMARY KEY NOT NULL,
						"app" text NOT NULL,
						"name" text NOT NULL,
						"on_grab" integer NOT NULL DEFAULT 0,
						"on_download" integer NOT NULL DEFAULT 0,
						"on_upgrade" integer NOT NULL DEFAULT 0,
						"on_movie_added" integer NOT NULL DEFAULT 0,
						"on_movie_delete" integer NOT NULL DEFAULT 0,
						"on_series_add" integer NOT NULL DEFAULT 0,
						"on_series_delete" integer NOT NULL DEFAULT 0,
						"config" text NOT NULL,
						"created_at" text NOT NULL
					)`
				)
				.run();
		}
		sqlite
			.prepare(
				`CREATE INDEX IF NOT EXISTS "idx_arr_notification_configs_app"
				 ON "arr_notification_configs" ("app")`
			)
			.run();
	}
};
