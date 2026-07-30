import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { MigrationDefinition } from '../migration-helpers.js';

// We build a minimal pre-migration DB manually rather than via createTestDb()
// because createTestDb() runs syncSchema() which applies every migration. We
// want to validate migration 119's apply() in isolation against several
// realistic table shapes.

function createTable(sqlite: Database.Database, table: string, withReleaseGroup: boolean): void {
	sqlite
		.prepare(
			`CREATE TABLE "${table}" (
				"id" text PRIMARY KEY NOT NULL,
				"title" text${withReleaseGroup ? ',\n\t\t\t\t"release_group" text' : ''}
			)`
		)
		.run();
}

describe('migration 119: backfill-release-group-from-title', () => {
	let sqlite: Database.Database;
	let migration: MigrationDefinition;

	beforeEach(async () => {
		sqlite = new Database(':memory:');
		const mod = await import('./119-backfill-release-group-from-title.js');
		migration = mod.migration_v119;
	});

	it('has version 119', () => {
		expect(migration.version).toBe(119);
	});

	it('has a descriptive name', () => {
		expect(migration.name).toBe('backfill_release_group_from_title');
	});

	it('backfills release_group from stored title when the column exists', () => {
		createTable(sqlite, 'download_queue', true);
		createTable(sqlite, 'download_history', true);
		sqlite
			.prepare(`INSERT INTO "download_queue" ("id", "title") VALUES (?, ?)`)
			.run('q1', 'Some.Movie.2024.1080p.WEB-DL.x264-RARBG');
		sqlite
			.prepare(`INSERT INTO "download_history" ("id", "title") VALUES (?, ?)`)
			.run('h1', 'Some.Movie.2024.1080p.WEB-DL.x264-RARBG');

		migration.apply(sqlite);

		const queueRow = sqlite
			.prepare(`SELECT "release_group" FROM "download_queue" WHERE "id" = 'q1'`)
			.get() as { release_group: string | null };
		const historyRow = sqlite
			.prepare(`SELECT "release_group" FROM "download_history" WHERE "id" = 'h1'`)
			.get() as { release_group: string | null };

		expect(queueRow.release_group).toBe('RARBG');
		expect(historyRow.release_group).toBe('RARBG');
	});

	it('does not overwrite an already-populated release_group', () => {
		createTable(sqlite, 'download_queue', true);
		createTable(sqlite, 'download_history', true);
		sqlite
			.prepare(`INSERT INTO "download_queue" ("id", "title", "release_group") VALUES (?, ?, ?)`)
			.run('q1', 'Some.Movie.2024.1080p.WEB-DL.x264-RARBG', 'EXISTING');

		migration.apply(sqlite);

		const row = sqlite
			.prepare(`SELECT "release_group" FROM "download_queue" WHERE "id" = 'q1'`)
			.get() as { release_group: string | null };
		expect(row.release_group).toBe('EXISTING');
	});

	it('does not throw when the release_group column is missing (legacy upgrade path)', () => {
		// Reproduces the schema-sync failure: tables created without release_group
		// because migration 039 was skipped on a legacy schema_version upgrade.
		createTable(sqlite, 'download_queue', false);
		createTable(sqlite, 'download_history', false);
		sqlite
			.prepare(`INSERT INTO "download_queue" ("id", "title") VALUES (?, ?)`)
			.run('q1', 'Some.Movie.2024.1080p.WEB-DL.x264-RARBG');

		expect(() => migration.apply(sqlite)).not.toThrow();
	});

	it('does not throw when the tables are absent entirely', () => {
		expect(() => migration.apply(sqlite)).not.toThrow();
	});
});
