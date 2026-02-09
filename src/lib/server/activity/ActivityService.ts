import { db } from '$lib/server/db';
import {
	downloadQueue,
	downloadHistory,
	monitoringHistory,
	movies,
	series,
	episodes,
	activityDetails,
	movieFiles
} from '$lib/server/db/schema';
import { desc, inArray, eq } from 'drizzle-orm';
import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import { parseRelease } from '$lib/server/indexers/parser/ReleaseParser';
import type {
	UnifiedActivity,
	ActivityEvent,
	ActivityStatus,
	ActivityFilters,
	ActivitySortOptions,
	ActivityDetails
} from '$lib/types/activity';
import type { DownloadQueueRecord, DownloadHistoryRecord, MonitoringHistoryRecord } from './types';

interface MediaInfo {
	id: string;
	title: string;
	year: number | null;
}

interface SeriesInfo extends MediaInfo {
	seasonNumber?: number;
}

interface EpisodeInfo {
	id: string;
	seriesId: string;
	episodeNumber: number;
	seasonNumber: number;
}

interface MediaMaps {
	movies: Map<string, MediaInfo>;
	series: Map<string, SeriesInfo>;
	episodes: Map<string, EpisodeInfo>;
}

interface PaginationOptions {
	limit: number;
	offset: number;
}

interface ActivityQueryResult {
	activities: UnifiedActivity[];
	total: number;
	hasMore: boolean;
}

/**
 * Service for managing and querying activity data
 * Consolidates download queue, history, and monitoring history into unified activities
 */
export class ActivityService {
	private static instance: ActivityService;

	private constructor() {}

	static getInstance(): ActivityService {
		if (!ActivityService.instance) {
			ActivityService.instance = new ActivityService();
		}
		return ActivityService.instance;
	}

	/**
	 * Get unified activities with filtering and pagination
	 */
	async getActivities(
		filters: ActivityFilters = {},
		sort: ActivitySortOptions = { field: 'time', direction: 'desc' },
		pagination: PaginationOptions = { limit: 50, offset: 0 }
	): Promise<ActivityQueryResult> {
		// Fetch data from all three sources
		const [activeDownloads, historyItems, monitoringItems] = await Promise.all([
			this.fetchActiveDownloads(),
			this.fetchHistoryItems(),
			this.fetchMonitoringItems(filters.includeNoResults)
		]);

		// Batch fetch all media info
		const mediaMaps = await this.fetchMediaMaps(activeDownloads, historyItems, monitoringItems);

		// Fetch linked monitoring history for queue items
		const monitoringByQueueId = await this.fetchMonitoringForQueue(
			activeDownloads.map((d) => d.id)
		);

		// Transform all sources to activities
		const activities: UnifiedActivity[] = [
			...this.transformQueueItems(activeDownloads, mediaMaps, monitoringByQueueId),
			...this.transformHistoryItems(historyItems, mediaMaps, activeDownloads),
			...this.transformMonitoringItems(monitoringItems, mediaMaps)
		];

		// Sort by time
		this.sortActivities(activities, sort);

		// Apply filters
		const filtered = this.applyFilters(activities, filters);

		// Apply pagination
		const total = filtered.length;
		const paginated = filtered.slice(pagination.offset, pagination.offset + pagination.limit);

		return {
			activities: paginated,
			total,
			hasMore: pagination.offset + paginated.length < total
		};
	}

	/**
	 * Get activity details by activity ID
	 */
	async getActivityDetails(activityId: string): Promise<ActivityDetails | null> {
		const details = await db
			.select()
			.from(activityDetails)
			.where(eq(activityDetails.activityId, activityId))
			.get();

		if (!details) return null;

		// Fetch replaced file info if available
		let replacedFileInfo = null;
		if (details.replacedMovieFileId) {
			const file = await db
				.select()
				.from(movieFiles)
				.where(eq(movieFiles.id, details.replacedMovieFileId))
				.get();
			if (file) {
				replacedFileInfo = {
					id: file.id,
					path: file.relativePath,
					size: file.size,
					quality: file.quality,
					releaseGroup: file.releaseGroup
				};
			}
		}

		return {
			id: details.id,
			activityId: details.activityId,
			scoreBreakdown: details.scoreBreakdown ?? undefined,
			replacedFileInfo: replacedFileInfo ?? undefined,
			replacedFilePath: details.replacedFilePath ?? undefined,
			replacedFileQuality: details.replacedFileQuality ?? undefined,
			replacedFileScore: details.replacedFileScore ?? undefined,
			replacedFileSize: details.replacedFileSize ?? undefined,
			searchResults: details.searchResults ?? undefined,
			selectionReason: details.selectionReason ?? undefined,
			importLog: details.importLog ?? undefined,
			filesImported: details.filesImported ?? undefined,
			filesDeleted: details.filesDeleted ?? undefined,
			downloadClientName: details.downloadClientName ?? undefined,
			downloadClientType: details.downloadClientType ?? undefined,
			downloadId: details.downloadId ?? undefined,
			infoHash: details.infoHash ?? undefined,
			releaseInfo: details.releaseInfo ?? undefined,
			createdAt: details.createdAt ?? new Date().toISOString(),
			updatedAt: details.updatedAt ?? new Date().toISOString()
		};
	}

