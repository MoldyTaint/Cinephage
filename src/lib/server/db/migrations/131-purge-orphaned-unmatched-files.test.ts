import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { syncSchema } from '../schema-sync.js';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

function database(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	return sqlite;
}

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 131: purge orphaned unmatched files', () => {
	it('is registered', () => {
		const migration = MIGRATIONS.find(({ version }) => version === 131);
		expect(migration?.name).toMatch(/orphaned/);
	});

	it('deletes rows referencing missing root folders and keeps valid ones', () => {
		const sqlite = database();
		syncSchema(sqlite);

		sqlite
			.prepare(
				`INSERT INTO root_folders (id, name, path, media_type)
				 VALUES ('rf-live', 'Live', '/media/live', 'tv')`
			)
			.run();

		// Seed as a legacy database: rows created before foreign-key
		// enforcement existed could reference folders that are gone now.
		sqlite.pragma('foreign_keys = OFF');
		const insert = sqlite.prepare(
			`INSERT INTO unmatched_files (id, path, root_folder_id, media_type)
			 VALUES (?, ?, ?, 'tv')`
		);
		insert.run('uf-orphan', '/media/gone/file.mkv', 'rf-dead');
		insert.run('uf-live', '/media/live/file.mkv', 'rf-live');
		insert.run('uf-null', '/media/loose/file.mkv', null);
		sqlite.pragma('foreign_keys = ON');

		const migration = MIGRATIONS.find(({ version }) => version === 131)!;
		expect(() => migration.apply(sqlite)).not.toThrow();
		// Idempotent
		expect(() => migration.apply(sqlite)).not.toThrow();

		const remaining = sqlite
			.prepare(`SELECT id FROM unmatched_files ORDER BY id`)
			.all()
			.map((r) => (r as { id: string }).id);
		expect(remaining).toEqual(['uf-live', 'uf-null']);
	});
});
