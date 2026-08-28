import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

function database(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	return sqlite;
}

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 132: copy-only rclone archive targets', () => {
	it('creates the target table without library relocation fields', () => {
		const sqlite = database();
		const migration = MIGRATIONS.find(({ version }) => version === 132)!;

		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();

		const columns = sqlite
			.prepare('PRAGMA table_info(archivers)')
			.all()
			.map((row) => (row as { name: string }).name);
		expect(columns).toContain('endpoint');
		expect(columns).toContain('remote');
		expect(columns).toContain('base_path');
		expect(columns).not.toContain('mounted_root_folder_id');
	});
});
