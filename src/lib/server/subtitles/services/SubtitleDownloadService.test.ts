import { rm } from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import {
	movieFiles,
	movies,
	rootFolders,
	subtitleHistory,
	subtitleProviders,
	subtitles
} from '$lib/server/db/schema';
import type { SubtitleSearchResult } from '../types';

const providerDownloadMock = vi.hoisted(() => vi.fn());
const getProviderInstanceMock = vi.hoisted(() => vi.fn());
const syncSubtitleMock = vi.hoisted(() => vi.fn());
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

vi.mock('./SubtitleProviderManager', () => ({
	getSubtitleProviderManager: () => ({
		getProviderInstance: getProviderInstanceMock
	})
}));

vi.mock('./SubtitleSyncService', () => ({
	getSubtitleSyncService: () => ({
		syncSubtitle: syncSubtitleMock
	})
}));

const { SubtitleDownloadService } = await import('./SubtitleDownloadService');

const ROOT_PATH = '/tmp/cinephage-subtitle-download-service';

function buildSearchResult(overrides: Partial<SubtitleSearchResult> = {}): SubtitleSearchResult {
	return {
		providerId: 'provider-1',
		providerName: 'Test Provider',
		providerSubtitleId: 'sub-1',
		language: 'en',
		title: 'Test Subtitle',
		isForced: false,
		isHearingImpaired: false,
		format: 'srt',
		isHashMatch: false,
		matchScore: 87,
		...overrides
	};
}

async function seedMovie(): Promise<string> {
	const rootFolderId = 'root-movie';
	const movieId = 'movie-1';
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
		id: movieId,
		tmdbId: 101,
		title: 'Test Movie',
		path: 'Test Movie (2024)',
		rootFolderId
	});

	await testDb.db.insert(movieFiles).values({
		id: 'movie-file-1',
		movieId,
		relativePath: 'Test.Movie.2024.mkv'
	});

	return movieId;
}

async function seedMultiFileMovie(): Promise<{
	movieId: string;
	file2160pId: string;
	file1080pId: string;
}> {
	const rootFolderId = 'root-movie';
	const movieId = 'movie-1';
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
		id: movieId,
		tmdbId: 101,
		title: 'Test Movie',
		path: 'Test Movie (2024)',
		rootFolderId
	});

	await testDb.db.insert(movieFiles).values({
		id: 'movie-file-2160p',
		movieId,
		relativePath: 'Test.Movie.2024.2160p.mkv'
	});

	await testDb.db.insert(movieFiles).values({
		id: 'movie-file-1080p',
		movieId,
		relativePath: 'Test.Movie.2024.1080p.mkv'
	});

	return { movieId, file2160pId: 'movie-file-2160p', file1080pId: 'movie-file-1080p' };
}

