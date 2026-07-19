import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { MigrationDefinition } from '../migration-helpers.js';

// Build a minimal pre-migration DB manually. createTestDb() runs syncSchema()
// which already includes the v124 column on fresh DBs; we want to validate the
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
	sqlite
		.prepare(
			`CREATE TABLE "movie_files" (
				"id" text PRIMARY KEY NOT NULL,
				"movie_id" text NOT NULL,
				"relative_path" text NOT NULL
			)`
		)
		.run();
	// Pre-migration subtitles schema: no movie_file_id column yet.
	sqlite
		.prepare(
			`CREATE TABLE "subtitles" (
				"id" text PRIMARY KEY NOT NULL,
				"movie_id" text,
				"episode_id" text,
				"relative_path" text NOT NULL,
				"language" text NOT NULL,
				"format" text NOT NULL
			)`
		)
		.run();
	return sqlite;
}

describe('migration 124: add-subtitles-movie-file-id', () => {
	let sqlite: Database.Database;
	let migration: MigrationDefinition;

	beforeEach(async () => {
		sqlite = createPreMigrationDb();
		const mod = await import('./124-add-subtitles-movie-file-id.js');
		migration = mod.migration_v124;
	});

	it('has version 124', () => {
		expect(migration.version).toBe(124);
	});

	it('has a descriptive name', () => {
		expect(migration.name).toBe('add_subtitles_movie_file_id');
	});

	it('adds the movie_file_id column to subtitles', () => {
		migration.apply(sqlite);
		const cols = sqlite.prepare(`PRAGMA table_info("subtitles")`).all() as Array<{
			name: string;
		}>;
		expect(cols.map((c) => c.name)).toContain('movie_file_id');
	});

	it('adds the column as nullable with no default', () => {
		sqlite
			.prepare(`INSERT INTO "movies" ("id","tmdb_id","title","path") VALUES ('m1',1,'T','p')`)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "movie_files" ("id","movie_id","relative_path") VALUES ('mf-none','m1','a.mkv')`
			)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "subtitles" ("id","movie_id","relative_path","language","format") VALUES ('s1','m1','a.srt','en','srt')`
			)
			.run();
		migration.apply(sqlite);
		// Column added after row insert: existing row survives and (here) gets
		// backfilled because there is exactly one movie_file. Nullability is
		// exercised by the multi-file case below.
		const row = sqlite
			.prepare(`SELECT "movie_file_id" AS mfid FROM "subtitles" WHERE "id" = 's1'`)
			.get() as { mfid: string | null };
		expect(row.mfid).not.toBeNull();
	});

	it('backfills movie_file_id when a movie has exactly one file', () => {
		sqlite
			.prepare(`INSERT INTO "movies" ("id","tmdb_id","title","path") VALUES ('m1',1,'T','p')`)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "movie_files" ("id","movie_id","relative_path") VALUES ('mf1','m1','m1-1080p.mkv')`
			)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "subtitles" ("id","movie_id","relative_path","language","format") VALUES ('s1','m1','m1.srt','en','srt')`
			)
			.run();

		migration.apply(sqlite);

		const row = sqlite
			.prepare(`SELECT "movie_file_id" AS mfid FROM "subtitles" WHERE "id" = 's1'`)
			.get() as { mfid: string | null };
		expect(row.mfid).toBe('mf1');
	});

	it('does not backfill when a movie has multiple files', () => {
		sqlite
			.prepare(`INSERT INTO "movies" ("id","tmdb_id","title","path") VALUES ('m1',1,'T','p')`)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "movie_files" ("id","movie_id","relative_path") VALUES ('mf1','m1','m1-1080p.mkv')`
			)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "movie_files" ("id","movie_id","relative_path") VALUES ('mf2','m1','m1-2160p.mkv')`
			)
			.run();
		sqlite
			.prepare(
				`INSERT INTO "subtitles" ("id","movie_id","relative_path","language","format") VALUES ('s1','m1','m1.srt','en','srt')`
			)
			.run();

		migration.apply(sqlite);

		const row = sqlite
			.prepare(`SELECT "movie_file_id" AS mfid FROM "subtitles" WHERE "id" = 's1'`)
			.get() as { mfid: string | null };
		expect(row.mfid).toBeNull();
	});

	it('is idempotent (applying twice does not error)', () => {
		migration.apply(sqlite);
		expect(() => migration.apply(sqlite)).not.toThrow();
	});

	it('creates the idx_subtitles_movie_file index', () => {
		migration.apply(sqlite);
		const indexes = sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='subtitles'")
			.all() as Array<{ name: string }>;
		expect(indexes.map((i) => i.name)).toContain('idx_subtitles_movie_file');
	});
});