	/**
	 * Create activity details record
	 */
	async createActivityDetails(activityId: string, data: Partial<ActivityDetails>): Promise<void> {
		await db.insert(activityDetails).values({
			activityId,
			scoreBreakdown: data.scoreBreakdown,
			replacedMovieFileId: data.replacedFileInfo?.id,
			replacedFilePath: data.replacedFilePath,
			replacedFileQuality: data.replacedFileQuality,
			replacedFileScore: data.replacedFileScore,
			replacedFileSize: data.replacedFileSize,
			searchResults: data.searchResults,
			selectionReason: data.selectionReason,
			importLog: data.importLog,
			filesImported: data.filesImported,
			filesDeleted: data.filesDeleted,
			downloadClientName: data.downloadClientName,
			downloadClientType: data.downloadClientType,
			downloadId: data.downloadId,
			infoHash: data.infoHash,
			releaseInfo: data.releaseInfo
		});
	}

	/**
	 * Update activity details
	 */
	async updateActivityDetails(activityId: string, data: Partial<ActivityDetails>): Promise<void> {
		await db
			.update(activityDetails)
			.set({
				scoreBreakdown: data.scoreBreakdown,
				replacedMovieFileId: data.replacedFileInfo?.id,
				replacedFilePath: data.replacedFilePath,
				replacedFileQuality: data.replacedFileQuality,
				replacedFileScore: data.replacedFileScore,
				replacedFileSize: data.replacedFileSize,
				searchResults: data.searchResults,
				selectionReason: data.selectionReason,
				importLog: data.importLog,
				filesImported: data.filesImported,
				filesDeleted: data.filesDeleted,
				downloadClientName: data.downloadClientName,
				downloadClientType: data.downloadClientType,
				downloadId: data.downloadId,
				infoHash: data.infoHash,
				releaseInfo: data.releaseInfo,
				updatedAt: new Date().toISOString()
			})
			.where(eq(activityDetails.activityId, activityId));
	}

	/**
	 * Transform a single queue item to unified activity
	 */
	transformQueueItem(
		download: DownloadQueueRecord,
		mediaMaps: MediaMaps,
		linkedMonitoring: MonitoringHistoryRecord[] = []
	): UnifiedActivity {
		const timeline = this.buildQueueTimeline(download, linkedMonitoring);
		const mediaInfo = this.resolveMediaInfo(download, mediaMaps);
		const status = this.mapQueueStatus(download.status);

		return {
			id: `queue-${download.id}`,
			mediaType: mediaInfo.mediaType,
			mediaId: mediaInfo.mediaId,
			mediaTitle: mediaInfo.mediaTitle,
			mediaYear: mediaInfo.mediaYear,
			seriesId: mediaInfo.seriesId,
			seriesTitle: mediaInfo.seriesTitle,
			seasonNumber: mediaInfo.seasonNumber,
			episodeNumber: mediaInfo.episodeNumber,
			episodeIds: download.episodeIds ?? undefined,
			releaseTitle: download.title,
			quality: download.quality ?? null,
			releaseGroup: download.releaseGroup ?? extractReleaseGroup(download.title)?.group ?? null,
			size: download.size ?? null,
			indexerId: download.indexerId ?? null,
			indexerName: download.indexerName ?? null,
			protocol: (download.protocol as 'torrent' | 'usenet' | 'streaming') ?? null,
			downloadClientId: download.downloadClientId ?? null,
			status,
			statusReason: download.errorMessage ?? undefined,
			downloadProgress: Math.round((Number(download.progress) || 0) * 100),
			isUpgrade: download.isUpgrade ?? false,
			timeline,
			startedAt: download.addedAt || new Date().toISOString(),
			completedAt: download.completedAt ?? null,
			queueItemId: download.id
		};
	}

