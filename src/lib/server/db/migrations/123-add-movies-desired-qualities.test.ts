import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { MigrationDefinition } from '../migration-helpers.js';

// Build a minimal pre-migration DB manually. createTestDb() runs syncSchema()
// which already includes the v123 column on fresh DBs; we want to validate the
// migration's apply() in isolation.

function createPreMigrationDb(): Database.Database {
	const sqlite = new Database(':memory:');
	sqlite
		.prepare(
			`CREATE TABLE "movies" (
				"id" text PRIMARY KEY NOT NULL,
				"tmdb_id" integer NOT NULL UNIQUE,
				"title" text NOT NULL,
				"path" text NOT NULL
			)`
		)
		.run();
	return sqlite;
}

describe('migration 123: add-movies-desired-qualities', () => {
	let sqlite: Database.Database;
	let migration: MigrationDefinition;

	beforeEach(async () => {
		sqlite = createPreMigrationDb();
		const mod = await import('./123-add-movies-desired-qualities.js');
		migration = mod.migration_v123;
	});

	it('has version 123', () => {
		expect(migration.version).toBe(123);
	});

	it('has a descriptive name', () => {
		expect(migration.name).toBe('add_movies_desired_qualities');
	});

	it('adds the desired_qualities column to movies', () => {
		migration.apply(sqlite);
		const cols = sqlite.prepare(`PRAGMA table_info("movies")`).all() as Array<{ name: string }>;
		expect(cols.map((c) => c.name)).toContain('desired_qualities');
	});

	it('adds the column as nullable with no default', () => {
		sqlite
			.prepare(`INSERT INTO "movies" ("id","tmdb_id","title","path") VALUES ('m1',1,'T','p')`)
			.run();
		migration.apply(sqlite);
		// Existing rows survive and the column is null
		const row = sqlite
			.prepare(`SELECT "desired_qualities" AS dq FROM "movies" WHERE "id" = 'm1'`)
			.get() as { dq: string | null };
		expect(row.dq).toBeNull();
	});

	it('is idempotent (applying twice does not error)', () => {
		migration.apply(sqlite);
		expect(() => migration.apply(sqlite)).not.toThrow();
	});
});
