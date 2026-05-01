import type {
	MediaServerStatsProvider,
	MediaServerStatsProviderConfig,
	SyncedMediaItem,
	SyncResult
} from '../types.js';
import { normalizeJellyfinHdr } from '../hdr-normalize.js';

const PAGE_SIZE = 1000;

export class JellyfinStatsProvider implements MediaServerStatsProvider {
	constructor(private config: MediaServerStatsProviderConfig) {}

	async fetchAllItems(): Promise<SyncResult> {
		const adminUserId = await this.getAdminUserId();

		const allItems: SyncedMediaItem[] = [];
		let totalRecordCount = 0;
		let offset = 0;

		do {
			const data = await this.request(
				`/Items?recursive=true&includeItemTypes=Movie,Episode,Series&fields=MediaSources,MediaStreams,Path,Overview,ProviderIds&enableUserData=true&userId=${adminUserId}&Limit=${PAGE_SIZE}&StartIndex=${offset}`
			);

			totalRecordCount = data.TotalRecordCount ?? 0;

			for (const raw of data.Items ?? []) {
				allItems.push(this.normalizeItem(raw));
			}

			offset += PAGE_SIZE;
		} while (offset < totalRecordCount);

		return {
			items: allItems,
			serverItemIds: new Set(allItems.map((item) => item.serverItemId)),
			totalOnServer: totalRecordCount
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async request(path: string): Promise<any> {
		const url = `${this.config.host}${path}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30_000);

		try {
			const response = await fetch(url, {
				headers: {
					Authorization: `MediaBrowser Token="${this.config.apiKey}"`,
					Accept: 'application/json'
				},
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Jellyfin API error: ${response.status} ${response.statusText}`);
			}

			return response.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	private async getAdminUserId(): Promise<string> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const users: any[] = await this.request('/Users');

		const admin = users.find((u) => u.Policy?.IsAdministrator === true);
		if (!admin?.Id) {
			throw new Error('No admin user found in Jellyfin');
		}

		return admin.Id;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private normalizeItem(raw: any): SyncedMediaItem {
		const typeMap: Record<string, SyncedMediaItem['itemType']> = {
			Movie: 'movie',
			Episode: 'episode',
			Series: 'series'
		};

		const mediaSource = raw.MediaSources?.[0];
		const streams = mediaSource?.MediaStreams ?? [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const videoStream = streams.find((s: any) => s.Type === 'Video') ?? null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const audioStreams = streams.filter((s: any) => s.Type === 'Audio');
		const mainAudio = audioStreams[0] ?? null;

		const videoRangeType = videoStream?.VideoRangeType;
		const isHDR =
			videoRangeType !== undefined && videoRangeType !== null && videoRangeType !== 'SDR';

		const normalizedHdr = isHDR ? normalizeJellyfinHdr(videoRangeType) : null;

		return {
			serverItemId: raw.Id ?? '',
			tmdbId: this.parseIntOrNull(raw.ProviderIds?.Tmdb),
			tvdbId: this.parseIntOrNull(raw.ProviderIds?.Tvdb),
			imdbId: raw.ProviderIds?.Imdb ?? null,
			title: raw.Name ?? '',
			year: raw.ProductionYear ?? null,
			itemType: typeMap[raw.Type] ?? 'movie',
			seriesName: raw.SeriesName ?? null,
			seasonNumber: raw.ParentIndexNumber ?? null,
			episodeNumber: raw.IndexNumber ?? null,
			playCount: raw.UserData?.PlayCount ?? 0,
			lastPlayedDate: raw.UserData?.LastPlayedDate ?? null,
			playedPercentage: raw.UserData?.PlayedPercentage ?? null,
			isPlayed: raw.UserData?.Played ?? false,
			videoCodec: videoStream?.Codec ?? null,
			videoProfile: videoStream?.Profile ?? null,
			videoBitDepth: videoStream?.BitDepth ?? null,
			width: videoStream?.Width ?? null,
			height: videoStream?.Height ?? null,
			isHDR,
			hdrFormat: normalizedHdr,
			videoBitrate: videoStream?.BitRate ?? null,
			audioCodec: mainAudio?.Codec ?? null,
			audioChannels: mainAudio?.Channels ?? null,
			audioChannelLayout: mainAudio?.ChannelLayout ?? null,
			audioBitrate: mainAudio?.BitRate ?? null,
			audioLanguages: audioStreams
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((s: any) => s.Language)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((l: any): l is string => typeof l === 'string' && l.length > 0),
			subtitleLanguages: streams
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((s: any) => s.Type === 'Subtitle')
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((s: any) => s.Language)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((l: any): l is string => typeof l === 'string' && l.length > 0),
			containerFormat: mediaSource?.Container ?? null,
			fileSize: mediaSource?.Size ?? null,
			bitrate: mediaSource?.Bitrate ?? null,
			duration: raw.RunTimeTicks != null ? raw.RunTimeTicks / 10_000_000 : null
		};
	}

	private parseIntOrNull(value: string | undefined | null): number | null {
		if (value == null) return null;
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
}
