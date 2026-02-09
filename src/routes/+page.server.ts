import type { PageServerLoad } from './$types';
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
import { logger } from '$lib/logging';
import type { UnifiedActivity } from '$lib/types/activity';

/**
 * Terminal download statuses (items that are done processing)
 */
const TERMINAL_STATUSES = ['imported', 'removed'];

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

		// Get active and failed download counts
		const [activeDownloads, failedDownloads] = await Promise.all([
			db
				.select({ count: count() })
				.from(downloadQueue)
				.where(
					and(
						not(inArray(downloadQueue.status, TERMINAL_STATUSES)),
						not(eq(downloadQueue.status, 'failed'))
					)
				),
			db.select({ count: count() }).from(downloadQueue).where(eq(downloadQueue.status, 'failed'))
		]);

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

		// Get upcoming/missing episodes (aired but no file, for monitored series)
		const today = new Date().toISOString().split('T')[0];
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
				activeDownloads: activeDownloads?.[0]?.count || 0,
				failedDownloads: failedDownloads?.[0]?.count || 0,
				unmatchedFiles: unmatchedCount?.count || 0,
				missingRootFolders: Math.max(
					(missingMovieRoots?.[0]?.count || 0) + (missingSeriesRoots?.[0]?.count || 0),
					missingRootFolderFallback
				)
			},
			recentActivity,
			recentlyAdded: {
				movies: recentlyAddedMovies,
				series: recentlyAddedSeries
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
				movies: { total: 0, withFile: 0, missing: 0, monitored: 0 },
				series: { total: 0, monitored: 0 },
				episodes: { total: 0, withFile: 0, missing: 0, monitored: 0 },
				activeDownloads: 0,
				failedDownloads: 0,
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
