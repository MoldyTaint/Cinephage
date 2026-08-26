import type { MigrationDefinition } from '../migration-helpers.js';
import { tableExists } from '../migration-helpers.js';

export const migration_v132: MigrationDefinition = {
	version: 132,
	name: 'add_archivers',
	apply: (sqlite) => {
		if (tableExists(sqlite, 'archivers')) return;
		sqlite
			.prepare(
				`CREATE TABLE "archivers" (
					"id" text PRIMARY KEY NOT NULL,
					"name" text NOT NULL,
					"type" text NOT NULL DEFAULT 'rclone' CHECK ("type" IN ('rclone')),
					"endpoint" text NOT NULL,
					"username" text,
					"password" text,
					"remote" text NOT NULL,
					"base_path" text NOT NULL DEFAULT '',
					"timeout_seconds" integer NOT NULL DEFAULT 3600,
					"enabled" integer NOT NULL DEFAULT 1,
					"last_tested_at" text,
					"test_result" text,
					"test_error" text,
					"created_at" text,
					"updated_at" text
				)`
			)
			.run();
	}
};