	/**
	 * Transform a single history item to unified activity
	 */
	transformHistoryItem(
		history: DownloadHistoryRecord,
		mediaMaps: MediaMaps,
		activeDownloads: DownloadQueueRecord[] = []
	): UnifiedActivity | null {
		// Skip if this release is still in the queue
		if (activeDownloads.some((d) => d.title === history.title)) {
			return null;
		}

		const timeline = this.buildHistoryTimeline(history);
		const mediaInfo = this.resolveMediaInfo(history, mediaMaps);

		return {
			id: `history-${history.id}`,
			mediaType: mediaInfo.mediaType,
			mediaId: mediaInfo.mediaId,
			mediaTitle: mediaInfo.mediaTitle,
			mediaYear: mediaInfo.mediaYear,
			seriesId: mediaInfo.seriesId,
			seriesTitle: mediaInfo.seriesTitle,
			seasonNumber: mediaInfo.seasonNumber,
			episodeNumber: mediaInfo.episodeNumber,
			episodeIds: history.episodeIds ?? undefined,
			releaseTitle: history.title,
			quality: history.quality ?? null,
			releaseGroup: history.releaseGroup ?? extractReleaseGroup(history.title)?.group ?? null,
			size: history.size ?? null,
			indexerId: history.indexerId ?? null,
			indexerName: history.indexerName ?? null,
			protocol: (history.protocol as 'torrent' | 'usenet' | 'streaming') ?? null,
			downloadClientId: history.downloadClientId ?? null,
			downloadClientName: history.downloadClientName ?? null,
			status: history.status as ActivityStatus,
			statusReason: history.statusReason ?? undefined,
			isUpgrade: false,
			timeline,
			startedAt: history.grabbedAt || history.createdAt || new Date().toISOString(),
			completedAt: history.importedAt || history.completedAt || null,
			downloadHistoryId: history.id,
			importedPath: history.importedPath ?? undefined
		};
	}

	/**
	 * Transform a single monitoring item to unified activity
	 */
	transformMonitoringItem(
		mon: MonitoringHistoryRecord,
		mediaMaps: MediaMaps,
		processedKeys?: Set<string>
	): UnifiedActivity | null {
		const executedAt = mon.executedAt;
		if (!executedAt) return null;

		// Deduplication key
		const mediaKey = mon.movieId
			? `movie-${mon.movieId}-${executedAt.slice(0, 10)}`
			: `episode-${mon.episodeId || mon.seriesId}-${executedAt.slice(0, 10)}`;

		if (processedKeys?.has(mediaKey)) return null;
		processedKeys?.add(mediaKey);

		const mediaInfo = this.resolveMonitoringMediaInfo(mon, mediaMaps);

		const timeline: ActivityEvent[] = [
			{
				type: 'searched',
				timestamp: executedAt,
				details: mon.errorMessage || (mon.status === 'no_results' ? 'No results found' : undefined)
			}
		];

		return {
			id: `monitoring-${mon.id}`,
			mediaType: mediaInfo.mediaType,
			mediaId: mediaInfo.mediaId,
			mediaTitle: mediaInfo.mediaTitle,
			mediaYear: mediaInfo.mediaYear,
			seriesId: mediaInfo.seriesId,
			seriesTitle: mediaInfo.seriesTitle,
			seasonNumber: mediaInfo.seasonNumber,
			episodeNumber: mediaInfo.episodeNumber,
			releaseTitle: null,
			quality: null,
			releaseGroup: null,
			size: null,
			indexerId: null,
			indexerName: null,
			protocol: null,
			status: mon.status === 'error' ? 'failed' : 'no_results',
			statusReason: mon.errorMessage ?? undefined,
			isUpgrade: mon.isUpgrade ?? false,
			oldScore: mon.oldScore ?? undefined,
			newScore: mon.newScore ?? undefined,
			timeline,
			startedAt: executedAt,
			completedAt: executedAt,
			monitoringHistoryId: mon.id
		};
	}

	// Private helper methods

