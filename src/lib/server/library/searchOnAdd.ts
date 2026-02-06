/**
 * Search On Add Service
 *
 * Handles automatic searching and grabbing when media is added to the library.
 * This mimics Radarr/Sonarr's "Search on Add" functionality.
 *
 * Now includes upgrade validation - will only grab releases that are:
 * 1. For missing content (no existing file)
 * 2. An upgrade over existing files (better quality/score)
 *
 * For bulk episode searches, uses CascadingSearchStrategy which:
 * - Tries season packs first when >= 50% of season is missing
 * - Tracks grabbed episodes to avoid duplicate searches
 * - Falls back to individual episode searches
 */

import { getIndexerManager } from '$lib/server/indexers/IndexerManager.js';
import {
	releaseDecisionService,
	getReleaseGrabService,
	getCascadingSearchStrategy,
	type EpisodeToSearch,
	type SeriesData as _SeriesData
} from '$lib/server/downloads/index.js';
import { logger } from '$lib/logging/index.js';
import { db } from '$lib/server/db/index.js';
import { movieFiles, series, episodes, episodeFiles } from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { SearchCriteria } from '$lib/server/indexers/types';

interface SearchForMovieParams {
	movieId: string;
	tmdbId: number;
	imdbId?: string | null;
	title: string;
	year?: number;
	scoringProfileId?: string;
}

interface SearchForSeriesParams {
	seriesId: string;
	tmdbId: number;
	tvdbId?: number | null;
	imdbId?: string | null;
	title: string;
	year?: number;
	scoringProfileId?: string;
	monitorType?:
		| 'all'
		| 'future'
		| 'missing'
		| 'existing'
		| 'firstSeason'
		| 'lastSeason'
		| 'recent'
		| 'pilot'
		| 'none';
}

interface GrabResult {
	success: boolean;
	releaseName?: string;
	error?: string;
	queueItemId?: string;
}

/** Parameters for searching a specific episode */
interface SearchForEpisodeParams {
	episodeId: string;
	/** Bypass monitoring checks for manual user-triggered searches */
	bypassMonitoring?: boolean;
}

/** Parameters for searching a season pack */
interface SearchForSeasonParams {
	seriesId: string;
	seasonNumber: number;
}

/** Result for a single item in multi-search operations */
interface AutoSearchItemResult {
	itemId: string;
	itemLabel: string;
	found: boolean;
	grabbed: boolean;
	releaseName?: string;
	error?: string;
	/** Whether this was grabbed via a season pack */
	wasPackGrab?: boolean;
}

/** Result for multi-search operations (missing, bulk) */
interface MultiSearchResult {
	results: AutoSearchItemResult[];
	summary: {
		searched: number;
		found: number;
		grabbed: number;
		/** Number of season packs grabbed */
		seasonPacksGrabbed?: number;
		/** Number of individual episodes grabbed (not via pack) */
		individualEpisodesGrabbed?: number;
	};
	/** Season packs that were grabbed */
	seasonPacks?: Array<{
		seasonNumber: number;
		releaseName: string;
		episodesCovered: string[];
	}>;
}

/**
 * Service for automatically searching and grabbing releases when media is added
 */
class SearchOnAddService {
	private readonly AUTO_GRAB_MIN_SCORE = 0; // Minimum score to auto-grab (0 = any passing release)

	/**
	 * Search for a movie and automatically grab the best release
	 * Now includes upgrade validation - only grabs if:
	 * - Movie has no file (missing content)
	 * - OR release is an upgrade over existing file
	 */
	async searchForMovie(params: SearchForMovieParams): Promise<GrabResult> {
		const { movieId, tmdbId, imdbId, title, year, scoringProfileId } = params;

		logger.info('[SearchOnAdd] Starting movie search', { movieId, tmdbId, title, year });

		try {
			// Check if movie already has a file
			const existingFile = await db.query.movieFiles.findFirst({
				where: eq(movieFiles.movieId, movieId)
			});

			const hasExistingFile = !!existingFile;
			logger.debug('[SearchOnAdd] Movie file status', { movieId, hasExistingFile });

			const indexerManager = await getIndexerManager();

			// Build search criteria
			const criteria: SearchCriteria = {
				searchType: 'movie',
				query: title,
				tmdbId,
				imdbId: imdbId ?? undefined,
				year
			};

			// Perform enriched search to get scored releases (automatic - on add)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info('[SearchOnAdd] Movie search completed', {
				movieId,
				totalResults: searchResult.releases.length,
				rejectedCount: searchResult.rejectedCount
			});

