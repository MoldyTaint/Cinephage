import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../schema-sync.js';
import { tableExists } from '../migration-helpers.js';
import { MIGRATIONS } from './index.js';

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));

describe('migration 139: arr_notification_configs table', () => {
	it('is registered in schema metadata', () => {
		expect(MIGRATIONS.find(({ version }) => version === 139)?.name).toMatch(
			/arr_notification_configs/i
		);
		expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(139);
	});

	it('creates the table idempotently', () => {
		const sqlite = new Database(':memory:');
		databases.push(sqlite);

		const migration = MIGRATIONS.find(({ version }) => version === 139)!;
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(() => migration.apply(sqlite)).not.toThrow();
		expect(tableExists(sqlite, 'arr_notification_configs')).toBe(true);

		sqlite
			.prepare(
				`INSERT INTO arr_notification_configs
				 (id, app, name, on_grab, on_download, on_upgrade, on_movie_added, on_movie_delete, on_series_add, on_series_delete, config, created_at)
				 VALUES ('id-1', 'radarr', 'Pulsarr', 0, 1, 0, 0, 0, 0, 0, '{}', '2026-01-01T00:00:00.000Z')`
			)
			.run();

		const row = sqlite
			.prepare(`SELECT app, on_download FROM arr_notification_configs WHERE id = 'id-1'`)
			.get() as { app: string; on_download: number };
		expect(row.app).toBe('radarr');
		expect(row.on_download).toBe(1);
	});
});
