import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlexStatsProvider } from './PlexStatsProvider.js';
import type { MediaServerStatsProviderConfig } from '../types.js';

const mockConfig: MediaServerStatsProviderConfig = {
	host: 'http://plex:32400',
	apiKey: 'test-plex-token',
	serverId: 'test-server-id',
	serverType: 'plex'
};

function mockFetchResponse(data: any) {
	return {
		ok: true,
		json: () => Promise.resolve(data)
	};
}

function mockSectionsResponse(
	sections: Array<{ key: string; type: string; title: string }> = [
		{ key: '1', type: 'movie', title: 'Movies' },
		{ key: '2', type: 'show', title: 'TV Shows' }
	]
) {
	return mockFetchResponse({
		MediaContainer: { Directory: sections }
	});
}

function makePlexMovie(overrides: Record<string, any> = {}) {
	return {
		ratingKey: '100',
		title: 'Test Plex Movie',
		year: 2023,
		viewCount: 7,
		lastViewedAt: 1704067200,
		duration: 7200000,
		Guid: [{ id: 'tmdb://12345' }, { id: 'tvdb://67890' }, { id: 'imdb://tt1234567' }],
		Media: [
			{
				videoResolution: '1080',
				videoCodec: 'h264',
				audioCodec: 'dts',
				audioChannels: 6,
				container: 'mkv',
				bitrate: 20000,
				width: 1920,
				height: 1080,
				Part: [
					{
						size: 8589934592,
						Stream: [
							{
								streamType: 1,
								codec: 'h264',
								profile: 'High',
								bitDepth: 8
							},
							{
								streamType: 2,
								codec: 'dts',
								channels: 6,
								audioChannelLayout: '5.1',
								languageCode: 'eng'
							},
							{
								streamType: 2,
								codec: 'aac',
								channels: 2,
								languageCode: 'fre'
							},
							{
								streamType: 3,
								languageCode: 'eng'
							},
							{
								streamType: 3,
								languageCode: 'spa'
							}
						]
					}
				]
			}
		],
		...overrides
	};
}

function mockEmptyLibrary(sectionKey: string, totalSize = 0) {
	return mockFetchResponse({
		MediaContainer: { Metadata: [], totalSize }
	});
}

