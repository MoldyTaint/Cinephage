import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v100: MigrationDefinition = {
	version: 100,
	name: 'add_scoring_profile_prevent_downgrades',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'scoring_profiles', 'prevent_downgrades')) {
			sqlite
				.prepare(`ALTER TABLE "scoring_profiles" ADD COLUMN "prevent_downgrades" integer DEFAULT 0`)
				.run();
		}
	}
};
