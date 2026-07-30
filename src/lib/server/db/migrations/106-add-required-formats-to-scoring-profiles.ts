import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v106: MigrationDefinition = {
	version: 106,
	name: 'add_required_formats_to_scoring_profiles',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'scoring_profiles', 'required_formats')) {
			sqlite.prepare(`ALTER TABLE "scoring_profiles" ADD COLUMN "required_formats" text`).run();
		}
	}
};
