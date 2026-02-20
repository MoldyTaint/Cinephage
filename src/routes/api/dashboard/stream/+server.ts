import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { librarySchedulerService } from '$lib/server/library/library-scheduler';
import { diskScanService } from '$lib/server/library/disk-scan';
import { db } from '$lib/server/db';
import {
	movies,
	series,
	episodes,
	episodeFiles,
	downloadQueue,
	downloadHistory,
	unmatchedFiles,
	rootFolders
} from '$lib/server/db/schema';
import { count, eq, desc, and, inArray, sql, gte, ne } from 'drizzle-orm';
import { activityService, mediaResolver } from '$lib/server/activity';
import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import type { UnifiedActivity, ActivityStatus } from '$lib/types/activity';
import type { RequestHandler } from '@sveltejs/kit';
import {
	computeMissingMovieAvailabilityCounts,
	enrichMoviesWithAvailability
} from '$lib/server/dashboard/movie-availability';

interface QueueItem {
	id: string;
	title: string;
	movieId?: string | null;
	seriesId?: string | null;
	episodeIds?: string[] | null;
	seasonNumber?: number | null;
	status: string;
	progress?: number;
	size?: number | null;
	indexerId?: string | null;
	indexerName?: string | null;
	protocol?: string | null;
	quality?: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
	addedAt: string;
	completedAt?: string | null;
	errorMessage?: string | null;
	isUpgrade?: boolean;
}

function isQueueItem(value: unknown): value is QueueItem {
	if (!value || typeof value !== 'object') return false;
	const maybe = value as Partial<QueueItem>;
	return typeof maybe.id === 'string' && typeof maybe.title === 'string';
}

function getQueueItemFromPayload(payload: unknown): QueueItem | null {
	if (isQueueItem(payload)) return payload;

	if (payload && typeof payload === 'object' && 'queueItem' in payload) {
		const wrapped = (payload as { queueItem?: unknown }).queueItem;
		if (isQueueItem(wrapped)) return wrapped;
	}

	return null;
}

function getQueueErrorFromPayload(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') return undefined;
	const maybeError = (payload as { error?: unknown }).error;
	return typeof maybeError === 'string' ? maybeError : undefined;
}

function mapQueueStatusToActivityStatus(status: string): ActivityStatus {
	switch (status) {
		case 'paused':
			return 'paused';
		case 'failed':
			return 'failed';
		case 'imported':
		case 'seeding-imported':
			return 'imported';
		case 'removed':
			return 'removed';
		default:
			return 'downloading';
	}
}

/**
 * Get dashboard stats
 */
