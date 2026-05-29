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
import { createSSEOperationStream } from '$lib/server/sse';
import { db } from '$lib/server/db/index.js';
import { series, seasons, episodes, libraries } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
import { resolveProviderWithFallback } from '$lib/server/metadata/provider-resolution.js';
import { resolveAnimeProviderRef } from '$lib/server/metadata/provider-ref-resolver.js';
import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import {
	startRefresh,
	stopRefresh,
	isSeriesRefreshing
} from '$lib/server/library/ActiveSearchTracker.js';

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

	// Check if a refresh is already running for this series
	if (isSeriesRefreshing(id)) {
		error(409, 'A refresh is already in progress for this series');
	}

	// Track this refresh
	const refreshId = `series-refresh-${id}`;
	startRefresh(refreshId, { seriesId: id });

	return createSSEOperationStream(
		request,
		async ({ send, signal, isAborted }) => {
			const sendEvent = (event: SSEEvent) => {
				if (isAborted()) return;
				send(event.type, event);
			};

			try {
				// Fetch fresh data from TMDB
				const [tmdbSeries, externalIds] = await Promise.all([
					tmdb.getTVShow(seriesData.tmdbId),
					tmdb.getTvExternalIds(seriesData.tmdbId).catch(() => null)
				]);

				// Resolve configured metadata provider chain for textual anime metadata enrichment
				const [libraryRow] = seriesData.libraryId
					? await db
							.select({ metadataProvider: libraries.metadataProvider })
							.from(libraries)
							.where(eq(libraries.id, seriesData.libraryId))
							.limit(1)
					: [];
				const animeSignal = isLikelyAnimeMedia({
					genres: tmdbSeries.genres,
					originalLanguage: tmdbSeries.original_language,
					originCountries: tmdbSeries.origin_country,
					productionCountries: tmdbSeries.production_countries,
					title: tmdbSeries.name,
					originalTitle: tmdbSeries.original_name
				});
				const mediaType = seriesData.seriesType === 'anime' || animeSignal ? 'anime' : 'tv';
				const providerResolution = await resolveProviderWithFallback({
					mediaType,
					seriesProvider:
						(seriesData.metadataProvider as 'auto' | 'tmdb' | 'anilist' | 'mal') ?? 'auto',
					libraryProvider:
						(libraryRow?.metadataProvider as 'auto' | 'tmdb' | 'anilist' | 'mal') ?? 'auto'
				});

				const providerRefs = (seriesData.providerRefs ?? {}) as Record<string, string>;
				const pinnedExternal = seriesData.pinnedExternal as {
					provider: 'tmdb' | 'anilist' | 'mal';
					id: string;
				} | null;
				let resolvedProviderRef: string | undefined =
					pinnedExternal?.provider === providerResolution.selectedProviderId
						? pinnedExternal.id
						: providerRefs[providerResolution.selectedProviderId];
				let providerDetails: {
					id: string;
					title: string;
					originalTitle?: string;
					overview?: string;
					year?: number | null;
					genres?: string[];
					status?: string;
					studios?: string[];
				} | null = null;
				if (providerResolution.selectedProviderId !== 'tmdb') {
					if (!resolvedProviderRef) {
						resolvedProviderRef = await resolveAnimeProviderRef({
							providerId: providerResolution.selectedProviderId,
							title: tmdbSeries.name,
							aliases: [
								tmdbSeries.original_name ?? '',
								seriesData.title,
								seriesData.originalTitle ?? ''
							],
							year: tmdbSeries.first_air_date
								? parseInt(tmdbSeries.first_air_date.split('-')[0], 10)
								: seriesData.year
						});
					}

					if (resolvedProviderRef) {
						providerDetails = await providerResolution.provider.getDetails(
							resolvedProviderRef,
							mediaType
						);
					}
				}

				// Update series metadata
				await db
					.update(series)
					.set({
						posterPath: tmdbSeries.poster_path,
						backdropPath: tmdbSeries.backdrop_path,
						status: providerDetails?.status ?? tmdbSeries.status,
						network: providerDetails?.studios?.[0] ?? tmdbSeries.networks?.[0]?.name,
						metadataProvider:
							seriesData.metadataProvider ??
							(libraryRow?.metadataProvider as 'auto' | 'tmdb' | 'anilist' | 'mal') ??
							'auto',
						providerRefs:
							providerResolution.selectedProviderId !== 'tmdb' && resolvedProviderRef
								? {
										...providerRefs,
										[providerResolution.selectedProviderId]: resolvedProviderRef
									}
								: providerRefs,
						// Keep canonical identity from TMDB to avoid provider switches renaming media.
						title: tmdbSeries.name,
						originalTitle: tmdbSeries.original_name,
						overview: providerDetails?.overview ?? tmdbSeries.overview,
						year: tmdbSeries.first_air_date
							? parseInt(tmdbSeries.first_air_date.split('-')[0], 10)
							: seriesData.year,
						genres: providerDetails?.genres ?? tmdbSeries.genres?.map((g) => g.name),
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
						if (signal.aborted) {
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
							sendEvent({
								type: 'progress',
								seasonNumber: tmdbSeasonInfo.season_number,
								totalSeasons,
								message: `Refreshed season ${tmdbSeasonInfo.season_number} (${processedSeasons}/${totalSeasons})`
							});

							// Small delay to avoid rate limiting
							await new Promise((resolve) => setTimeout(resolve, 100));
						} catch {
							logger.warn(
								{
									seasonNumber: tmdbSeasonInfo.season_number
								},
								'[RefreshSeries] Failed to fetch season'
							);
						}
					}
				}

				// Update series episode counts (include specials if monitorSpecials is enabled)
				const allEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, id));
				const monitorSpecials = seriesData.monitorSpecials ?? false;
				const today = new Date().toISOString().split('T')[0];
				const isAired = (episode: typeof episodes.$inferSelect) =>
					episode.airDate && episode.airDate !== '' && episode.airDate <= today;

				const episodesForStats = allEpisodes.filter(
					(e) => isAired(e) && (monitorSpecials || e.seasonNumber !== 0)
				);
				const episodeCount = episodesForStats.length;
				const episodeFileCount = episodesForStats.filter((e) => e.hasFile).length;

				await db.update(series).set({ episodeCount, episodeFileCount }).where(eq(series.id, id));

				// Update each season's episode counts (only aired episodes)
				const seasonEpisodeCounts = new Map<string, { total: number; withFiles: number }>();
				for (const ep of allEpisodes) {
					if (!isAired(ep)) continue;
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
				sendEvent({
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
				sendEvent({
					type: 'error',
					message: err instanceof Error ? err.message : 'Failed to refresh series from TMDB'
				});
			} finally {
				stopRefresh(refreshId);
			}
		},
		{ heartbeatInterval: 25000 }
	);
};
