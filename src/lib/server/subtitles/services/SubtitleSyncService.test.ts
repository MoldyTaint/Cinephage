import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import {
	movieFiles,
	movies,
	rootFolders,
	subtitleProviders,
	subtitles
} from '$lib/server/db/schema';

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

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

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

vi.mock('../sync/index.js', () => ({
	syncSubtitles: vi.fn()
}));

vi.mock('$lib/server/library/LibraryMediaEvents', () => ({
	libraryMediaEvents: {
		emitMovieUpdated: vi.fn(),
		emitSeriesUpdated: vi.fn()
	}
}));

const { SubtitleSyncService } = await import('./SubtitleSyncService');

const ROOT_PATH = '/tmp/cinephage-subtitle-sync-service';
const FILE_2160P_ID = 'movie-file-2160p';
const FILE_1080P_ID = 'movie-file-1080p';
const MOVIE_ID = 'movie-1';

async function seedMultiFileMovie(): Promise<void> {
	const rootFolderId = 'root-movie';
	const providerId = 'provider-1';

	await testDb.db.insert(subtitleProviders).values({
		id: providerId,
		name: 'Test Provider',
		implementation: 'opensubtitles',
		enabled: true,
		priority: 1,
		requestsPerMinute: 60
	});

	await testDb.db.insert(rootFolders).values({
		id: rootFolderId,
		name: 'Movies',
		path: ROOT_PATH,
		mediaType: 'movie'
	});

	await testDb.db.insert(movies).values({
		id: MOVIE_ID,
		tmdbId: 101,
		title: 'Test Movie',
		path: 'Test Movie (2024)',
		rootFolderId
	});

	await testDb.db.insert(movieFiles).values({
		id: FILE_2160P_ID,
		movieId: MOVIE_ID,
		relativePath: 'Test.Movie.2024.2160p.mkv'
	});

	await testDb.db.insert(movieFiles).values({
		id: FILE_1080P_ID,
		movieId: MOVIE_ID,
		relativePath: 'Test.Movie.2024.1080p.mkv'
	});
}

type SyncServiceInstance = ReturnType<typeof SubtitleSyncService.getInstance>;

async function getSubtitle(service: SyncServiceInstance, subtitleId: string) {
	const row = await testDb.db.select().from(subtitles).where(eq(subtitles.id, subtitleId));
	// @ts-expect-error - getSubtitlePaths is private; exercised directly to verify file selection
	return service.getSubtitlePaths(row[0]) as Promise<{
		subtitlePath: string | null;
		videoPath: string | null;
	}>;
}

describe('SubtitleSyncService.getSubtitlePaths', () => {
	beforeAll(async () => {
		await rm(ROOT_PATH, { recursive: true, force: true });
		await seedMultiFileMovie();
	});

	beforeEach(async () => {
		testDb.db.delete(subtitles).run();
	});

	afterAll(async () => {
		await rm(ROOT_PATH, { recursive: true, force: true });
		destroyTestDb(testDb);
	});

	it('selects the video file matching the subtitle movieFileId (multi-quality)', async () => {
		// Target the file that is NOT the default (files[0]) so this genuinely
		// fails before the fix (which always used files[0]) and passes after.
		const files = await testDb.db.select().from(movieFiles).where(eq(movieFiles.movieId, MOVIE_ID));
		const targetFile = files.find((f) => f.id !== files[0].id)!;

		const subtitleId = 'sub-target';
		await testDb.db.insert(subtitles).values({
			id: subtitleId,
			movieId: MOVIE_ID,
			movieFileId: targetFile.id,
			relativePath: 'Test.Movie.2024.target.en.srt',
			language: 'en',
			format: 'srt'
		});

		const service = SubtitleSyncService.getInstance();
		const { videoPath } = await getSubtitle(service, subtitleId);

		expect(videoPath).toBeTruthy();
		expect(videoPath).toContain(targetFile.relativePath);
		expect(videoPath).not.toContain(files[0].relativePath);
	});

	it('falls back to the first movie file when the subtitle has no movieFileId (legacy)', async () => {
		const files = await testDb.db.select().from(movieFiles).where(eq(movieFiles.movieId, MOVIE_ID));

		const subtitleId = 'sub-legacy';
		await testDb.db.insert(subtitles).values({
			id: subtitleId,
			movieId: MOVIE_ID,
			movieFileId: null,
			relativePath: 'Test.Movie.2024.en.srt',
			language: 'en',
			format: 'srt'
		});

		const service = SubtitleSyncService.getInstance();
		const { videoPath } = await getSubtitle(service, subtitleId);

		expect(videoPath).toBeTruthy();
		expect(videoPath).toContain(files[0].relativePath);
	});
});
