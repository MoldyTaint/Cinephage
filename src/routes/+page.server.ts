import type { PageServerLoad } from './$types';
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
import { logger } from '$lib/logging';
import type { UnifiedActivity } from '$lib/types/activity';
import {
	computeMissingMovieAvailabilityCounts,
	enrichMoviesWithAvailability
} from '$lib/server/dashboard/movie-availability';

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		// Get library stats
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

		// Download card metrics (actionable only)
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

		// Get unmatched files count
		const [unmatchedCount] = await db.select({ count: count() }).from(unmatchedFiles);

		// Get missing root folder count (movies + series)
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

		let missingRootFolderFallback = 0;
		try {
			const issuesUrl = new URL('/api/library/unmatched', url.origin);
			const issuesResponse = await fetch(issuesUrl.toString());
			if (issuesResponse.ok) {
				const issuesData = await issuesResponse.json();
				missingRootFolderFallback =
					issuesData.libraryItemTotal ??
					(Array.isArray(issuesData.libraryItems) ? issuesData.libraryItems.length : 0);
			}
		} catch (error) {
			logger.warn('[Dashboard] Failed to fetch library issues count', {
				error: error instanceof Error ? error.message : String(error)
			});
		}

		// Get recent activity - consolidated from activity API
		let recentActivity: UnifiedActivity[] = [];
		try {
			const activityUrl = new URL('/api/activity', url.origin);
			activityUrl.searchParams.set('limit', '10');
			const activityResponse = await fetch(activityUrl.toString());
			const activityData = await activityResponse.json();
			if (activityData.success && activityData.activities) {
				recentActivity = activityData.activities;
			}
		} catch (activityError) {
			logger.error(
				'[Dashboard] Error fetching activity',
				activityError instanceof Error ? activityError : undefined
			);
		}

		// Get recently added to library
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
								and(
									inArray(episodes.seriesId, recentlyAddedSeriesIds),
									ne(episodes.seasonNumber, 0)
								)
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
		const recentEpisodeIdToSeries = new Map(
			recentRegularEpisodes.map((ep) => [ep.id, ep.seriesId])
		);
		const recentEpisodeTotals = new Map<string, number>();
		for (const episode of recentRegularEpisodes) {
			recentEpisodeTotals.set(
				episode.seriesId,
				(recentEpisodeTotals.get(episode.seriesId) ?? 0) + 1
			);
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

		// Get missing episodes (aired but no file, for monitored series)
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
			.toISOString()
			.split('T')[0];

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

		// Enrich missing episodes with series info
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

		const missingEpisodesWithSeries = missingEpisodes.map((ep) => ({
			...ep,
			series: seriesMap.get(ep.seriesId) || null
		}));

		return {
			stats: {
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
				missingRootFolders: Math.max(
					(missingMovieRoots?.[0]?.count || 0) + (missingSeriesRoots?.[0]?.count || 0),
					missingRootFolderFallback
				)
			},
			recentActivity,
			recentlyAdded: {
				movies: recentlyAddedMoviesWithAvailability,
				series: recentlyAddedSeriesWithMissing
			},
			missingEpisodes: missingEpisodesWithSeries
		};
	} catch (error) {
		logger.error(
			'[Dashboard] Error loading dashboard data',
			error instanceof Error ? error : undefined
		);
		return {
			stats: {
				movies: {
					total: 0,
					withFile: 0,
					missing: 0,
					unreleased: 0,
					unmonitoredMissing: 0,
					monitored: 0
				},
				series: { total: 0, monitored: 0 },
				episodes: {
					total: 0,
					withFile: 0,
					missing: 0,
					unaired: 0,
					unmonitoredMissing: 0,
					monitored: 0
				},
				activeDownloads: 0,
				queuedDownloads: 0,
				downloadSpeedBytes: 0,
				downloadAvgProgress: 0,
				movingDownloads: 0,
				completedDownloadsLast24h: 0,
				unmatchedFiles: 0,
				missingRootFolders: 0
			},
			recentActivity: [] as UnifiedActivity[],
			recentlyAdded: {
				movies: [],
				series: []
			},
			missingEpisodes: [],
			error: 'Failed to load dashboard data'
		};
	}
};