			// Log the top releases for debugging
			if (searchResult.releases.length > 0) {
				const topReleases = searchResult.releases.slice(0, 5).map((r) => ({
					title: r.title,
					totalScore: r.totalScore,
					resolution: r.parsed.resolution,
					source: r.parsed.source,
					codec: r.parsed.codec,
					size: r.size ? Math.round((r.size / 1024 / 1024 / 1024) * 10) / 10 + 'GB' : 'unknown'
				}));
				logger.info('[SearchOnAdd] Top 5 releases by score', { movieId, topReleases });
			}

			if (searchResult.releases.length === 0) {
				logger.info('[SearchOnAdd] No suitable releases found for movie', { movieId, title });
				return { success: false, error: 'No suitable releases found' };
			}

			const grabService = getReleaseGrabService();

			// If movie has existing file, filter to only upgrades
			if (hasExistingFile) {
				logger.info('[SearchOnAdd] Movie has existing file, checking for upgrades', { movieId });

				// Find the first release that qualifies as an upgrade
				for (const release of searchResult.releases) {
					const releaseInfo = {
						title: release.title,
						size: release.size,
						quality: {
							resolution: release.parsed.resolution ?? undefined,
							source: release.parsed.source ?? undefined,
							codec: release.parsed.codec ?? undefined,
							hdr: release.parsed.hdr ?? undefined
						},
						indexerId: release.indexerId,
						infoHash: release.infoHash,
						downloadUrl: release.downloadUrl,
						magnetUrl: release.magnetUrl
					};

					const decision = await releaseDecisionService.evaluateForMovie(movieId, releaseInfo);

					if (decision.accepted && decision.isUpgrade) {
						logger.info('[SearchOnAdd] Found upgrade release for movie', {
							movieId,
							release: release.title,
							scoreImprovement: decision.scoreImprovement
						});

						const grabResult = await grabService.grabRelease(release, {
							mediaType: 'movie',
							movieId,
							isAutomatic: true,
							isUpgrade: true
						});

						return {
							success: grabResult.success,
							releaseName: grabResult.releaseName,
							queueItemId: grabResult.queueItemId,
							error: grabResult.error
						};
					}
				}

				logger.info('[SearchOnAdd] No upgrades found for movie with existing file', { movieId });
				return { success: false, error: 'No upgrades found - existing file quality is sufficient' };
			}

			// No existing file - grab the top-ranked release
			const bestRelease = searchResult.releases[0];
			const grabResult = await grabService.grabRelease(bestRelease, {
				mediaType: 'movie',
				movieId,
				isAutomatic: true,
				isUpgrade: false
			});

