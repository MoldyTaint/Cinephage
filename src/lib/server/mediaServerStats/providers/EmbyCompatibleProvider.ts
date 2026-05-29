import type {
	MediaServerStatsProvider,
	MediaServerStatsProviderConfig,
	SyncedMediaItem,
	SyncResult
} from '../types.js';

const PAGE_SIZE = 1000;
const TIMEOUT_MS = 30_000;
const ITEM_TYPES = 'Movie,Episode,Series';
const ITEM_FIELDS = 'MediaSources,MediaStreams,Path,Overview,ProviderIds';

const TYPE_MAP: Record<string, SyncedMediaItem['itemType']> = {
	Movie: 'movie',
	Episode: 'episode',
	Series: 'series'
};

export abstract class EmbyCompatibleProvider implements MediaServerStatsProvider {
	protected constructor(protected config: MediaServerStatsProviderConfig) {}

	abstract get serverName(): string;
	abstract buildUrl(path: string): string;
	abstract getAuthHeaders(): Record<string, string>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected abstract resolveHDR(videoStream: any | null): {
		isHDR: boolean;
		hdrFormat: string | null;
	};

	async fetchAllItems(): Promise<SyncResult> {
		const userId = await this.getAdminUserId();
		const items: SyncedMediaItem[] = [];
		let totalRecordCount = 0;
		let offset = 0;

		do {
			const data = await this.request(
				`/Users/${userId}/Items?Recursive=true&IncludeItemTypes=${ITEM_TYPES}` +
					`&Fields=${ITEM_FIELDS}&EnableUserData=true&Limit=${PAGE_SIZE}&StartIndex=${offset}`
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rawItems: any[] = data.Items ?? [];
			totalRecordCount = data.TotalRecordCount ?? 0;

			for (const raw of rawItems) {
				const normalized = this.normalizeItem(raw);
				if (normalized) {
					items.push(normalized);
				}
			}

			offset += PAGE_SIZE;
		} while (offset < totalRecordCount);

		const serverItemIds = new Set<string>(items.map((item) => item.serverItemId));

		return {
			items,
			serverItemIds,
			totalOnServer: totalRecordCount
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected async request(path: string): Promise<any> {
		const url = this.buildUrl(path);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				headers: {
					...this.getAuthHeaders(),
					Accept: 'application/json'
				},
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`${this.serverName} API error: ${response.status} ${response.statusText}`);
			}

			return response.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	protected async getAdminUserId(): Promise<string> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const users: any[] = await this.request('/Users');
		const admin = users.find((u) => u.Policy?.IsAdministrator === true);
		if (!admin?.Id) {
			throw new Error(`No administrator user found on ${this.serverName} server`);
		}
		return admin.Id;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected normalizeItem(raw: any): SyncedMediaItem | null {
		if (!raw.Id || !raw.Name) {
			return null;
		}

		const itemType = TYPE_MAP[raw.Type];
		if (!itemType) {
			return null;
		}

		const providerIds = raw.ProviderIds ?? {};
		const mediaSource = raw.MediaSources?.[0];
		const videoStream = this.getVideoStream(mediaSource);
		const audioStreams = this.getAudioStreams(mediaSource);
		const subtitleStreams = this.getSubtitleStreams(mediaSource);

		const { isHDR, hdrFormat } = this.resolveHDR(videoStream);

		return {
			serverItemId: String(raw.Id),
			tmdbId: this.parseIntOrNull(providerIds.Tmdb),
			tvdbId: this.parseIntOrNull(providerIds.Tvdb),
			imdbId: providerIds.Imdb ?? null,
			title: raw.Name,
			year: raw.ProductionYear ?? null,
			itemType,
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
			hdrFormat,
			videoBitrate: videoStream?.BitRate ?? null,
			audioCodec: audioStreams[0]?.Codec ?? null,
			audioChannels: audioStreams[0]?.Channels ?? null,
			audioChannelLayout: audioStreams[0]?.ChannelLayout ?? null,
			audioBitrate: audioStreams[0]?.BitRate ?? null,
			audioLanguages: audioStreams
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((s: any) => s.Language)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((l: any): l is string => typeof l === 'string' && l.length > 0),
			subtitleLanguages: subtitleStreams
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((s: any) => s.Language)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((l: any): l is string => typeof l === 'string' && l.length > 0),
			containerFormat: mediaSource?.Container ?? null,
			fileSize: mediaSource?.Size ?? null,
			bitrate: mediaSource?.Bitrate ?? null,
			duration: raw.RunTimeTicks ? raw.RunTimeTicks / 10_000_000 : null
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected getVideoStream(mediaSource: any): any | null {
		const streams = mediaSource?.MediaStreams;
		if (!Array.isArray(streams)) return null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return streams.find((s: any) => s.Type === 'Video') ?? null;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected getAudioStreams(mediaSource: any): any[] {
		const streams = mediaSource?.MediaStreams;
		if (!Array.isArray(streams)) return [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return streams.filter((s: any) => s.Type === 'Audio');
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected getSubtitleStreams(mediaSource: any): any[] {
		const streams = mediaSource?.MediaStreams;
		if (!Array.isArray(streams)) return [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return streams.filter((s: any) => s.Type === 'Subtitle');
	}

	protected parseIntOrNull(value: string | undefined): number | null {
		if (!value) return null;
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
}
