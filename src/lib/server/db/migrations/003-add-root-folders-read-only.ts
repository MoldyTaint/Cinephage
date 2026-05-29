import type { MigrationDefinition } from '../migration-helpers.js';
import { columnExists } from '../migration-helpers.js';
// Version 3: Add read_only column to root_folders for virtual mount support (NZBDav)

export const migration_v003: MigrationDefinition = {
	version: 3,
	name: 'add_root_folders_read_only',
	apply: (sqlite) => {
		// Only add column if it doesn't exist (may already exist from fresh TABLE_DEFINITIONS)
		if (!columnExists(sqlite, 'root_folders', 'read_only')) {
			sqlite.prepare(`ALTER TABLE root_folders ADD COLUMN read_only INTEGER DEFAULT 0`).run();
		}
	}
};
