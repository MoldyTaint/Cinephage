import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';

export const migration_v129: MigrationDefinition = {
	version: 129,
	name: 'add_rejected_releases_reason_columns',
	apply: (sqlite) => {
		if (!columnExists(sqlite, 'rejected_releases', 'primary_reason')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "primary_reason" text`).run();
		}
		if (!columnExists(sqlite, 'rejected_releases', 'rule_fired')) {
			sqlite.prepare(`ALTER TABLE "rejected_releases" ADD COLUMN "rule_fired" text`).run();
		}
	}
};