describe('SubtitleDownloadService', () => {
	beforeEach(async () => {
		testDb.db.delete(subtitleHistory).run();
		testDb.db.delete(subtitles).run();
		testDb.db.delete(movieFiles).run();
		testDb.db.delete(movies).run();
		testDb.db.delete(rootFolders).run();
		testDb.db.delete(subtitleProviders).run();

		await rm(ROOT_PATH, { recursive: true, force: true });
		providerDownloadMock.mockReset();
		getProviderInstanceMock.mockReset();
		syncSubtitleMock.mockReset();
		mockLogger.info.mockClear();
		mockLogger.error.mockClear();
		mockLogger.warn.mockClear();
		mockLogger.debug.mockClear();

		providerDownloadMock.mockResolvedValue(
			Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello\n', 'utf-8')
		);
		getProviderInstanceMock.mockResolvedValue({
			download: providerDownloadMock
		});
		syncSubtitleMock.mockResolvedValue({
			success: true,
			offsetMs: 1250
		});
	});

	afterAll(async () => {
		await rm(ROOT_PATH, { recursive: true, force: true });
		destroyTestDb(testDb);
	});

	it('automatically syncs downloaded subtitles', async () => {
		const movieId = await seedMovie();
		const service = SubtitleDownloadService.getInstance();

		const result = await service.downloadForMovie(movieId, buildSearchResult());

		expect(syncSubtitleMock).toHaveBeenCalledTimes(1);
		expect(syncSubtitleMock).toHaveBeenCalledWith(result.subtitleId);
		expect(result.wasSynced).toBe(true);
		expect(result.syncOffset).toBe(1250);

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].id).toBe(result.subtitleId);

		const historyRows = await testDb.db.select().from(subtitleHistory);
		expect(historyRows).toHaveLength(1);
		expect(historyRows[0].action).toBe('downloaded');
	});

	it('skips automatic sync for forced subtitles', async () => {
		const movieId = await seedMovie();
		const service = SubtitleDownloadService.getInstance();

		await service.downloadForMovie(movieId, buildSearchResult({ isForced: true }));

		expect(syncSubtitleMock).not.toHaveBeenCalled();
	});

	it('does not fail the download when automatic sync fails', async () => {
		const movieId = await seedMovie();
		const service = SubtitleDownloadService.getInstance();
		syncSubtitleMock.mockResolvedValueOnce({
			success: false,
			offsetMs: 0,
			error: 'alass sync failed'
		});

		const result = await service.downloadForMovie(movieId, buildSearchResult());

		expect(result.subtitleId).toBeTruthy();
		expect(result.path).toContain('Test.Movie.2024.en.srt');
		expect(result.wasSynced).toBe(false);
		expect(result.syncOffset).toBeNull();
		expect(syncSubtitleMock).toHaveBeenCalledTimes(1);
		expect(mockLogger.warn).toHaveBeenCalledWith(
			{ subtitleId: result.subtitleId, error: 'alass sync failed' },
			'Automatic subtitle sync failed after download'
		);
	});

	it('links a downloaded subtitle to the specified movie file and names the sidecar after it', async () => {
		const { movieId, file1080pId } = await seedMultiFileMovie();
		const service = SubtitleDownloadService.getInstance();

		const result = await service.downloadForMovie(movieId, buildSearchResult(), {
			movieFileId: file1080pId
		});

		expect(result.path).toContain('Test.Movie.2024.1080p.en.srt');

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(1);
		expect(savedSubtitles[0].movieFileId).toBe(file1080pId);
	});

	it('does not clobber an existing subtitle linked to a different movie file', async () => {
		const { movieId, file2160pId, file1080pId } = await seedMultiFileMovie();

		await testDb.db.insert(subtitles).values({
			id: 'existing-2160p-sub',
			movieId,
			movieFileId: file2160pId,
			relativePath: 'Test.Movie.2024.2160p.en.srt',
			language: 'en',
			format: 'srt'
		});

		const service = SubtitleDownloadService.getInstance();
		const result = await service.downloadForMovie(movieId, buildSearchResult(), {
			movieFileId: file1080pId
		});

		expect(result.wasUpgrade).toBe(false);
		expect(result.replacedSubtitleId).toBeUndefined();

		const savedSubtitles = await testDb.db.select().from(subtitles);
		expect(savedSubtitles).toHaveLength(2);
		expect(savedSubtitles.find((s) => s.id === 'existing-2160p-sub')).toBeTruthy();
		expect(savedSubtitles.find((s) => s.movieFileId === file1080pId)).toBeTruthy();
	});

	it('rejects a movieFileId that does not exist', async () => {
		await seedMultiFileMovie();
		const service = SubtitleDownloadService.getInstance();

		await expect(
			service.downloadForMovie('movie-1', buildSearchResult(), {
				movieFileId: 'nonexistent-file-id'
			})
		).rejects.toThrow('No file found for movie movie-1 with movieFileId nonexistent-file-id');

		expect(providerDownloadMock).not.toHaveBeenCalled();
	});

	it('rejects a movieFileId belonging to a different movie', async () => {
		const { file1080pId } = await seedMultiFileMovie();

		const rootFolderId = 'root-movie-2';
		const movie2Id = 'movie-2';
		await testDb.db.insert(rootFolders).values({
			id: rootFolderId,
			name: 'Movies 2',
			path: `${ROOT_PATH}-2`,
			mediaType: 'movie'
		});
		await testDb.db.insert(movies).values({
			id: movie2Id,
			tmdbId: 102,
			title: 'Other Movie',
			path: 'Other Movie (2024)',
			rootFolderId
		});

		const service = SubtitleDownloadService.getInstance();
		await expect(
			service.downloadForMovie(movie2Id, buildSearchResult(), {
				movieFileId: file1080pId
			})
		).rejects.toThrow(`No file found for movie ${movie2Id} with movieFileId ${file1080pId}`);

		expect(providerDownloadMock).not.toHaveBeenCalled();
	});
});
