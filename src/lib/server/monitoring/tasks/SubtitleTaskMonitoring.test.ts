import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import {
	movies,
	series,
	episodes,
	subtitles,
	subtitleHistory,
	monitoringHistory
} from '$lib/server/db/schema';

const testDb: TestDatabase = createTestDb();

const { searchService, downloadService, providerManager, profileService, missingEpisodesBySeries } =
	vi.hoisted(() => {
		const searchService = {
			searchForMovie: vi.fn().mockResolvedValue({ results: [] }),
			searchForEpisode: vi.fn().mockResolvedValue({ results: [] })
		};

		const downloadService = {
			downloadForMovie: vi.fn().mockResolvedValue(undefined),
			downloadForEpisode: vi.fn().mockResolvedValue(undefined)
		};

		const providerManager = {
			getHealthStatus: vi.fn().mockResolvedValue([
				{
					providerName: 'TestProvider',
					isThrottled: false,
					isHealthy: true,
					throttledUntil: null,
					throttleErrorType: null,
					consecutiveFailures: 0,
					lastError: null
				}
			]),
			getEnabledProviders: vi.fn().mockResolvedValue([{ name: 'TestProvider' }])
		};

		const defaultProfile = {
			id: 'profile-1',
			name: 'Default',
			languages: [
				{
					code: 'en',
					forced: false,
					hearingImpaired: false,
					excludeHi: false,
					isCutoff: true
				}
			],
			cutoffIndex: 0,
			upgradesAllowed: true,
			minimumScore: 80,
			isDefault: true
		};

		const defaultStatus = {
			satisfied: false,
			missing: [
				{
					code: 'en',
					forced: false,
					hearingImpaired: false
				}
			],
			existing: []
		};

		const missingEpisodesBySeries = new Map<string, string[]>();

		const profileService = {
			getDefaultProfile: vi.fn().mockResolvedValue(defaultProfile),
			getProfile: vi.fn().mockResolvedValue(defaultProfile),
			getMovieSubtitleStatus: vi.fn().mockResolvedValue(defaultStatus),
			getEpisodeSubtitleStatus: vi.fn().mockResolvedValue(defaultStatus),
			getSeriesEpisodesMissingSubtitles: vi.fn(
				async (seriesId: string) => missingEpisodesBySeries.get(seriesId) ?? []
			)
		};

		return {
			searchService,
			downloadService,
			providerManager,
			profileService,
			missingEpisodesBySeries
		};
	});

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

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

vi.mock('$lib/server/subtitles/services/SubtitleSearchService.js', () => ({
	getSubtitleSearchService: () => searchService
}));

vi.mock('$lib/server/subtitles/services/SubtitleDownloadService.js', () => ({
	getSubtitleDownloadService: () => downloadService
}));

vi.mock('$lib/server/subtitles/services/SubtitleProviderManager.js', () => ({
	getSubtitleProviderManager: () => providerManager
}));

vi.mock('$lib/server/subtitles/services/LanguageProfileService.js', () => ({
	LanguageProfileService: {
		getInstance: () => profileService
	}
}));

const { executeMissingSubtitlesTask } = await import('./MissingSubtitlesTask.js');
const { executeSubtitleUpgradeTask } = await import('./SubtitleUpgradeTask.js');

function resetDb() {
	testDb.db.delete(subtitleHistory).run();
	testDb.db.delete(monitoringHistory).run();
	testDb.db.delete(subtitles).run();
	testDb.db.delete(episodes).run();
	testDb.db.delete(series).run();
	testDb.db.delete(movies).run();
}

beforeEach(() => {
	resetDb();
	vi.clearAllMocks();
	missingEpisodesBySeries.clear();
});

afterAll(() => {
	destroyTestDb(testDb);
});

