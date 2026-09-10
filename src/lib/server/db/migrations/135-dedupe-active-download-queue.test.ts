import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migration_v135 } from './135-dedupe-active-download-queue.js';

describe('migration v135', () => {
	it('keeps one active queue row per client and info hash while preserving terminal rows', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE download_queue (
				id text PRIMARY KEY,
				download_client_id text NOT NULL,
				download_id text NOT NULL,
				info_hash text,
				title text NOT NULL,
				status text NOT NULL,
				added_at text
			);
			INSERT INTO download_queue
				(id, download_client_id, download_id, info_hash, title, status, added_at)
			VALUES
				('stalled-old', 'client-a', 'hash-a', 'ABC', 'Movie', 'stalled', '2026-01-01T00:00:00.000Z'),
				('downloading-new', 'client-a', 'hash-a', 'ABC', 'Movie', 'downloading', '2026-01-02T00:00:00.000Z'),
				('removed-old', 'client-a', 'hash-a', 'abc', 'Movie', 'removed', '2026-01-03T00:00:00.000Z'),
				('failed-old', 'client-a', 'hash-a', 'abc', 'Movie', 'failed', '2026-01-04T00:00:00.000Z'),
				('other-client', 'client-b', 'hash-b', 'abc', 'Movie', 'downloading', '2026-01-05T00:00:00.000Z');
		`);

		migration_v135.apply(sqlite);

		expect(sqlite.prepare('SELECT id FROM download_queue ORDER BY id').all()).toEqual([
			{ id: 'downloading-new' },
			{ id: 'failed-old' },
			{ id: 'other-client' },
			{ id: 'removed-old' }
		]);

		expect(
			sqlite.prepare('SELECT info_hash FROM download_queue WHERE id = ?').get('downloading-new')
		).toEqual({ info_hash: 'abc' });

		sqlite.close();
	});
});