async function getDashboardStats() {
	const [movieStats] = await db
		.select({
			total: count(),
			withFile: count(sql`CASE WHEN ${movies.hasFile} = 1 THEN 1 END`),
			monitored: count(sql`CASE WHEN ${movies.monitored} = 1 THEN 1 END`)
		})
		.from(movies);

	const [seriesStats] = await db
		.select({
			total: count(),
			monitored: count(sql`CASE WHEN ${series.monitored} = 1 THEN 1 END`)
		})
		.from(series);

	const [episodeStats] = await db
		.select({
			total: count(),
			withFile: count(sql`CASE WHEN ${episodes.hasFile} = 1 THEN 1 END`),
			monitored: count(sql`CASE WHEN ${episodes.monitored} = 1 THEN 1 END`)
		})
		.from(episodes);

	const now = new Date();
	const today = now.toISOString().split('T')[0];

	// Primary counters are monitored-only (actionable). We also keep a secondary
	// unmonitored missing counter for visibility ("ignored" in UI).
	const [
		airedMissingEpisodes,
		unairedEpisodes,
		unmonitoredAiredMissingEpisodes,
		missingMoviesForAvailability
	] = await Promise.all([
		db
			.select({ count: count() })
			.from(episodes)
			.innerJoin(series, eq(episodes.seriesId, series.id))
			.where(
				and(
					eq(episodes.hasFile, false),
					eq(episodes.monitored, true),
					eq(series.monitored, true),
					ne(episodes.seasonNumber, 0),
					sql`${episodes.airDate} <= ${today}`
				)
			),
		db
			.select({ count: count() })
			.from(episodes)
			.innerJoin(series, eq(episodes.seriesId, series.id))
			.where(
				and(
					eq(episodes.hasFile, false),
					eq(episodes.monitored, true),
					eq(series.monitored, true),
					ne(episodes.seasonNumber, 0),
					sql`${episodes.airDate} > ${today}`
				)
			),
		db
			.select({ count: count() })
			.from(episodes)
			.innerJoin(series, eq(episodes.seriesId, series.id))
			.where(
				and(
					eq(episodes.hasFile, false),
					ne(episodes.seasonNumber, 0),
					sql`${episodes.airDate} <= ${today}`,
					sql`(${episodes.monitored} = 0 OR ${series.monitored} = 0)`
				)
			),
		db
			.select({
				tmdbId: movies.tmdbId,
				year: movies.year,
				added: movies.added,
				monitored: movies.monitored
			})
			.from(movies)
			.where(eq(movies.hasFile, false))
	]);
	const missingMovieCounts = await computeMissingMovieAvailabilityCounts(
		missingMoviesForAvailability
	);
	const monitoredReleasedMissingMovies = missingMovieCounts.monitoredReleasedMissing;
	const monitoredUnreleasedMovies = missingMovieCounts.monitoredUnreleased;
	const unmonitoredMissingMovies = missingMovieCounts.unmonitoredMissing;

	const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
	const [downloadingDownloads, queuedDownloads, downloadThroughput, completedDownloads24h] =
		await Promise.all([
			db
				.select({ count: count() })
				.from(downloadQueue)
				.where(eq(downloadQueue.status, 'downloading')),
			db.select({ count: count() }).from(downloadQueue).where(eq(downloadQueue.status, 'queued')),
			db
				.select({
					totalSpeed: sql<number>`COALESCE(SUM(${downloadQueue.downloadSpeed}), 0)`,
					avgProgress: sql<number>`COALESCE(AVG(CAST(${downloadQueue.progress} AS REAL)), 0)`,
					movingCount: count(sql`CASE WHEN ${downloadQueue.downloadSpeed} > 0 THEN 1 END`)
				})
				.from(downloadQueue)
				.where(eq(downloadQueue.status, 'downloading')),
			db
				.select({ count: count() })
				.from(downloadHistory)
				.where(
					and(
						eq(downloadHistory.status, 'imported'),
						sql`COALESCE(${downloadHistory.importedAt}, ${downloadHistory.completedAt}, ${downloadHistory.createdAt}) >= ${oneDayAgoIso}`
					)
				)
		]);
	const activeDownloads = downloadingDownloads?.[0]?.count || 0;
	const queuedDownloadCount = queuedDownloads?.[0]?.count || 0;
	const downloadSpeedBytes = Number(downloadThroughput?.[0]?.totalSpeed || 0);
	const downloadAvgProgress = Math.max(
		0,
		Math.min(100, Math.round(Number(downloadThroughput?.[0]?.avgProgress || 0) * 100))
	);
	const movingDownloads = downloadThroughput?.[0]?.movingCount || 0;
	const completedDownloadsLast24h = completedDownloads24h?.[0]?.count || 0;

	const [unmatchedCount] = await db.select({ count: count() }).from(unmatchedFiles);

	const [missingMovieRoots, missingSeriesRoots] = await Promise.all([
		db.select({ count: count() }).from(movies).where(sql`
			${movies.rootFolderId} IS NULL
			OR ${movies.rootFolderId} = ''
			OR ${movies.rootFolderId} = 'null'
			OR NOT EXISTS (
				SELECT 1 FROM ${rootFolders} rf WHERE rf.id = ${movies.rootFolderId}
			)
			OR EXISTS (
				SELECT 1 FROM ${rootFolders} rf
				WHERE rf.id = ${movies.rootFolderId} AND rf.media_type != 'movie'
			)
		`),
		db.select({ count: count() }).from(series).where(sql`
			${series.rootFolderId} IS NULL
			OR ${series.rootFolderId} = ''
			OR ${series.rootFolderId} = 'null'
			OR NOT EXISTS (
				SELECT 1 FROM ${rootFolders} rf WHERE rf.id = ${series.rootFolderId}
			)
			OR EXISTS (
				SELECT 1 FROM ${rootFolders} rf
				WHERE rf.id = ${series.rootFolderId} AND rf.media_type != 'tv'
			)
		`)
	]);

	return {
		movies: {
			total: movieStats?.total || 0,
			withFile: movieStats?.withFile || 0,
			missing: monitoredReleasedMissingMovies,
			unreleased: monitoredUnreleasedMovies,
			unmonitoredMissing: unmonitoredMissingMovies,
			monitored: movieStats?.monitored || 0
		},
		series: {
			total: seriesStats?.total || 0,
			monitored: seriesStats?.monitored || 0
		},
		episodes: {
			total: episodeStats?.total || 0,
			withFile: episodeStats?.withFile || 0,
			missing: airedMissingEpisodes?.[0]?.count || 0,
			unaired: unairedEpisodes?.[0]?.count || 0,
			unmonitoredMissing: unmonitoredAiredMissingEpisodes?.[0]?.count || 0,
			monitored: episodeStats?.monitored || 0
		},
		activeDownloads,
		queuedDownloads: queuedDownloadCount,
		downloadSpeedBytes,
		downloadAvgProgress,
		movingDownloads,
		completedDownloadsLast24h,
		unmatchedFiles: unmatchedCount?.count || 0,
		missingRootFolders: (missingMovieRoots?.[0]?.count || 0) + (missingSeriesRoots?.[0]?.count || 0)
	};
}

