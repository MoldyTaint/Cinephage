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
	type EpisodeToSearch,
	type SeriesData as _SeriesData
} from '$lib/server/downloads/index.js';
import { logger } from '$lib/logging/index.js';
import { db } from '$lib/server/db/index.js';
import { movieFiles, series, episodes, episodeFiles } from '$lib/server/db/schema.js';
import { eq, and, inArray, ne } from 'drizzle-orm';
import {
	CINEPHAGE_STREAM_DEFINITION_ID,
	indexerHasCategoriesForSearchType,
	type IndexerCapabilities,
	type IndexerConfig,
	type SearchCriteria
} from '$lib/server/indexers/types';
import { evaluateIndexerSearchAvailability } from '$lib/server/indexers/search/availability';
import {
	getMovieSearchTitles,
	getSeriesSearchTitles,
	fetchAndStoreMovieAlternateTitles,
	fetchAndStoreSeriesAlternateTitles
} from '$lib/server/services/AlternateTitleService.js';

interface SearchForMovieParams {
	movieId: string;
	tmdbId: number;
	imdbId?: string | null;
	title: string;
	year?: number;
	scoringProfileId?: string;
	/** Bypass monitoring checks for manual user-triggered searches */
	bypassMonitoring?: boolean;
	/** Optional progress callback for real-time updates */
	onProgress?: (
		phase: string,
		message: string,
		progress?: { current: number; total: number }
	) => void;
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
	/** Bypass monitoring checks for manual user-triggered searches */
	bypassMonitoring?: boolean;
}

interface SearchForMissingEpisodesOptions {
	/** Bypass monitoring checks for manual user-triggered searches */
	bypassMonitoring?: boolean;
	/**
	 * Search strategy for missing episodes.
	 * - 'pack-first': complete/multi-season/single-season packs, then episodes
	 * - 'episode-only': targeted episode searches, but if an entire aired season is missing
	 *   we attempt a single-season pack grab first
	 * - 'auto': use episode-only only when RuTracker/Kinozal is the sole eligible TV indexer
	 */
	searchStrategy?: 'pack-first' | 'episode-only' | 'auto';
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
	error?: string;
	/** Additional operational errors collected during fallback attempts */
	errors?: string[];
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
	private readonly ALT_TITLE_REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
	private readonly ALT_TITLE_REFRESH_CACHE_MAX_ENTRIES = 2000;
	private readonly movieAltTitleRefreshAttempts = new Map<string, number>();
	private readonly seriesAltTitleRefreshAttempts = new Map<string, number>();

	private shouldExposeOperationalError(error: string | undefined): boolean {
		if (!error) return false;
		const normalized = error.trim().toLowerCase();
		if (!normalized) return false;

		// These are expected "no match" outcomes, not actionable operational failures.
		return !(
			normalized.includes('no suitable releases found') ||
			normalized.includes('no upgrades found') ||
			normalized.includes('no releases found that')
		);
	}

	private pruneAltTitleRefreshCache(cache: Map<string, number>, now: number): void {
		if (cache.size <= this.ALT_TITLE_REFRESH_CACHE_MAX_ENTRIES) {
			return;
		}

		// Remove expired entries first
		for (const [mediaId, attemptedAt] of cache.entries()) {
			if (now - attemptedAt >= this.ALT_TITLE_REFRESH_COOLDOWN_MS) {
				cache.delete(mediaId);
			}
		}

		if (cache.size <= this.ALT_TITLE_REFRESH_CACHE_MAX_ENTRIES) {
			return;
		}

		// If still oversized, drop oldest entries
		const overflow = cache.size - this.ALT_TITLE_REFRESH_CACHE_MAX_ENTRIES;
		let removed = 0;
		for (const mediaId of cache.keys()) {
			cache.delete(mediaId);
			removed++;
			if (removed >= overflow) {
				break;
			}
		}
	}

	private shouldAttemptAltTitleRefresh(cache: Map<string, number>, mediaId: string): boolean {
		const now = Date.now();
		const previousAttempt = cache.get(mediaId);
		if (
			typeof previousAttempt === 'number' &&
			now - previousAttempt < this.ALT_TITLE_REFRESH_COOLDOWN_MS
		) {
			return false;
		}

		cache.set(mediaId, now);
		this.pruneAltTitleRefreshCache(cache, now);
		return true;
	}

	/**
	 * Test-only helper to reset in-memory refresh guards between test cases.
	 */
	resetAlternateTitleRefreshAttemptCacheForTests(): void {
		if (process.env.NODE_ENV !== 'test') {
			return;
		}
		this.movieAltTitleRefreshAttempts.clear();
		this.seriesAltTitleRefreshAttempts.clear();
	}

	private async getMovieSearchTitlesWithRefresh(
		movieId: string,
		tmdbId?: number
	): Promise<string[]> {
		let titles = await getMovieSearchTitles(movieId);
		if (tmdbId && titles.length <= 1) {
			if (this.shouldAttemptAltTitleRefresh(this.movieAltTitleRefreshAttempts, movieId)) {
				await fetchAndStoreMovieAlternateTitles(movieId, tmdbId);
				titles = await getMovieSearchTitles(movieId);
			} else {
				logger.debug(
					{ movieId, tmdbId },
					'[SearchOnAdd] Skipping movie alternate title refresh during cooldown'
				);
			}
		}
		return titles;
	}

