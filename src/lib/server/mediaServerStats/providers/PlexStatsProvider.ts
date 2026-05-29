import type {
	MediaServerStatsProvider,
	MediaServerStatsProviderConfig,
	SyncedMediaItem,
	SyncResult
} from '../types.js';
import { buildPlexHdrLabel } from '../hdr-normalize.js';

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export class PlexStatsProvider implements MediaServerStatsProvider {
	constructor(private config: MediaServerStatsProviderConfig) {}

	async fetchAllItems(): Promise<SyncResult> {
		const sections = await this.getLibrarySections();
		const items: SyncedMediaItem[] = [];

		for (const section of sections) {
			if (section.type === 'movie') {
				const movies = await this.fetchLibraryItems(section.key, 1);
				for (const raw of movies) {
					items.push(this.normalizeItem(raw, 'movie'));
				}
			} else if (section.type === 'show') {
				const episodes = await this.fetchLibraryItems(section.key, 4);
				for (const raw of episodes) {
					items.push(this.normalizeItem(raw, 'episode'));
				}
			}
		}

		return {
			items,
			serverItemIds: new Set(items.map((item) => item.serverItemId)),
			totalOnServer: items.length
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async request(path: string): Promise<any> {
		const url = `${this.config.host}${path}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				headers: {
					'X-Plex-Token': this.config.apiKey,
					Accept: 'application/json'
				},
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Plex API error: ${response.status} ${response.statusText}`);
			}

			return response.json();
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async getLibrarySections(): Promise<Array<{ key: string; type: string; title: string }>> {
		const data = await this.request('/library/sections');
		const directories = this.asArray(data?.MediaContainer?.Directory);
		return (
			directories
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((d: any) => d.key && d.type)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((d: any) => ({
					key: String(d.key),
					type: String(d.type),
					title: String(d.title ?? '')
				}))
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async fetchLibraryItems(sectionKey: string, itemType: number): Promise<any[]> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const allItems: any[] = [];
		let start = 0;

		while (true) {
			const data = await this.request(
				`/library/sections/${sectionKey}/all?type=${itemType}&includeGuids=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE_SIZE}`
			);

			const metadata = this.asArray(data?.MediaContainer?.Metadata);
			const totalSize = Number(data?.MediaContainer?.totalSize ?? 0);

			allItems.push(...metadata);

			start += metadata.length;
			if (metadata.length === 0 || start >= totalSize) {
				break;
			}
		}

		return allItems;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private normalizeItem(raw: any, libraryType: 'movie' | 'episode'): SyncedMediaItem {
		const guids = this.parseGuids(raw);
		const media = this.asArray(raw?.Media)[0];
		const part = this.asArray(media?.Part)[0];
		const streams = this.asArray(part?.Stream);
		const hdrInfo = this.detectHDR(streams);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const videoStream = streams.find((s: any) => s.streamType === 1);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const audioStreams = streams.filter((s: any) => s.streamType === 2);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const subtitleStreams = streams.filter((s: any) => s.streamType === 3);

		const primaryAudio = audioStreams[0];

		const _resolution = this.mapResolution(media?.videoResolution, media?.width, media?.height);

		const duration = raw?.duration ? Math.round(Number(raw.duration) / 1000) : null;
		const lastViewedAt = raw?.lastViewedAt
			? new Date(Number(raw.lastViewedAt) * 1000).toISOString()
			: null;
		const playCount = raw?.viewCount != null ? Number(raw.viewCount) : 0;

		return {
			serverItemId: String(raw?.ratingKey ?? ''),
			tmdbId: guids.tmdbId,
			tvdbId: guids.tvdbId,
			imdbId: guids.imdbId,
			title: raw?.title ?? '',
			year: raw?.year != null ? Number(raw.year) : null,
			itemType: libraryType,
			seriesName: raw?.grandparentTitle ?? null,
			seasonNumber: raw?.parentIndex != null ? Number(raw.parentIndex) : null,
			episodeNumber: raw?.index != null ? Number(raw.index) : null,
			playCount,
			lastPlayedDate: lastViewedAt,
			playedPercentage: null,
			isPlayed: playCount > 0,
			videoCodec: videoStream?.codec ?? media?.videoCodec ?? null,
			videoProfile: videoStream?.profile ?? null,
			videoBitDepth: videoStream?.bitDepth != null ? Number(videoStream.bitDepth) : null,
			width: media?.width != null ? Number(media.width) : null,
			height: media?.height != null ? Number(media.height) : null,
			isHDR: hdrInfo.isHDR,
			hdrFormat: hdrInfo.hdrFormat,
			videoBitrate: null,
			audioCodec: primaryAudio?.codec ?? media?.audioCodec ?? null,
			audioChannels:
				primaryAudio?.channels != null
					? Number(primaryAudio.channels)
					: media?.audioChannels != null
						? Number(media.audioChannels)
						: null,
			audioChannelLayout: primaryAudio?.audioChannelLayout ?? null,
			audioBitrate: null,
			audioLanguages: audioStreams
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((s: any) => s.languageCode)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((l: any): l is string => typeof l === 'string'),
			subtitleLanguages: subtitleStreams
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((s: any) => s.languageCode)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.filter((l: any): l is string => typeof l === 'string'),
			containerFormat: media?.container ?? null,
			fileSize: part?.size != null ? Number(part.size) : null,
			bitrate: media?.bitrate != null ? Number(media.bitrate) : null,
			duration
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private parseGuids(metadata: any): {
		tmdbId: number | null;
		tvdbId: number | null;
		imdbId: string | null;
	} {
		const result = {
			tmdbId: null as number | null,
			tvdbId: null as number | null,
			imdbId: null as string | null
		};

		const guidArray = this.asArray(metadata?.Guid);

		for (const guid of guidArray) {
			const id = guid?.id;
			if (typeof id !== 'string') continue;

			if (id.startsWith('tmdb://')) {
				const parsed = parseInt(id.slice(7), 10);
				if (!isNaN(parsed)) result.tmdbId = parsed;
			} else if (id.startsWith('tvdb://')) {
				const parsed = parseInt(id.slice(7), 10);
				if (!isNaN(parsed)) result.tvdbId = parsed;
			} else if (id.startsWith('imdb://')) {
				result.imdbId = id.slice(7);
			}
		}

		if (result.tmdbId !== null || result.tvdbId !== null || result.imdbId !== null) {
			return result;
		}

		const guidString = metadata?.guid;
		if (typeof guidString === 'string') {
			const match = guidString.match(/(?:themoviedb|thetvdb|imdb):\/\/([^?]+)/);
			if (match) {
				const id = match[1];
				if (guidString.includes('themoviedb')) {
					const parsed = parseInt(id, 10);
					if (!isNaN(parsed)) result.tmdbId = parsed;
				} else if (guidString.includes('thetvdb')) {
					const parsed = parseInt(id, 10);
					if (!isNaN(parsed)) result.tvdbId = parsed;
				} else if (guidString.includes('imdb')) {
					result.imdbId = id;
				}
			}
		}

		return result;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private detectHDR(streams: any[]): { isHDR: boolean; hdrFormat: string | null } {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const videoStream = streams.find((s: any) => s.streamType === 1);
		if (!videoStream) return { isHDR: false, hdrFormat: null };

		const doViPresent =
			videoStream.DOVIPresent === true ||
			videoStream.DOVIPresent === 1 ||
			videoStream.DOVIPresent === '1';
		const doViProfile =
			videoStream.DOVIBLCompatID != null ? Number(videoStream.DOVIBLCompatID) : null;
		const colorTrc = String(videoStream.colorTrc ?? '');

		const label = buildPlexHdrLabel({ doViPresent, doViProfile, colorTrc });

		if (label) {
			return { isHDR: true, hdrFormat: label };
		}

		const allValues = Object.values(videoStream).map((v) => String(v ?? '').toLowerCase());
		const hasHDRKeyword = allValues.some(
			(v) => v.includes('hdr') || v.includes('dolbyvision') || v.includes('dolby vision')
		);

		if (hasHDRKeyword) {
			const hasDV = allValues.some((v) => v.includes('dolbyvision') || v.includes('dolby vision'));
			return { isHDR: true, hdrFormat: hasDV ? 'DV' : 'HDR10' };
		}

		return { isHDR: false, hdrFormat: null };
	}

	private mapResolution(
		label: string | null | undefined,
		width: number | null | undefined,
		height: number | null | undefined
	): string {
		if (label === '4k' || (width != null && Number(width) >= 3840)) return '4K';
		if (label === '1080' || (height != null && Number(height) >= 1080)) return '1080p';
		if (label === '720' || (height != null && Number(height) >= 720)) return '720p';
		if (label === '480' || (height != null && Number(height) >= 480)) return '480p';
		return 'SD';
	}

	private asArray<T>(value: T | T[] | undefined | null): T[] {
		if (!value) return [];
		return Array.isArray(value) ? value : [value];
	}
}