/**
 * Get recently added content
 */
async function getRecentlyAdded() {
	const recentlyAddedMovies = await db
		.select({
			id: movies.id,
			tmdbId: movies.tmdbId,
			title: movies.title,
			year: movies.year,
			posterPath: movies.posterPath,
			hasFile: movies.hasFile,
			monitored: movies.monitored,
			added: movies.added
		})
		.from(movies)
		.orderBy(desc(movies.added))
		.limit(6);
	const recentlyAddedMoviesWithAvailability =
		await enrichMoviesWithAvailability(recentlyAddedMovies);

	const recentlyAddedSeries = await db
		.select({
			id: series.id,
			tmdbId: series.tmdbId,
			title: series.title,
			year: series.year,
			posterPath: series.posterPath,
			episodeFileCount: series.episodeFileCount,
			episodeCount: series.episodeCount,
			added: series.added
		})
		.from(series)
		.orderBy(desc(series.added))
		.limit(6);

	const today = new Date().toISOString().split('T')[0];
	const recentlyAddedSeriesIds = recentlyAddedSeries.map((s) => s.id);
	const [recentRegularEpisodes, recentEpisodeFiles] =
		recentlyAddedSeriesIds.length > 0
			? await Promise.all([
					db
						.select({
							id: episodes.id,
							seriesId: episodes.seriesId
						})
						.from(episodes)
						.where(
							and(inArray(episodes.seriesId, recentlyAddedSeriesIds), ne(episodes.seasonNumber, 0))
						),
					db
						.select({
							seriesId: episodeFiles.seriesId,
							episodeIds: episodeFiles.episodeIds
						})
						.from(episodeFiles)
						.where(inArray(episodeFiles.seriesId, recentlyAddedSeriesIds))
				])
			: [[], []];
	const recentEpisodeIdToSeries = new Map(recentRegularEpisodes.map((ep) => [ep.id, ep.seriesId]));
	const recentEpisodeTotals = new Map<string, number>();
	for (const episode of recentRegularEpisodes) {
		recentEpisodeTotals.set(episode.seriesId, (recentEpisodeTotals.get(episode.seriesId) ?? 0) + 1);
	}
	const recentEpisodeFilesBySeries = new Map<string, Set<string>>();
	for (const file of recentEpisodeFiles) {
		const linkedEpisodeIds = (file.episodeIds as string[] | null) ?? [];
		if (linkedEpisodeIds.length === 0) continue;
		const seriesId = file.seriesId;
		let tracked = recentEpisodeFilesBySeries.get(seriesId);
		if (!tracked) {
			tracked = new Set<string>();
			recentEpisodeFilesBySeries.set(seriesId, tracked);
		}
		for (const episodeId of linkedEpisodeIds) {
			if (recentEpisodeIdToSeries.get(episodeId) === seriesId) {
				tracked.add(episodeId);
			}
		}
	}
	const recentlyAddedSeriesMissingCounts =
		recentlyAddedSeriesIds.length > 0
			? await db
					.select({
						seriesId: episodes.seriesId,
						count: count()
					})
					.from(episodes)
					.innerJoin(series, eq(episodes.seriesId, series.id))
					.where(
						and(
							inArray(episodes.seriesId, recentlyAddedSeriesIds),
							eq(episodes.hasFile, false),
							// Poster "missing" badge is actionable only: monitored series + monitored episode.
							eq(episodes.monitored, true),
							eq(series.monitored, true),
							ne(episodes.seasonNumber, 0),
							sql`${episodes.airDate} <= ${today}`
						)
					)
					.groupBy(episodes.seriesId)
			: [];
	const recentlyAddedSeriesMissingMap = new Map(
		recentlyAddedSeriesMissingCounts.map((row) => [row.seriesId, row.count])
	);
	const recentlyAddedSeriesWithMissing = recentlyAddedSeries.map((show) => ({
		...show,
		episodeCount: recentEpisodeTotals.get(show.id) ?? 0,
		episodeFileCount: recentEpisodeFilesBySeries.get(show.id)?.size ?? 0,
		airedMissingCount: recentlyAddedSeriesMissingMap.get(show.id) ?? 0
	}));

	return {
		movies: recentlyAddedMoviesWithAvailability,
		series: recentlyAddedSeriesWithMissing
	};
}

