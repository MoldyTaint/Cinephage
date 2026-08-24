import { describe, it, expect, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';

import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const { diskScanService } = await import('./disk-scan.js');
const { movies, movieFiles, rootFolders } = await import('$lib/server/db/schema.js');

const emptyRoot = await mkdtemp(join(tmpdir(), 'cinephage-empty-root-'));
const missingRoot = join(tmpdir(), 'cinephage-missing-root-does-not-exist');

testDb.db
	.insert(rootFolders)
	.values([
		{
			id: 'root-empty',
			name: 'Empty Root',
			path: emptyRoot,
			mediaType: 'movie',
			blockedVideoExtensions: '[]'
		},
		{
			id: 'root-missing',
			name: 'Missing Root',
			path: missingRoot,
			mediaType: 'movie',
			blockedVideoExtensions: '[]'
		}
	])
	.run();

for (const rootId of ['root-empty', 'root-missing']) {
	testDb.db
		.insert(movies)
		.values({
			id: `movie-${rootId}`,
			tmdbId: 900000 + (rootId === 'root-empty' ? 1 : 2),
			title: 'Tracked Movie',
			path: 'Movies/Tracked Movie (2020)',
			rootFolderId: rootId
		})
		.run();
	testDb.db
		.insert(movieFiles)
		.values({
			movieId: `movie-${rootId}`,
			relativePath: 'Tracked.Movie.2020.mkv',
			size: 1024 * 1024 * 1024
		})
		.run();
}

afterAll(() => {
	void rm(emptyRoot, { recursive: true, force: true });
	destroyTestDb(testDb);
});

async function trackedFileCount(rootId: string): Promise<number> {
	const rows = await testDb.db
		.select({ id: movieFiles.id })
		.from(movieFiles)
		.where(eq(movieFiles.movieId, `movie-${rootId}`));
	return rows.length;
}

describe('DiskScanService.scanRootFolder data-safety', () => {
	it('refuses to remove tracked records when an accessible folder scans as empty', async () => {
		const result = await diskScanService.scanRootFolder('root-empty');

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/scanned as empty/i);
		expect(await trackedFileCount('root-empty')).toBe(1);
	});

	it('fails the scan when the root path is missing instead of treating it as empty', async () => {
		const result = await diskScanService.scanRootFolder('root-missing');

		expect(result.success).toBe(false);
		expect(result.error).toBeTruthy();
		expect(result.error).not.toMatch(/no files/i);
		expect(await trackedFileCount('root-missing')).toBe(1);
	});
});
