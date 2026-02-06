import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	episodesFindFirst: vi.fn(),
	seriesFindFirst: vi.fn(),
	episodeFilesFindMany: vi.fn(),
	searchEnhanced: vi.fn(),
	evaluateForEpisode: vi.fn(),
	grabRelease: vi.fn(),
	getIndexerManager: vi.fn()
}));

vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: {
			episodes: { findFirst: mocks.episodesFindFirst },
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
		expect(mocks.grabRelease).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			success: true,
			releaseName: 'The.Pitt.S02E01.1080p.WEB.H264-GROUP'
		});
	});
});