	private async fetchActiveDownloads(): Promise<DownloadQueueRecord[]> {
		return db
			.select()
			.from(downloadQueue)
			.where(
				inArray(downloadQueue.status, [
					'downloading',
					'queued',
					'paused',
					'stalled',
					'seeding',
					'completed',
					'postprocessing',
					'importing'
				])
			)
			.orderBy(desc(downloadQueue.addedAt))
			.all();
	}

	private async fetchHistoryItems(): Promise<DownloadHistoryRecord[]> {
		return db
			.select()
			.from(downloadHistory)
			.orderBy(desc(downloadHistory.createdAt))
			.limit(200)
			.all();
	}

	private async fetchMonitoringItems(
		includeNoResults?: boolean
	): Promise<MonitoringHistoryRecord[]> {
		// Build status filter based on includeNoResults flag
		// By default (undefined/false), exclude 'no_results' to reduce noise
		const statuses = includeNoResults ? ['no_results', 'error', 'skipped'] : ['error', 'skipped'];

		const items = await db
			.select()
			.from(monitoringHistory)
			.where(inArray(monitoringHistory.status, statuses))
			.orderBy(desc(monitoringHistory.executedAt))
			.limit(100)
			.all();

		// Filter out subtitle search noise
		return items.filter(
			(item) => !(item.taskType === 'missingSubtitles' && item.status === 'no_results')
		);
	}

	private async fetchMediaMaps(
		activeDownloads: DownloadQueueRecord[],
		historyItems: DownloadHistoryRecord[],
		monitoringItems: MonitoringHistoryRecord[]
	): Promise<MediaMaps> {
		// Collect all IDs
		const movieIds = new Set<string>([
			...activeDownloads.filter((d) => d.movieId).map((d) => d.movieId!),
			...historyItems.filter((h) => h.movieId).map((h) => h.movieId!),
			...monitoringItems.filter((m) => m.movieId).map((m) => m.movieId!)
		]);

		const seriesIds = new Set<string>([
			...activeDownloads.filter((d) => d.seriesId).map((d) => d.seriesId!),
			...historyItems.filter((h) => h.seriesId).map((h) => h.seriesId!),
			...monitoringItems.filter((m) => m.seriesId).map((m) => m.seriesId!)
		]);

		const episodeIds = new Set<string>([
			...activeDownloads.filter((d) => d.episodeIds).flatMap((d) => d.episodeIds || []),
			...historyItems.filter((h) => h.episodeIds).flatMap((h) => h.episodeIds || []),
			...monitoringItems.filter((m) => m.episodeId).map((m) => m.episodeId!)
		]);

		// Fetch in parallel
		const [moviesData, seriesData, episodesData] = await Promise.all([
			movieIds.size > 0
				? db
						.select({ id: movies.id, title: movies.title, year: movies.year })
						.from(movies)
						.where(inArray(movies.id, Array.from(movieIds)))
						.all()
				: Promise.resolve([]),
			seriesIds.size > 0
				? db
						.select({ id: series.id, title: series.title, year: series.year })
						.from(series)
						.where(inArray(series.id, Array.from(seriesIds)))
						.all()
				: Promise.resolve([]),
			episodeIds.size > 0
				? db
						.select({
							id: episodes.id,
							seriesId: episodes.seriesId,
							episodeNumber: episodes.episodeNumber,
							seasonNumber: episodes.seasonNumber
						})
						.from(episodes)
						.where(inArray(episodes.id, Array.from(episodeIds)))
						.all()
				: Promise.resolve([])
		]);

		return {
			movies: new Map(moviesData.map((m) => [m.id, m])),
			series: new Map(seriesData.map((s) => [s.id, s])),
			episodes: new Map(
				episodesData.map((e) => [
					e.id,
					{
						id: e.id,
						seriesId: e.seriesId,
						episodeNumber: e.episodeNumber,
						seasonNumber: e.seasonNumber
					}
				])
			)
		};
	}

	private async fetchMonitoringForQueue(
		queueIds: string[]
	): Promise<Map<string, MonitoringHistoryRecord[]>> {
		if (queueIds.length === 0) return new Map();

		const linkedMonitoring = await db
			.select()
			.from(monitoringHistory)
			.where(inArray(monitoringHistory.queueItemId, queueIds))
			.all();

		const map = new Map<string, MonitoringHistoryRecord[]>();
		for (const m of linkedMonitoring) {
			if (m.queueItemId) {
				const existing = map.get(m.queueItemId) || [];
				existing.push(m);
				map.set(m.queueItemId, existing);
			}
		}
		return map;
	}