	private async getSeriesSearchTitlesWithRefresh(
		seriesId: string,
		tmdbId?: number
	): Promise<string[]> {
		let titles = await getSeriesSearchTitles(seriesId);
		if (tmdbId && titles.length <= 1) {
			if (this.shouldAttemptAltTitleRefresh(this.seriesAltTitleRefreshAttempts, seriesId)) {
				await fetchAndStoreSeriesAlternateTitles(seriesId, tmdbId);
				titles = await getSeriesSearchTitles(seriesId);
			} else {
				logger.debug(
					{ seriesId, tmdbId },
					'[SearchOnAdd] Skipping series alternate title refresh during cooldown'
				);
			}
		}
		return titles;
	}

	/**
	 * Search for a movie and automatically grab the best release
	 * Now includes upgrade validation - only grabs if:
	 * - Movie has no file (missing content)
	 * - OR release is an upgrade over existing file
	 */
	async searchForMovie(params: SearchForMovieParams): Promise<GrabResult> {
		const {
			movieId,
			tmdbId,
			imdbId,
			title,
			year,
			scoringProfileId,
			bypassMonitoring = false,
			onProgress
		} = params;

		logger.info({ movieId, tmdbId, title, year }, '[SearchOnAdd] Starting movie search');

		// Report initial progress
		onProgress?.('initializing', `Starting search for "${title}"...`, { current: 0, total: 100 });

		try {
			// Check if movie already has a file
			onProgress?.('checking', 'Checking existing files...', { current: 5, total: 100 });

			const existingFile = await db.query.movieFiles.findFirst({
				where: eq(movieFiles.movieId, movieId)
			});

			const hasExistingFile = !!existingFile;
			logger.debug({ movieId, hasExistingFile }, '[SearchOnAdd] Movie file status');

			const indexerManager = await getIndexerManager();
			const searchSource: 'interactive' | 'automatic' = bypassMonitoring
				? 'interactive'
				: 'automatic';
			const indexerAvailability = evaluateIndexerSearchAvailability(
				await indexerManager.getIndexers(),
				{
					searchType: 'movie',
					searchSource,
					scoringProfileId,
					getDefinitionCapabilities: (definitionId) =>
						indexerManager.getDefinitionCapabilities(definitionId)
				}
			);

			if (!indexerAvailability.ok) {
				const errorMessage = indexerAvailability.message || 'No indexers are available';
				logger.info(
					{
						movieId,
						code: indexerAvailability.code,
						message: errorMessage
					},
					'[SearchOnAdd] Movie search blocked by indexer availability'
				);
				onProgress?.('error', errorMessage, { current: 100, total: 100 });
				return { success: false, error: errorMessage };
			}

			// Build search criteria
			const movieSearchTitles = await this.getMovieSearchTitlesWithRefresh(movieId, tmdbId);
			const criteria: SearchCriteria = {
				searchType: 'movie',
				query: title,
				tmdbId,
				imdbId: imdbId ?? undefined,
				year,
				searchTitles: movieSearchTitles.length > 0 ? movieSearchTitles : [title]
			};

			// Perform enriched search to get scored releases (automatic - on add)
			onProgress?.('searching', 'Querying indexers for releases...', { current: 10, total: 100 });

			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource,
				enrichment: {
					scoringProfileId,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info(
				{
					movieId,
					totalResults: searchResult.releases.length,
					rejectedCount: searchResult.rejectedCount
				},
				'[SearchOnAdd] Movie search completed'
			);

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
				logger.info({ movieId, topReleases }, '[SearchOnAdd] Top 5 releases by score');
			}

			if (searchResult.releases.length === 0) {
				logger.info({ movieId, title }, '[SearchOnAdd] No suitable releases found for movie');
				onProgress?.('complete', 'No suitable releases found', { current: 100, total: 100 });
				return { success: false, error: 'No suitable releases found' };
			}

			onProgress?.('evaluating', `Found ${searchResult.releases.length} releases, evaluating...`, {
				current: 50,
				total: 100
			});

			const grabService = getReleaseGrabService();

			// If movie has existing file, filter to only upgrades
			if (hasExistingFile) {
				logger.info({ movieId }, '[SearchOnAdd] Movie has existing file, checking for upgrades');
				onProgress?.('evaluating', 'Checking for upgrade releases...', { current: 60, total: 100 });

				// Find the first release that qualifies as an upgrade
				for (let i = 0; i < searchResult.releases.length; i++) {
					const release = searchResult.releases[i];
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

					onProgress?.('evaluating', `Evaluating: ${release.title.substring(0, 50)}...`, {
						current: 60 + (i / searchResult.releases.length) * 20,
						total: 100
					});

					const decision = await releaseDecisionService.evaluateForMovie(movieId, releaseInfo);

					if (decision.accepted && decision.isUpgrade) {
						logger.info(
							{
								movieId,
								release: release.title,
								scoreImprovement: decision.scoreImprovement
							},
							'[SearchOnAdd] Found upgrade release for movie'
						);

						onProgress?.('grabbing', `Grabbing upgrade: ${release.title.substring(0, 50)}...`, {
							current: 85,
							total: 100
						});

						const grabResult = await grabService.grabRelease(release, {
							mediaType: 'movie',
							movieId,
							isAutomatic: true,
							isUpgrade: true
						});

						if (grabResult.success) {
							onProgress?.('complete', `✓ Grabbed: ${grabResult.releaseName}`, {
								current: 100,
								total: 100
							});
						} else {
							onProgress?.('error', `Failed to grab: ${grabResult.error || 'Unknown error'}`, {
								current: 100,
								total: 100
							});
						}

						return {
							success: grabResult.success,
							releaseName: grabResult.releaseName,
							queueItemId: grabResult.queueItemId,
							error: grabResult.error
						};
					}
				}

				logger.info({ movieId }, '[SearchOnAdd] No upgrades found for movie with existing file');
				onProgress?.('complete', 'No upgrades found - existing file quality is sufficient', {
					current: 100,
					total: 100
				});
				return { success: false, error: 'No upgrades found - existing file quality is sufficient' };
			}

			// No existing file - grab the top-ranked release
			const bestRelease = searchResult.releases[0];
			onProgress?.('grabbing', `Grabbing best release: ${bestRelease.title.substring(0, 50)}...`, {
				current: 85,
				total: 100
			});

			const grabResult = await grabService.grabRelease(bestRelease, {
				mediaType: 'movie',
				movieId,
				isAutomatic: true,
				isUpgrade: false
			});

			if (grabResult.success) {
				onProgress?.('complete', `✓ Grabbed: ${grabResult.releaseName}`, {
					current: 100,
					total: 100
				});
			} else {
				onProgress?.('error', `Failed to grab: ${grabResult.error || 'Unknown error'}`, {
					current: 100,
					total: 100
				});
			}

			return {
				success: grabResult.success,
				releaseName: grabResult.releaseName,
				queueItemId: grabResult.queueItemId,
				error: grabResult.error
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ movieId, err: error }, '[SearchOnAdd] Movie search failed');
			onProgress?.('error', `Search failed: ${message}`, { current: 100, total: 100 });
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

		logger.info(
			{
				seriesId,
				tmdbId,
				title,
				year,
				monitorType
			},
			'[SearchOnAdd] Starting series search'
		);

		// For 'none' monitor type, skip searching
		if (monitorType === 'none') {
			logger.info({ seriesId }, '[SearchOnAdd] Monitor type is none, skipping search');
			return { success: true };
		}

		try {
			const indexerManager = await getIndexerManager();
			const indexerAvailability = evaluateIndexerSearchAvailability(
				await indexerManager.getIndexers(),
				{
					searchType: 'tv',
					searchSource: 'automatic',
					scoringProfileId: scoringProfileId ?? undefined,
					getDefinitionCapabilities: (definitionId) =>
						indexerManager.getDefinitionCapabilities(definitionId)
				}
			);

			if (!indexerAvailability.ok) {
				const errorMessage = indexerAvailability.message || 'No indexers are available';
				logger.info(
					{
						seriesId,
						code: indexerAvailability.code,
						message: errorMessage
					},
					'[SearchOnAdd] Series search blocked by indexer availability'
				);
				return { success: false, error: errorMessage };
			}

			// Build search criteria for the series
			// For TV, we search without specific season/episode to find season packs first
			const seriesSearchTitles = await this.getSeriesSearchTitlesWithRefresh(seriesId, tmdbId);
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: title,
				tmdbId,
				tvdbId: tvdbId ?? undefined,
				imdbId: imdbId ?? undefined,
				searchTitles: seriesSearchTitles.length > 0 ? seriesSearchTitles : [title]
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

			logger.info(
				{
					seriesId,
					totalResults: searchResult.releases.length,
					rejectedCount: searchResult.rejectedCount
				},
				'[SearchOnAdd] Series search completed'
			);

			if (searchResult.releases.length === 0) {
				logger.info({ seriesId, title }, '[SearchOnAdd] No suitable releases found for series');
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
				logger.info(
					{
						seriesId,
						monitorType
					},
					'[SearchOnAdd] Monitor type defers to scheduler, not auto-grabbing'
				);
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
					logger.info(
						{
							seriesId,
							release: release.title,
							isUpgrade: decision.isUpgrade,
							upgradeStats: decision.upgradeStats
						},
						'[SearchOnAdd] Found acceptable release for series'
					);

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

			logger.info(
				{
					seriesId,
					reason: 'No releases pass evaluation'
				},
				'[SearchOnAdd] No acceptable releases found for series'
			);
			return { success: false, error: 'No releases found that meet upgrade requirements' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ seriesId, err: error }, '[SearchOnAdd] Series search failed');
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

		logger.info({ episodeId }, '[SearchOnAdd] Starting episode search');

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
				logger.info(
					{
						episodeId,
						seriesId: seriesData.id
					},
					'[SearchOnAdd] Skipping episode search for unmonitored series'
				);
				return { success: true };
			}

			// Check if episode already has a file
			// Episode files use episodeIds array, so we need to check if our episode is in any file
			const allEpisodeFiles = await db.query.episodeFiles.findMany({
				where: eq(episodeFiles.seriesId, episode.seriesId)
			});
			const existingFile = allEpisodeFiles.find((f) => f.episodeIds?.includes(episodeId));

			const hasExistingFile = !!existingFile;
			logger.debug({ episodeId, hasExistingFile }, '[SearchOnAdd] Episode file status');

			const indexerManager = await getIndexerManager();
			const searchSource: 'interactive' | 'automatic' = bypassMonitoring
				? 'interactive'
				: 'automatic';
			const indexerAvailability = evaluateIndexerSearchAvailability(
				await indexerManager.getIndexers(),
				{
					searchType: 'tv',
					searchSource,
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					getDefinitionCapabilities: (definitionId) =>
						indexerManager.getDefinitionCapabilities(definitionId)
				}
			);

			if (!indexerAvailability.ok) {
				const errorMessage = indexerAvailability.message || 'No indexers are available';
				logger.info(
					{
						episodeId,
						code: indexerAvailability.code,
						message: errorMessage
					},
					'[SearchOnAdd] Episode search blocked by indexer availability'
				);
				return { success: false, error: errorMessage };
			}

			// Build search criteria with season and episode number
			const seriesSearchTitles = await this.getSeriesSearchTitlesWithRefresh(
				seriesData.id,
				seriesData.tmdbId
			);
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: episode.seasonNumber,
				episode: episode.episodeNumber,
				searchTitles: seriesSearchTitles.length > 0 ? seriesSearchTitles : [seriesData.title]
			};

