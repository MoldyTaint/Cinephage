import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, syncSchema } from '../schema-sync.js';
import {
	MIGRATION_COLUMN_MAP,
	columnExists,
	detectAndFixSchemaDrift,
	getSchemaVersion
} from '../migration-helpers.js';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

function database(): Database.Database {
	const sqlite = new Database(':memory:');
	databases.push(sqlite);
	return sqlite;
}

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 122: debrid client columns', () => {
	it('is registered in schema and drift metadata', () => {
		const migration = MIGRATIONS.find(({ version }) => version === 122);
		expect(migration?.name).toMatch(/debrid/i);
		expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(122);
		expect(MIGRATION_COLUMN_MAP[122]).toEqual([
			{ table: 'download_clients', column: 'api_token' },
			{ table: 'download_clients', column: 'remove_after_import' }
		]);
	});

	it('adds both columns idempotently and preserves existing rows', () => {
		const sqlite = database();
		syncSchema(sqlite);
		sqlite
			.prepare(
				`INSERT INTO download_clients (id, name, implementation, host, port)
				 VALUES ('legacy', 'Legacy qBit', 'qbittorrent', 'localhost', 8080)`
			)
			.run();

		const migration = MIGRATIONS.find(({ version }) => version === 122)!;
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(columnExists(sqlite, 'download_clients', 'api_token')).toBe(true);
		expect(columnExists(sqlite, 'download_clients', 'remove_after_import')).toBe(true);
		expect(
			sqlite.prepare(`SELECT name FROM download_clients WHERE id = 'legacy'`).pluck().get()
		).toBe('Legacy qBit');
		expect(getSchemaVersion(sqlite)).toBeGreaterThanOrEqual(122);
	});

	it('marks drift failed so the missing columns can be reapplied', () => {
		const sqlite = database();
		syncSchema(sqlite);
		sqlite.prepare('ALTER TABLE download_clients DROP COLUMN api_token').run();
		sqlite.prepare('ALTER TABLE download_clients DROP COLUMN remove_after_import').run();

		detectAndFixSchemaDrift(sqlite);
		expect(
			sqlite.prepare('SELECT success FROM schema_migrations WHERE version = 122').pluck().get()
		).toBe(0);

		MIGRATIONS.find(({ version }) => version === 122)!.apply(sqlite);
		expect(columnExists(sqlite, 'download_clients', 'api_token')).toBe(true);
		expect(columnExists(sqlite, 'download_clients', 'remove_after_import')).toBe(true);
	});
});