	private transformQueueItems(
		downloads: DownloadQueueRecord[],
		mediaMaps: MediaMaps,
		monitoringByQueueId: Map<string, MonitoringHistoryRecord[]>
	): UnifiedActivity[] {
		return downloads.map((download) =>
			this.transformQueueItem(download, mediaMaps, monitoringByQueueId.get(download.id) || [])
		);
	}

	private transformHistoryItems(
		historyItems: DownloadHistoryRecord[],
		mediaMaps: MediaMaps,
		activeDownloads: DownloadQueueRecord[]
	): UnifiedActivity[] {
		return historyItems
			.map((history) => this.transformHistoryItem(history, mediaMaps, activeDownloads))
			.filter((activity): activity is UnifiedActivity => activity !== null);
	}

	private transformMonitoringItems(
		monitoringItems: MonitoringHistoryRecord[],
		mediaMaps: MediaMaps
	): UnifiedActivity[] {
		const processedKeys = new Set<string>();
		return monitoringItems
			.map((mon) => this.transformMonitoringItem(mon, mediaMaps, processedKeys))
			.filter((activity): activity is UnifiedActivity => activity !== null);
	}

	private buildQueueTimeline(
		download: DownloadQueueRecord,
		linkedMonitoring: MonitoringHistoryRecord[]
	): ActivityEvent[] {
		const timeline: ActivityEvent[] = [];

		// Add monitoring events
		for (const m of linkedMonitoring) {
			if (m.status === 'grabbed' && m.executedAt) {
				timeline.push({
					type: 'grabbed',
					timestamp: m.executedAt,
					details: m.releaseGrabbed || undefined
				});
			}
			if (m.releasesFound && m.releasesFound > 0 && m.executedAt) {
				timeline.push({
					type: 'found',
					timestamp: m.executedAt,
					details: `${m.releasesFound} releases found`
				});
			}
		}

		// Add download events
		if (download.addedAt) {
			timeline.push({ type: 'grabbed', timestamp: download.addedAt });
		}
		if (download.startedAt) {
			timeline.push({ type: 'downloading', timestamp: download.startedAt });
		}

		// Sort by timestamp
		timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		return timeline;
	}

	private buildHistoryTimeline(history: DownloadHistoryRecord): ActivityEvent[] {
		const timeline: ActivityEvent[] = [];

		if (history.grabbedAt) {
			timeline.push({ type: 'grabbed', timestamp: history.grabbedAt });
		}
		if (history.completedAt) {
			timeline.push({ type: 'completed', timestamp: history.completedAt });
		}
		if (history.importedAt && history.status === 'imported') {
			timeline.push({ type: 'imported', timestamp: history.importedAt });
		}
		if (history.status === 'failed' && history.createdAt) {
			timeline.push({
				type: 'failed',
				timestamp: history.createdAt,
				details: history.statusReason ?? undefined
			});
		}
		if (history.status === 'rejected' && history.createdAt) {
			timeline.push({
				type: 'rejected',
				timestamp: history.createdAt,
				details: history.statusReason ?? undefined
			});
		}

		timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		return timeline;
	}

