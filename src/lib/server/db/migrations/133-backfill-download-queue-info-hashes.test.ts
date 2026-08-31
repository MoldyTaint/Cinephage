import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migration_v133 } from './133-backfill-download-queue-info-hashes.js';

describe('migration v133', () => {
	it('backfills info hashes from magnet URLs and normalizes stored hashes', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE download_queue (
				id text PRIMARY KEY,
				download_id text,
				protocol text,
				info_hash text,
				magnet_url text,
				download_url text
			);
			INSERT INTO download_queue (id, magnet_url)
			VALUES ('magnet-row', 'magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567');
			INSERT INTO download_queue (id, info_hash)
			VALUES ('stored-row', 'ABCDEF0123456789ABCDEF0123456789ABCDEF01');
			INSERT INTO download_queue (id, download_id, protocol)
			VALUES ('download-id-row', '0123456789ABCDEF0123456789ABCDEF01234567', 'torrent');
		`);

		migration_v133.apply(sqlite);

		expect(
			sqlite.prepare('SELECT import_failed FROM download_queue WHERE id = ?').get('magnet-row')
		).toEqual({ import_failed: 0 });

		expect(
			sqlite.prepare('SELECT info_hash FROM download_queue WHERE id = ?').get('magnet-row')
		).toEqual({ info_hash: '0123456789abcdef0123456789abcdef01234567' });
		expect(
			sqlite.prepare('SELECT info_hash FROM download_queue WHERE id = ?').get('stored-row')
		).toEqual({ info_hash: 'abcdef0123456789abcdef0123456789abcdef01' });
		expect(
			sqlite.prepare('SELECT info_hash FROM download_queue WHERE id = ?').get('download-id-row')
		).toEqual({ info_hash: '0123456789abcdef0123456789abcdef01234567' });

		sqlite.close();
	});
});
