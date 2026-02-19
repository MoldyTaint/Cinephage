/**
 * Refresh Series API
 *
 * POST /api/library/series/[id]/refresh
 * Refreshes series metadata and populates all seasons/episodes from TMDB
 *
 * Returns a Server-Sent Events stream with progress updates to keep the
 * connection alive for long-running operations (prevents 502 through reverse proxies)
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index.js';
import { series, seasons, episodes } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';

interface ProgressEvent {
	type: 'progress';
	seasonNumber: number;
	totalSeasons: number;
	message: string;
}

interface CompleteEvent {
	type: 'complete';
	success: true;
	episodeCount: number;
	episodeFileCount: number;
}

interface ErrorEvent {
	type: 'error';
	message: string;
}

type SSEEvent = ProgressEvent | CompleteEvent | ErrorEvent;

export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	// Get the series
	const [seriesData] = await db.select().from(series).where(eq(series.id, id));

	if (!seriesData) {
		error(404, 'Series not found');
	}

	// Create a streaming response
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const send = (event: SSEEvent) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event.type}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// Controller may be closed
				}
			};

			// Heartbeat to keep connection alive (every 25 seconds)
			const heartbeatInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`: heartbeat\n\n`));
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 25000);

			// Cleanup on abort
			request.signal.addEventListener('abort', () => {
				clearInterval(heartbeatInterval);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});

			try {
				// Fetch fresh data from TMDB
				const [tmdbSeries, externalIds] = await Promise.all([
					tmdb.getTVShow(seriesData.tmdbId),
					tmdb.getTvExternalIds(seriesData.tmdbId).catch(() => null)
				]);

				// Update series metadata
				await db
					.update(series)
					.set({
						title: tmdbSeries.name,
						originalTitle: tmdbSeries.original_name,
						overview: tmdbSeries.overview,
						posterPath: tmdbSeries.poster_path,
						backdropPath: tmdbSeries.backdrop_path,
						status: tmdbSeries.status,
						network: tmdbSeries.networks?.[0]?.name,
						genres: tmdbSeries.genres?.map((g) => g.name),
						tvdbId: externalIds?.tvdb_id || seriesData.tvdbId,
						imdbId: externalIds?.imdb_id || seriesData.imdbId
					})
					.where(eq(series.id, id));

				// Get existing seasons and episodes to preserve file associations
				const existingSeasons = await db.select().from(seasons).where(eq(seasons.seriesId, id));
				const existingEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, id));

				// Create maps for quick lookup
				const seasonMap = new Map(existingSeasons.map((s) => [s.seasonNumber, s]));
				const episodeMap = new Map(
					existingEpisodes.map((e) => [`${e.seasonNumber}-${e.episodeNumber}`, e])
				);

				// Process each season from TMDB
				const totalSeasons = tmdbSeries.seasons?.length ?? 0;
				let processedSeasons = 0;

				if (tmdbSeries.seasons) {
					for (const tmdbSeasonInfo of tmdbSeries.seasons) {
						// Check if request was aborted
						if (request.signal.aborted) {
							clearInterval(heartbeatInterval);
							return;
						}

						try {
							// Fetch full season details
							const tmdbSeason = await tmdb.getSeason(
								seriesData.tmdbId,
								tmdbSeasonInfo.season_number
							);

							const existingSeason = seasonMap.get(tmdbSeasonInfo.season_number);
							let seasonId: string;
							let seasonMonitored: boolean;

							if (existingSeason) {
								// Update existing season
								seasonId = existingSeason.id;
								// Default to true for non-specials if monitored is null
								seasonMonitored = existingSeason.monitored ?? tmdbSeasonInfo.season_number !== 0;
								await db
									.update(seasons)
									.set({
										name: tmdbSeason.name || tmdbSeasonInfo.name,
										overview: tmdbSeason.overview || tmdbSeasonInfo.overview,
										posterPath: tmdbSeason.poster_path || tmdbSeasonInfo.poster_path,
										airDate: tmdbSeason.air_date || tmdbSeasonInfo.air_date,
										episodeCount: tmdbSeason.episodes?.length ?? tmdbSeasonInfo.episode_count ?? 0
									})
									.where(eq(seasons.id, seasonId));
							} else {
								// Create new season - respect monitorNewItems setting
								const isSpecials = tmdbSeasonInfo.season_number === 0;
								const monitorSpecials = seriesData.monitorSpecials ?? false;
								seasonMonitored =
									seriesData.monitorNewItems === 'all' ? !isSpecials || monitorSpecials : false;

								const [newSeason] = await db
									.insert(seasons)
									.values({
										seriesId: id,
										seasonNumber: tmdbSeasonInfo.season_number,
										name: tmdbSeason.name || tmdbSeasonInfo.name,
										overview: tmdbSeason.overview || tmdbSeasonInfo.overview,
										posterPath: tmdbSeason.poster_path || tmdbSeasonInfo.poster_path,
										airDate: tmdbSeason.air_date || tmdbSeasonInfo.air_date,
										episodeCount: tmdbSeason.episodes?.length ?? tmdbSeasonInfo.episode_count ?? 0,
										episodeFileCount: 0,
										monitored: seasonMonitored
									})
									.returning();
								seasonId = newSeason.id;
							}

							// Process episodes
							if (tmdbSeason.episodes) {
								for (const ep of tmdbSeason.episodes) {
									const key = `${ep.season_number}-${ep.episode_number}`;
									const existingEpisode = episodeMap.get(key);

									if (existingEpisode) {
										// Update existing episode (preserve hasFile and monitored)
										await db
											.update(episodes)
											.set({
												tmdbId: ep.id,
												title: ep.name,
												overview: ep.overview,
												airDate: ep.air_date,
												runtime: ep.runtime,
												seasonId: seasonId
											})
											.where(eq(episodes.id, existingEpisode.id));
									} else {
										// Create new episode - respect monitorNewItems setting
										// New episodes inherit monitored status from their season,
										// but only if monitorNewItems is 'all'
										const shouldMonitorNewEpisode =
											seriesData.monitorNewItems === 'all' ? seasonMonitored : false;

										await db.insert(episodes).values({
											seriesId: id,
											seasonId,
											tmdbId: ep.id,
											seasonNumber: ep.season_number,
											episodeNumber: ep.episode_number,
											title: ep.name,
											overview: ep.overview,
											airDate: ep.air_date,
											runtime: ep.runtime,
											monitored: shouldMonitorNewEpisode,
											hasFile: false
										});
									}
								}
							}

							processedSeasons++;

							// Send progress event
							send({
								type: 'progress',
								seasonNumber: tmdbSeasonInfo.season_number,
								totalSeasons,
								message: `Refreshed season ${tmdbSeasonInfo.season_number} (${processedSeasons}/${totalSeasons})`
							});

							// Small delay to avoid rate limiting
							await new Promise((resolve) => setTimeout(resolve, 100));
						} catch {
							logger.warn('[RefreshSeries] Failed to fetch season', {
								seasonNumber: tmdbSeasonInfo.season_number
							});
						}
					}
				}

				// Update series episode counts (excluding specials/season 0)
				const allEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, id));
				const regularEpisodes = allEpisodes.filter((e) => e.seasonNumber !== 0);
				const episodeCount = regularEpisodes.length;
				const episodeFileCount = regularEpisodes.filter((e) => e.hasFile).length;

				await db.update(series).set({ episodeCount, episodeFileCount }).where(eq(series.id, id));

				// Update each season's episode counts
				const seasonEpisodeCounts = new Map<string, { total: number; withFiles: number }>();
				for (const ep of allEpisodes) {
					if (ep.seasonId) {
						const current = seasonEpisodeCounts.get(ep.seasonId) || { total: 0, withFiles: 0 };
						current.total++;
						if (ep.hasFile) current.withFiles++;
						seasonEpisodeCounts.set(ep.seasonId, current);
					}
				}

				for (const [seasonId, counts] of seasonEpisodeCounts) {
					await db
						.update(seasons)
						.set({
							episodeCount: counts.total,
							episodeFileCount: counts.withFiles
						})
						.where(eq(seasons.id, seasonId));
				}

				libraryMediaEvents.emitSeriesUpdated(id);

				// Send completion event
				send({
					type: 'complete',
					success: true,
					episodeCount,
					episodeFileCount
				});
			} catch (err) {
				logger.error(
					'[RefreshSeries] Failed to refresh series',
					err instanceof Error ? err : undefined
				);
				send({
					type: 'error',
					message: err instanceof Error ? err.message : 'Failed to refresh series from TMDB'
				});
			} finally {
				clearInterval(heartbeatInterval);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};