	private resolveMediaInfo(
		item: DownloadQueueRecord | DownloadHistoryRecord,
		mediaMaps: MediaMaps
	): {
		mediaType: 'movie' | 'episode';
		mediaId: string;
		mediaTitle: string;
		mediaYear: number | null;
		seriesId?: string;
		seriesTitle?: string;
		seasonNumber?: number;
		episodeNumber?: number;
	} {
		if (item.movieId && mediaMaps.movies.has(item.movieId)) {
			const movie = mediaMaps.movies.get(item.movieId)!;
			return {
				mediaType: 'movie',
				mediaId: movie.id,
				mediaTitle: movie.title,
				mediaYear: movie.year
			};
		}

		if (item.seriesId && mediaMaps.series.has(item.seriesId)) {
			const s = mediaMaps.series.get(item.seriesId)!;
			const seasonNumber = item.seasonNumber ?? undefined;

			if (item.episodeIds && item.episodeIds.length > 0) {
				const firstEp = mediaMaps.episodes.get(item.episodeIds[0]);
				if (firstEp) {
					const episodeNumber = firstEp.episodeNumber;
					const mediaTitle =
						item.episodeIds.length > 1
							? `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}-E${String(mediaMaps.episodes.get(item.episodeIds[item.episodeIds.length - 1])?.episodeNumber).padStart(2, '0')}`
							: `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;

					return {
						mediaType: 'episode',
						mediaId: firstEp.id,
						mediaTitle,
						mediaYear: s.year,
						seriesId: item.seriesId,
						seriesTitle: s.title,
						seasonNumber,
						episodeNumber
					};
				}
			}

			return {
				mediaType: 'episode',
				mediaId: s.id,
				mediaTitle: item.seasonNumber ? `${s.title} Season ${item.seasonNumber}` : s.title,
				mediaYear: s.year,
				seriesId: item.seriesId,
				seriesTitle: s.title,
				seasonNumber
			};
		}

		return {
			...this.deriveFallbackMediaInfo(
				item.title,
				Boolean(item.seriesId || (item.episodeIds?.length ?? 0) > 0 || item.seasonNumber)
			),
			mediaId: ''
		};
	}

	private resolveMonitoringMediaInfo(
		mon: MonitoringHistoryRecord,
		mediaMaps: MediaMaps
	): {
		mediaType: 'movie' | 'episode';
		mediaId: string;
		mediaTitle: string;
		mediaYear: number | null;
		seriesId?: string;
		seriesTitle?: string;
		seasonNumber?: number;
		episodeNumber?: number;
	} {
		if (mon.movieId && mediaMaps.movies.has(mon.movieId)) {
			const movie = mediaMaps.movies.get(mon.movieId)!;
			return {
				mediaType: 'movie',
				mediaId: movie.id,
				mediaTitle: movie.title,
				mediaYear: movie.year
			};
		}

		if (mon.seriesId && mediaMaps.series.has(mon.seriesId)) {
			const s = mediaMaps.series.get(mon.seriesId)!;
			const seasonNumber = mon.seasonNumber ?? undefined;

			if (mon.episodeId && mediaMaps.episodes.has(mon.episodeId)) {
				const ep = mediaMaps.episodes.get(mon.episodeId)!;
				return {
					mediaType: 'episode',
					mediaId: ep.id,
					mediaTitle: `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
					mediaYear: s.year,
					seriesId: mon.seriesId,
					seriesTitle: s.title,
					seasonNumber,
					episodeNumber: ep.episodeNumber
				};
			}

			return {
				mediaType: 'episode',
				mediaId: s.id,
				mediaTitle: mon.seasonNumber ? `${s.title} Season ${mon.seasonNumber}` : s.title,
				mediaYear: s.year,
				seriesId: mon.seriesId,
				seriesTitle: s.title,
				seasonNumber
			};
		}

		return {
			...this.deriveFallbackMediaInfo(mon.releaseGrabbed, Boolean(mon.seriesId || mon.episodeId)),
			mediaId: ''
		};
	}

	private deriveFallbackMediaInfo(
		releaseTitle: string | null | undefined,
		isEpisode: boolean
	): {
		mediaType: 'movie' | 'episode';
		mediaId: string;
		mediaTitle: string;
		mediaYear: number | null;
		seasonNumber?: number;
		episodeNumber?: number;
	} {
		if (!releaseTitle) {
			return {
				mediaType: isEpisode ? 'episode' : 'movie',
				mediaId: '',
				mediaTitle: 'Unknown',
				mediaYear: null
			};
		}

		const parsed = parseRelease(releaseTitle);
		const fallbackTitle = releaseTitle.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
		const baseTitle = parsed.cleanTitle?.trim() || fallbackTitle || 'Unknown';

		if (!isEpisode) {
			return {
				mediaType: 'movie',
				mediaId: '',
				mediaTitle: baseTitle,
				mediaYear: parsed.year ?? null
			};
		}

		const seasonNumber = parsed.episode?.season;
		const episodeNumbers = parsed.episode?.episodes;
		const firstEpisode = episodeNumbers?.[0];
		const lastEpisode =
			episodeNumbers && episodeNumbers.length > 0
				? episodeNumbers[episodeNumbers.length - 1]
				: undefined;

		let mediaTitle = baseTitle;
		if (seasonNumber && firstEpisode) {
			const season = String(seasonNumber).padStart(2, '0');
			const startEpisode = String(firstEpisode).padStart(2, '0');
			if (lastEpisode && lastEpisode !== firstEpisode) {
				const endEpisode = String(lastEpisode).padStart(2, '0');
				mediaTitle = `${baseTitle} S${season}E${startEpisode}-E${endEpisode}`;
			} else {
				mediaTitle = `${baseTitle} S${season}E${startEpisode}`;
			}
		} else if (seasonNumber && parsed.episode?.isSeasonPack) {
			mediaTitle = `${baseTitle} Season ${seasonNumber}`;
		}

		return {
			mediaType: 'episode',
			mediaId: '',
			mediaTitle,
			mediaYear: parsed.year ?? null,
			seasonNumber: seasonNumber ?? undefined,
			episodeNumber: firstEpisode ?? undefined
		};
	}

