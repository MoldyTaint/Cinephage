import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import { movieFiles, movies, rootFolders, subtitleHistory, subtitles } from '$lib/server/db/schema';

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

vi.mock('$lib/server/db/index.js', () => ({
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

const { SubtitleScannerService } = await import('./SubtitleScannerService');

const ROOT_PATH = '/tmp/cinephage-subtitle-scanner-scan';
const MOVIE_ID = 'movie-1';
const ROOT_FOLDER_ID = 'root-movie';

async function seedRootFolderAndMovie(): Promise<void> {
	await testDb.db.insert(rootFolders).values({
		id: ROOT_FOLDER_ID,
		name: 'Movies',
		path: ROOT_PATH,
		mediaType: 'movie'
	});

	await testDb.db.insert(movies).values({
		id: MOVIE_ID,
		tmdbId: 101,
		title: 'Test Movie',
		path: 'Test Movie (2024)',
		rootFolderId: ROOT_FOLDER_ID
	});
}

async function seedMovieFile(id: string, relativePath: string): Promise<void> {
	await testDb.db.insert(movieFiles).values({
		id,
		movieId: MOVIE_ID,
		relativePath
	});
}

function buildSidecar(videoFileName: string) {
	return {
		path: `${ROOT_PATH}/Test Movie (2024)/${videoFileName}.en.srt`,
		relativePath: `${videoFileName}.en.srt`,
		size: 100,
		language: 'en',
		isForced: false,
		isHearingImpaired: false,
		format: 'srt' as const,
		videoFileName
	};
}

describe('SubtitleScannerService scanMovieSubtitles movie-file linking', () => {
	beforeEach(async () => {
		testDb.db.delete(subtitleHistory).run();
		testDb.db.delete(subtitles).run();
		testDb.db.delete(movieFiles).run();
		testDb.db.delete(movies).run();
		testDb.db.delete(rootFolders).run();
		mockLogger.info.mockClear();
		mockLogger.error.mockClear();
		mockLogger.warn.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('links each discovered sidecar to the movie file whose base name matches', async () => {
		await seedRootFolderAndMovie();
		await seedMovieFile('movie-file-2160p', 'Movie.2024.2160p.mkv');
		await seedMovieFile('movie-file-1080p', 'Movie.2024.1080p.mkv');

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([
			buildSidecar('Movie.2024.2160p'),
			buildSidecar('Movie.2024.1080p')
		]);

		const result = await service.scanMovieSubtitles(MOVIE_ID);

		expect(result.registered).toBe(2);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(2);
		const sub2160p = savedSubtitles.find((s) => s.relativePath === 'Movie.2024.2160p.en.srt');
		const sub1080p = savedSubtitles.find((s) => s.relativePath === 'Movie.2024.1080p.en.srt');
		expect(sub2160p?.movieFileId).toBe('movie-file-2160p');
		expect(sub1080p?.movieFileId).toBe('movie-file-1080p');
	});

	it('leaves movieFileId null for a sidecar that matches no movie file', async () => {
		await seedRootFolderAndMovie();
		await seedMovieFile('movie-file-2160p', 'Movie.2024.2160p.mkv');

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([buildSidecar('Some.Other.Release')]);

		const result = await service.scanMovieSubtitles(MOVIE_ID);

		expect(result.registered).toBe(1);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBeNull();
	});

	it('links a sidecar when the movie has a single matching movie file', async () => {
		await seedRootFolderAndMovie();
		await seedMovieFile('movie-file-1', 'Movie.2024.1080p.mkv');

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([buildSidecar('Movie.2024.1080p')]);

		await service.scanMovieSubtitles(MOVIE_ID);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBe('movie-file-1');
	});

	it('leaves movieFileId null when the sidecar base name is ambiguous across files', async () => {
		await seedRootFolderAndMovie();
		// Two files in different subfolders but sharing the same base name.
		await seedMovieFile('movie-file-a', '2160p/Movie.2024.mkv');
		await seedMovieFile('movie-file-b', '1080p/Movie.2024.mkv');

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([buildSidecar('Movie.2024')]);

		await service.scanMovieSubtitles(MOVIE_ID);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBeNull();
	});

	it('links a sidecar whose videoFileName differs only in case from the movie file', async () => {
		await seedRootFolderAndMovie();
		await seedMovieFile('movie-file-2160p', 'Movie.2024.2160p.mkv');

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([buildSidecar('MOVIE.2024.2160P')]);

		const result = await service.scanMovieSubtitles(MOVIE_ID);

		expect(result.registered).toBe(1);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBe('movie-file-2160p');
	});

	it('registers a sidecar with null movieFileId when the movie has no movie files', async () => {
		await seedRootFolderAndMovie();

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([buildSidecar('Movie.2024.2160p')]);

		const result = await service.scanMovieSubtitles(MOVIE_ID);

		expect(result.registered).toBe(1);
		expect(result.errors).toHaveLength(0);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBeNull();
	});

	it('registers a sidecar with null movieFileId when videoFileName is undefined', async () => {
		await seedRootFolderAndMovie();
		await seedMovieFile('movie-file-2160p', 'Movie.2024.2160p.mkv');

		const service = SubtitleScannerService.getInstance();
		vi.spyOn(service, 'discoverSubtitles').mockResolvedValue([
			{
				path: `${ROOT_PATH}/Test Movie (2024)/unknown.en.srt`,
				relativePath: 'unknown.en.srt',
				size: 100,
				language: 'en',
				isForced: false,
				isHearingImpaired: false,
				format: 'srt' as const,
				videoFileName: undefined
			}
		]);

		const result = await service.scanMovieSubtitles(MOVIE_ID);

		expect(result.registered).toBe(1);
		expect(result.errors).toHaveLength(0);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBeNull();
	});
});
