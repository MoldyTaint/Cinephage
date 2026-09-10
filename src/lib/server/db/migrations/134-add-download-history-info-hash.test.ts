import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migration_v134 } from './134-add-download-history-info-hash.js';

describe('migration v134', () => {
	it('backfills history hashes from matching queue rows', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE download_queue (
				id text PRIMARY KEY,
				download_id text NOT NULL,
				info_hash text
			);
			CREATE TABLE download_history (
				id text PRIMARY KEY,
				download_id text
			);
			INSERT INTO download_queue (id, download_id, info_hash)
			VALUES ('queue-1', 'provider-item-1', '0123456789abcdef0123456789abcdef01234567');
			INSERT INTO download_history (id, download_id)
			VALUES ('history-1', 'provider-item-1');
		`);

		migration_v134.apply(sqlite);

		expect(
			sqlite.prepare('SELECT info_hash FROM download_history WHERE id = ?').get('history-1')
		).toEqual({ info_hash: '0123456789abcdef0123456789abcdef01234567' });

		sqlite.close();
	});
});