/**
 * Get missing episodes
 */
async function getMissingEpisodes() {
	const today = new Date().toISOString().split('T')[0];
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

	const missingEpisodes = await db
		.select({
			id: episodes.id,
			seriesId: episodes.seriesId,
			seasonNumber: episodes.seasonNumber,
			episodeNumber: episodes.episodeNumber,
			title: episodes.title,
			airDate: episodes.airDate
		})
		.from(episodes)
		.innerJoin(series, eq(episodes.seriesId, series.id))
		.where(
			and(
				eq(episodes.monitored, true),
				eq(episodes.hasFile, false),
				eq(series.monitored, true),
				gte(episodes.airDate, thirtyDaysAgo),
				sql`${episodes.airDate} <= ${today}`
			)
		)
		.orderBy(desc(episodes.airDate))
		.limit(10);

	const seriesIds = [...new Set(missingEpisodes.map((e) => e.seriesId))];
	const seriesInfo =
		seriesIds.length > 0
			? await db
					.select({
						id: series.id,
						title: series.title,
						posterPath: series.posterPath
					})
					.from(series)
					.where(inArray(series.id, seriesIds))
			: [];

	const seriesMap = new Map(seriesInfo.map((s) => [s.id, s]));

	return missingEpisodes.map((ep) => ({
		...ep,
		series: seriesMap.get(ep.seriesId) || null
	}));
}

/**
 * Get recent activity
 */
async function getRecentActivity(limit = 10): Promise<UnifiedActivity[]> {
	const result = await activityService.getActivities(
		{ status: 'all', mediaType: 'all', protocol: 'all' },
		{ field: 'time', direction: 'desc' },
		{ limit, offset: 0 }
	);
	return result.activities;
}

/**
 * Convert queue item to activity
 */
async function queueItemToActivity(item: QueueItem): Promise<Partial<UnifiedActivity>> {
	const mediaInfo = await mediaResolver.resolveDownloadMediaInfo({
		movieId: item.movieId,
		seriesId: item.seriesId,
		episodeIds: item.episodeIds,
		seasonNumber: item.seasonNumber
	});

	const status = mapQueueStatusToActivityStatus(item.status);

	const releaseGroup = extractReleaseGroup(item.title);

	return {
		id: `queue-${item.id}`,
		mediaType: mediaInfo.mediaType,
		mediaId: mediaInfo.mediaId,
		mediaTitle: mediaInfo.mediaTitle,
		mediaYear: mediaInfo.mediaYear,
		seriesTitle: mediaInfo.seriesTitle,
		seasonNumber: mediaInfo.seasonNumber,
		episodeNumber: mediaInfo.episodeNumber,
		releaseTitle: item.title,
		quality: item.quality ?? null,
		releaseGroup: releaseGroup?.group ?? null,
		size: item.size ?? null,
		indexerId: item.indexerId ?? null,
		indexerName: item.indexerName ?? null,
		protocol: (item.protocol as 'torrent' | 'usenet' | 'streaming') ?? null,
		status,
		statusReason: item.errorMessage ?? undefined,
		downloadProgress: Math.round((item.progress ?? 0) * 100),
		isUpgrade: item.isUpgrade ?? false,
		startedAt: item.addedAt,
		completedAt: item.completedAt ?? null,
		queueItemId: item.id
	};
}