			// Perform enriched search to get scored releases (automatic - on add)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource,
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info(
				{
					episodeId,
					seasonNumber: episode.seasonNumber,
					episodeNumber: episode.episodeNumber,
					totalResults: searchResult.releases.length,
					rejectedCount: searchResult.rejectedCount
				},
				'[SearchOnAdd] Episode search completed'
			);

			if (searchResult.releases.length === 0) {
				logger.info(
					{
						episodeId,
						title: `${seriesData.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`
					},
					'[SearchOnAdd] No suitable releases found for episode'
				);
				return { success: false, error: 'No suitable releases found' };
			}

			const grabService = getReleaseGrabService();

			// If episode has existing file, filter to only upgrades
			if (hasExistingFile) {
				logger.info(
					{
						episodeId
					},
					'[SearchOnAdd] Episode has existing file, checking for upgrades'
				);

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
						logger.info(
							{
								episodeId,
								release: release.title,
								scoreImprovement: decision.scoreImprovement
							},
							'[SearchOnAdd] Found upgrade release for episode'
						);

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

				logger.info(
					{
						episodeId
					},
					'[SearchOnAdd] No upgrades found for episode with existing file'
				);
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
			logger.error({ episodeId, err: error }, '[SearchOnAdd] Episode search failed');
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
		const { seriesId, seasonNumber, bypassMonitoring = false } = params;

		logger.info({ seriesId, seasonNumber }, '[SearchOnAdd] Starting season search');

		try {
			// Look up series data
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId)
			});

			if (!seriesData) {
				return { success: false, error: 'Series not found' };
			}

			if (!bypassMonitoring && !seriesData.monitored) {
				logger.info(
					{
						seriesId,
						seasonNumber
					},
					'[SearchOnAdd] Skipping season search for unmonitored series'
				);
				return { success: true };
			}

			// Get season episodes for linking
			const seasonEpisodes = await db.query.episodes.findMany({
				where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber))
			});

			const indexerManager = await getIndexerManager();
			const searchSource: 'interactive' | 'automatic' = bypassMonitoring
				? 'interactive'
				: 'automatic';
			const indexerAvailability = evaluateIndexerSearchAvailability(
				await indexerManager.getIndexers(),
				{
					searchType: 'tv',
					searchSource,
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					getDefinitionCapabilities: (definitionId) =>
						indexerManager.getDefinitionCapabilities(definitionId)
				}
			);

			if (!indexerAvailability.ok) {
				const errorMessage = indexerAvailability.message || 'No indexers are available';
				logger.info(
					{
						seriesId,
						seasonNumber,
						code: indexerAvailability.code,
						message: errorMessage
					},
					'[SearchOnAdd] Season search blocked by indexer availability'
				);
				return { success: false, error: errorMessage };
			}

			// Build search criteria with season only (no episode number = season pack search)
			const seriesSearchTitles = await this.getSeriesSearchTitlesWithRefresh(
				seriesData.id,
				seriesData.tmdbId
			);
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: seasonNumber,
				searchTitles: seriesSearchTitles.length > 0 ? seriesSearchTitles : [seriesData.title]
			};

			// Perform enriched search to get scored releases (automatic - on add)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource,
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			logger.info(
				{
					seriesId,
					seasonNumber,
					totalResults: searchResult.releases.length,
					rejectedCount: searchResult.rejectedCount
				},
				'[SearchOnAdd] Season search completed'
			);

			if (searchResult.releases.length === 0) {
				logger.info(
					{
						seriesId,
						seasonNumber,
						title: `${seriesData.title} Season ${seasonNumber}`
					},
					'[SearchOnAdd] No suitable releases found for season'
				);
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
					logger.info(
						{
							seriesId,
							seasonNumber,
							release: release.title,
							isUpgrade: decision.isUpgrade,
							upgradeStats: decision.upgradeStats
						},
						'[SearchOnAdd] Found acceptable release for season pack'
					);

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

			logger.info(
				{
					seriesId,
					seasonNumber,
					reason: 'No releases pass majority benefit rule'
				},
				'[SearchOnAdd] No acceptable releases found for season'
			);
			return { success: false, error: 'No releases found that would benefit majority of episodes' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error(
				{
					seriesId,
					seasonNumber,
					err: error
				},
				'[SearchOnAdd] Season search failed'
			);
			return { success: false, error: message };
		}
	}

	/**
	 * Search for missing aired episodes in a series.
	 * Automatic/background searches respect episode monitoring.
	 * Manual user-triggered searches can bypass monitoring.
	 * Uses MultiSeasonSearchStrategy for intelligent pack-first searching with multi-season support.
	 */
	async searchForMissingEpisodes(
		seriesId: string,
		onProgress?: (
			update: import('$lib/server/downloads/MultiSeasonSearchStrategy.js').SearchProgressUpdate
		) => void,
		options: SearchForMissingEpisodesOptions = {}
	): Promise<MultiSearchResult> {
		const { bypassMonitoring = false, searchStrategy = 'pack-first' } = options;

		logger.info(
			{
				seriesId,
				bypassMonitoring,
				searchStrategy
			},
			'[SearchOnAdd] Starting missing episodes search with multi-season strategy'
		);

		try {
			// Get series data first
			const seriesData = await db.query.series.findFirst({
				where: eq(series.id, seriesId)
			});

			if (!seriesData) {
				return {
					results: [],
					summary: { searched: 0, found: 0, grabbed: 0 },
					error: 'Series not found'
				};
			}

			const indexerManager = await getIndexerManager();
			const indexerConfigs = await indexerManager.getIndexers();
			const indexerAvailability = evaluateIndexerSearchAvailability(indexerConfigs, {
				searchType: 'tv',
				searchSource: 'interactive',
				scoringProfileId: seriesData.scoringProfileId ?? undefined,
				getDefinitionCapabilities: (definitionId) =>
					indexerManager.getDefinitionCapabilities(definitionId)
			});

			if (!indexerAvailability.ok) {
				const errorMessage = indexerAvailability.message || 'No indexers are available';
				logger.info(
					{
						seriesId,
						code: indexerAvailability.code,
						message: errorMessage
					},
					'[SearchOnAdd] Missing episodes search blocked by indexer availability'
				);
				return {
					results: [],
					summary: { searched: 0, found: 0, grabbed: 0 },
					error: errorMessage
				};
			}

			const effectiveSearchStrategy =
				searchStrategy === 'auto'
					? this.resolveAutoMissingSearchStrategy(indexerConfigs, {
							searchSource: 'interactive',
							scoringProfileId: seriesData.scoringProfileId,
							getDefinitionCapabilities: (definitionId) =>
								indexerManager.getDefinitionCapabilities(definitionId)
						})
					: searchStrategy;

			// Find all missing episodes. Automatic/background searches only include monitored
			// episodes, while manual user-triggered searches can bypass monitoring.
			const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
			const conditions = [
				eq(episodes.seriesId, seriesId),
				eq(episodes.hasFile, false),
				// Exclude specials (season 0) for missing-episode auto-search.
				// This matches series episode counts and prevents oversized "missing" totals.
				ne(episodes.seasonNumber, 0)
			];
			if (!bypassMonitoring) {
				conditions.push(eq(episodes.monitored, true));
			}

			const missingEpisodes = await db.query.episodes.findMany({
				where: and(...conditions)
			});

			// Filter to only aired episodes
			const airedMissingEpisodes = missingEpisodes.filter((ep) => {
				if (!ep.airDate) return false;
				return ep.airDate <= now;
			});

			logger.info(
				{
					seriesId,
					total: missingEpisodes.length,
					aired: airedMissingEpisodes.length,
					searchStrategy: effectiveSearchStrategy
				},
				'[SearchOnAdd] Found missing episodes'
			);

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

			if (effectiveSearchStrategy === 'episode-only') {
				const sortedEpisodes = [...episodesToSearch].sort(
					(a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
				);
				const episodesBySeason = new Map<number, EpisodeToSearch[]>();
				for (const episode of sortedEpisodes) {
					const seasonEpisodes = episodesBySeason.get(episode.seasonNumber) ?? [];
					seasonEpisodes.push(episode);
					episodesBySeason.set(episode.seasonNumber, seasonEpisodes);
				}

				// Determine aired + eligible episode totals per season to decide whether
				// a season is fully missing and should use a season-pack grab.
				const eligibleSeasonConditions = [
					eq(episodes.seriesId, seriesId),
					ne(episodes.seasonNumber, 0)
				];
				if (!bypassMonitoring) {
					eligibleSeasonConditions.push(eq(episodes.monitored, true));
				}
				const eligibleSeasonEpisodes = await db.query.episodes.findMany({
					where: and(...eligibleSeasonConditions)
				});
				const eligibleAiredSeasonEpisodeCounts = new Map<number, number>();
				for (const seasonEpisode of eligibleSeasonEpisodes) {
					if (!seasonEpisode.airDate || seasonEpisode.airDate > now) {
						continue;
					}
					eligibleAiredSeasonEpisodeCounts.set(
						seasonEpisode.seasonNumber,
						(eligibleAiredSeasonEpisodeCounts.get(seasonEpisode.seasonNumber) ?? 0) + 1
					);
				}

				onProgress?.({
					phase: 'initializing',
					message: `Preparing ${sortedEpisodes.length} missing episodes for targeted search...`,
					percentComplete: 5,
					details: {
						releaseType: 'episode',
						episodeCount: sortedEpisodes.length
					}
				});

				const results: AutoSearchItemResult[] = [];
				const operationalErrors = new Set<string>();
				let foundCount = 0;
				let grabbedCount = 0;
				let individualEpisodesGrabbed = 0;
				let seasonPacksGrabbed = 0;
				const seasonPacks: NonNullable<MultiSearchResult['seasonPacks']> = [];
				let processedEpisodes = 0;

				const sortedSeasons = [...episodesBySeason.keys()].sort((a, b) => a - b);
				for (const seasonNumber of sortedSeasons) {
					const seasonEpisodes = episodesBySeason.get(seasonNumber) ?? [];
					if (seasonEpisodes.length === 0) {
						continue;
					}

					const eligibleAiredSeasonCount = eligibleAiredSeasonEpisodeCounts.get(seasonNumber) ?? 0;
					const isEntireSeasonMissing =
						eligibleAiredSeasonCount > 0 && seasonEpisodes.length === eligibleAiredSeasonCount;

					if (isEntireSeasonMissing) {
						onProgress?.({
							phase: 'single_season_search',
							message: `Searching season pack for Season ${seasonNumber}...`,
							percentComplete: Math.min(
								95,
								10 + Math.round((processedEpisodes / sortedEpisodes.length) * 80)
							),
							currentItem: `Season ${seasonNumber}`,
							details: {
								releaseType: 'single_season',
								decision: 'pending'
							}
						});

						const seasonSearchResult = await this.searchForSeason({
							seriesId,
							seasonNumber,
							bypassMonitoring
						});
						const seasonPackWasGrabbed = seasonSearchResult.success;
						if (
							!seasonPackWasGrabbed &&
							this.shouldExposeOperationalError(seasonSearchResult.error)
						) {
							operationalErrors.add(seasonSearchResult.error as string);
						}

						if (seasonPackWasGrabbed) {
							seasonPacksGrabbed++;
							const seasonPackReleaseName = seasonSearchResult.releaseName;
							if (seasonPackReleaseName) {
								seasonPacks.push({
									seasonNumber,
									releaseName: seasonPackReleaseName,
									episodesCovered: seasonEpisodes.map((episode) => episode.id)
								});
							}

							for (const episode of seasonEpisodes) {
								const episodeLabel = `S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber
									.toString()
									.padStart(2, '0')}`;
								foundCount++;
								grabbedCount++;
								results.push({
									itemId: episode.id,
									itemLabel: episodeLabel,
									found: true,
									grabbed: true,
									releaseName: seasonSearchResult.releaseName,
									wasPackGrab: true
								});
							}
							processedEpisodes += seasonEpisodes.length;
							continue;
						}
					}

					for (const episode of seasonEpisodes) {
						const episodeLabel = `S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber
							.toString()
							.padStart(2, '0')}`;

						onProgress?.({
							phase: 'individual_episode_search',
							message: `Searching ${episodeLabel}...`,
							percentComplete: Math.min(
								95,
								10 + Math.round(((processedEpisodes + 1) / sortedEpisodes.length) * 80)
							),
							currentItem: episodeLabel,
							details: {
								releaseType: 'episode',
								decision: 'pending'
							}
						});

						const searchResult = await this.searchForEpisode({
							episodeId: episode.id,
							bypassMonitoring
						});
						if (!searchResult.success && this.shouldExposeOperationalError(searchResult.error)) {
							operationalErrors.add(searchResult.error as string);
						}

						const wasGrabbed = searchResult.success;
						const wasFound = wasGrabbed;

						if (wasFound) {
							foundCount++;
						}
						if (wasGrabbed) {
							grabbedCount++;
							individualEpisodesGrabbed++;
						}

						results.push({
							itemId: episode.id,
							itemLabel: episodeLabel,
							found: wasFound,
							grabbed: wasGrabbed,
							releaseName: searchResult.releaseName,
							error: wasGrabbed ? undefined : (searchResult.error ?? 'No suitable releases found')
						});
						processedEpisodes++;
					}
				}

				onProgress?.({
					phase: 'complete',
					message: `Search complete: ${grabbedCount}/${sortedEpisodes.length} episodes grabbed`,
					percentComplete: 100
				});

				logger.info(
					{
						seriesId,
						searched: sortedEpisodes.length,
						found: foundCount,
						grabbed: grabbedCount,
						seasonPacksGrabbed
					},
					'[SearchOnAdd] Missing episodes targeted search completed'
				);

				return {
					results,
					summary: {
						searched: sortedEpisodes.length,
						found: foundCount,
						grabbed: grabbedCount,
						seasonPacksGrabbed,
						individualEpisodesGrabbed
					},
					errors: operationalErrors.size > 0 ? [...operationalErrors] : undefined,
					seasonPacks: seasonPacks.length > 0 ? seasonPacks : undefined
				};
			}

			// Use multi-season search strategy
			const { getMultiSeasonSearchStrategy } =
				await import('$lib/server/downloads/MultiSeasonSearchStrategy.js');
			const multiSeasonStrategy = getMultiSeasonSearchStrategy();
			// Manual missing auto-grab should avoid re-downloading existing episodes.
			// Require 100% missing coverage before attempting any pack type.
			const packThreshold = bypassMonitoring ? 100 : undefined;

			const searchResult = await multiSeasonStrategy.searchWithMultiSeasonPriority({
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
				searchSource: 'interactive',
				onProgress,
				completeSeriesThreshold: packThreshold,
				multiSeasonThreshold: packThreshold,
				singleSeasonThreshold: packThreshold
			});

			// Convert results to AutoSearchItemResult format
			const results: AutoSearchItemResult[] = searchResult.results.map((r) => ({
				itemId: r.episodeId,
				itemLabel: r.episodeLabel,
				found: r.found,
				grabbed: r.grabbed,
				releaseName: r.releaseName,
				error: r.error,
				wasPackGrab: r.wasPackGrab
			}));

			// Combine season packs and multi-season packs
			const allSeasonPacks = [
				...searchResult.seasonPacks.map((pack) => ({
					seasonNumber: pack.seasonNumber,
					releaseName: pack.releaseName,
					episodesCovered: pack.episodesCovered
				})),
				...searchResult.multiSeasonPacks.map((pack) => ({
					seasonNumber: pack.coveredSeasons[0], // Use first season as representative
					releaseName: pack.releaseName,
					episodesCovered: pack.episodesCovered
				}))
			];

			logger.info(
				{
					seriesId,
					searched: searchResult.summary.searched,
					found: searchResult.summary.found,
					grabbed: searchResult.summary.grabbed,
					completeSeriesPacks: searchResult.summary.completeSeriesPacksGrabbed,
					multiSeasonPacks: searchResult.summary.multiSeasonPacksGrabbed,
					singleSeasonPacks: searchResult.summary.singleSeasonPacksGrabbed,
					individualEpisodes: searchResult.summary.individualEpisodesGrabbed
				},
				'[SearchOnAdd] Missing episodes search completed'
			);

			return {
				results,
				summary: {
					searched: searchResult.summary.searched,
					found: searchResult.summary.found,
					grabbed: searchResult.summary.grabbed,
					seasonPacksGrabbed:
						searchResult.summary.singleSeasonPacksGrabbed +
						searchResult.summary.multiSeasonPacksGrabbed +
						searchResult.summary.completeSeriesPacksGrabbed,
					individualEpisodesGrabbed: searchResult.summary.individualEpisodesGrabbed
				},
				errors: searchResult.results
					.map((resultItem) => resultItem.error)
					.filter((error): error is string => this.shouldExposeOperationalError(error)),
				seasonPacks: allSeasonPacks
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ seriesId, err: error }, '[SearchOnAdd] Missing episodes search failed');
			return {
				results: [],
				summary: { searched: 0, found: 0, grabbed: 0 },
				error: message
			};
		}
	}

	/**
	 * Search for a specific list of episodes (bulk selection).
	 * Uses MultiSeasonSearchStrategy for intelligent pack-first searching with multi-season support.
	 */
	async searchBulkEpisodes(
		episodeIds: string[],
		onProgress?: (
			update: import('$lib/server/downloads/MultiSeasonSearchStrategy.js').SearchProgressUpdate
		) => void
	): Promise<MultiSearchResult> {
		logger.info(
			{
				count: episodeIds.length
			},
			'[SearchOnAdd] Starting bulk episode search with multi-season strategy'
		);

		if (episodeIds.length === 0) {
			return {
				results: [],
				summary: { searched: 0, found: 0, grabbed: 0 }
			};
		}

		try {
			const indexerManager = await getIndexerManager();
			const indexerAvailability = evaluateIndexerSearchAvailability(
				await indexerManager.getIndexers(),
				{
					searchType: 'tv',
					searchSource: 'interactive',
					scoringProfileId: undefined,
					getDefinitionCapabilities: (definitionId) =>
						indexerManager.getDefinitionCapabilities(definitionId)
				}
			);

			if (!indexerAvailability.ok) {
				const errorMessage = indexerAvailability.message || 'No indexers are available';
				logger.info(
					{
						count: episodeIds.length,
						code: indexerAvailability.code,
						message: errorMessage
					},
					'[SearchOnAdd] Bulk episode search blocked by indexer availability'
				);
				return {
					results: [],
					summary: { searched: 0, found: 0, grabbed: 0 },
					error: errorMessage
				};
			}

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
			const operationalErrors = new Set<string>();
			const allSeasonPacks: Array<{
				seasonNumber: number;
				releaseName: string;
				episodesCovered: string[];
			}> = [];
			let totalSearched = 0;
			let totalFound = 0;
			let totalGrabbed = 0;
			let totalCompleteSeriesPacks = 0;
			let totalMultiSeasonPacks = 0;
			let totalSingleSeasonPacks = 0;
			let totalIndividualGrabbed = 0;

			const { getMultiSeasonSearchStrategy } =
				await import('$lib/server/downloads/MultiSeasonSearchStrategy.js');
			const multiSeasonStrategy = getMultiSeasonSearchStrategy();

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

				// Use multi-season search for this series
				const searchResult = await multiSeasonStrategy.searchWithMultiSeasonPriority({
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
					searchSource: 'interactive',
					onProgress
				});

				// Convert and aggregate results
				for (const r of searchResult.results) {
					if (this.shouldExposeOperationalError(r.error)) {
						operationalErrors.add(r.error as string);
					}
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

				// Add season packs
				allSeasonPacks.push(
					...searchResult.seasonPacks.map((pack) => ({
						seasonNumber: pack.seasonNumber,
						releaseName: pack.releaseName,
						episodesCovered: pack.episodesCovered
					})),
					...searchResult.multiSeasonPacks.map((pack) => ({
						seasonNumber: pack.coveredSeasons[0],
						releaseName: pack.releaseName,
						episodesCovered: pack.episodesCovered
					}))
				);

				totalSearched += searchResult.summary.searched;
				totalFound += searchResult.summary.found;
				totalGrabbed += searchResult.summary.grabbed;
				totalCompleteSeriesPacks += searchResult.summary.completeSeriesPacksGrabbed;
				totalMultiSeasonPacks += searchResult.summary.multiSeasonPacksGrabbed;
				totalSingleSeasonPacks += searchResult.summary.singleSeasonPacksGrabbed;
				totalIndividualGrabbed += searchResult.summary.individualEpisodesGrabbed;
			}

			logger.info(
				{
					searched: totalSearched,
					found: totalFound,
					grabbed: totalGrabbed,
					completeSeriesPacks: totalCompleteSeriesPacks,
					multiSeasonPacks: totalMultiSeasonPacks,
					singleSeasonPacks: totalSingleSeasonPacks,
					individualEpisodesGrabbed: totalIndividualGrabbed
				},
				'[SearchOnAdd] Bulk episode search completed'
			);

			return {
				results: allResults,
				summary: {
					searched: totalSearched,
					found: totalFound,
					grabbed: totalGrabbed,
					seasonPacksGrabbed:
						totalCompleteSeriesPacks + totalMultiSeasonPacks + totalSingleSeasonPacks,
					individualEpisodesGrabbed: totalIndividualGrabbed
				},
				errors: operationalErrors.size > 0 ? [...operationalErrors] : undefined,
				seasonPacks: allSeasonPacks.length > 0 ? allSeasonPacks : undefined
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error({ err: error }, '[SearchOnAdd] Bulk episode search failed');
			return {
				results: [],
				summary: { searched: 0, found: 0, grabbed: 0 },
				error: message
			};
		}
	}

	private resolveAutoMissingSearchStrategy(
		indexerConfigs: IndexerConfig[],
		options: {
			searchSource: 'interactive' | 'automatic';
			scoringProfileId?: string | null;
			getDefinitionCapabilities: (definitionId: string) => IndexerCapabilities | undefined;
		}
	): 'pack-first' | 'episode-only' {
		const isStreamerProfile = options.scoringProfileId === 'streamer';
		const profileScoped = isStreamerProfile
			? indexerConfigs.filter((config) => config.definitionId === CINEPHAGE_STREAM_DEFINITION_ID)
			: indexerConfigs;

		const eligibleTvIndexers = profileScoped.filter((config) => {
			if (!config.enabled) {
				return false;
			}
			if (options.searchSource === 'interactive' && config.enableInteractiveSearch === false) {
				return false;
			}
			if (options.searchSource === 'automatic' && config.enableAutomaticSearch === false) {
				return false;
			}

			const capabilities = options.getDefinitionCapabilities(config.definitionId);
			return Boolean(
				capabilities?.tvSearch?.available &&
				indexerHasCategoriesForSearchType(capabilities.categories, 'tv')
			);
		});

		const hasRuTracker = eligibleTvIndexers.some(
			(config) => this.isRuTrackerIndexerName(config.name) || this.isRuTrackerHost(config.baseUrl)
		);
		const hasNonRuTracker = eligibleTvIndexers.some(
			(config) =>
				!(this.isRuTrackerIndexerName(config.name) || this.isRuTrackerHost(config.baseUrl))
		);

		return hasRuTracker && !hasNonRuTracker ? 'episode-only' : 'pack-first';
	}

	private isRuTrackerIndexerName(indexerName: string | undefined): boolean {
		if (typeof indexerName !== 'string') {
			return false;
		}
		const normalized = indexerName.toLowerCase();
		return normalized.includes('rutracker') || normalized.includes('kinozal');
	}

	private isRuTrackerHost(baseUrl: string | undefined): boolean {
		if (!baseUrl) {
			return false;
		}
		try {
			const hostname = new URL(baseUrl).hostname.toLowerCase();
			return hostname.includes('rutracker.') || hostname.includes('kinozal.');
		} catch {
			const normalized = baseUrl.toLowerCase();
			return normalized.includes('rutracker.') || normalized.includes('kinozal.');
		}
	}
}

// Export singleton instance
export const searchOnAdd = new SearchOnAddService();

// Export types for API usage
export type { GrabResult, AutoSearchItemResult, MultiSearchResult };
