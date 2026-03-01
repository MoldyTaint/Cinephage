import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	movieFilesFindFirst: vi.fn(),
	episodesFindFirst: vi.fn(),
	episodesFindMany: vi.fn(),
	seriesFindFirst: vi.fn(),
	episodeFilesFindMany: vi.fn(),
	searchEnhanced: vi.fn(),
	evaluateForEpisode: vi.fn(),
	grabRelease: vi.fn(),
	getIndexerManager: vi.fn(),
	searchWithMultiSeasonPriority: vi.fn(),
	getMultiSeasonSearchStrategy: vi.fn()
}));

vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: {
			movieFiles: { findFirst: mocks.movieFilesFindFirst },
			episodes: { findFirst: mocks.episodesFindFirst, findMany: mocks.episodesFindMany },
			series: { findFirst: mocks.seriesFindFirst },
			episodeFiles: { findMany: mocks.episodeFilesFindMany }
		}
	}
}));

vi.mock('$lib/server/indexers/IndexerManager.js', () => ({
	getIndexerManager: mocks.getIndexerManager
}));

vi.mock('$lib/server/downloads/index.js', () => ({
	releaseDecisionService: {
		evaluateForEpisode: mocks.evaluateForEpisode
	},
	getReleaseGrabService: () => ({
		grabRelease: mocks.grabRelease
	}),
	getCascadingSearchStrategy: vi.fn()
}));

vi.mock('$lib/server/downloads/MultiSeasonSearchStrategy.js', () => ({
	getMultiSeasonSearchStrategy: mocks.getMultiSeasonSearchStrategy
}));

vi.mock('$lib/logging/index.js', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

import { searchOnAdd } from './searchOnAdd';

describe('SearchOnAddService.searchForEpisode monitoring behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getIndexerManager.mockResolvedValue({
			searchEnhanced: mocks.searchEnhanced
		});
		mocks.getMultiSeasonSearchStrategy.mockReturnValue({
			searchWithMultiSeasonPriority: mocks.searchWithMultiSeasonPriority
		});
		mocks.searchWithMultiSeasonPriority.mockResolvedValue({
			results: [],
			summary: {
				searched: 0,
				found: 0,
				grabbed: 0,
				completeSeriesPacksGrabbed: 0,
				multiSeasonPacksGrabbed: 0,
				singleSeasonPacksGrabbed: 0,
				individualEpisodesGrabbed: 0
			},
			seasonPacks: [],
			multiSeasonPacks: []
		});
	});

	it('skips when series is unmonitored by default', async () => {
		mocks.episodesFindFirst.mockResolvedValue({
			id: 'ep-1',
			seriesId: 'series-1',
			seasonNumber: 2,
			episodeNumber: 1
		});
		mocks.seriesFindFirst.mockResolvedValue({
			id: 'series-1',
			title: 'The Pitt',
			tmdbId: 250307,
			tvdbId: 448176,
			imdbId: 'tt3193862',
			monitored: false,
			scoringProfileId: null
		});

		const result = await searchOnAdd.searchForEpisode({ episodeId: 'ep-1' });

		expect(result).toEqual({ success: true });
		expect(mocks.searchEnhanced).not.toHaveBeenCalled();
		expect(mocks.grabRelease).not.toHaveBeenCalled();
	});

	it('searches and grabs when bypassMonitoring is true', async () => {
		mocks.episodesFindFirst.mockResolvedValue({
			id: 'ep-1',
			seriesId: 'series-1',
			seasonNumber: 2,
			episodeNumber: 1
		});
		mocks.seriesFindFirst.mockResolvedValue({
			id: 'series-1',
			title: 'The Pitt',
			tmdbId: 250307,
			tvdbId: 448176,
			imdbId: 'tt3193862',
			monitored: false,
			scoringProfileId: null
		});
		mocks.episodeFilesFindMany.mockResolvedValue([]);
		mocks.searchEnhanced.mockResolvedValue({
			releases: [
				{
					title: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP',
					size: 2_000_000_000,
					parsed: {
						resolution: '1080p',
						source: 'webdl',
						codec: 'h264',
						hdr: null
					},
					indexerId: 'indexer-1',
					infoHash: 'abc123',
					downloadUrl: 'https://example.test/download/1',
					magnetUrl: null
				}
			],
			rejectedCount: 0
		});
		mocks.evaluateForEpisode.mockResolvedValue({
			accepted: true,
			isUpgrade: false
		});
		mocks.grabRelease.mockResolvedValue({
			success: true,
			releaseName: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP',
			queueItemId: 'queue-1'
		});

		const result = await searchOnAdd.searchForEpisode({
			episodeId: 'ep-1',
			bypassMonitoring: true
		});

		expect(mocks.searchEnhanced).toHaveBeenCalledOnce();
		expect(mocks.searchEnhanced).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ searchSource: 'interactive' })
		);
		expect(mocks.grabRelease).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			success: true,
			releaseName: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP'
		});
	});

	it('uses automatic search source for monitored-series episode auto-search', async () => {
		mocks.episodesFindFirst.mockResolvedValue({
			id: 'ep-1',
			seriesId: 'series-1',
			seasonNumber: 2,
			episodeNumber: 1
		});
		mocks.seriesFindFirst.mockResolvedValue({
			id: 'series-1',
			title: 'The Pitt',
			tmdbId: 250307,
			tvdbId: 448176,
			imdbId: 'tt3193862',
			monitored: true,
			scoringProfileId: null
		});
		mocks.episodeFilesFindMany.mockResolvedValue([]);
		mocks.searchEnhanced.mockResolvedValue({
			releases: [
				{
					title: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP',
					size: 2_000_000_000,
					parsed: {
						resolution: '1080p',
						source: 'webdl',
						codec: 'h264',
						hdr: null
					},
					indexerId: 'indexer-1',
					infoHash: 'abc123',
					downloadUrl: 'https://example.test/download/1',
					magnetUrl: null
				}
			],
			rejectedCount: 0
		});
		mocks.evaluateForEpisode.mockResolvedValue({
			accepted: true,
			isUpgrade: false
		});
		mocks.grabRelease.mockResolvedValue({
			success: true,
			releaseName: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP',
			queueItemId: 'queue-1'
		});

		const result = await searchOnAdd.searchForEpisode({ episodeId: 'ep-1' });

		expect(mocks.searchEnhanced).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ searchSource: 'automatic' })
		);
		expect(mocks.grabRelease).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			success: true,
			releaseName: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP'
		});
	});
});

