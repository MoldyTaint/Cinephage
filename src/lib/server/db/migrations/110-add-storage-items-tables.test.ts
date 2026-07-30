import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { MigrationDefinition } from '../migration-helpers.js';

// We build a minimal pre-migration DB manually rather than via createTestDb()
// because createTestDb() runs syncSchema() which already creates the v110 tables
// on fresh DBs. We want to validate the migration's apply() in isolation.

function createPreMigrationDb(): Database.Database {
	const sqlite = new Database(':memory:');
	// Minimal root_folders table so the ALTER TABLE ADD COLUMN can be tested
	sqlite
		.prepare(
			`CREATE TABLE "root_folders" (
				"id" text PRIMARY KEY NOT NULL,
				"name" text NOT NULL,
				"path" text NOT NULL,
				"free_space_bytes" integer
			)`
		)
		.run();
	return sqlite;
}

describe('migration 110: add-storage-items-tables', () => {
	let sqlite: Database.Database;
	let migration: MigrationDefinition;

	beforeEach(async () => {
		sqlite = createPreMigrationDb();
		const mod = await import('./110-add-storage-items-tables.js');
		migration = mod.migration_v110;
	});

	it('has version 110', () => {
		expect(migration.version).toBe(110);
	});

	it('has a descriptive name', () => {
		expect(migration.name).toBe('add_storage_items_tables');
	});

	it('creates storage_items table', () => {
		migration.apply(sqlite);
		const rows = sqlite
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='storage_items'`)
			.all();
		expect(rows).toHaveLength(1);
	});

	it('creates storage_item_server_links table', () => {
		migration.apply(sqlite);
		const rows = sqlite
			.prepare(
				`SELECT name FROM sqlite_master WHERE type='table' AND name='storage_item_server_links'`
			)
			.all();
		expect(rows).toHaveLength(1);
	});

	it('creates storage_insights table', () => {
		migration.apply(sqlite);
		const rows = sqlite
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='storage_insights'`)
			.all();
		expect(rows).toHaveLength(1);
	});

	it('adds total_space_bytes column to root_folders', () => {
		migration.apply(sqlite);
		const cols = sqlite.prepare(`PRAGMA table_info("root_folders")`).all() as Array<{
			name: string;
		}>;
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain('total_space_bytes');
	});

	it('creates the logical uniqueness index on storage_items', () => {
		migration.apply(sqlite);
		const indexes = sqlite
			.prepare(
				`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_storage_items_logical'`
			)
			.all();
		expect(indexes).toHaveLength(1);
	});

	it('creates supporting indexes on storage_items', () => {
		migration.apply(sqlite);
		const expectedIndexes = [
			'idx_storage_items_tmdb',
			'idx_storage_items_tvdb',
			'idx_storage_items_source',
			'idx_storage_items_root_folder',
			'idx_storage_items_library'
		];
		for (const idxName of expectedIndexes) {
			const rows = sqlite
				.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name = ?`)
				.all(idxName);
			expect(rows).toHaveLength(1);
		}
	});

	it('creates indexes on storage_insights', () => {
		migration.apply(sqlite);
		const expectedIndexes = [
			'idx_storage_insights_type',
			'idx_storage_insights_scope',
			'idx_storage_insights_active'
		];
		for (const idxName of expectedIndexes) {
			const rows = sqlite
				.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name = ?`)
				.all(idxName);
			expect(rows).toHaveLength(1);
		}
	});

	it('is idempotent - running twice does not throw', () => {
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();
	});

	it('does not error if root_folders already has total_space_bytes', () => {
		// Simulate a partial prior run
		sqlite.prepare(`ALTER TABLE "root_folders" ADD COLUMN "total_space_bytes" integer`).run();
		expect(() => migration.apply(sqlite)).not.toThrow();
	});

	it('logs progress on completion', () => {
		// Migration should not throw and should complete - logging is a side effect
		// we don't assert on; this test exists to ensure apply() runs end-to-end
		// on a realistic pre-migration state.
		expect(() => migration.apply(sqlite)).not.toThrow();
	});
});