describe('MissingSubtitlesTask monitored gating', () => {
	it('skips unmonitored movies and episodes', async () => {
		const monitoredMovieId = 'movie-monitored';
		const unmonitoredMovieId = 'movie-unmonitored';

		await testDb.db.insert(movies).values([
			{
				id: monitoredMovieId,
				tmdbId: 1,
				title: 'Monitored Movie',
				path: '/movies/monitored',
				hasFile: true,
				wantsSubtitles: true,
				monitored: true,
				languageProfileId: 'profile-1'
			},
			{
				id: unmonitoredMovieId,
				tmdbId: 2,
				title: 'Unmonitored Movie',
				path: '/movies/unmonitored',
				hasFile: true,
				wantsSubtitles: true,
				monitored: false,
				languageProfileId: 'profile-1'
			}
		]);

		const monitoredSeriesId = 'series-monitored';
		const unmonitoredSeriesId = 'series-unmonitored';

		await testDb.db.insert(series).values([
			{
				id: monitoredSeriesId,
				tmdbId: 101,
				title: 'Monitored Series',
				path: '/series/monitored',
				monitored: true,
				wantsSubtitles: true,
				languageProfileId: 'profile-1'
			},
			{
				id: unmonitoredSeriesId,
				tmdbId: 102,
				title: 'Unmonitored Series',
				path: '/series/unmonitored',
				monitored: false,
				wantsSubtitles: true,
				languageProfileId: 'profile-1'
			}
		]);

		const monitoredEpisodeId = 'ep-monitored';
		const unmonitoredEpisodeId = 'ep-unmonitored';
		const unmonitoredSeriesEpisodeId = 'ep-unmonitored-series';

		await testDb.db.insert(episodes).values([
			{
				id: monitoredEpisodeId,
				seriesId: monitoredSeriesId,
				seasonNumber: 1,
				episodeNumber: 1,
				hasFile: true,
				monitored: true
			},
			{
				id: unmonitoredEpisodeId,
				seriesId: monitoredSeriesId,
				seasonNumber: 1,
				episodeNumber: 2,
				hasFile: true,
				monitored: false
			},
			{
				id: unmonitoredSeriesEpisodeId,
				seriesId: unmonitoredSeriesId,
				seasonNumber: 1,
				episodeNumber: 1,
				hasFile: true,
				monitored: true
			}
		]);

		missingEpisodesBySeries.set(monitoredSeriesId, [monitoredEpisodeId, unmonitoredEpisodeId]);
		missingEpisodesBySeries.set(unmonitoredSeriesId, [unmonitoredSeriesEpisodeId]);

		const result = await executeMissingSubtitlesTask(null);

		expect(result.itemsProcessed).toBe(2);
		expect(searchService.searchForMovie).toHaveBeenCalledTimes(1);
		expect(searchService.searchForMovie).toHaveBeenCalledWith(monitoredMovieId, ['en']);
		expect(
			searchService.searchForMovie.mock.calls.some((call) => call[0] === unmonitoredMovieId)
		).toBe(false);

		expect(searchService.searchForEpisode).toHaveBeenCalledTimes(1);
		expect(searchService.searchForEpisode).toHaveBeenCalledWith(monitoredEpisodeId, ['en']);
		expect(
			searchService.searchForEpisode.mock.calls.some(
				(call) => call[0] === unmonitoredEpisodeId || call[0] === unmonitoredSeriesEpisodeId
			)
		).toBe(false);

		expect(profileService.getSeriesEpisodesMissingSubtitles).toHaveBeenCalledTimes(1);
		expect(profileService.getSeriesEpisodesMissingSubtitles).toHaveBeenCalledWith(
			monitoredSeriesId
		);
	});
});

