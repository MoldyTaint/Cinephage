import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { MigrationDefinition } from '../migration-helpers.js';

function createPreMigrationDb(): Database.Database {
	const sqlite = new Database(':memory:');
	sqlite
		.prepare(
			`
			CREATE TABLE "cinephage_api_config" (
				"id" integer PRIMARY KEY NOT NULL DEFAULT 1 CHECK ("id" = 1),
				"enabled" integer DEFAULT 1 NOT NULL,
				"base_url" text NOT NULL DEFAULT 'https://api.cinephage.net',
				"version_override" text,
				"commit_override" text,
				"updated_at" text
			)
			`
		)
		.run();
	sqlite
		.prepare(
			`INSERT INTO cinephage_api_config (id, enabled, base_url, version_override, commit_override, updated_at) VALUES (1, 1, 'https://api.cinephage.net', ?, ?, ?)`
		)
		.run('0.14.2', '9bb5561', new Date().toISOString());
	return sqlite;
}

describe('migration 127: add cinephage_api identity auto-sync', () => {
	let sqlite: Database.Database;
	let migration: MigrationDefinition;

	beforeEach(async () => {
		sqlite = createPreMigrationDb();
		const mod = await import('./127-add-cinephage-api-identity-auto-sync.js');
		migration = mod.migration_v127;
	});

	it('has version 127', () => {
		expect(migration.version).toBe(127);
	});

	it('adds the identity auto-sync columns', () => {
		migration.apply(sqlite);
		const columns = sqlite.prepare(`PRAGMA table_info(cinephage_api_config)`).all() as Array<{
			name: string;
			dflt_value: string | null;
		}>;
		const names = columns.map((c) => c.name);
		expect(names).toContain('latest_version');
		expect(names).toContain('latest_commit');
		expect(names).toContain('auto_update');
		const autoUpdate = columns.find((c) => c.name === 'auto_update');
		expect(autoUpdate?.dflt_value).toBe('1');
	});

	it('moves stale overrides into latest_* and clears the manual overrides', () => {
		migration.apply(sqlite);
		const row = sqlite.prepare(`SELECT * FROM cinephage_api_config WHERE id = 1`).get() as Record<
			string,
			unknown
		>;
		expect(row.version_override).toBeNull();
		expect(row.commit_override).toBeNull();
		expect(row.latest_version).toBe('0.14.2');
		expect(row.latest_commit).toBe('9bb5561');
	});

	it('is idempotent', () => {
		migration.apply(sqlite);
		migration.apply(sqlite);
		const row = sqlite.prepare(`SELECT * FROM cinephage_api_config WHERE id = 1`).get() as Record<
			string,
			unknown
		>;
		expect(row.latest_version).toBe('0.14.2');
		expect(row.latest_commit).toBe('9bb5561');
		expect(row.version_override).toBeNull();
	});
});
