import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SubtitleSearchCriteria } from '../types';

const mockGetMovieExternalIds = vi.fn();
const mockGetTvExternalIds = vi.fn();

vi.mock('$lib/server/tmdb', () => ({
	tmdb: {
		getMovieExternalIds: (...args: unknown[]) => mockGetMovieExternalIds(...args),
		getTvExternalIds: (...args: unknown[]) => mockGetTvExternalIds(...args)
	}
}));

const { SubtitleSearchService, clearIdCacheForTests } = await import('./SubtitleSearchService');

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