describe('SearchOnAddService.searchForMovie monitoring behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getIndexerManager.mockResolvedValue({
			searchEnhanced: mocks.searchEnhanced
		});
		mocks.movieFilesFindFirst.mockResolvedValue(undefined);
		mocks.grabRelease.mockResolvedValue({
			success: true,
			releaseName: 'The.Interview.2014.1080p.WEB.H264-GROUP',
			queueItemId: 'queue-1'
		});
	});

	it('uses interactive search source when bypassMonitoring is true', async () => {
		mocks.searchEnhanced.mockResolvedValue({
			releases: [
				{
					title: 'The.Interview.2014.1080p.WEB.H264-GROUP',
					size: 2_000_000_000,
					parsed: {
						resolution: '1080p',
						source: 'webdl',
						codec: 'h264',
						hdr: null
					},
					indexerId: 'indexer-1',
					infoHash: 'abc123',
					downloadUrl: 'stream://movie/228967',
					magnetUrl: null
				}
			],
			rejectedCount: 0
		});

		const result = await searchOnAdd.searchForMovie({
			movieId: 'movie-1',
			tmdbId: 228967,
			imdbId: 'tt2788710',
			title: 'The Interview',
			year: 2014,
			scoringProfileId: 'streamer',
			bypassMonitoring: true
		});

		expect(mocks.searchEnhanced).toHaveBeenCalledOnce();
		expect(mocks.searchEnhanced).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ searchSource: 'interactive' })
		);
		expect(mocks.grabRelease).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			success: true,
			releaseName: 'The.Interview.2014.1080p.WEB.H264-GROUP'
		});
	});

	it('uses automatic search source by default', async () => {
		mocks.searchEnhanced.mockResolvedValue({
			releases: [
				{
					title: 'The.Interview.2014.1080p.WEB.H264-GROUP',
					size: 2_000_000_000,
					parsed: {
						resolution: '1080p',
						source: 'webdl',
						codec: 'h264',
						hdr: null
					},
					indexerId: 'indexer-1',
					infoHash: 'abc123',
					downloadUrl: 'stream://movie/228967',
					magnetUrl: null
				}
			],
			rejectedCount: 0
		});

		const result = await searchOnAdd.searchForMovie({
			movieId: 'movie-1',
			tmdbId: 228967,
			imdbId: 'tt2788710',
			title: 'The Interview',
			year: 2014,
			scoringProfileId: 'streamer'
		});

		expect(mocks.searchEnhanced).toHaveBeenCalledOnce();
		expect(mocks.searchEnhanced).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ searchSource: 'automatic' })
		);
		expect(mocks.grabRelease).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			success: true,
			releaseName: 'The.Interview.2014.1080p.WEB.H264-GROUP'
		});
	});
});

