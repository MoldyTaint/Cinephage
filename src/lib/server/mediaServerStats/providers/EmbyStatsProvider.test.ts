import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbyStatsProvider } from './EmbyStatsProvider.js';
import type { MediaServerStatsProviderConfig } from '../types.js';

const mockConfig: MediaServerStatsProviderConfig = {
	host: 'http://emby:8096',
	apiKey: 'test-emby-key',
	serverId: 'test-server-id',
	serverType: 'emby'
};

function mockFetchResponse(data: any) {
	return {
		ok: true,
		json: () => Promise.resolve(data)
	};
}

function mockAdminResponse() {
	return mockFetchResponse([{ Id: 'emby-admin-id', Policy: { IsAdministrator: true } }]);
}

function makeEmbyItem(overrides: Record<string, any> = {}) {
	return {
		Id: 'emby-item-1',
		Name: 'Test Emby Movie',
		Type: 'Movie',
		ProductionYear: 2024,
		ProviderIds: {
			Tmdb: '55555',
			Tvdb: '44444',
			Imdb: 'tt5555555'
		},
		UserData: {
			PlayCount: 3,
			LastPlayedDate: '2025-06-01T00:00:00Z',
			PlayedPercentage: 100,
			Played: true
		},
		MediaSources: [
			{
				Container: 'mp4',
				Size: 5368709120,
				Bitrate: 15000000,
				MediaStreams: [
					{
						Type: 'Video',
						Codec: 'h264',
						Profile: 'High',
						BitDepth: 8,
						Width: 1920,
						Height: 1080,
						BitRate: 12000000,
						ExtendedVideoType: 'None'
					},
					{
						Type: 'Audio',
						Codec: 'ac3',
						Channels: 6,
						ChannelLayout: '5.1',
						BitRate: 640000,
						Language: 'eng'
					},
					{
						Type: 'Subtitle',
						Language: 'spa'
					}
				]
			}
		],
		RunTimeTicks: 54000000000,
		...overrides
	};
}

describe('EmbyStatsProvider', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should use /emby/ API prefix', async () => {
		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(mockFetchResponse({ TotalRecordCount: 0, Items: [] }));

		const provider = new EmbyStatsProvider(mockConfig);
		await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledWith('http://emby:8096/emby/Users', expect.anything());
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('http://emby:8096/emby/Users/emby-admin-id/Items'),
			expect.anything()
		);
	});

	it('should authenticate with X-Emby-Token header', async () => {
		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(mockFetchResponse({ TotalRecordCount: 0, Items: [] }));

		const provider = new EmbyStatsProvider(mockConfig);
		await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({
					'X-Emby-Token': 'test-emby-key'
				})
			})
		);
	});

	it('should normalize items from Emby response format', async () => {
		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({ TotalRecordCount: 1, Items: [makeEmbyItem()] })
		);

		const provider = new EmbyStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		const item = result.items[0];
		expect(item.serverItemId).toBe('emby-item-1');
		expect(item.tmdbId).toBe(55555);
		expect(item.tvdbId).toBe(44444);
		expect(item.imdbId).toBe('tt5555555');
		expect(item.title).toBe('Test Emby Movie');
		expect(item.year).toBe(2024);
		expect(item.itemType).toBe('movie');
		expect(item.playCount).toBe(3);
		expect(item.isPlayed).toBe(true);
		expect(item.videoCodec).toBe('h264');
		expect(item.width).toBe(1920);
		expect(item.height).toBe(1080);
		expect(item.audioCodec).toBe('ac3');
		expect(item.containerFormat).toBe('mp4');
		expect(item.duration).toBe(5400);
		expect(item.audioLanguages).toEqual(['eng']);
		expect(item.subtitleLanguages).toEqual(['spa']);
	});

	it('should detect HDR from ExtendedVideoType', async () => {
		const hdrItem = makeEmbyItem({
			MediaSources: [
				{
					Container: 'mkv',
					MediaStreams: [
						{
							Type: 'Video',
							Codec: 'hevc',
							ExtendedVideoType: 'HDR10'
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(mockFetchResponse({ TotalRecordCount: 1, Items: [hdrItem] }));

		const provider = new EmbyStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('HDR10');
	});

	it('should normalize Emby DolbyVision to Dolby Vision', async () => {
		const dvItem = makeEmbyItem({
			MediaSources: [
				{
					Container: 'mkv',
					MediaStreams: [
						{
							Type: 'Video',
							Codec: 'hevc',
							ExtendedVideoType: 'DolbyVision'
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(mockFetchResponse({ TotalRecordCount: 1, Items: [dvItem] }));

		const provider = new EmbyStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('DV');
	});

	it('should normalize Emby Hdr10Plus to HDR10+', async () => {
		const item = makeEmbyItem({
			MediaSources: [
				{
					Container: 'mkv',
					MediaStreams: [
						{
							Type: 'Video',
							Codec: 'hevc',
							ExtendedVideoType: 'Hdr10Plus'
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(mockFetchResponse({ TotalRecordCount: 1, Items: [item] }));

		const provider = new EmbyStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('HDR10+');
	});

	it('should normalize Emby HyperLogGamma to HLG', async () => {
		const item = makeEmbyItem({
			MediaSources: [
				{
					Container: 'mkv',
					MediaStreams: [
						{
							Type: 'Video',
							Codec: 'hevc',
							ExtendedVideoType: 'HyperLogGamma'
						}
					]
				}
			]
		});

		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(mockFetchResponse({ TotalRecordCount: 1, Items: [item] }));

		const provider = new EmbyStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(result.items[0].isHDR).toBe(true);
		expect(result.items[0].hdrFormat).toBe('HLG');
	});

	it('should handle pagination', async () => {
		const items = Array.from({ length: 3 }, (_, i) =>
			makeEmbyItem({ Id: `emby-item-${i}`, Name: `Movie ${i}` })
		);

		mockFetch.mockResolvedValueOnce(mockAdminResponse());
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({ TotalRecordCount: 1500, Items: items.slice(0, 2) })
		);
		mockFetch.mockResolvedValueOnce(
			mockFetchResponse({ TotalRecordCount: 1500, Items: items.slice(2) })
		);

		const provider = new EmbyStatsProvider(mockConfig);
		const result = await provider.fetchAllItems();

		expect(mockFetch).toHaveBeenCalledTimes(3);
		expect(result.items).toHaveLength(3);
		expect(result.totalOnServer).toBe(1500);
	});
});
