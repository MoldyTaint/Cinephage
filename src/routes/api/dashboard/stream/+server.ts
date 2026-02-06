import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { librarySchedulerService } from '$lib/server/library/library-scheduler';
import { diskScanService } from '$lib/server/library/disk-scan';
import { db } from '$lib/server/db';
import {
	movies,
	series,
	episodes,
	downloadQueue,
	unmatchedFiles,
	rootFolders
} from '$lib/server/db/schema';
import { count, eq, desc, and, not, inArray, sql, gte } from 'drizzle-orm';
import { activityService, mediaResolver } from '$lib/server/activity';
import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import type { UnifiedActivity, ActivityStatus } from '$lib/types/activity';
import type { RequestHandler } from '@sveltejs/kit';

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

const TERMINAL_STATUSES = ['imported', 'removed'];

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

	const [activeDownloads] = await db
		.select({ count: count() })
		.from(downloadQueue)
		.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

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
			missing: (movieStats?.total || 0) - (movieStats?.withFile || 0),
			monitored: movieStats?.monitored || 0
		},
		series: {
			total: seriesStats?.total || 0,
			monitored: seriesStats?.monitored || 0
		},
		episodes: {
			total: episodeStats?.total || 0,
			withFile: episodeStats?.withFile || 0,
			missing: (episodeStats?.total || 0) - (episodeStats?.withFile || 0),
			monitored: episodeStats?.monitored || 0
		},
		activeDownloads: activeDownloads?.count || 0,
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
			added: movies.added
		})
		.from(movies)
		.orderBy(desc(movies.added))
		.limit(6);

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

	return {
		movies: recentlyAddedMovies,
		series: recentlyAddedSeries
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

	let status: ActivityStatus = 'downloading';
	if (item.status === 'failed') status = 'failed';
	else if (item.status === 'imported') status = 'imported';
	else if (item.status === 'removed') status = 'removed';

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
				const activity = await queueItemToActivity(item as QueueItem);
				send('activity:new', activity);
			} catch {
				// Error converting item
			}
		};

		const onQueueUpdated = async (item: unknown) => {
			try {
				const typedItem = item as QueueItem;
				send('activity:progress', {
					id: `queue-${typedItem.id}`,
					progress: Math.round((typedItem.progress ?? 0) * 100),
					status: typedItem.status
				});
			} catch {
				// Error
			}
		};

		const onQueueImported = async (_data: unknown) => {
			// Send activity update
			try {
				const typedData = _data as { queueItem: QueueItem };
				const activity = await queueItemToActivity(typedData.queueItem);
				send('activity:updated', { ...activity, status: 'imported' });
			} catch {
				// Error
			}

			// Update dashboard data
			await sendDashboardUpdate();
		};

		const onQueueFailed = async (_data: unknown) => {
			try {
				const typedData = _data as { queueItem: QueueItem; error: string };
				const activity = await queueItemToActivity(typedData.queueItem);
				send('activity:updated', {
					...activity,
					status: 'failed',
					statusReason: typedData.error
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
