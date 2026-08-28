import { describe, it, expect, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
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
const { libraryOperationLock } = await import('./library-operation-lock.js');
const { movies, movieFiles, rootFolders, series, episodeFiles } =
	await import('$lib/server/db/schema.js');

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

describe('DiskScanService lock integration', () => {
	it('refuses to scan while a rename operation holds the lock', async () => {
		await libraryOperationLock.withLock('rename', async () => {
			await expect(diskScanService.scanRootFolder('root-empty')).rejects.toThrow(
				/rename|reorganiz/i
			);
			expect(diskScanService.scanning).toBe(false);
		});
		expect(libraryOperationLock.isLocked).toBe(false);
	});
});

describe('rename transition healing', () => {
	it('findRenameHealTarget returns the new path only when it exists on disk', async () => {
		const { findRenameHealTarget } = await import('./disk-scan.js');

		const transitions = new Map([
			['/media/old/Movie.mkv', '/media/new/Movie.mkv'],
			['/media/gone/Movie.mkv', '/media/never-materialized/Movie.mkv']
		]);
		const seenPaths = new Set(['/media/new/Movie.mkv']);

		expect(findRenameHealTarget('/media/old/Movie.mkv', transitions, seenPaths)).toBe(
			'/media/new/Movie.mkv'
		);
		expect(findRenameHealTarget('/media/gone/Movie.mkv', transitions, seenPaths)).toBeNull();
		expect(findRenameHealTarget('/media/other/Movie.mkv', transitions, seenPaths)).toBeNull();
	});

	it('healRenamedFile updates series path and episodeFiles.relativePath instead of deleting', async () => {
		const db = testDb.db;

		const rootFolderId = randomUUID();
		const seriesId = randomUUID();
		const fileId = randomUUID();

		await db.insert(rootFolders).values({
			id: rootFolderId,
			path: '/tmp/opencode/heal-root',
			mediaType: 'tv',
			name: 'heal-root'
		});
		await db.insert(series).values({
			id: seriesId,
			rootFolderId,
			path: 'Old Series (2020)',
			title: 'Old Series',
			tmdbId: 12345
		});
		await db.insert(episodeFiles).values({
			id: fileId,
			seriesId,
			seasonNumber: 1,
			relativePath: 'Season 01/old name S01E01.mkv',
			size: 100
		});

		const newPath = '/tmp/opencode/heal-root/New Series (2020)/Season 01/new name S01E01.mkv';
		await diskScanService.healRenamedFile(
			{
				id: fileId,
				path: '/tmp/opencode/heal-root/Old Series (2020)/Season 01/old name S01E01.mkv',
				size: 100,
				allowStrmProbe: true,
				source: 'tracked' as const
			},
			newPath,
			'/tmp/opencode/heal-root',
			'tv'
		);

		const [seriesRow] = await db.select().from(series).where(eq(series.id, seriesId));
		const [fileRow] = await db.select().from(episodeFiles).where(eq(episodeFiles.id, fileId));
		expect(seriesRow.path).toBe('New Series (2020)');
		expect(fileRow.relativePath).toBe('Season 01/new name S01E01.mkv');

		await db.delete(episodeFiles).where(eq(episodeFiles.id, fileId));
		await db.delete(series).where(eq(series.id, seriesId));
		await db.delete(rootFolders).where(eq(rootFolders.id, rootFolderId));
	});
});