/**
 * Server-Sent Events endpoint for real-time dashboard updates
 *
 * Events emitted:
 * - dashboard:initial - Full dashboard state on connect
 * - dashboard:stats - Stats update
 * - dashboard:recentlyAdded - Recently added content update
 * - dashboard:missingEpisodes - Missing episodes update
 * - activity:new - New activity
 * - activity:updated - Activity status change
 * - activity:progress - Activity progress update
 */
export const GET: RequestHandler = async () => {
	return createSSEStream((send) => {
		// Send initial state
		const sendInitialState = async () => {
			try {
				const [stats, recentlyAdded, missingEpisodes, recentActivity] = await Promise.all([
					getDashboardStats(),
					getRecentlyAdded(),
					getMissingEpisodes(),
					getRecentActivity()
				]);

				send('dashboard:initial', {
					stats,
					recentlyAdded,
					missingEpisodes,
					recentActivity
				});
			} catch {
				// Error fetching initial state
			}
		};

		// Send updated dashboard data (stats, recentlyAdded, missingEpisodes)
		const sendDashboardUpdate = async () => {
			try {
				const [stats, recentlyAdded, missingEpisodes] = await Promise.all([
					getDashboardStats(),
					getRecentlyAdded(),
					getMissingEpisodes()
				]);

				send('dashboard:stats', stats);
				send('dashboard:recentlyAdded', recentlyAdded);
				send('dashboard:missingEpisodes', missingEpisodes);
			} catch {
				// Error fetching dashboard data
			}
		};

		// Send initial state immediately
		sendInitialState();

		// Event handlers for download monitor
		const onQueueAdded = async (item: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(item);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:new', activity);
			} catch {
				// Error converting item
			}
		};

		const onQueueUpdated = async (item: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(item);
				if (!queueItem) return;
				send('activity:progress', {
					id: `queue-${queueItem.id}`,
					progress: Math.round((queueItem.progress ?? 0) * 100),
					status: mapQueueStatusToActivityStatus(queueItem.status)
				});
			} catch {
				// Error
			}
		};

		const onQueueImported = async (data: unknown) => {
			// Send activity update
			try {
				const queueItem = getQueueItemFromPayload(data);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:updated', { ...activity, status: 'imported' });
			} catch {
				// Error
			}

			// Update dashboard data
			await sendDashboardUpdate();
		};

		const onQueueFailed = async (data: unknown) => {
			try {
				const queueItem = getQueueItemFromPayload(data);
				if (!queueItem) return;
				const activity = await queueItemToActivity(queueItem);
				send('activity:updated', {
					...activity,
					status: 'failed',
					statusReason: getQueueErrorFromPayload(data) ?? activity.statusReason
				});
			} catch {
				// Error
			}
		};

		// Library scheduler events
		const onScanComplete = async () => {
			await sendDashboardUpdate();
		};

		// Disk scan events
		const onScanProgress = (progress: unknown) => {
			send('dashboard:scanProgress', progress);
		};

		// Register handlers
		downloadMonitor.on('queue:added', onQueueAdded);
		downloadMonitor.on('queue:updated', onQueueUpdated);
		downloadMonitor.on('queue:imported', onQueueImported);
		downloadMonitor.on('queue:failed', onQueueFailed);
		librarySchedulerService.on('scanComplete', onScanComplete);
		diskScanService.on('progress', onScanProgress);

		// Return cleanup function
		return () => {
			downloadMonitor.off('queue:added', onQueueAdded);
			downloadMonitor.off('queue:updated', onQueueUpdated);
			downloadMonitor.off('queue:imported', onQueueImported);
			downloadMonitor.off('queue:failed', onQueueFailed);
			librarySchedulerService.off('scanComplete', onScanComplete);
			diskScanService.off('progress', onScanProgress);
		};
	});
};
