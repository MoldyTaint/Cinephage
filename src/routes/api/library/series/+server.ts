import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { series, seasons, episodes, rootFolders } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { z } from 'zod';
import { NamingService, type MediaNamingInfo } from '$lib/server/library/naming/NamingService.js';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService.js';
import {
	validateRootFolder,
	getEffectiveScoringProfileId,
	getLanguageProfileId,
	fetchSeriesDetails,
	fetchSeriesExternalIds,
	triggerSeriesSearch
} from '$lib/server/library/LibraryAddService.js';
import { fetchAndStoreSeriesAlternateTitles } from '$lib/server/services/AlternateTitleService.js';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';

/**
 * Schema for adding a series to the library
 */
const addSeriesSchema = z.object({
	tmdbId: z.number().int().positive(),
	rootFolderId: z.string().min(1),
	scoringProfileId: z.string().optional(),
	monitored: z.boolean().default(true),
	seasonFolder: z.boolean().default(true),
	seriesType: z.enum(['standard', 'anime', 'daily']).default('standard'),
	monitorType: z
		.enum([
			'all',
			'future',
			'missing',
			'existing',
			'firstSeason',
			'lastSeason',
			'recent',
			'pilot',
			'none'
		])
		.default('all'),
	monitorNewItems: z.enum(['all', 'none']).default('all'),
	monitorSpecials: z.boolean().default(false),
	monitoredSeasons: z.array(z.number().int()).optional(),
	searchOnAdd: z.boolean().default(true),
	wantsSubtitles: z.boolean().default(true)
});

/**
 * Generate a folder name for a series using the naming service
 * Uses database naming configuration instead of defaults
 */
function generateSeriesFolderName(title: string, year?: number, tvdbId?: number): string {
	const config = namingSettingsService.getConfigSync();
	const namingService = new NamingService(config);
	const info: MediaNamingInfo = {
		title,
		year,
		tvdbId
	};
	return namingService.generateSeriesFolderName(info);
}

/**
 * GET /api/library/series
 * List all series in the library
 */