			return {
				success: grabResult.success,
				releaseName: grabResult.releaseName,
				queueItemId: grabResult.queueItemId,
				error: grabResult.error
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SearchOnAdd] Movie search failed', { movieId, error: message });
			return { success: false, error: message };
		}
	}

	/**
	 * Search for a series and automatically grab releases for monitored episodes
	 *
	 * Now includes upgrade validation using series-level evaluation.
	 * Note: For initial add, we do a series-wide search to find season packs
	 * or recent episodes. For ongoing monitoring, episode-specific searches
	 * would be handled by a separate scheduler.
	 */
	async searchForSeries(params: SearchForSeriesParams): Promise<GrabResult> {
		const { seriesId, tmdbId, tvdbId, imdbId, title, year, scoringProfileId, monitorType } = params;

		logger.info('[SearchOnAdd] Starting series search', {
			seriesId,
			tmdbId,
			title,
			year,
			monitorType
		});

		// For 'none' monitor type, skip searching
		if (monitorType === 'none') {
			logger.info('[SearchOnAdd] Monitor type is none, skipping search', { seriesId });
			return { success: true };
		}

		try {
			const indexerManager = await getIndexerManager();

			// Build search criteria for the series
			// For TV, we search without specific season/episode to find season packs first
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: title,
				tmdbId,
				tvdbId: tvdbId ?? undefined,
				imdbId: imdbId ?? undefined
			};

			// Perform enriched search to get scored releases (automatic - on add)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info('[SearchOnAdd] Series search completed', {
				seriesId,
				totalResults: searchResult.releases.length,
				rejectedCount: searchResult.rejectedCount
			});

			if (searchResult.releases.length === 0) {
				logger.info('[SearchOnAdd] No suitable releases found for series', { seriesId, title });
				return { success: false, error: 'No suitable releases found' };
			}

			// For series, we might want different logic based on monitorType:
			// - 'all': Prefer complete series/season packs
			// - 'firstSeason', 'lastSeason': Look for specific season packs
			// - 'pilot': Look for S01E01
			// - 'future', 'missing', 'existing': Don't auto-grab on add, let scheduler handle
			// - 'recent': Don't auto-grab on add, let scheduler handle (depends on air dates)

			if (
				monitorType === 'future' ||
				monitorType === 'missing' ||
				monitorType === 'existing' ||
				monitorType === 'recent'
			) {
				// These types don't auto-grab on add - they're handled by ongoing monitoring
				logger.info('[SearchOnAdd] Monitor type defers to scheduler, not auto-grabbing', {
					seriesId,
					monitorType
				});
				return { success: true };
			}

			const grabService = getReleaseGrabService();

			// Use series-level evaluation to find acceptable release
			for (const release of searchResult.releases) {
				const releaseInfo = {
					title: release.title,
					size: release.size,
					quality: {
						resolution: release.parsed.resolution ?? undefined,
						source: release.parsed.source ?? undefined,
						codec: release.parsed.codec ?? undefined,
						hdr: release.parsed.hdr ?? undefined
					},
					indexerId: release.indexerId,
					infoHash: release.infoHash,
					downloadUrl: release.downloadUrl,
					magnetUrl: release.magnetUrl
				};

				const decision = await releaseDecisionService.evaluateForSeries(seriesId, releaseInfo);

				if (decision.accepted) {
					logger.info('[SearchOnAdd] Found acceptable release for series', {
						seriesId,
						release: release.title,
						isUpgrade: decision.isUpgrade,
						upgradeStats: decision.upgradeStats
					});

					const grabResult = await grabService.grabRelease(release, {
						mediaType: 'tv',
						seriesId,
						isAutomatic: true,
						isUpgrade: decision.isUpgrade
					});

					return {
						success: grabResult.success,
						releaseName: grabResult.releaseName,
						queueItemId: grabResult.queueItemId,
						error: grabResult.error
					};
				}
			}

			logger.info('[SearchOnAdd] No acceptable releases found for series', {
				seriesId,
				reason: 'No releases pass evaluation'
			});
			return { success: false, error: 'No releases found that meet upgrade requirements' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SearchOnAdd] Series search failed', { seriesId, error: message });
			return { success: false, error: message };
		}
	}

	/**
	 * Search for a specific episode and automatically grab the best release
	 * Now includes upgrade validation - only grabs if:
	 * - Episode has no file (missing content)
	 * - OR release is an upgrade over existing file
	 */
	async searchForEpisode(params: SearchForEpisodeParams): Promise<GrabResult> {
		const { episodeId, bypassMonitoring = false } = params;

		logger.info('[SearchOnAdd] Starting episode search', { episodeId });

		try {
			// Look up episode and series data
			const episode = await db.query.episodes.findFirst({
				where: eq(episodes.id, episodeId)
			});

			if (!episode) {
				return { success: false, error: 'Episode not found' };
			}

			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, episode.seriesId)
			});

			if (!seriesData) {
				return { success: false, error: 'Series not found' };
			}

			if (!bypassMonitoring && !seriesData.monitored) {
				logger.info('[SearchOnAdd] Skipping episode search for unmonitored series', {
					episodeId,
					seriesId: seriesData.id
				});
				return { success: true };
			}

			// Check if episode already has a file
			// Episode files use episodeIds array, so we need to check if our episode is in any file
			const allEpisodeFiles = await db.query.episodeFiles.findMany({
				where: eq(episodeFiles.seriesId, episode.seriesId)
			});
			const existingFile = allEpisodeFiles.find((f) => f.episodeIds?.includes(episodeId));

			const hasExistingFile = !!existingFile;
			logger.debug('[SearchOnAdd] Episode file status', { episodeId, hasExistingFile });

			const indexerManager = await getIndexerManager();

			// Build search criteria with season and episode number
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: episode.seasonNumber,
				episode: episode.episodeNumber
			};

			// Perform enriched search to get scored releases (automatic - on add)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info('[SearchOnAdd] Episode search completed', {
				episodeId,
				seasonNumber: episode.seasonNumber,
				episodeNumber: episode.episodeNumber,
				totalResults: searchResult.releases.length,
				rejectedCount: searchResult.rejectedCount
			});

			if (searchResult.releases.length === 0) {
				logger.info('[SearchOnAdd] No suitable releases found for episode', {
					episodeId,
					title: `${seriesData.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`
				});
				return { success: false, error: 'No suitable releases found' };
			}

			const grabService = getReleaseGrabService();

			// If episode has existing file, filter to only upgrades
			if (hasExistingFile) {
				logger.info('[SearchOnAdd] Episode has existing file, checking for upgrades', {
					episodeId
				});

				// Find the first release that qualifies as an upgrade
				for (const release of searchResult.releases) {
					const releaseInfo = {
						title: release.title,
						size: release.size,
						quality: {
							resolution: release.parsed.resolution ?? undefined,
							source: release.parsed.source ?? undefined,
							codec: release.parsed.codec ?? undefined,
							hdr: release.parsed.hdr ?? undefined
						},
						indexerId: release.indexerId,
						infoHash: release.infoHash,
						downloadUrl: release.downloadUrl,
						magnetUrl: release.magnetUrl
					};

					const decision = await releaseDecisionService.evaluateForEpisode(episodeId, releaseInfo);

					if (decision.accepted && decision.isUpgrade) {
						logger.info('[SearchOnAdd] Found upgrade release for episode', {
							episodeId,
							release: release.title,
							scoreImprovement: decision.scoreImprovement
						});

						const grabResult = await grabService.grabRelease(release, {
							mediaType: 'tv',
							seriesId: seriesData.id,
							episodeIds: [episodeId],
							seasonNumber: episode.seasonNumber,
							isAutomatic: true,
							isUpgrade: true
						});

						return {
							success: grabResult.success,
							releaseName: grabResult.releaseName,
							queueItemId: grabResult.queueItemId,
							error: grabResult.error
						};
					}
				}

				logger.info('[SearchOnAdd] No upgrades found for episode with existing file', {
					episodeId
				});
				return { success: false, error: 'No upgrades found - existing file quality is sufficient' };
			}

			// No existing file - grab the top-ranked release
			const bestRelease = searchResult.releases[0];
			const grabResult = await grabService.grabRelease(bestRelease, {
				mediaType: 'tv',
				seriesId: seriesData.id,
				episodeIds: [episodeId],
				seasonNumber: episode.seasonNumber,
				isAutomatic: true,
				isUpgrade: false
			});

			return {
				success: grabResult.success,
				releaseName: grabResult.releaseName,
				queueItemId: grabResult.queueItemId,
				error: grabResult.error
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SearchOnAdd] Episode search failed', { episodeId, error: message });
			return { success: false, error: message };
		}
	}

	/**
	 * Search for a season pack and automatically grab the best release
	 * Now includes upgrade validation - uses majority benefit rule:
	 * - Accepts if more episodes would be upgraded than downgraded
	 * - Counts new episodes (no file) as beneficial
	 */
	async searchForSeason(params: SearchForSeasonParams): Promise<GrabResult> {
		const { seriesId, seasonNumber } = params;

		logger.info('[SearchOnAdd] Starting season search', { seriesId, seasonNumber });

		try {
			// Look up series data
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId)
			});

			if (!seriesData) {
				return { success: false, error: 'Series not found' };
			}

			// Get season episodes for linking
			const seasonEpisodes = await db.query.episodes.findMany({
				where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber))
			});

			const indexerManager = await getIndexerManager();

			// Build search criteria with season only (no episode number = season pack search)
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: seasonNumber
			};

			// Perform enriched search to get scored releases (automatic - on add)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info('[SearchOnAdd] Season search completed', {
				seriesId,
				seasonNumber,
				totalResults: searchResult.releases.length,
				rejectedCount: searchResult.rejectedCount
			});

			if (searchResult.releases.length === 0) {
				logger.info('[SearchOnAdd] No suitable releases found for season', {
					seriesId,
					seasonNumber,
					title: `${seriesData.title} Season ${seasonNumber}`
				});
				return { success: false, error: 'No suitable releases found' };
			}

			const grabService = getReleaseGrabService();

			// Use season pack evaluation which checks majority benefit
			// Find the first release that passes the season pack validation
			for (const release of searchResult.releases) {
				const releaseInfo = {
					title: release.title,
					size: release.size,
					quality: {
						resolution: release.parsed.resolution ?? undefined,
						source: release.parsed.source ?? undefined,
						codec: release.parsed.codec ?? undefined,
						hdr: release.parsed.hdr ?? undefined
					},
					indexerId: release.indexerId,
					infoHash: release.infoHash,
					downloadUrl: release.downloadUrl,
					magnetUrl: release.magnetUrl
				};

				const decision = await releaseDecisionService.evaluateForSeason(
					seriesId,
					seasonNumber,
					releaseInfo
				);

				if (decision.accepted) {
					logger.info('[SearchOnAdd] Found acceptable release for season pack', {
						seriesId,
						seasonNumber,
						release: release.title,
						isUpgrade: decision.isUpgrade,
						upgradeStats: decision.upgradeStats
					});

					const grabResult = await grabService.grabRelease(release, {
						mediaType: 'tv',
						seriesId: seriesData.id,
						episodeIds: seasonEpisodes.map((e) => e.id),
						seasonNumber,
						isAutomatic: true,
						isUpgrade: decision.isUpgrade
					});

					return {
						success: grabResult.success,
						releaseName: grabResult.releaseName,
						queueItemId: grabResult.queueItemId,
						error: grabResult.error
					};
				}
			}

			logger.info('[SearchOnAdd] No acceptable releases found for season', {
				seriesId,
				seasonNumber,
				reason: 'No releases pass majority benefit rule'
			});
			return { success: false, error: 'No releases found that would benefit majority of episodes' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SearchOnAdd] Season search failed', {
				seriesId,
				seasonNumber,
				error: message
			});
			return { success: false, error: message };
		}
	}

	/**
	 * Search for all missing (monitored, aired, no file) episodes in a series.
	 * Uses CascadingSearchStrategy for smart pack-first searching.
	 */
	async searchForMissingEpisodes(seriesId: string): Promise<MultiSearchResult> {
		logger.info('[SearchOnAdd] Starting missing episodes search with cascading strategy', {
			seriesId
		});

		try {
			// Get series data first
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId)
			});

			if (!seriesData) {
				return {
					results: [],
					summary: { searched: 0, found: 0, grabbed: 0 }
				};
			}

			// Find all missing episodes: monitored, aired, and no file
			const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
			const missingEpisodes = await db.query.episodes.findMany({
				where: and(
					eq(episodes.seriesId, seriesId),
					eq(episodes.monitored, true),
					eq(episodes.hasFile, false)
				)
			});

			// Filter to only aired episodes
			const airedMissingEpisodes = missingEpisodes.filter((ep) => {
				if (!ep.airDate) return false;
				return ep.airDate <= now;
			});

			logger.info('[SearchOnAdd] Found missing episodes', {
				seriesId,
				total: missingEpisodes.length,
				aired: airedMissingEpisodes.length
			});

			if (airedMissingEpisodes.length === 0) {
				return {
					results: [],
					summary: { searched: 0, found: 0, grabbed: 0 }
				};
			}

			// Convert to EpisodeToSearch format
			const episodesToSearch: EpisodeToSearch[] = airedMissingEpisodes.map((ep) => ({
				id: ep.id,
				seriesId: ep.seriesId,
				seasonNumber: ep.seasonNumber,
				episodeNumber: ep.episodeNumber,
				hasFile: ep.hasFile,
				monitored: ep.monitored
			}));

			// Use cascading search strategy
			const cascadingStrategy = getCascadingSearchStrategy();
			const cascadeResult = await cascadingStrategy.searchEpisodes({
				seriesData: {
					id: seriesData.id,
					title: seriesData.title,
					tmdbId: seriesData.tmdbId,
					tvdbId: seriesData.tvdbId,
					imdbId: seriesData.imdbId,
					scoringProfileId: seriesData.scoringProfileId
				},
				episodes: episodesToSearch,
				scoringProfileId: seriesData.scoringProfileId ?? undefined,
				searchSource: 'interactive'
			});

			// Convert cascade results to AutoSearchItemResult format
			const results: AutoSearchItemResult[] = cascadeResult.results.map((r) => ({
				itemId: r.episodeId,
				itemLabel: r.episodeLabel,
				found: r.found,
				grabbed: r.grabbed,
				releaseName: r.releaseName,
				error: r.error,
				wasPackGrab: r.wasPackGrab
			}));

			logger.info('[SearchOnAdd] Missing episodes search completed', {
				seriesId,
				searched: cascadeResult.summary.searched,
				found: cascadeResult.summary.found,
				grabbed: cascadeResult.summary.grabbed,
				seasonPacksGrabbed: cascadeResult.summary.seasonPacksGrabbed,
				individualEpisodesGrabbed: cascadeResult.summary.individualEpisodesGrabbed
			});

			return {
				results,
				summary: {
					searched: cascadeResult.summary.searched,
					found: cascadeResult.summary.found,
					grabbed: cascadeResult.summary.grabbed,
					seasonPacksGrabbed: cascadeResult.summary.seasonPacksGrabbed,
					individualEpisodesGrabbed: cascadeResult.summary.individualEpisodesGrabbed
				},
				seasonPacks: cascadeResult.seasonPacks
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SearchOnAdd] Missing episodes search failed', { seriesId, error: message });
			return {
				results: [],
				summary: { searched: 0, found: 0, grabbed: 0 }
			};
		}
	}

	/**
	 * Search for a specific list of episodes (bulk selection).
	 * Uses CascadingSearchStrategy for smart pack-first searching.
	 */
	async searchBulkEpisodes(episodeIds: string[]): Promise<MultiSearchResult> {
		logger.info('[SearchOnAdd] Starting bulk episode search with cascading strategy', {
			count: episodeIds.length
		});

		if (episodeIds.length === 0) {
			return {
				results: [],
				summary: { searched: 0, found: 0, grabbed: 0 }
			};
		}

		try {
			// Load all episodes
			const allEpisodes = await db.query.episodes.findMany({
				where: inArray(episodes.id, episodeIds)
			});

			if (allEpisodes.length === 0) {
				return {
					results: [],
					summary: { searched: 0, found: 0, grabbed: 0 }
				};
			}

			// Group episodes by series
			const episodesBySeries = new Map<string, typeof allEpisodes>();
			for (const ep of allEpisodes) {
				const existing = episodesBySeries.get(ep.seriesId) || [];
				existing.push(ep);
				episodesBySeries.set(ep.seriesId, existing);
			}

			const allResults: AutoSearchItemResult[] = [];
			const allSeasonPacks: Array<{
				seasonNumber: number;
				releaseName: string;
				episodesCovered: string[];
			}> = [];
			let totalSearched = 0;
			let totalFound = 0;
			let totalGrabbed = 0;
			let totalPacksGrabbed = 0;
			let totalIndividualGrabbed = 0;

			const cascadingStrategy = getCascadingSearchStrategy();

			// Process each series separately
			for (const [seriesId, seriesEpisodes] of episodesBySeries) {
				// Get series data
				const seriesData = await db.query.series.findFirst({
					where: eq(series.id, seriesId)
				});

				if (!seriesData) {
					// Add error results for episodes from unknown series
					for (const ep of seriesEpisodes) {
						allResults.push({
							itemId: ep.id,
							itemLabel: `S${ep.seasonNumber.toString().padStart(2, '0')}E${ep.episodeNumber.toString().padStart(2, '0')}`,
							found: false,
							grabbed: false,
							error: 'Series not found'
						});
					}
					continue;
				}

				// Convert to EpisodeToSearch format
				const episodesToSearch: EpisodeToSearch[] = seriesEpisodes.map((ep) => ({
					id: ep.id,
					seriesId: ep.seriesId,
					seasonNumber: ep.seasonNumber,
					episodeNumber: ep.episodeNumber,
					hasFile: ep.hasFile,
					monitored: ep.monitored
				}));

				// Use cascading search for this series
				const cascadeResult = await cascadingStrategy.searchEpisodes({
					seriesData: {
						id: seriesData.id,
						title: seriesData.title,
						tmdbId: seriesData.tmdbId,
						tvdbId: seriesData.tvdbId,
						imdbId: seriesData.imdbId,
						scoringProfileId: seriesData.scoringProfileId
					},
					episodes: episodesToSearch,
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					searchSource: 'interactive'
				});

				// Convert and aggregate results
				for (const r of cascadeResult.results) {
					allResults.push({
						itemId: r.episodeId,
						itemLabel: r.episodeLabel,
						found: r.found,
						grabbed: r.grabbed,
						releaseName: r.releaseName,
						error: r.error,
						wasPackGrab: r.wasPackGrab
					});
				}

				allSeasonPacks.push(...cascadeResult.seasonPacks);
				totalSearched += cascadeResult.summary.searched;
				totalFound += cascadeResult.summary.found;
				totalGrabbed += cascadeResult.summary.grabbed;
				totalPacksGrabbed += cascadeResult.summary.seasonPacksGrabbed;
				totalIndividualGrabbed += cascadeResult.summary.individualEpisodesGrabbed;
			}

			logger.info('[SearchOnAdd] Bulk episode search completed', {
				searched: totalSearched,
				found: totalFound,
				grabbed: totalGrabbed,
				seasonPacksGrabbed: totalPacksGrabbed,
				individualEpisodesGrabbed: totalIndividualGrabbed
			});

			return {
				results: allResults,
				summary: {
					searched: totalSearched,
					found: totalFound,
					grabbed: totalGrabbed,
					seasonPacksGrabbed: totalPacksGrabbed,
					individualEpisodesGrabbed: totalIndividualGrabbed
				},
				seasonPacks: allSeasonPacks.length > 0 ? allSeasonPacks : undefined
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SearchOnAdd] Bulk episode search failed', { error: message });
			return {
				results: [],
				summary: { searched: 0, found: 0, grabbed: 0 }
			};
		}
	}
}

// Export singleton instance
export const searchOnAdd = new SearchOnAddService();

// Export types for API usage
export type { GrabResult, AutoSearchItemResult, MultiSearchResult };