describe('SubtitleUpgradeTask monitored gating', () => {
	it('skips unmonitored movies, series, and episodes', async () => {
		const monitoredMovieId = 'upgrade-movie-monitored';
		const unmonitoredMovieId = 'upgrade-movie-unmonitored';

		await testDb.db.insert(movies).values([
			{
				id: monitoredMovieId,
				tmdbId: 201,
				title: 'Monitored Movie',
				path: '/movies/upgrade-monitored',
				monitored: true,
				languageProfileId: 'profile-1'
			},
			{
				id: unmonitoredMovieId,
				tmdbId: 202,
				title: 'Unmonitored Movie',
				path: '/movies/upgrade-unmonitored',
				monitored: false,
				languageProfileId: 'profile-1'
			}
		]);

		await testDb.db.insert(subtitles).values([
			{
				id: 'sub-movie-monitored',
				movieId: monitoredMovieId,
				relativePath: 'monitored.srt',
				language: 'en',
				format: 'srt',
				matchScore: 50
			},
			{
				id: 'sub-movie-unmonitored',
				movieId: unmonitoredMovieId,
				relativePath: 'unmonitored.srt',
				language: 'en',
				format: 'srt',
				matchScore: 50
			}
		]);

		const monitoredSeriesId = 'upgrade-series-monitored';
		const unmonitoredSeriesId = 'upgrade-series-unmonitored';

		await testDb.db.insert(series).values([
			{
				id: monitoredSeriesId,
				tmdbId: 301,
				title: 'Monitored Series',
				path: '/series/upgrade-monitored',
				monitored: true,
				languageProfileId: 'profile-1'
			},
			{
				id: unmonitoredSeriesId,
				tmdbId: 302,
				title: 'Unmonitored Series',
				path: '/series/upgrade-unmonitored',
				monitored: false,
				languageProfileId: 'profile-1'
			}
		]);

		const monitoredEpisodeId = 'upgrade-ep-monitored';
		const unmonitoredEpisodeId = 'upgrade-ep-unmonitored';
		const unmonitoredSeriesEpisodeId = 'upgrade-ep-unmonitored-series';

		await testDb.db.insert(episodes).values([
			{
				id: monitoredEpisodeId,
				seriesId: monitoredSeriesId,
				seasonNumber: 1,
				episodeNumber: 1,
				monitored: true
			},
			{
				id: unmonitoredEpisodeId,
				seriesId: monitoredSeriesId,
				seasonNumber: 1,
				episodeNumber: 2,
				monitored: false
			},
			{
				id: unmonitoredSeriesEpisodeId,
				seriesId: unmonitoredSeriesId,
				seasonNumber: 1,
				episodeNumber: 1,
				monitored: true
			}
		]);

		await testDb.db.insert(subtitles).values([
			{
				id: 'sub-ep-monitored',
				episodeId: monitoredEpisodeId,
				relativePath: 'ep-monitored.srt',
				language: 'en',
				format: 'srt',
				matchScore: 50
			},
			{
				id: 'sub-ep-unmonitored',
				episodeId: unmonitoredEpisodeId,
				relativePath: 'ep-unmonitored.srt',
				language: 'en',
				format: 'srt',
				matchScore: 50
			},
			{
				id: 'sub-ep-unmonitored-series',
				episodeId: unmonitoredSeriesEpisodeId,
				relativePath: 'ep-unmonitored-series.srt',
				language: 'en',
				format: 'srt',
				matchScore: 50
			}
		]);

		const result = await executeSubtitleUpgradeTask(null);

		expect(result.itemsProcessed).toBe(2);
		expect(searchService.searchForMovie).toHaveBeenCalledTimes(1);
		expect(searchService.searchForMovie).toHaveBeenCalledWith(monitoredMovieId, ['en']);
		expect(
			searchService.searchForMovie.mock.calls.some((call) => call[0] === unmonitoredMovieId)
		).toBe(false);

		expect(searchService.searchForEpisode).toHaveBeenCalledTimes(1);
		expect(searchService.searchForEpisode).toHaveBeenCalledWith(monitoredEpisodeId, ['en']);
		expect(
			searchService.searchForEpisode.mock.calls.some(
				(call) => call[0] === unmonitoredEpisodeId || call[0] === unmonitoredSeriesEpisodeId
			)
		).toBe(false);
	});
});