export const GET: RequestHandler = async () => {
	try {
		const allSeries = await db
			.select({
				id: series.id,
				tmdbId: series.tmdbId,
				tvdbId: series.tvdbId,
				imdbId: series.imdbId,
				title: series.title,
				originalTitle: series.originalTitle,
				year: series.year,
				overview: series.overview,
				posterPath: series.posterPath,
				backdropPath: series.backdropPath,
				status: series.status,
				network: series.network,
				genres: series.genres,
				path: series.path,
				rootFolderId: series.rootFolderId,
				rootFolderPath: rootFolders.path,
				scoringProfileId: series.scoringProfileId,
				monitored: series.monitored,
				seasonFolder: series.seasonFolder,
				added: series.added,
				episodeCount: series.episodeCount,
				episodeFileCount: series.episodeFileCount
			})
			.from(series)
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id));

		// Calculate percentages and format data
		const seriesWithStats = allSeries.map((s) => ({
			...s,
			percentComplete:
				s.episodeCount && s.episodeCount > 0
					? Math.round(((s.episodeFileCount || 0) / s.episodeCount) * 100)
					: 0
		}));

		return json({
			success: true,
			series: seriesWithStats,
			total: seriesWithStats.length
		});
	} catch (error) {
		logger.error('[API] Error fetching series', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch series'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/library/series
 * Add a TV series to the library by TMDB ID
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const result = addSeriesSchema.safeParse(body);

		if (!result.success) {
			throw new ValidationError('Validation failed', {
				details: result.error.flatten()
			});
		}

		const {
			tmdbId,
			rootFolderId,
			scoringProfileId,
			monitored,
			seasonFolder,
			seriesType,
			monitorType,
			monitorNewItems,
			monitorSpecials,
			monitoredSeasons: selectedSeasons,
			searchOnAdd: shouldSearch,
			wantsSubtitles
		} = result.data;

		// Check if series already exists
		const existingSeries = await db
			.select({ id: series.id })
			.from(series)
			.where(eq(series.tmdbId, tmdbId))
			.limit(1);

		if (existingSeries.length > 0) {
			return json(
				{
					success: false,
					error: 'Series already exists in library',
					seriesId: existingSeries[0].id
				},
				{ status: 409 }
			);
		}

		// Verify root folder exists and is for TV (shared logic)
		await validateRootFolder(rootFolderId, 'tv');

		// Fetch series details from TMDB (shared logic with error handling)
		const tvDetails = await fetchSeriesDetails(tmdbId);

		// Extract external IDs (shared logic)
		const { imdbId, tvdbId } = await fetchSeriesExternalIds(tmdbId);

		// Generate folder path
		const year = tvDetails.first_air_date
			? new Date(tvDetails.first_air_date).getFullYear()
			: undefined;
		const folderName = generateSeriesFolderName(tvDetails.name, year, tvdbId ?? undefined);

		// Calculate total episode count (excluding specials/season 0)
		const totalEpisodes =
			tvDetails.seasons
				?.filter((s) => s.season_number !== 0)
				.reduce((sum, s) => sum + (s.episode_count ?? 0), 0) ?? 0;

		// Get the effective scoring profile (shared logic)
		const effectiveProfileId = await getEffectiveScoringProfileId(scoringProfileId);

		// Get the language profile if subtitles wanted (shared logic)
		const languageProfileId = await getLanguageProfileId(wantsSubtitles, tmdbId);

		// Insert series into database
		const [newSeries] = await db
			.insert(series)
			.values({
				tmdbId,
				tvdbId,
				imdbId,
				title: tvDetails.name,
				originalTitle: tvDetails.original_name,
				year,
				overview: tvDetails.overview,
				posterPath: tvDetails.poster_path,
				backdropPath: tvDetails.backdrop_path,
				status: tvDetails.status,
				network: tvDetails.networks?.[0]?.name ?? null,
				genres: tvDetails.genres?.map((g) => g.name) ?? [],
				path: folderName,
				rootFolderId,
				scoringProfileId: effectiveProfileId,
				monitored,
				monitorNewItems,
				monitorSpecials,
				seasonFolder,
				seriesType,
				episodeCount: totalEpisodes,
				episodeFileCount: 0,
				wantsSubtitles,
				languageProfileId
			})
			.returning();

		// Fetch and store alternate titles from TMDB (non-blocking)
		fetchAndStoreSeriesAlternateTitles(newSeries.id, tmdbId).catch((err) => {
			logger.warn('Failed to fetch alternate titles for series', {
				seriesId: newSeries.id,
				tmdbId,
				error: err instanceof Error ? err.message : String(err)
			});
		});

		// Insert seasons and episodes
		if (tvDetails.seasons && tvDetails.seasons.length > 0) {
			for (const s of tvDetails.seasons) {
				// Determine if this season should be monitored
				let shouldMonitorSeason = false;

				if (selectedSeasons && selectedSeasons.length > 0) {
					shouldMonitorSeason = selectedSeasons.includes(s.season_number);
				} else {
					// Check if this is specials (season 0) - respect monitorSpecials setting
					const isSpecials = s.season_number === 0;
					if (isSpecials && !monitorSpecials) {
						shouldMonitorSeason = false;
					} else {
						switch (monitorType) {
							case 'all':
								shouldMonitorSeason = s.season_number > 0 || monitorSpecials;
								break;
							case 'firstSeason':
								shouldMonitorSeason = s.season_number === 1;
								break;
							case 'lastSeason': {
								const maxSeasonNumber = Math.max(
									...tvDetails
										.seasons!.filter((ss) => ss.season_number > 0)
										.map((ss) => ss.season_number)
								);
								shouldMonitorSeason = s.season_number === maxSeasonNumber;
								break;
							}
							case 'recent':
								// For 'recent', monitor all non-specials seasons - episode filtering happens later
								shouldMonitorSeason = s.season_number > 0 || monitorSpecials;
								break;
							case 'none':
								shouldMonitorSeason = false;
								break;
							default:
								// For 'future', 'missing', 'existing', 'pilot' - episode filtering happens later
								shouldMonitorSeason = s.season_number > 0 || monitorSpecials;
								break;
						}
					}
				}

				// Insert the season
				const [newSeason] = await db
					.insert(seasons)
					.values({
						seriesId: newSeries.id,
						seasonNumber: s.season_number,
						monitored: shouldMonitorSeason,
						name: s.name,
						overview: s.overview,
						posterPath: s.poster_path,
						airDate: s.air_date,
						episodeCount: s.episode_count ?? 0,
						episodeFileCount: 0
					})
					.returning();

				// Fetch full season details to get episodes
				try {
					const fullSeason = await tmdb.getSeason(tmdbId, s.season_number);

					if (fullSeason.episodes && fullSeason.episodes.length > 0) {
						// Calculate cutoff date for 'recent' monitor type (90 days ago)
						const recentCutoffDate = new Date();
						recentCutoffDate.setDate(recentCutoffDate.getDate() - 90);
						const today = new Date();

						const episodeValues = fullSeason.episodes.map((ep) => {
							// Determine if this specific episode should be monitored
							let shouldMonitorEpisode = shouldMonitorSeason;

							if (shouldMonitorSeason && !selectedSeasons?.length) {
								const airDate = ep.air_date ? new Date(ep.air_date) : null;
								const hasAired = airDate ? airDate <= today : false;
								const isRecent = airDate ? airDate >= recentCutoffDate : false;

								switch (monitorType) {
									case 'pilot':
										// Only monitor S01E01
										shouldMonitorEpisode = ep.season_number === 1 && ep.episode_number === 1;
										break;
									case 'future':
										// Only monitor episodes that haven't aired yet
										shouldMonitorEpisode = !hasAired;
										break;
									case 'recent':
										// Monitor episodes from last 90 days + future episodes
										shouldMonitorEpisode = !hasAired || isRecent;
										break;
									case 'missing':
									case 'existing':
										// These are handled at search time based on hasFile status
										shouldMonitorEpisode = shouldMonitorSeason;
										break;
									default:
										shouldMonitorEpisode = shouldMonitorSeason;
										break;
								}
							}

							return {
								seriesId: newSeries.id,
								seasonId: newSeason.id,
								tmdbId: ep.id,
								seasonNumber: ep.season_number,
								episodeNumber: ep.episode_number,
								title: ep.name,
								overview: ep.overview,
								airDate: ep.air_date,
								runtime: ep.runtime,
								monitored: shouldMonitorEpisode,
								hasFile: false
							};
						});

						await db.insert(episodes).values(episodeValues);
					}

					// Small delay to avoid TMDB rate limiting
					await new Promise((resolve) => setTimeout(resolve, 50));
				} catch {
					logger.warn('[API] Failed to fetch episodes for season', {
						seasonNumber: s.season_number
					});
				}
			}
		}

		// Trigger search if requested and series is monitored (shared logic)
		let searchTriggered = false;
		if (shouldSearch && monitored && monitorType !== 'none') {
			const searchResult = await triggerSeriesSearch({
				seriesId: newSeries.id,
				tmdbId,
				title: tvDetails.name
			});
			searchTriggered = searchResult.triggered;
		}

		return json({
			success: true,
			series: {
				id: newSeries.id,
				tmdbId: newSeries.tmdbId,
				title: newSeries.title,
				year: newSeries.year,
				path: newSeries.path,
				monitored: newSeries.monitored,
				episodeCount: newSeries.episodeCount,
				searchTriggered
			}
		});
	} catch (error) {
		logger.error('[API] Error adding series', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add series'
			},
			{ status: 500 }
		);
	}
};