describe('PlexStatsProvider', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should discover library sections', async () => {
		mockFetch.mockResolvedValueOnce(mockSectionsResponse());
		mockFetch.mockResolvedValueOnce(mockEmptyLibrary('1'));
		mockFetch.mockResolvedValueOnce(mockEmptyLibrary('2'));

		const provider = new PlexStatsProvider(mockConfig);
		await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledWith(
			'http://plex:32400/library/sections',
			expect.objectContaining({
				headers: expect.objectContaining({
					'X-Plex-Token': 'test-plex-token'
				})
			})
		);
	});

	it('should fetch movies from movie libraries', async () => {
		const movie = makePlexMovie();

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [movie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('/library/sections/1/all?type=1'),
			expect.anything()
		);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].itemType).toBe('movie');
	});

	it('should fetch episodes from show libraries', async () => {
		const episode = {
			ratingKey: '200',
			title: 'Test Episode',
			year: 2023,
			grandparentTitle: 'Test Series',
			parentIndex: 1,
			index: 5,
			viewCount: 2,
			lastViewedAt: 1704067200,
			duration: 2700000,
			Media: [
				{
					videoCodec: 'h264',
					container: 'mp4',
					Part: [{ size: 1073741824, Stream: [] }]
				}
			]
		};

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '2', type: 'show', title: 'TV Shows' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [episode], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('/library/sections/2/all?type=4'),
			expect.anything()
		);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].itemType).toBe('episode');
		expect(result.items[0].seriesName).toBe('Test Series');
		expect(result.items[0].seasonNumber).toBe(1);
		expect(result.items[0].episodeNumber).toBe(5);
	});

	it('should parse modern Guid array format', async () => {
		const movie = makePlexMovie({
			Guid: [{ id: 'tmdb://99999' }, { id: 'tvdb://88888' }, { id: 'imdb://tt9876543' }]
		});

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [movie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].tmdbId).toBe(99999);
		expect(result.items[0].tvdbId).toBe(88888);
		expect(result.items[0].imdbId).toBe('tt9876543');
	});

	it('should parse legacy guid string format', async () => {
		const movie = makePlexMovie({
			guid: 'com.plexapp.agents.themoviedb://54321?lang=en',
			Guid: []
		});

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [movie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].tmdbId).toBe(54321);
	});

	it('should extract media info from Media/Part/Stream structure', async () => {
		const movie = makePlexMovie();

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [movie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		const item = result.items[0];
		expect(item.videoCodec).toBe('h264');
		expect(item.videoProfile).toBe('High');
		expect(item.videoBitDepth).toBe(8);
		expect(item.width).toBe(1920);
		expect(item.height).toBe(1080);
		expect(item.audioCodec).toBe('dts');
		expect(item.audioChannels).toBe(6);
		expect(item.audioChannelLayout).toBe('5.1');
		expect(item.containerFormat).toBe('mkv');
		expect(item.fileSize).toBe(8589934592);
		expect(item.bitrate).toBe(20000);
		expect(item.audioLanguages).toEqual(['eng', 'fre']);
		expect(item.subtitleLanguages).toEqual(['eng', 'spa']);
	});

	it('should detect HDR from colorTrc field', async () => {
		const hdrMovie = makePlexMovie({
			Media: [
				{
					container: 'mkv',
					Part: [
						{
							size: 100,
							Stream: [
								{
									streamType: 1,
									codec: 'hevc',
									colorTrc: 'smpte2084'
								}
							]
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [hdrMovie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('HDR10');
	});

	it('should detect Dolby Vision from DOVIPresent', async () => {
		const dvMovie = makePlexMovie({
			Media: [
				{
					container: 'mkv',
					Part: [
						{
							size: 100,
							Stream: [
								{
									streamType: 1,
									codec: 'hevc',
									DOVIPresent: 1,
									DOVIBLCompatID: 0
								}
							]
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [dvMovie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('DV');
	});

	it('should detect Dolby Vision HDR10 from DOVIPresent with profile 7', async () => {
		const dvMovie = makePlexMovie({
			Media: [
				{
					container: 'mkv',
					Part: [
						{
							size: 100,
							Stream: [
								{
									streamType: 1,
									codec: 'hevc',
									DOVIPresent: 1,
									DOVIBLCompatID: 7
								}
							]
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [dvMovie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('DVHDR10');
	});

	it('should detect HLG from colorTrc', async () => {
		const hlgMovie = makePlexMovie({
			Media: [
				{
					container: 'mkv',
					Part: [
						{
							size: 100,
							Stream: [
								{
									streamType: 1,
									codec: 'hevc',
									colorTrc: 'arib-std-b67'
								}
							]
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [hlgMovie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('HLG');
	});

	it('should handle pagination with X-Plex-Container-Start', async () => {
		const movies = Array.from({ length: 3 }, (_, i) =>
			makePlexMovie({ ratingKey: String(100 + i), title: `Movie ${i}` })
		);

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: movies.slice(0, 2), totalSize: 3 }
			})
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: movies.slice(2), totalSize: 3 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('X-Plex-Container-Start=0'),
			expect.anything()
		);
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('X-Plex-Container-Start=2'),
			expect.anything()
		);
		expect(result.items).toHaveLength(3);
	});

	it('should map viewCount to playCount', async () => {
		const movie = makePlexMovie({ viewCount: 12 });

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [movie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].playCount).toBe(12);
		expect(result.items[0].isPlayed).toBe(true);
	});

	it('should convert epoch timestamp to ISO datetime', async () => {
		const epochValue = 1704067200;
		const movie = makePlexMovie({ lastViewedAt: epochValue });

		mockFetch.mockResolvedValueOnce(
			mockSectionsResponse([{ key: '1', type: 'movie', title: 'Movies' }])
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({
				MediaContainer: { Metadata: [movie], totalSize: 1 }
			})
		);

		const provider = new PlexStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].lastPlayedDate).toBe(new Date(epochValue * 1000).toISOString());
	});
});
