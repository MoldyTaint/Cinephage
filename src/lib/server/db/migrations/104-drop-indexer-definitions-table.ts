import type { MigrationDefinition } from '../migration-helpers.js';
import { tableExists } from '../migration-helpers.js';

/**
 * Migration 104: Drop the vestigial indexer_definitions table.
 *
 * This table was defined in Drizzle schema and schema-sync but was never
 * written to or read by any application code. All definition access has
 * always been filesystem/YAML-backed through YamlDefinitionLoader.
 *
 * Dropping this table removes confusion and dead-weight from the schema.
 * The related Drizzle definition, relations, types, and schema-sync blocks
 * are removed in the same changeset.
 */
export const migration_v104: MigrationDefinition = {
	version: 104,
	name: 'drop_indexer_definitions_table',
	apply: (sqlite) => {
		if (tableExists(sqlite, 'indexer_definitions')) {
			// Drop indexes first to avoid orphaned index warnings
			sqlite.prepare(`DROP INDEX IF EXISTS "idx_indexer_definitions_protocol"`).run();
			sqlite.prepare(`DROP INDEX IF EXISTS "idx_indexer_definitions_type"`).run();
			sqlite.prepare(`DROP TABLE IF EXISTS "indexer_definitions"`).run();
		}
	}
};
