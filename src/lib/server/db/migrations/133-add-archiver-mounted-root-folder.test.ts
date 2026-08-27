import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { columnExists } from '../migration-helpers.js';
import { migration_v133 } from './133-add-archiver-mounted-root-folder.js';

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

function createLegacyDatabase(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	sqlite.prepare('PRAGMA foreign_keys = ON').run();
	sqlite.prepare('CREATE TABLE "root_folders" ("id" text PRIMARY KEY NOT NULL)').run();
	sqlite
		.prepare(
			`CREATE TABLE "archivers" (
				"id" text PRIMARY KEY NOT NULL,
				"name" text NOT NULL
			)`
		)
		.run();
	return sqlite;
}

describe('migration 133: archiver mounted root folder', () => {
	it('adds the optional root folder reference idempotently', () => {
		const sqlite = createLegacyDatabase();
		migration_v133.apply(sqlite);
		expect(columnExists(sqlite, 'archivers', 'mounted_root_folder_id')).toBe(true);
		expect(() => migration_v133.apply(sqlite)).not.toThrow();
	});

	it('preserves existing archiver rows with a null mount', () => {
		const sqlite = createLegacyDatabase();
		sqlite.prepare("INSERT INTO archivers (id, name) VALUES ('a1', 'Archive')").run();
		migration_v133.apply(sqlite);
		expect(
			sqlite.prepare('SELECT mounted_root_folder_id FROM archivers WHERE id = ?').pluck().get('a1')
		).toBeNull();
	});
});