	private mapQueueStatus(status: string): ActivityStatus {
		switch (status) {
			case 'failed':
				return 'failed';
			case 'imported':
				return 'imported';
			case 'removed':
				return 'removed';
			default:
				return 'downloading';
		}
	}

	private sortActivities(activities: UnifiedActivity[], sort: ActivitySortOptions): void {
		activities.sort((a, b) => {
			let comparison = 0;

			switch (sort.field) {
				case 'time':
					comparison = new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
					break;
				case 'media':
					comparison = a.mediaTitle.localeCompare(b.mediaTitle);
					break;
				case 'size':
					comparison = (b.size || 0) - (a.size || 0);
					break;
				case 'status':
					comparison = a.status.localeCompare(b.status);
					break;
			}

			return sort.direction === 'asc' ? -comparison : comparison;
		});
	}

	private applyFilters(activities: UnifiedActivity[], filters: ActivityFilters): UnifiedActivity[] {
		let filtered = activities;

		// Status filter
		if (filters.status && filters.status !== 'all') {
			if (filters.status === 'success') {
				filtered = filtered.filter((a) => a.status === 'imported' || a.status === 'streaming');
			} else {
				filtered = filtered.filter((a) => a.status === filters.status);
			}
		}

		// Media type filter
		if (filters.mediaType === 'movie') {
			filtered = filtered.filter((a) => a.mediaType === 'movie');
		} else if (filters.mediaType === 'tv') {
			filtered = filtered.filter((a) => a.mediaType === 'episode');
		}

		// Search filter
		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			filtered = filtered.filter(
				(a) =>
					a.mediaTitle.toLowerCase().includes(searchLower) ||
					a.releaseTitle?.toLowerCase().includes(searchLower) ||
					a.seriesTitle?.toLowerCase().includes(searchLower) ||
					a.releaseGroup?.toLowerCase().includes(searchLower) ||
					a.indexerName?.toLowerCase().includes(searchLower)
			);
		}

		// Protocol filter
		if (filters.protocol && filters.protocol !== 'all') {
			filtered = filtered.filter((a) => a.protocol === filters.protocol);
		}

		// Indexer filter
		if (filters.indexer) {
			filtered = filtered.filter(
				(a) => a.indexerName?.toLowerCase() === filters.indexer?.toLowerCase()
			);
		}

		// Release group filter
		if (filters.releaseGroup) {
			filtered = filtered.filter((a) =>
				a.releaseGroup?.toLowerCase().includes(filters.releaseGroup!.toLowerCase())
			);
		}

		// Resolution filter
		if (filters.resolution) {
			filtered = filtered.filter(
				(a) => a.quality?.resolution?.toLowerCase() === filters.resolution?.toLowerCase()
			);
		}

		// Download client filter
		if (filters.downloadClientId) {
			filtered = filtered.filter((a) => a.downloadClientId === filters.downloadClientId);
		}

		// Is upgrade filter
		if (filters.isUpgrade !== undefined) {
			filtered = filtered.filter((a) => a.isUpgrade === filters.isUpgrade);
		}

		// Date filters
		if (filters.startDate) {
			const startTime = new Date(filters.startDate).getTime();
			filtered = filtered.filter((a) => new Date(a.startedAt).getTime() >= startTime);
		}
		if (filters.endDate) {
			const endTime = new Date(filters.endDate).getTime();
			filtered = filtered.filter((a) => new Date(a.startedAt).getTime() <= endTime);
		}

		return filtered;
	}
}

// Export singleton instance
export const activityService = ActivityService.getInstance();