describe('SearchOnAddService.searchForMissingEpisodes monitoring behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getMultiSeasonSearchStrategy.mockReturnValue({
			searchWithMultiSeasonPriority: mocks.searchWithMultiSeasonPriority
		});
		mocks.searchWithMultiSeasonPriority.mockResolvedValue({
			results: [],
			summary: {
				searched: 0,
				found: 0,
				grabbed: 0,
				completeSeriesPacksGrabbed: 0,
				multiSeasonPacksGrabbed: 0,
				singleSeasonPacksGrabbed: 0,
				individualEpisodesGrabbed: 0
			},
			seasonPacks: [],
			multiSeasonPacks: []
		});
	});

	it('filters to monitored episodes by default', async () => {
		mocks.seriesFindFirst.mockResolvedValue({
			id: 'series-1',
			title: 'Afro Samurai',
			tmdbId: 19544,
			tvdbId: 79755,
			imdbId: 'tt0465316',
			scoringProfileId: 'streamer'
		});
		mocks.episodesFindMany.mockResolvedValue([
			{
				id: 'ep-1',
				seriesId: 'series-1',
				seasonNumber: 1,
				episodeNumber: 1,
				hasFile: false,
				monitored: true,
				airDate: '2007-01-03'
			}
		]);

		await searchOnAdd.searchForMissingEpisodes('series-1');

		expect(mocks.searchWithMultiSeasonPriority).toHaveBeenCalledWith(
			expect.objectContaining({
				searchSource: 'interactive',
				episodes: [
					expect.objectContaining({
						id: 'ep-1',
						monitored: true
					})
				]
			})
		);
	});

	it('includes unmonitored episodes when bypassMonitoring is true', async () => {
		mocks.seriesFindFirst.mockResolvedValue({
			id: 'series-1',
			title: 'Afro Samurai',
			tmdbId: 19544,
			tvdbId: 79755,
			imdbId: 'tt0465316',
			scoringProfileId: 'streamer'
		});
		mocks.episodesFindMany.mockResolvedValue([
			{
				id: 'ep-1',
				seriesId: 'series-1',
				seasonNumber: 1,
				episodeNumber: 1,
				hasFile: false,
				monitored: false,
				airDate: '2007-01-03'
			},
			{
				id: 'ep-2',
				seriesId: 'series-1',
				seasonNumber: 1,
				episodeNumber: 2,
				hasFile: false,
				monitored: true,
				airDate: '2007-01-10'
			}
		]);

		await searchOnAdd.searchForMissingEpisodes('series-1', undefined, {
			bypassMonitoring: true
		});

		expect(mocks.searchWithMultiSeasonPriority).toHaveBeenCalledWith(
			expect.objectContaining({
				searchSource: 'interactive',
				episodes: [
					expect.objectContaining({
						id: 'ep-1',
						monitored: false
					}),
					expect.objectContaining({
						id: 'ep-2',
						monitored: true
					})
				]
			})
		);
	});
});
