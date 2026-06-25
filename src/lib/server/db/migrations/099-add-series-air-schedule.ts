import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v099: MigrationDefinition = {
	version: 99,
	name: 'add_series_air_schedule',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'series', 'airs_day')) {
			sqlite.prepare(`ALTER TABLE "series" ADD COLUMN "airs_day" text`).run();
		}
		if (!columnExists(sqlite, 'series', 'airs_time')) {
			sqlite.prepare(`ALTER TABLE "series" ADD COLUMN "airs_time" text`).run();
		}
	}
};
