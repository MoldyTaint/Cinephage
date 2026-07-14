import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type {
	SubtitleSearchCriteria,
	SubtitleSearchResult,
	AggregatedSearchResult
} from '../types';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import { movies, movieFiles, rootFolders } from '$lib/server/db/schema';

const mockGetMovieExternalIds = vi.fn();
const mockGetTvExternalIds = vi.fn();

vi.mock('$lib/server/tmdb', () => ({
	tmdb: {
		getMovieExternalIds: (...args: unknown[]) => mockGetMovieExternalIds(...args),
		getTvExternalIds: (...args: unknown[]) => mockGetTvExternalIds(...args)
	}
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

const { SubtitleSearchService, clearIdCacheForTests } = await import('./SubtitleSearchService');

afterAll(() => {
	destroyTestDb(testDb);
});

type TestableSubtitleSearchService = {
	enrichCriteria(criteria: SubtitleSearchCriteria): Promise<SubtitleSearchCriteria>;
};

describe('SubtitleSearchService - enrichCriteria', () => {
	let service: TestableSubtitleSearchService;

	beforeEach(() => {
		service = SubtitleSearchService.getInstance() as unknown as TestableSubtitleSearchService;
		mockGetMovieExternalIds.mockReset();
		mockGetTvExternalIds.mockReset();
		clearIdCacheForTests();
	});

	it('should return criteria unchanged when no tmdbId', async () => {
		const criteria: SubtitleSearchCriteria = {
			title: 'Inception',
			year: 2010,
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result).toBe(criteria);
		expect(mockGetMovieExternalIds).not.toHaveBeenCalled();
	});

	it('should return criteria unchanged when imdbId already present', async () => {
		const criteria: SubtitleSearchCriteria = {
			title: 'Inception',
			year: 2010,
			tmdbId: 27205,
			imdbId: 'tt1375666',
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result.imdbId).toBe('tt1375666');
		expect(mockGetMovieExternalIds).not.toHaveBeenCalled();
	});

	it('should resolve imdbId for movies via TMDB', async () => {
		mockGetMovieExternalIds.mockResolvedValue({
			imdb_id: 'tt1375666',
			tvdb_id: null,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});

		const criteria: SubtitleSearchCriteria = {
			title: 'Inception',
			year: 2010,
			tmdbId: 27205,
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result.imdbId).toBe('tt1375666');
		expect(mockGetMovieExternalIds).toHaveBeenCalledWith(27205);
	});

	it('should resolve imdbId and tvdbId for TV shows via TMDB', async () => {
		mockGetTvExternalIds.mockResolvedValue({
			imdb_id: 'tt0903747',
			tvdb_id: 81189,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});

		const criteria: SubtitleSearchCriteria = {
			title: 'Breaking Bad',
			seriesTitle: 'Breaking Bad',
			season: 1,
			episode: 1,
			tmdbId: 1396,
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result.imdbId).toBe('tt0903747');
		expect(result.tvdbId).toBe(81189);
		expect(mockGetTvExternalIds).toHaveBeenCalledWith(1396);
	});

	it('should not resolve tvdbId for movies', async () => {
		mockGetMovieExternalIds.mockResolvedValue({
			imdb_id: 'tt1375666',
			tvdb_id: 123,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});

		const criteria: SubtitleSearchCriteria = {
			title: 'Inception',
			year: 2010,
			tmdbId: 27205,
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result.imdbId).toBe('tt1375666');
		expect(result.tvdbId).toBeUndefined();
		expect(mockGetMovieExternalIds).toHaveBeenCalledWith(27205);
	});

	it('should handle TMDB API failure gracefully', async () => {
		mockGetMovieExternalIds.mockRejectedValue(new Error('TMDB API down'));

		const criteria: SubtitleSearchCriteria = {
			title: 'Inception',
			year: 2010,
			tmdbId: 27205,
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result.imdbId).toBeUndefined();
		expect(result.title).toBe('Inception');
	});

	it('should handle null imdb_id from TMDB', async () => {
		mockGetMovieExternalIds.mockResolvedValue({
			imdb_id: null,
			tvdb_id: null,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});

		const criteria: SubtitleSearchCriteria = {
			title: 'Unknown Movie',
			tmdbId: 999999,
			languages: ['en']
		};

		const result = await service.enrichCriteria(criteria);

		expect(result.imdbId).toBeUndefined();
	});

	it('should use cached results on second call', async () => {
		mockGetMovieExternalIds.mockResolvedValue({
			imdb_id: 'tt1375666',
			tvdb_id: null,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});

		const criteria1: SubtitleSearchCriteria = {
			title: 'Inception',
			tmdbId: 27205,
			languages: ['en']
		};

		await service.enrichCriteria(criteria1);
		expect(mockGetMovieExternalIds).toHaveBeenCalledTimes(1);

		const criteria2: SubtitleSearchCriteria = {
			title: 'Inception',
			tmdbId: 27205,
			languages: ['en']
		};

		const result2 = await service.enrichCriteria(criteria2);
		expect(result2.imdbId).toBe('tt1375666');
		expect(mockGetMovieExternalIds).toHaveBeenCalledTimes(1);
	});

	it('should cache TV and movie separately for same tmdbId', async () => {
		mockGetMovieExternalIds.mockResolvedValue({
			imdb_id: 'ttMovie',
			tvdb_id: null,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});
		mockGetTvExternalIds.mockResolvedValue({
			imdb_id: 'ttTv',
			tvdb_id: 99999,
			wikidata_id: null,
			facebook_id: null,
			instagram_id: null,
			twitter_id: null
		});

		const movieCriteria: SubtitleSearchCriteria = {
			title: 'Battlestar',
			tmdbId: 12345,
			languages: ['en']
		};

		const tvCriteria: SubtitleSearchCriteria = {
			title: 'Battlestar',
			tmdbId: 12345,
			season: 1,
			episode: 1,
			languages: ['en']
		};

		const movieResult = await service.enrichCriteria(movieCriteria);
		const tvResult = await service.enrichCriteria(tvCriteria);

		expect(movieResult.imdbId).toBe('ttMovie');
		expect(movieResult.tvdbId).toBeUndefined();
		expect(tvResult.imdbId).toBe('ttTv');
		expect(tvResult.tvdbId).toBe(99999);
	});
});

describe('SubtitleSearchService - searchForMovie', () => {
	const ROOT_PATH = '/tmp/cinephage-subtitle-search-service';

	function buildSearchResult(overrides: Partial<SubtitleSearchResult> = {}): SubtitleSearchResult {
		return {
			providerId: 'opensubtitles',
			providerName: 'OpenSubtitles',
			providerSubtitleId: 'sub-default',
			language: 'en',
			title: 'Test Movie',
			isForced: false,
			isHearingImpaired: false,
			format: 'srt',
			isHashMatch: false,
			matchScore: 80,
			...overrides
		};
	}

	function buildAggregatedResult(results: SubtitleSearchResult[]): AggregatedSearchResult {
		return {
			results,
			totalResults: results.length,
			searchTimeMs: 5,
			providerResults: [
				{
					providerId: 'opensubtitles',
					providerName: 'OpenSubtitles',
					resultCount: results.length,
					searchTimeMs: 5
				}
			]
		};
	}

	async function seedRootFolderAndMovie(): Promise<string> {
		const rootFolderId = 'root-1';
		const movieId = 'movie-1';
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
		return movieId;
	}

	beforeEach(() => {
		testDb.db.delete(movieFiles).run();
		testDb.db.delete(movies).run();
		testDb.db.delete(rootFolders).run();
	});

	it('runs one search per movie file and tags each result with its movieFileId', async () => {
		const movieId = await seedRootFolderAndMovie();
		await testDb.db.insert(movieFiles).values([
			{ id: 'file-2160p', movieId, relativePath: 'Test.Movie.2024.2160p.mkv', size: 1000 },
			{ id: 'file-1080p', movieId, relativePath: 'Test.Movie.2024.1080p.mkv', size: 2000 }
		]);

		const service = SubtitleSearchService.getInstance();
		let callIndex = 0;
		const searchSpy = vi.spyOn(service, 'search').mockImplementation(async () => {
			const idx = callIndex++;
			return buildAggregatedResult([buildSearchResult({ providerSubtitleId: `sub-${idx}` })]);
		});

		try {
			const result = await service.searchForMovie(movieId, ['en']);

			expect(searchSpy).toHaveBeenCalledTimes(2);
			expect(result.results).toHaveLength(2);
			expect(result.totalResults).toBe(2);

			const taggedIds = result.results.map((r) => r.movieFileId).sort();
			expect(taggedIds).toEqual(['file-1080p', 'file-2160p']);

			const firstCriteria = searchSpy.mock.calls[0][0] as SubtitleSearchCriteria;
			const secondCriteria = searchSpy.mock.calls[1][0] as SubtitleSearchCriteria;
			expect(firstCriteria.filePath).toContain('.mkv');
			expect(firstCriteria.fileSize).toBeTypeOf('number');
			expect(secondCriteria.filePath).toContain('.mkv');
			expect(secondCriteria.fileSize).toBeTypeOf('number');
		} finally {
			searchSpy.mockRestore();
		}
	});

	it('runs a single search for a single-file movie and tags the result (backward compat)', async () => {
		const movieId = await seedRootFolderAndMovie();
		await testDb.db.insert(movieFiles).values({
			id: 'file-1',
			movieId,
			relativePath: 'Test.Movie.2024.mkv',
			size: 5000
		});

		const service = SubtitleSearchService.getInstance();
		const searchSpy = vi
			.spyOn(service, 'search')
			.mockResolvedValue(
				buildAggregatedResult([buildSearchResult({ providerSubtitleId: 'sub-single' })])
			);

		try {
			const result = await service.searchForMovie(movieId, ['en']);

			expect(searchSpy).toHaveBeenCalledTimes(1);
			expect(result.results).toHaveLength(1);
			expect(result.results[0].movieFileId).toBe('file-1');
			expect(result.totalResults).toBe(1);
		} finally {
			searchSpy.mockRestore();
		}
	});

	it('falls back to a metadata-only search when the movie has no files', async () => {
		const movieId = await seedRootFolderAndMovie();

		const service = SubtitleSearchService.getInstance();
		const searchSpy = vi
			.spyOn(service, 'search')
			.mockResolvedValue(
				buildAggregatedResult([buildSearchResult({ providerSubtitleId: 'sub-meta' })])
			);

		try {
			const result = await service.searchForMovie(movieId, ['en']);

			expect(searchSpy).toHaveBeenCalledTimes(1);
			expect(result.results).toHaveLength(1);
			expect(result.results[0].movieFileId).toBeUndefined();

			const criteria = searchSpy.mock.calls[0][0] as SubtitleSearchCriteria;
			expect(criteria.filePath).toBeUndefined();
			expect(criteria.fileSize).toBeUndefined();
			expect(criteria.title).toBe('Test Movie');
		} finally {
			searchSpy.mockRestore();
		}
	});
});
