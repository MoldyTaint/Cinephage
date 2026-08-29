import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../schema-sync.js';
import { MIGRATION_COLUMN_MAP, columnExists } from '../migration-helpers.js';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 132: qBittorrent sequential download', () => {
	it('is registered in schema and drift metadata', () => {
		expect(MIGRATIONS.find(({ version }) => version === 132)?.name).toMatch(/sequential/i);
		expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(132);
		expect(MIGRATION_COLUMN_MAP[132]).toEqual([
			{ table: 'download_clients', column: 'sequential_download' }
		]);
	});

	it('adds the disabled-by-default column idempotently and preserves existing rows', () => {
		const sqlite = new Database(':memory:');
		databases.push(sqlite);
		sqlite.exec(`
			CREATE TABLE download_clients (
				id text PRIMARY KEY NOT NULL,
				name text NOT NULL,
				implementation text NOT NULL,
				host text NOT NULL,
				port integer NOT NULL
			)
		`);
		sqlite
			.prepare(
				`INSERT INTO download_clients (id, name, implementation, host, port)
				 VALUES ('legacy', 'Legacy qBit', 'qbittorrent', 'localhost', 8080)`
			)
			.run();

		const migration = MIGRATIONS.find(({ version }) => version === 132)!;
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(columnExists(sqlite, 'download_clients', 'sequential_download')).toBe(true);
		expect(
			sqlite
				.prepare(`SELECT sequential_download FROM download_clients WHERE id = 'legacy'`)
				.pluck()
				.get()
		).toBe(0);
	});
});
