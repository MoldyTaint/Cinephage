import { db } from '$lib/server/db';
import {
	downloadQueue,
	downloadHistory,
	monitoringHistory,
	taskHistory,
	movies,
	series,
	episodes,
	settings
} from '$lib/server/db/schema';
import { and, desc, gte, inArray, eq, lte, lt, sql, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import { parseRelease } from '$lib/server/indexers/parser/ReleaseParser';
import {
	isActiveActivity,
	type UnifiedActivity,
	type ActivityEvent,
	type ActivityStatus,
	type ActivityFilters,
	type ActivitySortOptions,
	type ActivityScope,
	type ActivitySummary
} from '$lib/types/activity';
import type { DownloadQueueRecord, DownloadHistoryRecord, MonitoringHistoryRecord } from './types';
import { projectQueueActivity } from './projectors';
import { parseMoveTaskId } from '$lib/server/library/MediaMoveService.js';

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

interface MoveTaskRecord {
	id: string;
	taskId: string;
	status: 'running' | 'completed' | 'failed' | 'cancelled';
	results: Record<string, unknown> | null;
	errors: string[] | null;
	startedAt: string | null;
	completedAt: string | null;
}

interface ActiveQueueIndex {
	byDownloadId: Map<string, DownloadQueueRecord>;
	byNormalizedTitle: Map<string, DownloadQueueRecord>;
	byMovieId: Set<string>;
	bySeriesId: Set<string>;
	byAddedAt: Map<string, DownloadQueueRecord[]>;
	titleEntries: { key: string; item: DownloadQueueRecord }[];
	hasAnyWithoutMediaLink: boolean;
	items: DownloadQueueRecord[];
}

interface ActivityQueryResult {
	activities: UnifiedActivity[];
	total: number;
	hasMore: boolean;
	summary: ActivitySummary | null;
}

const ACTIVITY_RETENTION_SETTINGS_KEY = 'activity_history_retention_days';
export const DEFAULT_ACTIVITY_RETENTION_DAYS = 90;
export const MAX_ACTIVITY_RETENTION_DAYS = 90;
const MIN_ACTIVITY_RETENTION_DAYS = 1;

interface DeleteHistoryResult {
	deletedDownloadHistory: number;
	deletedMonitoringHistory: number;
	deletedTaskHistory: number;
	skippedQueue: number;
	skippedUnknown: number;
	skippedRetryableFailed: number;
	skippedRunningTasks: number;
}

interface PurgeHistoryResult {
	deletedDownloadHistory: number;
	deletedMonitoringHistory: number;
	deletedTaskHistory: number;
	totalDeleted: number;
	cutoff?: string;
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
	 * Get unified activities with filtering and pagination.
	 *
	 * Filters are pushed down to SQL WHERE clauses where possible so the
	 * database does the heavy lifting rather than fetching everything into
	 * memory and filtering afterwards.
	 */
	async getActivities(
		filters: ActivityFilters = {},
		sort: ActivitySortOptions = { field: 'time', direction: 'desc' },
		pagination: PaginationOptions = { limit: 50, offset: 0 },
		scope: ActivityScope = 'all'
	): Promise<ActivityQueryResult> {
		const needsActive = scope === 'all' || scope === 'active';
		const needsHistory = scope === 'all' || scope === 'history';
		const summaryFilters = this.withoutStatusFilter(filters);

		// Check if any JS-only filters are active (search, resolution,
		// releaseGroup, isUpgrade).  When they are, we cannot compute an
		// accurate total via SQL COUNT alone and must rely on the
		// post-transform filtered length instead.
		const hasJsOnlyFilters =
			!!filters.search ||
			!!filters.resolution ||
			!!filters.releaseGroup ||
			filters.isUpgrade !== undefined;

		// Fetch data + SQL-level counts in parallel.
		// The counts use the same WHERE clauses as the data queries but skip
		// the LIMIT cap, giving an accurate total even when the result set is
		// larger than the fetch limit.
		const [
			activeDownloads,
			historyItems,
			monitoringItems,
			moveTasks,
			failedQueueItems,
			historyCount,
			monitoringCount,
			moveTaskCount
		] = await Promise.all([
			needsActive
				? this.fetchActiveDownloads(summaryFilters)
				: Promise.resolve([] as DownloadQueueRecord[]),
			needsHistory
				? this.fetchHistoryItems(filters)
				: Promise.resolve([] as DownloadHistoryRecord[]),
			needsHistory
				? this.fetchMonitoringItems(filters.includeNoResults, filters)
				: Promise.resolve([] as MonitoringHistoryRecord[]),
			needsActive || needsHistory
				? this.fetchMoveTasks(scope, filters)
				: Promise.resolve([] as MoveTaskRecord[]),
			needsActive
				? this.fetchFailedQueueItems()
				: Promise.resolve(
						[] as Pick<DownloadQueueRecord, 'id' | 'downloadId' | 'title' | 'addedAt' | 'status'>[]
					),
			needsHistory && !hasJsOnlyFilters ? this.countHistoryItems(filters) : Promise.resolve(0),
			needsHistory && !hasJsOnlyFilters
				? this.countMonitoringItems(filters.includeNoResults, filters)
				: Promise.resolve(0),
			(needsActive || needsHistory) && !hasJsOnlyFilters
				? this.countMoveTasks(scope, filters)
				: Promise.resolve(0)
		]);

		// Batch fetch all media info
		const mediaMaps = await this.fetchMediaMaps(activeDownloads, historyItems, monitoringItems);

		// Fetch linked monitoring history for queue items
		const monitoringByQueueId = needsActive
			? await this.fetchMonitoringForQueue(activeDownloads.map((d) => d.id))
			: new Map<string, MonitoringHistoryRecord[]>();

		const failedQueueIndex = this.buildFailedQueueIndex(failedQueueItems);

		const queueActivities = this.transformQueueItems(
			activeDownloads,
			mediaMaps,
			monitoringByQueueId
		);
		const historyActivities = this.transformHistoryItems(
			historyItems,
			mediaMaps,
			activeDownloads,
			failedQueueIndex
		);
		const monitoringActivities = this.transformMonitoringItems(monitoringItems, mediaMaps);
		const moveActivities = this.transformMoveTasks(moveTasks);
		const activities: UnifiedActivity[] = [
			...queueActivities,
			...historyActivities,
			...monitoringActivities,
			...moveActivities
		];

		let filtered = this.applyRequestedStatusFilter(
			this.applyFilters(activities, filters, scope),
			filters
		);
		if (scope === 'active') {
			filtered = this.dedupeActiveActivities(filtered);
		}
		this.sortActivities(filtered, sort);

		let activeFilteredCount = 0;
		let summary: ActivitySummary | null = null;
		if (needsActive) {
			let activeUniverse = this.applyFilters(activities, summaryFilters, 'active');
			activeUniverse = this.dedupeActiveActivities(activeUniverse);
			activeFilteredCount = this.applyRequestedStatusFilter(activeUniverse, filters).length;

			if (scope === 'active') {
				summary = this.buildActivitySummary(activeUniverse);
			}
		}

		const total =
			scope === 'active'
				? activeFilteredCount
				: scope === 'history'
					? hasJsOnlyFilters
						? filtered.length
						: historyCount + monitoringCount + moveTaskCount
					: hasJsOnlyFilters
						? filtered.length
						: activeFilteredCount + historyCount + monitoringCount + moveTaskCount;

		const paginated = filtered.slice(pagination.offset, pagination.offset + pagination.limit);

		return {
			activities: paginated,
			total,
			hasMore: pagination.offset + paginated.length < total,
			summary
		};
	}

	/**
	 * Get active-tab card stats using lightweight COUNT/SUM queries.
	 *
	 * Previous implementation ran the full 8-query pipeline (fetch all sources,
	 * transform, filter, dedupe) just to return 7 numbers. This replaces it with
	 * two simple SQL queries against the download_queue table.
	 */
	/**
	 * Lightweight check: how many active queue items exist?
	 * Used by the page load to decide which tab to show without running the full pipeline.
	 */
	async getActiveCount(): Promise<number> {
		const result = await db
			.select({ count: count() })
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
					'importing',
					'failed'
				])
			)
			.get();
		return result?.count ?? 0;
	}

	async getRetentionDays(): Promise<number> {
		const row = await db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, ACTIVITY_RETENTION_SETTINGS_KEY))
			.get();
		return this.parseRetentionDays(row?.value);
	}

	async setRetentionDays(days: number): Promise<number> {
		const normalized = this.parseRetentionDays(days);
		await db
			.insert(settings)
			.values({
				key: ACTIVITY_RETENTION_SETTINGS_KEY,
				value: String(normalized)
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: String(normalized) }
			});
		return normalized;
	}

	async deleteHistoryActivities(activityIds: string[]): Promise<DeleteHistoryResult> {
		const historyIds = new Set<string>();
		const monitoringIds = new Set<string>();
		const taskIds = new Set<string>();
		let skippedQueue = 0;
		let skippedUnknown = 0;

		for (const rawId of activityIds) {
			const id = rawId.trim();
			if (!id) {
				continue;
			}

			if (id.startsWith('history-')) {
				const historyId = id.slice('history-'.length).trim();
				if (historyId) {
					historyIds.add(historyId);
				}
				continue;
			}

			if (id.startsWith('monitoring-')) {
				const monitoringId = id.slice('monitoring-'.length).trim();
				if (monitoringId) {
					monitoringIds.add(monitoringId);
				}
				continue;
			}

			if (id.startsWith('queue-')) {
				skippedQueue += 1;
				continue;
			}

			if (id.startsWith('task-')) {
				const taskId = id.slice('task-'.length).trim();
				if (taskId) {
					taskIds.add(taskId);
				}
				continue;
			}

			skippedUnknown += 1;
		}

		const historyIdList = Array.from(historyIds);
		const monitoringIdList = Array.from(monitoringIds);
		const taskIdList = Array.from(taskIds);
		let eligibleHistoryIdList = historyIdList;
		let eligibleTaskIdList = taskIdList;
		let skippedRetryableFailed = 0;
		let skippedRunningTasks = 0;

		if (historyIdList.length > 0) {
			const requestedHistoryRows = await db
				.select({
					id: downloadHistory.id,
					status: downloadHistory.status,
					downloadId: downloadHistory.downloadId,
					title: downloadHistory.title,
					grabbedAt: downloadHistory.grabbedAt
				})
				.from(downloadHistory)
				.where(inArray(downloadHistory.id, historyIdList))
				.all();

			const failedQueueIndex = this.buildFailedQueueIndex(await this.fetchFailedQueueItems());
			const protectedHistoryIds = new Set<string>();

			for (const row of requestedHistoryRows) {
				if (row.status !== 'failed') continue;

				const byDownloadId = row.downloadId
					? failedQueueIndex.get(`download:${row.downloadId}`)
					: undefined;
				const byTitleGrabbed =
					!byDownloadId && row.title && row.grabbedAt
						? failedQueueIndex.get(`title:${row.title.toLowerCase()}|grabbed:${row.grabbedAt}`)
						: undefined;

				if (byDownloadId || byTitleGrabbed) {
					protectedHistoryIds.add(row.id);
				}
			}

			skippedRetryableFailed = protectedHistoryIds.size;
			eligibleHistoryIdList = historyIdList.filter((id) => !protectedHistoryIds.has(id));
		}

		if (taskIdList.length > 0) {
			const requestedTaskRows = await db
				.select({
					id: taskHistory.id,
					taskId: taskHistory.taskId,
					status: taskHistory.status
				})
				.from(taskHistory)
				.where(inArray(taskHistory.id, taskIdList))
				.all();

			const protectedTaskIds = new Set<string>();
			for (const row of requestedTaskRows) {
				// Only media-move task history is represented in Activity rows.
				// Also do not allow deleting running task rows.
				if (!row.taskId.startsWith('media-move:')) {
					protectedTaskIds.add(row.id);
					continue;
				}
				if (row.status === 'running') {
					protectedTaskIds.add(row.id);
					skippedRunningTasks += 1;
				}
			}

			eligibleTaskIdList = taskIdList.filter((id) => !protectedTaskIds.has(id));
		}

		const { deletedDownloadHistory, deletedMonitoringHistory, deletedTaskHistory } =
			await db.transaction((tx) => {
				const deletedDownloadHistory =
					eligibleHistoryIdList.length > 0
						? tx
								.delete(downloadHistory)
								.where(inArray(downloadHistory.id, eligibleHistoryIdList))
								.run().changes
						: 0;

				const deletedMonitoringHistory =
					monitoringIdList.length > 0
						? tx
								.delete(monitoringHistory)
								.where(inArray(monitoringHistory.id, monitoringIdList))
								.run().changes
						: 0;

				const deletedTaskHistory =
					eligibleTaskIdList.length > 0
						? tx
								.delete(taskHistory)
								.where(
									and(
										inArray(taskHistory.id, eligibleTaskIdList),
										sql`${taskHistory.taskId} LIKE 'media-move:%'`,
										inArray(taskHistory.status, ['completed', 'failed', 'cancelled'])
									)
								)
								.run().changes
						: 0;

				return { deletedDownloadHistory, deletedMonitoringHistory, deletedTaskHistory };
			});

		return {
			deletedDownloadHistory,
			deletedMonitoringHistory,
			deletedTaskHistory,
			skippedQueue,
			skippedUnknown,
			skippedRetryableFailed,
			skippedRunningTasks
		};
	}

	async purgeHistoryOlderThan(retentionDays: number): Promise<PurgeHistoryResult> {
		const normalizedRetentionDays = this.parseRetentionDays(retentionDays);
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - normalizedRetentionDays);
		const cutoffIso = cutoffDate.toISOString();

		const { deletedDownloadHistory, deletedMonitoringHistory, deletedTaskHistory } =
			await db.transaction((tx) => {
				const deletedDownloadHistory = tx
					.delete(downloadHistory)
					.where(lt(downloadHistory.createdAt, cutoffIso))
					.run().changes;
				const deletedMonitoringHistory = tx
					.delete(monitoringHistory)
					.where(lt(monitoringHistory.executedAt, cutoffIso))
					.run().changes;

				const deletedTaskHistory = tx
					.delete(taskHistory)
					.where(
						and(
							sql`${taskHistory.taskId} LIKE 'media-move:%'`,
							inArray(taskHistory.status, ['completed', 'failed', 'cancelled']),
							lt(taskHistory.startedAt, cutoffIso)
						)
					)
					.run().changes;

				return { deletedDownloadHistory, deletedMonitoringHistory, deletedTaskHistory };
			});

		return {
			deletedDownloadHistory,
			deletedMonitoringHistory,
			deletedTaskHistory,
			totalDeleted: deletedDownloadHistory + deletedMonitoringHistory + deletedTaskHistory,
			cutoff: cutoffIso
		};
	}

	async purgeAllHistory(): Promise<PurgeHistoryResult> {
		const { deletedDownloadHistory, deletedMonitoringHistory, deletedTaskHistory } =
			await db.transaction((tx) => {
				const deletedDownloadHistory = tx.delete(downloadHistory).run().changes;
				const deletedMonitoringHistory = tx.delete(monitoringHistory).run().changes;

				const deletedTaskHistory = tx
					.delete(taskHistory)
					.where(
						and(
							sql`${taskHistory.taskId} LIKE 'media-move:%'`,
							inArray(taskHistory.status, ['completed', 'failed', 'cancelled'])
						)
					)
					.run().changes;

				return { deletedDownloadHistory, deletedMonitoringHistory, deletedTaskHistory };
			});

		return {
			deletedDownloadHistory,
			deletedMonitoringHistory,
			deletedTaskHistory,
			totalDeleted: deletedDownloadHistory + deletedMonitoringHistory + deletedTaskHistory
		};
	}

	/**
	 * Transform a single queue item to unified activity
	 */
	transformQueueItem(
		download: DownloadQueueRecord,
		mediaMaps: MediaMaps,
		linkedMonitoring: MonitoringHistoryRecord[] = []
	): UnifiedActivity {
		const mediaInfo = this.resolveMediaInfo(download, mediaMaps);

		return projectQueueActivity(download, mediaInfo, linkedMonitoring);
	}

	/**
	 * Transform a single history item to unified activity
	 */
	transformHistoryItem(
		history: DownloadHistoryRecord,
		mediaMaps: MediaMaps,
		activeDownloads: DownloadQueueRecord[] = [],
		failedQueueIndex?: Map<string, string>
	): UnifiedActivity | null {
		// Skip if this release is already represented by an active queue row.
		// This avoids duplicate active entries when a failed history record is retried.
		const index = this.buildActiveQueueIndex(activeDownloads);
		if (this.isHistoryRepresentedByActiveQueueIndexed(history, index)) {
			return null;
		}

		const timeline = this.buildHistoryTimeline(history);
		const mediaInfo = this.resolveMediaInfo(history, mediaMaps);
		const queueItemId =
			history.status === 'failed'
				? this.findFailedQueueItemId(history, failedQueueIndex)
				: undefined;

		return {
			id: `history-${history.id}`,
			activitySource: 'download_history' as const,
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
			startedAt:
				history.createdAt ||
				history.importedAt ||
				history.completedAt ||
				history.grabbedAt ||
				new Date().toISOString(),
			completedAt: history.importedAt || history.completedAt || null,
			queueItemId,
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
			activitySource: 'monitoring',
			taskType: mon.taskType ?? undefined,
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
			status: mon.status === 'error' ? 'search_error' : 'no_results',
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

	private async fetchActiveDownloads(
		filters: ActivityFilters = {}
	): Promise<DownloadQueueRecord[]> {
		const baseStatuses = [
			'downloading',
			'queued',
			'paused',
			'stalled',
			'seeding',
			'completed',
			'postprocessing',
			'importing',
			'failed'
		];

		// Apply status filter at SQL level when possible
		let statusFilter: string[] = baseStatuses;
		if (filters.status && filters.status !== 'all') {
			const mapped = this.mapFilterStatusToQueueStatuses(filters.status);
			if (mapped) {
				statusFilter = mapped.filter((s) => baseStatuses.includes(s));
				// If no overlap (e.g. filtering for 'success' on active tab), return empty
				if (statusFilter.length === 0) return [];
			}
		}

		const conditions: SQL[] = [inArray(downloadQueue.status, statusFilter)];

		// Protocol filter
		if (filters.protocol && filters.protocol !== 'all') {
			conditions.push(eq(downloadQueue.protocol, filters.protocol));
		}

		// Download client filter
		if (filters.downloadClientId) {
			conditions.push(eq(downloadQueue.downloadClientId, filters.downloadClientId));
		}

		// Indexer filter (by name)
		if (filters.indexer) {
			conditions.push(sql`LOWER(${downloadQueue.indexerName}) = LOWER(${filters.indexer})`);
		}

		// Media type filter
		if (filters.mediaType === 'movie') {
			conditions.push(sql`${downloadQueue.movieId} IS NOT NULL`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${downloadQueue.seriesId} IS NOT NULL`);
		}

		// Date filters (use addedAt for queue items)
		if (filters.startDate) {
			conditions.push(gte(downloadQueue.addedAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(downloadQueue.addedAt, endDateEnd));
		}

		return db
			.select({
				id: downloadQueue.id,
				downloadClientId: downloadQueue.downloadClientId,
				downloadId: downloadQueue.downloadId,
				title: downloadQueue.title,
				indexerId: downloadQueue.indexerId,
				indexerName: downloadQueue.indexerName,
				protocol: downloadQueue.protocol,
				movieId: downloadQueue.movieId,
				seriesId: downloadQueue.seriesId,
				episodeIds: downloadQueue.episodeIds,
				seasonNumber: downloadQueue.seasonNumber,
				status: downloadQueue.status,
				progress: downloadQueue.progress,
				size: downloadQueue.size,
				quality: downloadQueue.quality,
				releaseGroup: downloadQueue.releaseGroup,
				addedAt: downloadQueue.addedAt,
				startedAt: downloadQueue.startedAt,
				completedAt: downloadQueue.completedAt,
				importedAt: downloadQueue.importedAt,
				errorMessage: downloadQueue.errorMessage,
				lastAttemptAt: downloadQueue.lastAttemptAt,
				isUpgrade: downloadQueue.isUpgrade
			})
			.from(downloadQueue)
			.where(and(...conditions))
			.orderBy(desc(downloadQueue.addedAt))
			.all() as DownloadQueueRecord[];
	}

	private async fetchFailedQueueItems(): Promise<
		Pick<DownloadQueueRecord, 'id' | 'downloadId' | 'title' | 'addedAt' | 'status'>[]
	> {
		return db
			.select({
				id: downloadQueue.id,
				downloadId: downloadQueue.downloadId,
				title: downloadQueue.title,
				addedAt: downloadQueue.addedAt,
				status: downloadQueue.status
			})
			.from(downloadQueue)
			.where(eq(downloadQueue.status, 'failed'))
			.all();
	}

	private async fetchHistoryItems(filters: ActivityFilters = {}): Promise<DownloadHistoryRecord[]> {
		const conditions: SQL[] = [];

		// Status filter at SQL level
		if (filters.status && filters.status !== 'all') {
			const mapped = this.mapFilterStatusToHistoryStatuses(filters.status);
			if (mapped) {
				if (mapped.length === 0) return [];
				conditions.push(inArray(downloadHistory.status, mapped));
			}
		}

		// Protocol filter
		if (filters.protocol && filters.protocol !== 'all') {
			conditions.push(eq(downloadHistory.protocol, filters.protocol));
		}

		// Download client filter
		if (filters.downloadClientId) {
			conditions.push(eq(downloadHistory.downloadClientId, filters.downloadClientId));
		}

		// Indexer filter (by name)
		if (filters.indexer) {
			conditions.push(sql`LOWER(${downloadHistory.indexerName}) = LOWER(${filters.indexer})`);
		}

		// Media type filter
		if (filters.mediaType === 'movie') {
			conditions.push(sql`${downloadHistory.movieId} IS NOT NULL`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${downloadHistory.seriesId} IS NOT NULL`);
		}

		// Date filters
		if (filters.startDate) {
			conditions.push(gte(downloadHistory.createdAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(downloadHistory.createdAt, endDateEnd));
		}

		// Fetch up to 500 rows (raised from 200) -- SQL filters now keep this manageable
		const fetchLimit = 500;

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		return db
			.select({
				id: downloadHistory.id,
				downloadClientId: downloadHistory.downloadClientId,
				downloadClientName: downloadHistory.downloadClientName,
				downloadId: downloadHistory.downloadId,
				title: downloadHistory.title,
				indexerId: downloadHistory.indexerId,
				indexerName: downloadHistory.indexerName,
				protocol: downloadHistory.protocol,
				movieId: downloadHistory.movieId,
				seriesId: downloadHistory.seriesId,
				episodeIds: downloadHistory.episodeIds,
				seasonNumber: downloadHistory.seasonNumber,
				status: downloadHistory.status,
				statusReason: downloadHistory.statusReason,
				size: downloadHistory.size,
				quality: downloadHistory.quality,
				releaseGroup: downloadHistory.releaseGroup,
				importedPath: downloadHistory.importedPath,
				grabbedAt: downloadHistory.grabbedAt,
				completedAt: downloadHistory.completedAt,
				importedAt: downloadHistory.importedAt,
				createdAt: downloadHistory.createdAt
			})
			.from(downloadHistory)
			.where(whereClause)
			.orderBy(desc(downloadHistory.createdAt))
			.limit(fetchLimit)
			.all() as DownloadHistoryRecord[];
	}

	/**
	 * Count history items matching SQL-level filters (no LIMIT cap).
	 * Uses the same WHERE conditions as fetchHistoryItems so the total is
	 * accurate even when the data fetch is capped.
	 */
	private async countHistoryItems(filters: ActivityFilters = {}): Promise<number> {
		const conditions: SQL[] = [];

		if (filters.status && filters.status !== 'all') {
			const mapped = this.mapFilterStatusToHistoryStatuses(filters.status);
			if (mapped) {
				if (mapped.length === 0) return 0;
				conditions.push(inArray(downloadHistory.status, mapped));
			}
		}
		if (filters.protocol && filters.protocol !== 'all') {
			conditions.push(eq(downloadHistory.protocol, filters.protocol));
		}
		if (filters.downloadClientId) {
			conditions.push(eq(downloadHistory.downloadClientId, filters.downloadClientId));
		}
		if (filters.indexer) {
			conditions.push(sql`LOWER(${downloadHistory.indexerName}) = LOWER(${filters.indexer})`);
		}
		if (filters.mediaType === 'movie') {
			conditions.push(sql`${downloadHistory.movieId} IS NOT NULL`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${downloadHistory.seriesId} IS NOT NULL`);
		}
		if (filters.startDate) {
			conditions.push(gte(downloadHistory.createdAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(downloadHistory.createdAt, endDateEnd));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const result = await db
			.select({ count: count() })
			.from(downloadHistory)
			.where(whereClause)
			.get();
		return result?.count ?? 0;
	}

	private async fetchMonitoringItems(
		includeNoResults?: boolean,
		filters: ActivityFilters = {}
	): Promise<MonitoringHistoryRecord[]> {
		// Build status filter based on includeNoResults flag
		// By default (undefined/false), exclude 'no_results' to reduce noise
		const baseStatuses = includeNoResults
			? ['no_results', 'error', 'skipped']
			: ['error', 'skipped'];

		// If user is filtering by a specific status, narrow monitoring statuses accordingly
		let monitoringStatuses = baseStatuses;
		if (filters.status && filters.status !== 'all') {
			if (filters.status === 'failed' || filters.status === 'search_error') {
				monitoringStatuses = baseStatuses.filter((s) => s === 'error');
			} else if (filters.status === 'no_results') {
				monitoringStatuses = baseStatuses.filter((s) => s === 'no_results');
				if (monitoringStatuses.length === 0) return [];
			} else if (
				filters.status === 'success' ||
				filters.status === 'downloading' ||
				filters.status === 'seeding' ||
				filters.status === 'paused' ||
				filters.status === 'removed' ||
				filters.status === 'rejected'
			) {
				// Monitoring items never have these statuses
				return [];
			}
		}

		const conditions: SQL[] = [inArray(monitoringHistory.status, monitoringStatuses)];

		// Exclude subtitle search noise in SQL (previously done in JS post-query)
		conditions.push(
			sql`NOT (${monitoringHistory.taskType} = 'missingSubtitles' AND ${monitoringHistory.status} = 'no_results')`
		);

		// Media type filter
		if (filters.mediaType === 'movie') {
			conditions.push(sql`${monitoringHistory.movieId} IS NOT NULL`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${monitoringHistory.seriesId} IS NOT NULL`);
		}

		// Date filters
		if (filters.startDate) {
			conditions.push(gte(monitoringHistory.executedAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(monitoringHistory.executedAt, endDateEnd));
		}

		// Fetch up to 300 rows (raised from 100) -- SQL filters keep this manageable
		const fetchLimit = 300;

		const items = (await db
			.select({
				id: monitoringHistory.id,
				taskType: monitoringHistory.taskType,
				movieId: monitoringHistory.movieId,
				seriesId: monitoringHistory.seriesId,
				seasonNumber: monitoringHistory.seasonNumber,
				episodeId: monitoringHistory.episodeId,
				status: monitoringHistory.status,
				releasesFound: monitoringHistory.releasesFound,
				releaseGrabbed: monitoringHistory.releaseGrabbed,
				queueItemId: monitoringHistory.queueItemId,
				isUpgrade: monitoringHistory.isUpgrade,
				oldScore: monitoringHistory.oldScore,
				newScore: monitoringHistory.newScore,
				executedAt: monitoringHistory.executedAt,
				errorMessage: monitoringHistory.errorMessage
			})
			.from(monitoringHistory)
			.where(and(...conditions))
			.orderBy(desc(monitoringHistory.executedAt))
			.limit(fetchLimit)
			.all()) as MonitoringHistoryRecord[];

		return items;
	}

	/**
	 * Count monitoring items matching SQL-level filters (no LIMIT cap).
	 * Mirrors the WHERE logic in fetchMonitoringItems, plus excludes
	 * subtitle noise in SQL so the count is accurate.
	 */
	private async countMonitoringItems(
		includeNoResults?: boolean,
		filters: ActivityFilters = {}
	): Promise<number> {
		const baseStatuses = includeNoResults
			? ['no_results', 'error', 'skipped']
			: ['error', 'skipped'];

		let monitoringStatuses = baseStatuses;
		if (filters.status && filters.status !== 'all') {
			if (filters.status === 'failed') {
				monitoringStatuses = baseStatuses.filter((s) => s === 'error');
			} else if (filters.status === 'no_results') {
				monitoringStatuses = baseStatuses.filter((s) => s === 'no_results');
				if (monitoringStatuses.length === 0) return 0;
			} else if (
				filters.status === 'success' ||
				filters.status === 'downloading' ||
				filters.status === 'seeding' ||
				filters.status === 'paused' ||
				filters.status === 'removed' ||
				filters.status === 'rejected'
			) {
				return 0;
			}
		}

		const conditions: SQL[] = [inArray(monitoringHistory.status, monitoringStatuses)];

		// Exclude subtitle noise in SQL (matches the JS filter in fetchMonitoringItems)
		conditions.push(
			sql`NOT (${monitoringHistory.taskType} = 'missingSubtitles' AND ${monitoringHistory.status} = 'no_results')`
		);

		if (filters.mediaType === 'movie') {
			conditions.push(sql`${monitoringHistory.movieId} IS NOT NULL`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${monitoringHistory.seriesId} IS NOT NULL`);
		}
		if (filters.startDate) {
			conditions.push(gte(monitoringHistory.executedAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(monitoringHistory.executedAt, endDateEnd));
		}

		const result = await db
			.select({ count: count() })
			.from(monitoringHistory)
			.where(and(...conditions))
			.get();
		return result?.count ?? 0;
	}

	private async fetchMoveTasks(
		scope: ActivityScope,
		filters: ActivityFilters = {}
	): Promise<MoveTaskRecord[]> {
		const conditions: SQL[] = [sql`${taskHistory.taskId} LIKE 'media-move:%'`];

		const statuses = this.mapMoveStatusesForScopeAndFilter(scope, filters.status ?? 'all');
		if (statuses.length === 0) return [];
		conditions.push(inArray(taskHistory.status, statuses));

		if (filters.mediaType === 'movie') {
			conditions.push(sql`${taskHistory.taskId} LIKE 'media-move:movie:%'`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${taskHistory.taskId} LIKE 'media-move:series:%'`);
		}

		if (filters.protocol && filters.protocol !== 'all') {
			return [];
		}
		if (filters.downloadClientId || filters.indexer) {
			return [];
		}

		if (filters.startDate) {
			conditions.push(gte(taskHistory.startedAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(taskHistory.startedAt, endDateEnd));
		}

		return (await db
			.select({
				id: taskHistory.id,
				taskId: taskHistory.taskId,
				status: taskHistory.status,
				results: taskHistory.results,
				errors: taskHistory.errors,
				startedAt: taskHistory.startedAt,
				completedAt: taskHistory.completedAt
			})
			.from(taskHistory)
			.where(and(...conditions))
			.orderBy(desc(taskHistory.startedAt))
			.limit(500)
			.all()) as MoveTaskRecord[];
	}

	private async countMoveTasks(
		scope: ActivityScope,
		filters: ActivityFilters = {}
	): Promise<number> {
		const conditions: SQL[] = [sql`${taskHistory.taskId} LIKE 'media-move:%'`];

		const statuses = this.mapMoveStatusesForScopeAndFilter(scope, filters.status ?? 'all');
		if (statuses.length === 0) return 0;
		conditions.push(inArray(taskHistory.status, statuses));

		if (filters.mediaType === 'movie') {
			conditions.push(sql`${taskHistory.taskId} LIKE 'media-move:movie:%'`);
		} else if (filters.mediaType === 'tv') {
			conditions.push(sql`${taskHistory.taskId} LIKE 'media-move:series:%'`);
		}

		if (filters.protocol && filters.protocol !== 'all') {
			return 0;
		}
		if (filters.downloadClientId || filters.indexer) {
			return 0;
		}

		if (filters.startDate) {
			conditions.push(gte(taskHistory.startedAt, filters.startDate));
		}
		if (filters.endDate) {
			const endDateEnd = filters.endDate + 'T23:59:59.999Z';
			conditions.push(lte(taskHistory.startedAt, endDateEnd));
		}

		const result = await db
			.select({ count: count() })
			.from(taskHistory)
			.where(and(...conditions))
			.get();
		return result?.count ?? 0;
	}

	private transformMoveTasks(tasks: MoveTaskRecord[]): UnifiedActivity[] {
		return tasks
			.map((task) => this.transformMoveTask(task))
			.filter((activity): activity is UnifiedActivity => activity !== null);
	}

	private transformMoveTask(task: MoveTaskRecord): UnifiedActivity | null {
		const parsed = parseMoveTaskId(task.taskId);
		if (!parsed) return null;

		const mediaType = parsed.mediaType === 'movie' ? 'movie' : 'episode';
		const defaultTitle = parsed.mediaType === 'movie' ? 'Movie' : 'Series';
		const results = task.results ?? {};
		const resultsMediaTitle =
			typeof results.mediaTitle === 'string' && results.mediaTitle.trim().length > 0
				? results.mediaTitle.trim()
				: null;
		const mediaTitle = resultsMediaTitle ?? defaultTitle;

		const mappedStatus = this.mapMoveTaskStatus(task.status);
		const statusReason =
			task.status === 'failed'
				? (task.errors?.[0] ?? 'Failed to move media files')
				: task.status === 'cancelled'
					? (task.errors?.[0] ?? 'Move cancelled')
					: undefined;

		const startedAt = task.startedAt ?? new Date().toISOString();
		const completedAt = task.completedAt ?? null;
		const timeline: ActivityEvent[] = [{ type: 'searched', timestamp: startedAt }];
		if (task.status === 'running') {
			timeline.push({
				type: 'downloading',
				timestamp: startedAt,
				details: 'Moving files to new root folder'
			});
		} else if (task.status === 'completed') {
			timeline.push({
				type: 'imported',
				timestamp: completedAt ?? startedAt,
				details:
					typeof results.destPath === 'string' && results.destPath
						? `Moved to ${results.destPath}`
						: 'Moved to new root folder'
			});
		} else if (task.status === 'failed') {
			timeline.push({
				type: 'failed',
				timestamp: completedAt ?? startedAt,
				details: statusReason
			});
		} else if (task.status === 'cancelled') {
			timeline.push({
				type: 'removed',
				timestamp: completedAt ?? startedAt,
				details: statusReason
			});
		}

		return {
			id: `task-${task.id}`,
			activitySource: 'task',
			taskType: 'media_move',
			mediaType,
			mediaId: parsed.mediaId,
			mediaTitle,
			mediaYear: null,
			seriesId: mediaType === 'episode' ? parsed.mediaId : undefined,
			seriesTitle: mediaType === 'episode' ? mediaTitle : undefined,
			releaseTitle: 'Move media files to new root folder',
			quality: null,
			releaseGroup: null,
			size: null,
			indexerId: null,
			indexerName: null,
			protocol: null,
			status: mappedStatus,
			statusReason,
			isUpgrade: false,
			timeline,
			startedAt,
			completedAt,
			lastAttemptAt: task.status === 'failed' ? (completedAt ?? startedAt) : null
		};
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
		activeDownloads: DownloadQueueRecord[],
		failedQueueIndex?: Map<string, string>
	): UnifiedActivity[] {
		// Build the active queue index once for all history items (O(n) build, O(1) lookups)
		const activeIndex = this.buildActiveQueueIndex(activeDownloads);

		return historyItems
			.map((history) =>
				this.transformHistoryItemWithIndex(history, mediaMaps, activeIndex, failedQueueIndex)
			)
			.filter((activity): activity is UnifiedActivity => activity !== null);
	}

	/**
	 * Internal transform using a pre-built active queue index for O(1) dedup lookups.
	 */
	private transformHistoryItemWithIndex(
		history: DownloadHistoryRecord,
		mediaMaps: MediaMaps,
		activeIndex: ActiveQueueIndex,
		failedQueueIndex?: Map<string, string>
	): UnifiedActivity | null {
		if (this.isHistoryRepresentedByActiveQueueIndexed(history, activeIndex)) {
			return null;
		}

		const timeline = this.buildHistoryTimeline(history);
		const mediaInfo = this.resolveMediaInfo(history, mediaMaps);
		const queueItemId =
			history.status === 'failed'
				? this.findFailedQueueItemId(history, failedQueueIndex)
				: undefined;

		return {
			id: `history-${history.id}`,
			activitySource: 'download_history' as const,
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
			startedAt:
				history.createdAt ||
				history.importedAt ||
				history.completedAt ||
				history.grabbedAt ||
				new Date().toISOString(),
			completedAt: history.importedAt || history.completedAt || null,
			queueItemId,
			downloadHistoryId: history.id,
			importedPath: history.importedPath ?? undefined
		};
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

	private buildFailedQueueIndex(
		queueItems: Pick<DownloadQueueRecord, 'id' | 'downloadId' | 'title' | 'addedAt'>[]
	): Map<string, string> {
		const index = new Map<string, string>();

		for (const item of queueItems) {
			if (item.downloadId) {
				index.set(`download:${item.downloadId}`, item.id);
			}
			if (item.title && item.addedAt) {
				index.set(`title:${item.title.toLowerCase()}|grabbed:${item.addedAt}`, item.id);
			}
		}

		return index;
	}

	private findFailedQueueItemId(
		history: DownloadHistoryRecord,
		failedQueueIndex?: Map<string, string>
	): string | undefined {
		if (!failedQueueIndex) return undefined;

		if (history.downloadId) {
			const byDownloadId = failedQueueIndex.get(`download:${history.downloadId}`);
			if (byDownloadId) return byDownloadId;
		}

		if (history.title && history.grabbedAt) {
			return failedQueueIndex.get(
				`title:${history.title.toLowerCase()}|grabbed:${history.grabbedAt}`
			);
		}

		return undefined;
	}

	private normalizeReleaseKey(value: string | null | undefined): string {
		if (!value) return '';
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '')
			.trim();
	}

	private toEpisodeIdList(value: unknown): string[] {
		if (Array.isArray(value)) {
			return value.filter(
				(entry): entry is string => typeof entry === 'string' && entry.length > 0
			);
		}

		if (typeof value === 'string') {
			try {
				const parsed = JSON.parse(value) as unknown;
				if (Array.isArray(parsed)) {
					return parsed.filter(
						(entry): entry is string => typeof entry === 'string' && entry.length > 0
					);
				}
			} catch {
				// Ignore malformed JSON episode arrays and fall through.
			}
		}

		return [];
	}

	private hasEpisodeOverlap(left: unknown, right: unknown): boolean {
		const leftIds = this.toEpisodeIdList(left);
		const rightIds = this.toEpisodeIdList(right);
		if (leftIds.length === 0 || rightIds.length === 0) return false;
		const rightSet = new Set(rightIds);
		return leftIds.some((episodeId) => rightSet.has(episodeId));
	}

	private isSameMediaTarget(
		history: Pick<DownloadHistoryRecord, 'movieId' | 'seriesId' | 'episodeIds' | 'seasonNumber'>,
		queueItem: Pick<DownloadQueueRecord, 'movieId' | 'seriesId' | 'episodeIds' | 'seasonNumber'>
	): boolean {
		if (history.movieId && queueItem.movieId) {
			return history.movieId === queueItem.movieId;
		}

		if (history.seriesId && queueItem.seriesId && history.seriesId === queueItem.seriesId) {
			if (this.hasEpisodeOverlap(history.episodeIds, queueItem.episodeIds)) {
				return true;
			}

			if (history.seasonNumber && queueItem.seasonNumber) {
				return history.seasonNumber === queueItem.seasonNumber;
			}

			const historyEpisodeIds = this.toEpisodeIdList(history.episodeIds);
			const queueEpisodeIds = this.toEpisodeIdList(queueItem.episodeIds);
			if (historyEpisodeIds.length === 0 && queueEpisodeIds.length === 0) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Pre-built index for fast active queue lookups.
	 * Replaces O(n*m) iteration with O(1) lookups for most match paths.
	 */
	private buildActiveQueueIndex(activeDownloads: DownloadQueueRecord[]): ActiveQueueIndex {
		const byDownloadId = new Map<string, DownloadQueueRecord>();
		const byNormalizedTitle = new Map<string, DownloadQueueRecord>();
		const byMovieId = new Set<string>();
		const bySeriesId = new Set<string>();
		const byAddedAt = new Map<string, DownloadQueueRecord[]>();
		const titleEntries: { key: string; item: DownloadQueueRecord }[] = [];
		const hasAnyWithoutMediaLink = activeDownloads.some((d) => !d.movieId && !d.seriesId);

		for (const item of activeDownloads) {
			if (item.downloadId) {
				byDownloadId.set(item.downloadId, item);
			}
			const titleKey = this.normalizeReleaseKey(item.title);
			if (titleKey) {
				byNormalizedTitle.set(titleKey, item);
				titleEntries.push({ key: titleKey, item });
			}
			if (item.movieId) byMovieId.add(item.movieId);
			if (item.seriesId) bySeriesId.add(item.seriesId);
			if (item.addedAt) {
				const existing = byAddedAt.get(item.addedAt) || [];
				existing.push(item);
				byAddedAt.set(item.addedAt, existing);
			}
		}

		return {
			byDownloadId,
			byNormalizedTitle,
			byMovieId,
			bySeriesId,
			byAddedAt,
			titleEntries,
			hasAnyWithoutMediaLink,
			items: activeDownloads
		};
	}

	private isHistoryRepresentedByActiveQueueIndexed(
		history: DownloadHistoryRecord,
		index: ActiveQueueIndex
	): boolean {
		if (index.items.length === 0) return false;

		// Fast path 1: exact downloadId match
		if (history.downloadId && index.byDownloadId.has(history.downloadId)) {
			return true;
		}

		const historyTitleKey = this.normalizeReleaseKey(history.title);
		const hasHistoryMediaLink = Boolean(history.movieId || history.seriesId);

		// Fast path 2: exact title match + (same media OR same grabbedAt OR no media link)
		if (historyTitleKey) {
			const queueByTitle = index.byNormalizedTitle.get(historyTitleKey);
			if (queueByTitle) {
				// sameTitle is true, check remaining conditions
				const sameMovie = Boolean(
					history.movieId && queueByTitle.movieId && history.movieId === queueByTitle.movieId
				);
				const sameSeries = Boolean(
					history.seriesId && queueByTitle.seriesId && history.seriesId === queueByTitle.seriesId
				);
				const sameGrabbedAt = Boolean(
					history.grabbedAt && queueByTitle.addedAt && history.grabbedAt === queueByTitle.addedAt
				);
				const hasQueueMediaLink = Boolean(queueByTitle.movieId || queueByTitle.seriesId);
				const sameProtocol = Boolean(
					history.protocol && queueByTitle.protocol && history.protocol === queueByTitle.protocol
				);
				const protocolCompatible = !history.protocol || !queueByTitle.protocol || sameProtocol;

				if (sameMovie || sameSeries || sameGrabbedAt) return true;
				if (this.isSameMediaTarget(history, queueByTitle)) return true;
				if (protocolCompatible && (!hasHistoryMediaLink || !hasQueueMediaLink)) return true;
			}
		}

		// Fast path 3: same grabbedAt + same movie/series
		if (history.grabbedAt) {
			const queueItemsAtTime = index.byAddedAt.get(history.grabbedAt);
			if (queueItemsAtTime) {
				for (const queueItem of queueItemsAtTime) {
					const sameMovie = Boolean(
						history.movieId && queueItem.movieId && history.movieId === queueItem.movieId
					);
					const sameSeries = Boolean(
						history.seriesId && queueItem.seriesId && history.seriesId === queueItem.seriesId
					);
					if (sameMovie || sameSeries) return true;
					if (this.isSameMediaTarget(history, queueItem)) return true;
				}
			}
		}

		// Fast path 4: same media + same grabbedAt (check media exists in index)
		if (history.movieId && index.byMovieId.has(history.movieId) && history.grabbedAt) {
			const queueItemsAtTime = index.byAddedAt.get(history.grabbedAt);
			if (queueItemsAtTime?.some((q) => q.movieId === history.movieId)) return true;
		}
		if (history.seriesId && index.bySeriesId.has(history.seriesId) && history.grabbedAt) {
			const queueItemsAtTime = index.byAddedAt.get(history.grabbedAt);
			if (queueItemsAtTime?.some((q) => q.seriesId === history.seriesId)) return true;
		}

		// Slow path: substring title matching (only when exact title didn't match)
		// This handles cases where title normalization results in containment rather than equality
		if (historyTitleKey && historyTitleKey.length > 12) {
			for (const entry of index.titleEntries) {
				if (entry.key === historyTitleKey) continue; // already checked exact match above
				const isSubstring =
					(entry.key.length > 12 && entry.key.includes(historyTitleKey)) ||
					historyTitleKey.includes(entry.key);
				if (!isSubstring) continue;

				const queueItem = entry.item;
				const sameMovie = Boolean(
					history.movieId && queueItem.movieId && history.movieId === queueItem.movieId
				);
				const sameSeries = Boolean(
					history.seriesId && queueItem.seriesId && history.seriesId === queueItem.seriesId
				);
				const sameGrabbedAt = Boolean(
					history.grabbedAt && queueItem.addedAt && history.grabbedAt === queueItem.addedAt
				);
				const hasQueueMediaLink = Boolean(queueItem.movieId || queueItem.seriesId);
				const sameProtocol = Boolean(
					history.protocol && queueItem.protocol && history.protocol === queueItem.protocol
				);
				const protocolCompatible = !history.protocol || !queueItem.protocol || sameProtocol;

				if (sameMovie || sameSeries || sameGrabbedAt) return true;
				if (this.isSameMediaTarget(history, queueItem)) return true;
				if (protocolCompatible && (!hasHistoryMediaLink || !hasQueueMediaLink)) return true;
			}
		}

		// Fallback for short-titled items with no media link (rare case)
		if (historyTitleKey && !hasHistoryMediaLink && index.hasAnyWithoutMediaLink) {
			const queueByTitle = index.byNormalizedTitle.get(historyTitleKey);
			if (queueByTitle) {
				const hasQueueMediaLink = Boolean(queueByTitle.movieId || queueByTitle.seriesId);
				if (!hasQueueMediaLink) {
					const protocolCompatible =
						!history.protocol ||
						!queueByTitle.protocol ||
						history.protocol === queueByTitle.protocol;
					if (protocolCompatible) return true;
				}
			}
		}

		return false;
	}

	private buildActiveDedupKey(activity: UnifiedActivity): string {
		const releaseKey = this.normalizeReleaseKey(
			activity.releaseTitle || activity.mediaTitle || activity.id
		);
		const mediaTitleKey = this.normalizeReleaseKey(activity.mediaTitle || activity.id);
		const mediaKey =
			activity.mediaType === 'movie'
				? `movie:${activity.mediaId || mediaTitleKey}`
				: activity.seriesId
					? `series:${activity.seriesId}`
					: `fallback:${activity.mediaType}:${mediaTitleKey}`;

		return `${mediaKey}|release:${releaseKey}`;
	}

	private getActiveDedupPriority(activity: UnifiedActivity): [number, number, number] {
		const statusPriority =
			activity.status === 'downloading' || activity.status === 'seeding'
				? 0
				: activity.status === 'paused' || activity.status === 'searching'
					? 1
					: activity.status === 'failed'
						? 2
						: 3;

		const sourcePriority = activity.id.startsWith('queue-') ? 0 : 1;
		const startedAtMs = Number.isFinite(new Date(activity.startedAt).getTime())
			? new Date(activity.startedAt).getTime()
			: 0;
		const recencyPriority = -startedAtMs;

		return [statusPriority, sourcePriority, recencyPriority];
	}

	private shouldPreferActiveCandidate(
		candidate: UnifiedActivity,
		existing: UnifiedActivity
	): boolean {
		const [candidateStatus, candidateSource, candidateRecency] =
			this.getActiveDedupPriority(candidate);
		const [existingStatus, existingSource, existingRecency] = this.getActiveDedupPriority(existing);

		if (candidateStatus !== existingStatus) return candidateStatus < existingStatus;
		if (candidateSource !== existingSource) return candidateSource < existingSource;
		return candidateRecency < existingRecency;
	}

	private dedupeActiveActivities(activities: UnifiedActivity[]): UnifiedActivity[] {
		const dedupedByKey = new Map<string, UnifiedActivity>();
		const stableOrder: string[] = [];

		for (const activity of activities) {
			const key = this.buildActiveDedupKey(activity);
			if (!dedupedByKey.has(key)) {
				dedupedByKey.set(key, activity);
				stableOrder.push(key);
				continue;
			}

			const existing = dedupedByKey.get(key)!;
			if (this.shouldPreferActiveCandidate(activity, existing)) {
				dedupedByKey.set(key, activity);
			}
		}

		return stableOrder
			.map((key) => dedupedByKey.get(key))
			.filter((activity): activity is UnifiedActivity => Boolean(activity));
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

	private sortActivities(activities: UnifiedActivity[], sort: ActivitySortOptions): void {
		activities.sort((a, b) => {
			const priorityComparison = this.compareActivityPriority(a, b);
			if (priorityComparison !== 0) {
				return priorityComparison;
			}

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

			if (comparison === 0) {
				comparison = new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
			}

			return sort.direction === 'asc' ? -comparison : comparison;
		});
	}

	private parseRetentionDays(value: unknown): number {
		const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
		if (!Number.isFinite(numeric)) {
			return DEFAULT_ACTIVITY_RETENTION_DAYS;
		}

		return Math.max(MIN_ACTIVITY_RETENTION_DAYS, Math.min(MAX_ACTIVITY_RETENTION_DAYS, numeric));
	}

	private compareActivityPriority(a: UnifiedActivity, b: UnifiedActivity): number {
		const aPriority = a.status === 'downloading' || a.status === 'seeding' ? 0 : 1;
		const bPriority = b.status === 'downloading' || b.status === 'seeding' ? 0 : 1;
		return aPriority - bPriority;
	}

	/**
	 * Map a UI-facing filter status to download_queue status values.
	 * Returns null if the filter does not constrain queue statuses.
	 */
	private mapFilterStatusToQueueStatuses(status: string): string[] | null {
		switch (status) {
			case 'downloading':
				return ['downloading', 'queued', 'stalled', 'completed', 'postprocessing', 'importing'];
			case 'seeding':
				return ['seeding'];
			case 'paused':
				return ['paused'];
			case 'failed':
				return ['failed'];
			case 'success':
				// Queue items are never in a "success" state visible to the user
				return [];
			default:
				return null;
		}
	}

	/**
	 * Map a UI-facing filter status to download_history status values.
	 * Returns null if the filter does not constrain history statuses.
	 */
	private mapFilterStatusToHistoryStatuses(status: string): string[] | null {
		switch (status) {
			case 'success':
				return ['imported'];
			case 'failed':
				return ['failed'];
			case 'search_error':
				// search_error items come from monitoring, not download history
				return [];
			case 'removed':
				return ['removed'];
			case 'rejected':
				return ['rejected'];
			case 'downloading':
			case 'seeding':
			case 'paused':
			case 'no_results':
				// History items never have these statuses
				return [];
			default:
				return null;
		}
	}

	private mapMoveStatusesForScopeAndFilter(
		scope: ActivityScope,
		status: ActivityFilters['status'] | 'all'
	): Array<'running' | 'completed' | 'failed' | 'cancelled'> {
		let base: Array<'running' | 'completed' | 'failed' | 'cancelled'>;
		if (scope === 'active') {
			base = ['running'];
		} else if (scope === 'history') {
			base = ['completed', 'failed', 'cancelled'];
		} else {
			base = ['running', 'completed', 'failed', 'cancelled'];
		}

		switch (status) {
			case 'all':
				return base;
			case 'downloading':
				return base.includes('running') ? ['running'] : [];
			case 'success':
				return base.includes('completed') ? ['completed'] : [];
			case 'failed':
				return base.includes('failed') ? ['failed'] : [];
			case 'removed':
				return base.includes('cancelled') ? ['cancelled'] : [];
			case 'seeding':
			case 'paused':
			case 'search_error':
			case 'rejected':
			case 'no_results':
			case 'streaming':
			case 'searching':
			case 'imported':
				return [];
			default:
				return base;
		}
	}

	private mapMoveTaskStatus(
		status: MoveTaskRecord['status']
	): Extract<ActivityStatus, 'downloading' | 'imported' | 'failed' | 'removed'> {
		switch (status) {
			case 'running':
				return 'downloading';
			case 'completed':
				return 'imported';
			case 'failed':
				return 'failed';
			case 'cancelled':
				return 'removed';
		}
	}

	private withoutStatusFilter(filters: ActivityFilters): ActivityFilters {
		if (!filters.status || filters.status === 'all') {
			return filters;
		}

		return {
			...filters,
			status: 'all'
		};
	}

	private applyRequestedStatusFilter(
		activities: UnifiedActivity[],
		filters: ActivityFilters
	): UnifiedActivity[] {
		const status = filters.status ?? 'all';
		if (status === 'all') return activities;

		switch (status) {
			case 'success':
				return activities.filter((activity) => activity.status === 'imported');
			case 'downloading':
				return activities.filter((activity) => activity.status === 'downloading');
			case 'failed':
			case 'search_error':
			case 'seeding':
			case 'paused':
			case 'removed':
			case 'rejected':
			case 'no_results':
				return activities.filter((activity) => activity.status === status);
			default:
				return activities;
		}
	}

	private createEmptySummary(): ActivitySummary {
		return {
			totalCount: 0,
			downloadingCount: 0,
			seedingCount: 0,
			pausedCount: 0,
			failedCount: 0
		};
	}

	private buildActivitySummary(activeActivities: UnifiedActivity[]): ActivitySummary {
		const summary = this.createEmptySummary();

		for (const activity of activeActivities) {
			summary.totalCount += 1;
			switch (activity.status) {
				case 'seeding':
					summary.seedingCount += 1;
					break;
				case 'paused':
					summary.pausedCount += 1;
					break;
				case 'failed':
					summary.failedCount += 1;
					break;
				default:
					summary.downloadingCount += 1;
					break;
			}
		}

		return summary;
	}

	/**
	 * Apply filters that cannot be expressed in SQL.
	 *
	 * Filters already pushed to SQL in fetchActiveDownloads / fetchHistoryItems /
	 * fetchMonitoringItems: status, protocol, indexer, downloadClientId,
	 * mediaType, startDate, endDate.  DO NOT re-apply them here.
	 *
	 * This method handles only:
	 *  - scope (active vs history) — determined by source table, but transformed
	 *    activities need the isActiveActivity check after merging
	 *  - search — matches across joined/transformed fields (mediaTitle, seriesTitle, etc.)
	 *  - releaseGroup — extracted from the release title at transform time
	 *  - resolution — parsed from the JSON quality blob
	 *  - isUpgrade — only available after transform
	 */
	private applyFilters(
		activities: UnifiedActivity[],
		filters: ActivityFilters,
		scope: ActivityScope = 'all'
	): UnifiedActivity[] {
		let filtered = activities;

		if (scope === 'active') {
			filtered = filtered.filter((activity) => isActiveActivity(activity));
		} else if (scope === 'history') {
			filtered = filtered.filter((activity) => !isActiveActivity(activity));
		}

		// Search filter (spans joined fields not available in SQL)
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

		// Release group filter (extracted at transform time)
		if (filters.releaseGroup) {
			filtered = filtered.filter((a) =>
				a.releaseGroup?.toLowerCase().includes(filters.releaseGroup!.toLowerCase())
			);
		}

		// Resolution filter (parsed from JSON quality blob)
		if (filters.resolution) {
			filtered = filtered.filter(
				(a) => a.quality?.resolution?.toLowerCase() === filters.resolution?.toLowerCase()
			);
		}

		// Is upgrade filter (only known after transform)
		if (filters.isUpgrade !== undefined) {
			filtered = filtered.filter((a) => a.isUpgrade === filters.isUpgrade);
		}

		return filtered;
	}
}

// Export singleton instance
export const activityService = ActivityService.getInstance();
