/**
 * Monitoring Search Service
 *
 * Orchestrates searches for monitoring tasks:
 * - Filters content through specifications
 * - Executes searches via IndexerManager
 * - Evaluates results through decision engine
 * - Auto-grabs best releases
 */

import { db } from '$lib/server/db/index.js';
import {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	scoringProfiles,
	downloadQueue,
	downloadHistory
} from '$lib/server/db/schema.js';
import { eq, and, lte, gte, inArray } from 'drizzle-orm';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager.js';
import { getReleaseGrabService } from '$lib/server/downloads/ReleaseGrabService.js';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser.js';
import { strmService, StrmService, getStreamingBaseUrl } from '$lib/server/streaming/index.js';
import { fileExists } from '$lib/server/downloadClients/import/index.js';
import { mediaInfoService } from '$lib/server/library/media-info.js';
import { logger } from '$lib/logging/index.js';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { relative, join } from 'node:path';
import type { SearchCriteria, EnhancedReleaseResult } from '$lib/server/indexers/types';
import { scoreRelease, isUpgrade } from '$lib/server/scoring/scorer.js';
import type { ScoringProfile } from '$lib/server/scoring/types.js';
import { qualityFilter } from '$lib/server/quality';
import { TaskCancelledException } from '$lib/server/tasks/TaskCancelledException.js';
import {
	getMovieSearchTitles,
	getSeriesSearchTitles
} from '$lib/server/services/AlternateTitleService.js';

// Specifications
import {
	MovieMonitoredSpecification,
	EpisodeMonitoredSpecification,
	MovieMissingContentSpecification,
	EpisodeMissingContentSpecification,
	MovieCutoffUnmetSpecification,
	EpisodeCutoffUnmetSpecification,
	MovieUpgradeableSpecification,
	EpisodeUpgradeableSpecification,
	NewEpisodeSpecification,
	MovieAvailabilitySpecification,
	MovieSearchCooldownSpecification,
	EpisodeSearchCooldownSpecification,
	ReleaseBlocklistSpecification,
	MovieReadOnlyFolderSpecification,
	EpisodeReadOnlyFolderSpecification,
	type MovieContext,
	type EpisodeContext,
	type ReleaseCandidate
} from '../specifications/index.js';

const parser = new ReleaseParser();

type EpisodeFileUpsertInput = Omit<typeof episodeFiles.$inferInsert, 'id'> & { id?: string };
type EpisodeFileWriteExecutor = Pick<typeof db, 'select' | 'update' | 'insert'>;

/**
 * Upsert episode file by (seriesId, relativePath) and return canonical row id.
 */
async function upsertEpisodeFileByPath(
	executor: EpisodeFileWriteExecutor,
	record: EpisodeFileUpsertInput
): Promise<string> {
	const { id: requestedId, ...values } = record;

	const existing = await executor
		.select({ id: episodeFiles.id })
		.from(episodeFiles)
		.where(
			and(
				eq(episodeFiles.seriesId, record.seriesId),
				eq(episodeFiles.relativePath, record.relativePath)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		await executor.update(episodeFiles).set(values).where(eq(episodeFiles.id, existing[0].id));
		return existing[0].id;
	}

	const id = requestedId ?? randomUUID();
	await executor.insert(episodeFiles).values({ id, ...values });
	return id;
}

/**
 * Search result for individual item
 */
export interface ItemSearchResult {
	itemId: string;
	itemType: 'movie' | 'episode';
	title: string;
	searched: boolean;
	releasesFound: number;
	grabbed: boolean;
	grabbedRelease?: string;
	queueItemId?: string;
	error?: string;
	skipped?: boolean;
	skipReason?: string;
}

/**
 * Aggregated search results
 */
export interface SearchResults {
	items: ItemSearchResult[];
	summary: {
		searched: number;
		found: number;
		grabbed: number;
		skipped: number;
		errors: number;
	};
	/** Detailed upgrade decisions (only populated in dry-run mode) */
	upgradeDetails?: UpgradeDecisionDetail[];
}

/**
 * Detailed result for dry-run mode showing upgrade decision details
 */
export interface UpgradeDecisionDetail {
	itemId: string;
	itemType: 'movie' | 'episode';
	title: string;
	existingFile: {
		name: string;
		score: number;
		breakdown?: Record<string, number>;
	};
	bestCandidate: {
		name: string;
		score: number;
		improvement: number;
		breakdown?: Record<string, number>;
	} | null;
	candidatesChecked: number;
	wouldGrab: boolean;
	reason: string;
}

/**
 * Options for upgrade searches
 */
export interface UpgradeSearchOptions {
	movieIds?: string[];
	seriesIds?: string[];
	maxItems?: number;
	/**
	 * If true, only search items where cutoff is unmet (below target quality).
	 * If false, search ALL items with files for potential upgrades.
	 * Default: true (matches legacy behavior)
	 */
	cutoffUnmetOnly?: boolean;
	/**
	 * Optional AbortSignal for cancellation support
	 */
	signal?: AbortSignal;
	/**
	 * If true, don't actually grab releases - just simulate and log what would happen.
	 * Returns detailed upgrade decision info for debugging.
	 */
	dryRun?: boolean;
}

/**
 * MonitoringSearchService - Coordinate searches for monitoring
 */
export class MonitoringSearchService {
	private readonly AUTO_GRAB_MIN_SCORE = 0;
	private readonly MAX_CONCURRENT_SEARCHES = 10;

	// Active download statuses that indicate media is already being acquired
	private readonly ACTIVE_DOWNLOAD_STATUSES = [
		'queued',
		'downloading',
		'paused',
		'seeding',
		'importing'
	];

	// Cache for season episode counts to avoid N+1 queries
	// Key: `${seriesId}-${seasonNumber}`, Value: episode count
	private seasonEpisodeCountCache: Map<string, number> = new Map();

	/**
	 * Check if a movie already has an active download in the queue
	 */
	private async isMovieAlreadyDownloading(movieId: string): Promise<boolean> {
		const activeDownloads = await db
			.select({ id: downloadQueue.id, status: downloadQueue.status, title: downloadQueue.title })
			.from(downloadQueue)
			.where(
				and(
					eq(downloadQueue.movieId, movieId),
					inArray(downloadQueue.status, this.ACTIVE_DOWNLOAD_STATUSES)
				)
			)
			.limit(1);

		const found = activeDownloads.length > 0;
		logger.debug('[MonitoringSearch] isMovieAlreadyDownloading check', {
			movieId,
			found,
			activeDownload: found ? activeDownloads[0] : undefined
		});

		return found;
	}

	/**
	 * Check if any of the episodes already have an active download in the queue
	 */
	private async areEpisodesAlreadyDownloading(episodeIds: string[]): Promise<boolean> {
		// Download queue stores episodeIds as JSON array - we need to check if any overlap
		const activeDownloads = await db
			.select({ episodeIds: downloadQueue.episodeIds })
			.from(downloadQueue)
			.where(inArray(downloadQueue.status, this.ACTIVE_DOWNLOAD_STATUSES));

		const activeEpisodeIds = new Set<string>();
		for (const download of activeDownloads) {
			if (download.episodeIds) {
				for (const id of download.episodeIds) {
					activeEpisodeIds.add(id);
				}
			}
		}

		return episodeIds.some((id) => activeEpisodeIds.has(id));
	}

	/**
	 * Pre-load episode counts for all seasons of given series IDs in a single query.
	 * Call this at the start of a search operation to avoid N+1 queries.
	 */
	private async preloadSeasonEpisodeCounts(seriesIds: string[]): Promise<void> {
		if (seriesIds.length === 0) return;

		// Clear old cache entries for these series
		for (const seriesId of seriesIds) {
			// Remove any cached entries for this series
			for (const key of this.seasonEpisodeCountCache.keys()) {
				if (key.startsWith(`${seriesId}-`)) {
					this.seasonEpisodeCountCache.delete(key);
				}
			}
		}

		// Single query to get all season episode counts grouped by series and season
		const counts = await db
			.select({
				seriesId: episodes.seriesId,
				seasonNumber: episodes.seasonNumber
			})
			.from(episodes)
			.where(inArray(episodes.seriesId, seriesIds));

		// Count episodes per series/season combination
		const countMap = new Map<string, number>();
		for (const row of counts) {
			const key = `${row.seriesId}-${row.seasonNumber}`;
			countMap.set(key, (countMap.get(key) || 0) + 1);
		}

		// Store in cache
		for (const [key, count] of countMap) {
			this.seasonEpisodeCountCache.set(key, count);
		}

		logger.debug('[MonitoringSearch] Preloaded season episode counts', {
			seriesCount: seriesIds.length,
			seasonCount: countMap.size
		});
	}

	/**
	 * Clear the season episode count cache.
	 * Call this after a search operation completes.
	 */
	private clearSeasonEpisodeCountCache(): void {
		this.seasonEpisodeCountCache.clear();
	}

	/**
	 * Get the episode count for a specific season.
	 * Uses cache if available, otherwise falls back to database query.
	 * Used for season pack size validation (per-episode size calculation)
	 */
	private async getSeasonEpisodeCount(seriesId: string, seasonNumber: number): Promise<number> {
		const cacheKey = `${seriesId}-${seasonNumber}`;

		// Check cache first
		const cached = this.seasonEpisodeCountCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		// Fallback to database query (for cases where cache wasn't preloaded)
		const seasonEpisodes = await db.query.episodes.findMany({
			where: and(eq(episodes.seriesId, seriesId), eq(episodes.seasonNumber, seasonNumber)),
			columns: { id: true }
		});

		const count = seasonEpisodes.length;

		// Cache for future calls in this operation
		this.seasonEpisodeCountCache.set(cacheKey, count);

		return count;
	}

	/**
	 * Search for missing movies
	 * @param signal - Optional AbortSignal for cancellation support
	 */
	async searchMissingMovies(signal?: AbortSignal): Promise<SearchResults> {
		logger.info('[MonitoringSearch] Starting missing movies search');

		const results: ItemSearchResult[] = [];

		try {
			// Check for cancellation
			if (signal?.aborted) {
				logger.info('[MonitoringSearch] Missing movies search cancelled');
				throw new TaskCancelledException('search');
			}

			// Query monitored movies without files
			const missingMovies = await db.query.movies.findMany({
				where: and(eq(movies.monitored, true), eq(movies.hasFile, false)),
				with: {
					scoringProfile: true
				}
			});

			logger.info('[MonitoringSearch] Found missing movies', { count: missingMovies.length });

			// Filter through specifications
			const missingSpec = new MovieMissingContentSpecification();
			const monitoredSpec = new MovieMonitoredSpecification();
			const readOnlySpec = new MovieReadOnlyFolderSpecification();
			const availabilitySpec = new MovieAvailabilitySpecification();
			const cooldownSpec = new MovieSearchCooldownSpecification();

			for (const movie of missingMovies) {
				// Check for cancellation before processing each movie
				if (signal?.aborted) {
					logger.info('[MonitoringSearch] Missing movies search cancelled during processing');
					throw new TaskCancelledException('search');
				}
				const context: MovieContext = {
					movie,
					profile: movie.scoringProfile ?? undefined
				};

				// Check monitored
				const monitoredResult = await monitoredSpec.isSatisfied(context);
				if (!monitoredResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: monitoredResult.reason
					});
					continue;
				}

				// Skip movies in read-only folders (imports would fail anyway)
				const readOnlyResult = await readOnlySpec.isSatisfied(context);
				if (!readOnlyResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: readOnlyResult.reason
					});
					continue;
				}

				// Check availability (must meet minimum availability threshold)
				const availabilityResult = await availabilitySpec.isSatisfied(context);
				if (!availabilityResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: availabilityResult.reason
					});
					continue;
				}

				// Check search cooldown (prevent hammering indexers)
				const cooldownResult = await cooldownSpec.isSatisfied(context);
				if (!cooldownResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: cooldownResult.reason
					});
					continue;
				}

				// Check missing
				const missingResult = await missingSpec.isSatisfied(context);
				if (!missingResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: missingResult.reason
					});
					continue;
				}

				// Update lastSearchTime before searching
				await db
					.update(movies)
					.set({ lastSearchTime: new Date().toISOString() })
					.where(eq(movies.id, movie.id));

				// Search and grab
				const searchResult = await this.searchAndGrabMovie(movie);
				results.push(searchResult);

				// Rate limiting - small delay between searches
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} catch (error) {
			logger.error('[MonitoringSearch] Missing movies search failed', error);
		}

		return this.aggregateResults(results);
	}

	/**
	 * Search for missing episodes in a series or all series
	 * Uses cascading search strategy: series packs -> season packs -> individual episodes
	 * @param signal - Optional AbortSignal for cancellation support
	 */
	async searchMissingEpisodes(signal?: AbortSignal): Promise<SearchResults> {
		logger.info('[MonitoringSearch] Starting missing episodes search with cascading strategy');

		const results: ItemSearchResult[] = [];

		try {
			// Check for cancellation
			if (signal?.aborted) {
				logger.info('[MonitoringSearch] Missing episodes search cancelled');
				throw new TaskCancelledException('search');
			}

			// Query monitored episodes without files
			const query = and(
				eq(episodes.monitored, true),
				eq(episodes.hasFile, false),
				lte(episodes.airDate, new Date().toISOString()) // Only aired episodes
			);

			const missingEpisodes = await db.query.episodes.findMany({
				where: query,
				with: {
					series: {
						with: {
							scoringProfile: true
						}
					},
					season: true
				}
			});

			logger.info('[MonitoringSearch] Found missing episodes', { count: missingEpisodes.length });

			// Filter through specifications first
			const missingSpec = new EpisodeMissingContentSpecification();
			const monitoredSpec = new EpisodeMonitoredSpecification();
			const readOnlySpec = new EpisodeReadOnlyFolderSpecification();
			const cooldownSpec = new EpisodeSearchCooldownSpecification();

			// Filter and group episodes by series and season
			const episodesBySeriesAndSeason = new Map<string, Map<number, typeof missingEpisodes>>();
			const seriesDataMap = new Map<string, (typeof missingEpisodes)[0]['series']>();

			for (const episode of missingEpisodes) {
				// Check for cancellation before processing each episode
				if (signal?.aborted) {
					logger.info('[MonitoringSearch] Missing episodes search cancelled during processing');
					throw new TaskCancelledException('search');
				}

				if (!episode.series) continue;

				const context: EpisodeContext = {
					series: episode.series,
					episode,
					profile: episode.series.scoringProfile ?? undefined
				};

				// Check monitored (cascading)
				const monitoredResult = await monitoredSpec.isSatisfied(context);
				if (!monitoredResult.accepted) {
					results.push({
						itemId: episode.id,
						itemType: 'episode',
						title: `${episode.series.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: monitoredResult.reason
					});
					continue;
				}

				// Skip episodes in read-only folders (imports would fail anyway)
				const readOnlyResult = await readOnlySpec.isSatisfied(context);
				if (!readOnlyResult.accepted) {
					results.push({
						itemId: episode.id,
						itemType: 'episode',
						title: `${episode.series.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: readOnlyResult.reason
					});
					continue;
				}

				// Check search cooldown (prevent hammering indexers)
				const cooldownResult = await cooldownSpec.isSatisfied(context);
				if (!cooldownResult.accepted) {
					results.push({
						itemId: episode.id,
						itemType: 'episode',
						title: `${episode.series.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: cooldownResult.reason
					});
					continue;
				}

				// Check missing
				const missingResult = await missingSpec.isSatisfied(context);
				if (!missingResult.accepted) {
					results.push({
						itemId: episode.id,
						itemType: 'episode',
						title: `${episode.series.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: missingResult.reason
					});
					continue;
				}

				// Group by series
				if (!episodesBySeriesAndSeason.has(episode.seriesId)) {
					episodesBySeriesAndSeason.set(episode.seriesId, new Map());
					seriesDataMap.set(episode.seriesId, episode.series);
				}

				// Group by season within series
				const seasonMap = episodesBySeriesAndSeason.get(episode.seriesId)!;
				if (!seasonMap.has(episode.seasonNumber)) {
					seasonMap.set(episode.seasonNumber, []);
				}
				seasonMap.get(episode.seasonNumber)!.push(episode);
			}

			// Preload all season episode counts in a single query to avoid N+1
			const allSeriesIds = Array.from(episodesBySeriesAndSeason.keys());
			await this.preloadSeasonEpisodeCounts(allSeriesIds);

			// Process each series with cascading strategy
			for (const [currentSeriesId, seasonMap] of episodesBySeriesAndSeason) {
				// Check for cancellation before each series
				if (signal?.aborted) {
					logger.info('[MonitoringSearch] Missing episodes search cancelled between series');
					throw new TaskCancelledException('search');
				}

				const seriesData = seriesDataMap.get(currentSeriesId);
				if (!seriesData) continue;

				const seriesResults = await this.searchSeriesWithCascadingStrategy(
					seriesData,
					seasonMap,
					signal
				);
				results.push(...seriesResults);
			}
		} catch (error) {
			logger.error('[MonitoringSearch] Missing episodes search failed', error);
		} finally {
			// Clear the cache after search completes
			this.clearSeasonEpisodeCountCache();
		}

		return this.aggregateResults(results);
	}

	/**
	 * Search for a series using cascading strategy: season packs first, then individual episodes
	 * This prioritizes efficient downloads that get multiple episodes at once
	 * @param signal - Optional AbortSignal for cancellation support
	 */
	private async searchSeriesWithCascadingStrategy(
		seriesData: NonNullable<
			typeof series.$inferSelect & { scoringProfile?: typeof scoringProfiles.$inferSelect | null }
		>,
		seasonMap: Map<number, Array<typeof episodes.$inferSelect>>,
		signal?: AbortSignal
	): Promise<ItemSearchResult[]> {
		const results: ItemSearchResult[] = [];
		const grabbedEpisodeIds = new Set<string>();

		logger.info('[MonitoringSearch] Processing series with cascading strategy', {
			seriesId: seriesData.id,
			title: seriesData.title,
			seasons: Array.from(seasonMap.keys()),
			totalMissingEpisodes: Array.from(seasonMap.values()).reduce((sum, eps) => sum + eps.length, 0)
		});

		// Get total episode counts for each season to calculate missing percentage
		const seasonEpisodeCounts = new Map<number, number>();
		for (const seasonNumber of seasonMap.keys()) {
			const count = await this.getSeasonEpisodeCount(seriesData.id, seasonNumber);
			seasonEpisodeCounts.set(seasonNumber, count);
		}

		// Strategy 1: Try season pack search for seasons with many missing episodes
		// Only try pack search if >= 50% of season is missing
		for (const [seasonNumber, missingEpisodes] of seasonMap) {
			// Check for cancellation before each season
			if (signal?.aborted) {
				throw new TaskCancelledException('search');
			}

			const totalEpisodes = seasonEpisodeCounts.get(seasonNumber) ?? missingEpisodes.length;
			const missingPercent = (missingEpisodes.length / totalEpisodes) * 100;

			// Skip if less than 50% missing - not worth a pack
			if (missingPercent < 50) {
				logger.debug('[MonitoringSearch] Skipping season pack search - not enough missing', {
					seriesTitle: seriesData.title,
					season: seasonNumber,
					missingEpisodes: missingEpisodes.length,
					totalEpisodes,
					missingPercent: missingPercent.toFixed(1)
				});
				continue;
			}

			// Check if episodes are already downloading
			const episodeIds = missingEpisodes.map((e) => e.id);
			const alreadyDownloading = await this.areEpisodesAlreadyDownloading(episodeIds);
			if (alreadyDownloading) {
				logger.debug('[MonitoringSearch] Some episodes already downloading, skipping season pack', {
					seriesTitle: seriesData.title,
					season: seasonNumber
				});
				continue;
			}

			logger.info('[MonitoringSearch] Trying season pack search', {
				seriesTitle: seriesData.title,
				season: seasonNumber,
				missingEpisodes: missingEpisodes.length,
				totalEpisodes,
				missingPercent: missingPercent.toFixed(1)
			});

			// Try season pack search
			const packResult = await this.searchAndGrabSeasonPack(
				seriesData,
				seasonNumber,
				missingEpisodes
			);

			if (packResult.grabbed) {
				// Mark all episodes in this season as handled
				for (const ep of missingEpisodes) {
					grabbedEpisodeIds.add(ep.id);
				}
				results.push(packResult);

				logger.info('[MonitoringSearch] Season pack grabbed successfully', {
					seriesTitle: seriesData.title,
					season: seasonNumber,
					releaseName: packResult.grabbedRelease
				});
			} else {
				// Log that we'll try individual episodes instead
				logger.debug(
					'[MonitoringSearch] No suitable season pack found, will try individual episodes',
					{
						seriesTitle: seriesData.title,
						season: seasonNumber,
						releasesFound: packResult.releasesFound
					}
				);
			}

			// Rate limiting between season searches
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		// Strategy 2: Search for remaining individual episodes
		for (const [seasonNumber, missingEpisodes] of seasonMap) {
			for (const episode of missingEpisodes) {
				// Check for cancellation before each episode
				if (signal?.aborted) {
					throw new TaskCancelledException('search');
				}

				// Skip if already grabbed via pack
				if (grabbedEpisodeIds.has(episode.id)) {
					continue;
				}

				// Update lastSearchTime before searching
				await db
					.update(episodes)
					.set({ lastSearchTime: new Date().toISOString() })
					.where(eq(episodes.id, episode.id));

				// Search and grab individual episode
				// Note: searchAndGrabEpisode now includes packs in results due to filterBySeasonEpisode change
				// Pack bonus scoring will naturally prioritize packs if they're of similar quality
				const searchResult = await this.searchAndGrabEpisode(seriesData, episode);

				// If we grabbed a pack, mark all episodes in that season as handled
				if (searchResult.grabbed && searchResult.grabbedRelease) {
					// Check if the grabbed release is a season pack
					const parsed = parser.parse(searchResult.grabbedRelease);
					if (parsed.episode?.isSeasonPack) {
						// Mark all episodes in this season as handled
						for (const ep of missingEpisodes) {
							grabbedEpisodeIds.add(ep.id);
						}
						logger.info('[MonitoringSearch] Season pack grabbed via episode search', {
							seriesTitle: seriesData.title,
							season: seasonNumber,
							releaseName: searchResult.grabbedRelease
						});
					}
				}

				results.push(searchResult);

				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}

		return results;
	}

	/**
	 * Search for and grab a season pack for a specific season
	 */
	private async searchAndGrabSeasonPack(
		seriesData: typeof series.$inferSelect & {
			scoringProfile?: typeof scoringProfiles.$inferSelect | null;
		},
		seasonNumber: number,
		missingEpisodes: Array<typeof episodes.$inferSelect>
	): Promise<ItemSearchResult> {
		const title = `${seriesData.title} Season ${seasonNumber}`;
		const episodeIds = missingEpisodes.map((e) => e.id);

		try {
			const indexerManager = await getIndexerManager();

			// Get episode count for the target season (for season pack size validation)
			const seasonEpisodeCount = await this.getSeasonEpisodeCount(seriesData.id, seasonNumber);

			// Get all search titles (primary + original + alternates)
			const searchTitles = await getSeriesSearchTitles(seriesData.id);

			// Build search criteria - season only (no episode number) to get packs
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: seasonNumber,
				searchTitles
				// Note: No episode number - this will return season packs
			};

			// Perform enriched search (automatic - background monitoring)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE,
					seasonEpisodeCount
				}
			});

			if (searchResult.releases.length === 0) {
				return {
					itemId: episodeIds[0], // Use first episode as representative
					itemType: 'episode',
					title,
					searched: true,
					releasesFound: 0,
					grabbed: false
				};
			}

			// Filter to only season packs (the enricher should already prioritize these via pack bonus)
			const seasonPacks = searchResult.releases.filter((release) => {
				const isSeasonPack =
					release.parsed.episode?.isSeasonPack ?? release.episodeMatch?.isSeasonPack ?? false;
				const packSeasons = release.parsed.episode?.seasons ??
					release.episodeMatch?.seasons ?? [
						release.parsed.episode?.season ?? release.episodeMatch?.season
					];
				return isSeasonPack && packSeasons?.includes(seasonNumber);
			});

			if (seasonPacks.length === 0) {
				return {
					itemId: episodeIds[0],
					itemType: 'episode',
					title,
					searched: true,
					releasesFound: searchResult.releases.length,
					grabbed: false
				};
			}

			// Find best non-blocklisted season pack
			const blocklistSpec = new ReleaseBlocklistSpecification({ seriesId: seriesData.id });
			let grabResult: {
				success: boolean;
				releaseName?: string;
				queueItemId?: string;
				error?: string;
			} | null = null;

			// Load scoring profile for explicit validation
			let profile: ScoringProfile | undefined;
			if (seriesData.scoringProfileId) {
				profile = (await qualityFilter.getProfile(seriesData.scoringProfileId)) ?? undefined;
			}
			if (!profile) {
				profile = await qualityFilter.getDefaultScoringProfile();
			}

			for (const release of seasonPacks) {
				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					infoHash: release.infoHash,
					indexerId: release.indexerId
				};

				// Check blocklist
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					logger.debug('[MonitoringSearch] Season pack blocklisted, trying next', {
						title: release.title,
						reason: blocklistResult.reason
					});
					continue;
				}

				// Validate release against scoring profile
				if (profile) {
					const scoreResult = scoreRelease(release.title, profile, undefined, release.size, {
						mediaType: 'tv',
						isSeasonPack: true,
						episodeCount: seasonEpisodeCount
					});
					if (!scoreResult.meetsMinimum || scoreResult.isBanned || scoreResult.sizeRejected) {
						logger.debug('[MonitoringSearch] Season pack rejected by scoring profile', {
							seriesId: seriesData.id,
							season: seasonNumber,
							title: release.title,
							score: scoreResult.totalScore,
							reason: scoreResult.isBanned
								? 'banned'
								: scoreResult.sizeRejected
									? scoreResult.sizeRejectionReason
									: `score ${scoreResult.totalScore} below minimum ${profile.minScore ?? 0}`
						});
						continue;
					}
				}

				// Found a valid season pack, grab it
				grabResult = await this.grabRelease(release, {
					mediaType: 'tv',
					seriesId: seriesData.id,
					episodeIds,
					seasonNumber,
					isAutomatic: true
				});

				if (grabResult.success) {
					break; // Successfully grabbed
				}
			}

			return {
				itemId: episodeIds[0],
				itemType: 'episode',
				title,
				searched: true,
				releasesFound: seasonPacks.length,
				grabbed: grabResult?.success ?? false,
				grabbedRelease: grabResult?.releaseName,
				queueItemId: grabResult?.queueItemId,
				error: grabResult?.error
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				itemId: episodeIds[0],
				itemType: 'episode',
				title,
				searched: true,
				releasesFound: 0,
				grabbed: false,
				error: message
			};
		}
	}

	/**
	 * Search for upgrades (movies/episodes with files below cutoff or all items)
	 * @param options.cutoffUnmetOnly - If true, only search items below cutoff. If false, search all items.
	 * @param options.signal - Optional AbortSignal for cancellation support
	 * @param options.dryRun - If true, don't grab - just log what would happen
	 */
	async searchForUpgrades(options: UpgradeSearchOptions = {}): Promise<SearchResults> {
		const cutoffUnmetOnly = options.cutoffUnmetOnly ?? true; // Default to legacy behavior
		const signal = options.signal;
		const dryRun = options.dryRun ?? false;
		logger.info('[MonitoringSearch] Starting upgrade search', {
			...options,
			cutoffUnmetOnly,
			dryRun
		});

		const results: ItemSearchResult[] = [];
		const upgradeDetails: UpgradeDecisionDetail[] = [];
		const maxItems = options.maxItems;

		try {
			// Check for cancellation
			if (signal?.aborted) {
				logger.info('[MonitoringSearch] Upgrade search cancelled');
				throw new TaskCancelledException('search');
			}

			// Search for movie upgrades
			if (!options.seriesIds) {
				const { items: movieItems, details: movieDetails } = await this.searchMovieUpgrades(
					options.movieIds,
					maxItems,
					cutoffUnmetOnly,
					signal,
					dryRun
				);
				results.push(...movieItems);
				if (movieDetails) {
					upgradeDetails.push(...movieDetails);
				}
			}

			// Check for cancellation between movie and episode search
			if (signal?.aborted) {
				logger.info('[MonitoringSearch] Upgrade search cancelled after movies');
				throw new TaskCancelledException('search');
			}

			// Search for episode upgrades
			if (!options.movieIds) {
				const { items: episodeItems, details: episodeDetails } = await this.searchEpisodeUpgrades(
					options.seriesIds,
					maxItems,
					cutoffUnmetOnly,
					signal,
					dryRun
				);
				results.push(...episodeItems);
				if (episodeDetails) {
					upgradeDetails.push(...episodeDetails);
				}
			}
		} catch (error) {
			if (TaskCancelledException.isTaskCancelled(error)) {
				throw error;
			}
			logger.error('[MonitoringSearch] Upgrade search failed', error);
		}

		const aggregated = this.aggregateResults(results);
		if (dryRun && upgradeDetails.length > 0) {
			aggregated.upgradeDetails = upgradeDetails;
		}
		return aggregated;
	}

	/**
	 * Search for movie upgrades
	 * @param cutoffUnmetOnly - If true, only search items below cutoff. If false, search all items with files.
	 * @param signal - Optional AbortSignal for cancellation support
	 * @param dryRun - If true, don't grab - just log what would happen
	 */
	private async searchMovieUpgrades(
		movieIds?: string[],
		maxItems?: number,
		cutoffUnmetOnly: boolean = true,
		signal?: AbortSignal,
		dryRun: boolean = false
	): Promise<{ items: ItemSearchResult[]; details?: UpgradeDecisionDetail[] }> {
		const results: ItemSearchResult[] = [];
		const details: UpgradeDecisionDetail[] = [];

		try {
			// Check for cancellation
			if (signal?.aborted) {
				throw new TaskCancelledException('search');
			}

			// Query monitored movies WITH files
			const query =
				movieIds && movieIds.length > 0
					? and(eq(movies.monitored, true), eq(movies.hasFile, true))
					: and(eq(movies.monitored, true), eq(movies.hasFile, true));

			const moviesWithFiles = await db.query.movies.findMany({
				where: query,
				with: {
					scoringProfile: true
				},
				...(maxItems && { limit: maxItems })
			});

			logger.info('[MonitoringSearch] Found movies with files for upgrade check', {
				count: moviesWithFiles.length,
				cutoffUnmetOnly,
				dryRun
			});

			// Get existing files
			const cutoffSpec = new MovieCutoffUnmetSpecification();
			const monitoredSpec = new MovieMonitoredSpecification();
			const readOnlySpec = new MovieReadOnlyFolderSpecification();
			const cooldownSpec = new MovieSearchCooldownSpecification();

			for (const movie of moviesWithFiles) {
				// Check for cancellation before each movie
				if (signal?.aborted) {
					throw new TaskCancelledException('search');
				}

				// Get existing file
				const existingFiles = await db.query.movieFiles.findMany({
					where: eq(movieFiles.movieId, movie.id),
					limit: 1
				});

				if (existingFiles.length === 0) continue;

				const context: MovieContext = {
					movie,
					existingFile: existingFiles[0],
					profile: movie.scoringProfile ?? undefined
				};

				// Check monitored
				const monitoredResult = await monitoredSpec.isSatisfied(context);
				if (!monitoredResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: monitoredResult.reason
					});
					continue;
				}

				// Skip movies in read-only folders (imports would fail anyway)
				const readOnlyResult = await readOnlySpec.isSatisfied(context);
				if (!readOnlyResult.accepted) {
					results.push({
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: readOnlyResult.reason
					});
					continue;
				}

				// Check search cooldown (prevent hammering indexers) - skip in dry-run mode
				if (!dryRun) {
					const cooldownResult = await cooldownSpec.isSatisfied(context);
					if (!cooldownResult.accepted) {
						results.push({
							itemId: movie.id,
							itemType: 'movie',
							title: movie.title,
							searched: false,
							releasesFound: 0,
							grabbed: false,
							skipped: true,
							skipReason: cooldownResult.reason
						});
						continue;
					}
				}

				// Check if cutoff is unmet (only when cutoffUnmetOnly is true)
				if (cutoffUnmetOnly) {
					const cutoffResult = await cutoffSpec.isSatisfied(context);
					if (!cutoffResult.accepted) {
						results.push({
							itemId: movie.id,
							itemType: 'movie',
							title: movie.title,
							searched: false,
							releasesFound: 0,
							grabbed: false,
							skipped: true,
							skipReason: cutoffResult.reason
						});
						continue;
					}
				}

				// Update lastSearchTime before searching (skip in dry-run mode)
				if (!dryRun) {
					await db
						.update(movies)
						.set({ lastSearchTime: new Date().toISOString() })
						.where(eq(movies.id, movie.id));
				}

				// Search for better releases
				const { result: searchResult, detail } = await this.searchAndUpgradeMovie(
					movie,
					existingFiles[0],
					dryRun
				);
				results.push(searchResult);
				if (detail) {
					details.push(detail);
				}

				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		} catch (error) {
			logger.error('[MonitoringSearch] Movie upgrade search failed', error);
		}

		return { items: results, details: dryRun ? details : undefined };
	}

	/**
	 * Search for episode upgrades
	 * @param cutoffUnmetOnly - If true, only search items below cutoff. If false, search all items with files.
	 * @param signal - Optional AbortSignal for cancellation support
	 * @param dryRun - If true, don't grab - just log what would happen
	 */
	private async searchEpisodeUpgrades(
		seriesIds?: string[],
		maxItems?: number,
		cutoffUnmetOnly: boolean = true,
		signal?: AbortSignal,
		dryRun: boolean = false
	): Promise<{ items: ItemSearchResult[]; details?: UpgradeDecisionDetail[] }> {
		const results: ItemSearchResult[] = [];
		const details: UpgradeDecisionDetail[] = [];

		try {
			// Check for cancellation
			if (signal?.aborted) {
				throw new TaskCancelledException('search');
			}

			// Query monitored episodes WITH files
			const query =
				seriesIds && seriesIds.length > 0
					? and(
							eq(episodes.monitored, true),
							eq(episodes.hasFile, true),
							inArray(episodes.seriesId, seriesIds)
						)
					: and(eq(episodes.monitored, true), eq(episodes.hasFile, true));

			const episodesWithFiles = await db.query.episodes.findMany({
				where: query,
				with: {
					series: {
						with: {
							scoringProfile: true
						}
					},
					season: true
				},
				...(maxItems && { limit: maxItems })
			});

			logger.info('[MonitoringSearch] Found episodes with files for upgrade check', {
				count: episodesWithFiles.length,
				cutoffUnmetOnly,
				dryRun
			});

			// Preload season episode counts to avoid N+1 queries
			const uniqueSeriesIds = [...new Set(episodesWithFiles.map((e) => e.seriesId))];
			await this.preloadSeasonEpisodeCounts(uniqueSeriesIds);

			const cutoffSpec = new EpisodeCutoffUnmetSpecification();
			const monitoredSpec = new EpisodeMonitoredSpecification();
			const readOnlySpec = new EpisodeReadOnlyFolderSpecification();
			const cooldownSpec = new EpisodeSearchCooldownSpecification();

			for (const episode of episodesWithFiles) {
				// Check for cancellation before each episode
				if (signal?.aborted) {
					throw new TaskCancelledException('search');
				}

				if (!episode.series) continue;

				// Get existing file
				const existingFiles = await db.query.episodeFiles.findMany({
					where: eq(episodeFiles.seriesId, episode.seriesId),
					limit: 1
				});

				if (existingFiles.length === 0) continue;

				const context: EpisodeContext = {
					series: episode.series,
					episode,
					existingFile: existingFiles[0],
					profile: episode.series.scoringProfile ?? undefined
				};

				// Check monitored
				const monitoredResult = await monitoredSpec.isSatisfied(context);
				if (!monitoredResult.accepted) {
					continue; // Skip silently
				}

				// Skip episodes in read-only folders (imports would fail anyway)
				const readOnlyResult = await readOnlySpec.isSatisfied(context);
				if (!readOnlyResult.accepted) {
					continue; // Skip silently - can't upgrade in read-only folder
				}

				// Check search cooldown (prevent hammering indexers) - skip in dry-run mode
				if (!dryRun) {
					const cooldownResult = await cooldownSpec.isSatisfied(context);
					if (!cooldownResult.accepted) {
						continue; // Skip silently - recently searched
					}
				}

				// Check if cutoff is unmet (only when cutoffUnmetOnly is true)
				if (cutoffUnmetOnly) {
					const cutoffResult = await cutoffSpec.isSatisfied(context);
					if (!cutoffResult.accepted) {
						continue; // Skip silently - already at cutoff
					}
				}

				// Update lastSearchTime before searching (skip in dry-run mode)
				if (!dryRun) {
					await db
						.update(episodes)
						.set({ lastSearchTime: new Date().toISOString() })
						.where(eq(episodes.id, episode.id));
				}

				// Search for better releases
				const { result: searchResult, detail } = await this.searchAndUpgradeEpisode(
					episode.series,
					episode,
					existingFiles[0],
					dryRun
				);
				results.push(searchResult);
				if (detail) {
					details.push(detail);
				}

				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		} catch (error) {
			logger.error('[MonitoringSearch] Episode upgrade search failed', error);
		} finally {
			// Clear the cache after search completes
			this.clearSeasonEpisodeCountCache();
		}

		return { items: results, details: dryRun ? details : undefined };
	}

	/**
	 * Search and grab an upgrade for a movie
	 * @param dryRun - If true, don't grab - just log and return what would happen
	 */
	private async searchAndUpgradeMovie(
		movie: typeof movies.$inferSelect & {
			scoringProfile?: typeof scoringProfiles.$inferSelect | null;
		},
		existingFile: typeof movieFiles.$inferSelect,
		dryRun: boolean = false
	): Promise<{ result: ItemSearchResult; detail?: UpgradeDecisionDetail }> {
		// Get existing file name for scoring
		const existingFileName = existingFile.sceneName || existingFile.relativePath;

		// Load scoring profile for scoring
		let profile: ScoringProfile | undefined;
		if (movie.scoringProfile) {
			profile = (await qualityFilter.getProfile(movie.scoringProfile.id)) ?? undefined;
		}

		// Score the existing file upfront for dry-run reporting
		let existingScore = 0;
		let existingBreakdown: Record<string, number> = {};
		if (profile) {
			const existingScoreResult = scoreRelease(existingFileName, profile, undefined, undefined, {
				mediaType: 'movie'
			});
			existingScore = existingScoreResult.totalScore;
			existingBreakdown = Object.fromEntries(
				Object.entries(existingScoreResult.breakdown).map(([k, v]) => [k, v.score])
			);
		}

		try {
			const indexerManager = await getIndexerManager();

			// Get all search titles (primary + original + alternates)
			const searchTitles = await getMovieSearchTitles(movie.id);

			// Build search criteria
			const criteria: SearchCriteria = {
				searchType: 'movie',
				query: movie.title,
				tmdbId: movie.tmdbId,
				imdbId: movie.imdbId ?? undefined,
				year: movie.year ?? undefined,
				searchTitles
			};

			// Perform enriched search (automatic - background monitoring)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: movie.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			if (searchResult.releases.length === 0) {
				const result: ItemSearchResult = {
					itemId: movie.id,
					itemType: 'movie',
					title: movie.title,
					searched: true,
					releasesFound: 0,
					grabbed: false
				};
				const detail: UpgradeDecisionDetail | undefined = dryRun
					? {
							itemId: movie.id,
							itemType: 'movie',
							title: movie.title,
							existingFile: {
								name: existingFileName,
								score: existingScore,
								breakdown: existingBreakdown
							},
							bestCandidate: null,
							candidatesChecked: 0,
							wouldGrab: false,
							reason: 'No releases found'
						}
					: undefined;
				return { result, detail };
			}

			// Check each release to see if it's an upgrade
			const upgradeSpec = new MovieUpgradeableSpecification();
			const blocklistSpec = new ReleaseBlocklistSpecification({ movieId: movie.id });
			const context: MovieContext = {
				movie,
				existingFile,
				profile: movie.scoringProfile ?? undefined
			};

			// Track best candidate for dry-run reporting
			let bestCandidate: {
				name: string;
				score: number;
				improvement: number;
				breakdown?: Record<string, number>;
			} | null = null;
			let candidatesChecked = 0;
			let wouldGrabReason = 'No candidates passed checks';

			for (const release of searchResult.releases) {
				candidatesChecked++;

				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					quality: {
						resolution: release.parsed.resolution,
						source: release.parsed.source,
						codec: release.parsed.codec,
						hdr: release.parsed.hdr ?? undefined
					},
					infoHash: release.infoHash,
					indexerId: release.indexerId
				};

				// Check blocklist first
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					if (dryRun) {
						logger.info('[DryRun] Release blocklisted', {
							movie: movie.title,
							release: release.title,
							reason: blocklistResult.reason
						});
					} else {
						logger.debug('[MonitoringSearch] Release blocklisted', {
							title: release.title,
							reason: blocklistResult.reason
						});
					}
					continue;
				}

				// Reject TV episodes when searching for movies
				// This prevents mismatches like "Doom.Patrol.S03E06.1917.Patrol" being grabbed for movie "1917"
				const episodeInfo = release.parsed.episode;
				if (episodeInfo && (episodeInfo.season !== undefined || episodeInfo.episodes?.length)) {
					if (dryRun) {
						logger.info('[DryRun] Release rejected - TV episode, not a movie', {
							movie: movie.title,
							release: release.title,
							season: episodeInfo.season,
							episodes: episodeInfo.episodes
						});
					} else {
						logger.debug('[MonitoringSearch] Release rejected - TV episode, not a movie', {
							movieId: movie.id,
							title: release.title,
							season: episodeInfo.season,
							episodes: episodeInfo.episodes
						});
					}
					continue;
				}

				// Validate release against scoring profile (defense-in-depth check)
				if (profile) {
					const candidateScoreResult = scoreRelease(
						release.title,
						profile,
						undefined,
						release.size,
						{
							mediaType: 'movie'
						}
					);
					if (
						!candidateScoreResult.meetsMinimum ||
						candidateScoreResult.isBanned ||
						candidateScoreResult.sizeRejected
					) {
						const reason = candidateScoreResult.isBanned
							? 'banned'
							: candidateScoreResult.sizeRejected
								? candidateScoreResult.sizeRejectionReason
								: `score ${candidateScoreResult.totalScore} below minimum ${profile.minScore ?? 0}`;
						if (dryRun) {
							logger.info('[DryRun] Release rejected by scoring profile', {
								movie: movie.title,
								release: release.title,
								score: candidateScoreResult.totalScore,
								reason
							});
						} else {
							logger.debug('[MonitoringSearch] Release rejected by scoring profile', {
								movieId: movie.id,
								title: release.title,
								score: candidateScoreResult.totalScore,
								reason
							});
						}
						continue;
					}

					// Get comparison details for dry-run
					if (dryRun && profile) {
						const comparison = isUpgrade(existingFileName, release.title, profile, {
							minimumImprovement: movie.scoringProfile?.minScoreIncrement || 0,
							allowSidegrade: false,
							candidateSizeBytes: release.size
						});

						const candidateBreakdown = Object.fromEntries(
							Object.entries(comparison.candidate.breakdown).map(([k, v]) => [k, v.score])
						);

						logger.info('[DryRun] Upgrade comparison', {
							movie: movie.title,
							existingFile: existingFileName,
							existingScore: comparison.existing.totalScore,
							candidate: release.title,
							candidateScore: comparison.candidate.totalScore,
							improvement: comparison.improvement,
							minRequired: movie.scoringProfile?.minScoreIncrement || 0,
							isUpgrade: comparison.isUpgrade,
							verdict: comparison.isUpgrade ? 'WOULD GRAB' : 'REJECTED'
						});

						// Track best candidate (even if not accepted)
						if (!bestCandidate || comparison.candidate.totalScore > bestCandidate.score) {
							bestCandidate = {
								name: release.title,
								score: comparison.candidate.totalScore,
								improvement: comparison.improvement,
								breakdown: candidateBreakdown
							};
							if (comparison.isUpgrade) {
								wouldGrabReason = 'Upgrade accepted';
							} else if (comparison.improvement <= 0) {
								wouldGrabReason = `Score not better (improvement: ${comparison.improvement})`;
							} else {
								wouldGrabReason = `Improvement ${comparison.improvement} below minimum ${movie.scoringProfile?.minScoreIncrement || 0}`;
							}
						}
					}
				}

				const upgradeResult = await upgradeSpec.isSatisfied(context, releaseCandidate);
				if (upgradeResult.accepted) {
					if (dryRun) {
						// In dry-run mode, don't actually grab - just report what would happen
						logger.info('[DryRun] Would grab upgrade', {
							movie: movie.title,
							release: release.title,
							existingFile: existingFileName,
							existingScore,
							candidateScore: release.totalScore ?? 0
						});

						const result: ItemSearchResult = {
							itemId: movie.id,
							itemType: 'movie',
							title: movie.title,
							searched: true,
							releasesFound: searchResult.releases.length,
							grabbed: false, // Didn't actually grab
							grabbedRelease: release.title // What would have been grabbed
						};
						const detail: UpgradeDecisionDetail = {
							itemId: movie.id,
							itemType: 'movie',
							title: movie.title,
							existingFile: {
								name: existingFileName,
								score: existingScore,
								breakdown: existingBreakdown
							},
							bestCandidate: bestCandidate ?? {
								name: release.title,
								score: release.totalScore ?? 0,
								improvement: (release.totalScore ?? 0) - existingScore
							},
							candidatesChecked,
							wouldGrab: true,
							reason: 'Upgrade accepted - would grab'
						};
						return { result, detail };
					}

					// This is an upgrade! Grab it
					const grabResult = await this.grabRelease(release, {
						mediaType: 'movie',
						movieId: movie.id,
						isAutomatic: true,
						isUpgrade: true
					});

					return {
						result: {
							itemId: movie.id,
							itemType: 'movie',
							title: movie.title,
							searched: true,
							releasesFound: searchResult.releases.length,
							grabbed: grabResult.success,
							grabbedRelease: grabResult.releaseName,
							queueItemId: grabResult.queueItemId,
							error: grabResult.error
						}
					};
				}
			}

			// No upgrades found
			const result: ItemSearchResult = {
				itemId: movie.id,
				itemType: 'movie',
				title: movie.title,
				searched: true,
				releasesFound: searchResult.releases.length,
				grabbed: false
			};
			const detail: UpgradeDecisionDetail | undefined = dryRun
				? {
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						existingFile: {
							name: existingFileName,
							score: existingScore,
							breakdown: existingBreakdown
						},
						bestCandidate,
						candidatesChecked,
						wouldGrab: false,
						reason: wouldGrabReason
					}
				: undefined;
			return { result, detail };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			const result: ItemSearchResult = {
				itemId: movie.id,
				itemType: 'movie',
				title: movie.title,
				searched: true,
				releasesFound: 0,
				grabbed: false,
				error: message
			};
			const detail: UpgradeDecisionDetail | undefined = dryRun
				? {
						itemId: movie.id,
						itemType: 'movie',
						title: movie.title,
						existingFile: {
							name: existingFileName,
							score: existingScore,
							breakdown: existingBreakdown
						},
						bestCandidate: null,
						candidatesChecked: 0,
						wouldGrab: false,
						reason: `Error: ${message}`
					}
				: undefined;
			return { result, detail };
		}
	}

	/**
	 * Search and grab an upgrade for an episode
	 * @param dryRun - If true, don't grab - just log and return what would happen
	 */
	private async searchAndUpgradeEpisode(
		seriesData: typeof series.$inferSelect & {
			scoringProfile?: typeof scoringProfiles.$inferSelect | null;
		},
		episode: typeof episodes.$inferSelect,
		existingFile: typeof episodeFiles.$inferSelect,
		dryRun: boolean = false
	): Promise<{ result: ItemSearchResult; detail?: UpgradeDecisionDetail }> {
		const title = `${seriesData.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`;

		// Get existing file name for scoring
		const existingFileName = existingFile.sceneName || existingFile.relativePath;

		// Load scoring profile for scoring
		let profile: ScoringProfile | undefined;
		if (seriesData.scoringProfileId) {
			profile = (await qualityFilter.getProfile(seriesData.scoringProfileId)) ?? undefined;
		}
		if (!profile) {
			profile = await qualityFilter.getDefaultScoringProfile();
		}

		// Score the existing file upfront for dry-run reporting
		let existingScore = 0;
		let existingBreakdown: Record<string, number> = {};
		if (profile) {
			const existingScoreResult = scoreRelease(existingFileName, profile, undefined, undefined, {
				mediaType: 'tv'
			});
			existingScore = existingScoreResult.totalScore;
			existingBreakdown = Object.fromEntries(
				Object.entries(existingScoreResult.breakdown).map(([k, v]) => [k, v.score])
			);
		}

		try {
			const indexerManager = await getIndexerManager();

			// Get episode count for the target season (for season pack size validation)
			const seasonEpisodeCount = await this.getSeasonEpisodeCount(
				seriesData.id,
				episode.seasonNumber
			);

			// Get all search titles (primary + original + alternates)
			const searchTitles = await getSeriesSearchTitles(seriesData.id);

			// Build search criteria
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: episode.seasonNumber,
				episode: episode.episodeNumber,
				searchTitles
			};

			// Perform enriched search (automatic - background monitoring)
			// Pass seasonEpisodeCount for proper season pack size validation during enrichment
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE,
					seasonEpisodeCount
				}
			});

			if (searchResult.releases.length === 0) {
				const result: ItemSearchResult = {
					itemId: episode.id,
					itemType: 'episode',
					title,
					searched: true,
					releasesFound: 0,
					grabbed: false
				};
				const detail: UpgradeDecisionDetail | undefined = dryRun
					? {
							itemId: episode.id,
							itemType: 'episode',
							title,
							existingFile: {
								name: existingFileName,
								score: existingScore,
								breakdown: existingBreakdown
							},
							bestCandidate: null,
							candidatesChecked: 0,
							wouldGrab: false,
							reason: 'No releases found'
						}
					: undefined;
				return { result, detail };
			}

			// Check each release to see if it's an upgrade
			const upgradeSpec = new EpisodeUpgradeableSpecification();
			const blocklistSpec = new ReleaseBlocklistSpecification({ seriesId: seriesData.id });
			const context: EpisodeContext = {
				series: seriesData,
				episode,
				existingFile,
				profile: seriesData.scoringProfile ?? undefined
			};

			// Track best candidate for dry-run reporting
			let bestCandidate: {
				name: string;
				score: number;
				improvement: number;
				breakdown?: Record<string, number>;
			} | null = null;
			let candidatesChecked = 0;
			let wouldGrabReason = 'No candidates passed checks';

			for (const release of searchResult.releases) {
				candidatesChecked++;

				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					quality: {
						resolution: release.parsed.resolution,
						source: release.parsed.source,
						codec: release.parsed.codec,
						hdr: release.parsed.hdr ?? undefined
					},
					infoHash: release.infoHash,
					indexerId: release.indexerId
				};

				// Check blocklist first
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					if (dryRun) {
						logger.info('[DryRun] Release blocklisted', {
							episode: title,
							release: release.title,
							reason: blocklistResult.reason
						});
					} else {
						logger.debug('[MonitoringSearch] Release blocklisted', {
							title: release.title,
							reason: blocklistResult.reason
						});
					}
					continue;
				}

				// Validate release against scoring profile (defense-in-depth check)
				if (profile) {
					// Check if this is a season pack and get episode count for proper size validation
					const isSeasonPack =
						release.parsed.episode?.isSeasonPack ?? release.episodeMatch?.isSeasonPack ?? false;
					let episodeCount: number | undefined;
					if (isSeasonPack) {
						// For season packs, we need episode count for per-episode size calculation
						// Use the season from the release if available, otherwise use the target episode's season
						const releaseSeasons = release.parsed.episode?.seasons ?? release.episodeMatch?.seasons;
						const targetSeason = releaseSeasons?.[0] ?? episode.seasonNumber;
						episodeCount = await this.getSeasonEpisodeCount(seriesData.id, targetSeason);
					}

					const candidateScoreResult = scoreRelease(
						release.title,
						profile,
						undefined,
						release.size,
						{
							mediaType: 'tv',
							isSeasonPack,
							episodeCount
						}
					);
					if (
						!candidateScoreResult.meetsMinimum ||
						candidateScoreResult.isBanned ||
						candidateScoreResult.sizeRejected
					) {
						const reason = candidateScoreResult.isBanned
							? 'banned'
							: candidateScoreResult.sizeRejected
								? candidateScoreResult.sizeRejectionReason
								: `score ${candidateScoreResult.totalScore} below minimum ${profile.minScore ?? 0}`;
						if (dryRun) {
							logger.info('[DryRun] Release rejected by scoring profile', {
								episode: title,
								release: release.title,
								score: candidateScoreResult.totalScore,
								reason
							});
						} else {
							logger.debug('[MonitoringSearch] Release rejected by scoring profile', {
								seriesId: seriesData.id,
								episodeId: episode.id,
								title: release.title,
								score: candidateScoreResult.totalScore,
								isSeasonPack,
								episodeCount,
								reason
							});
						}
						continue;
					}

					// Get comparison details for dry-run
					if (dryRun && profile) {
						const comparison = isUpgrade(existingFileName, release.title, profile, {
							minimumImprovement: seriesData.scoringProfile?.minScoreIncrement || 0,
							allowSidegrade: false,
							candidateSizeBytes: release.size
						});

						const candidateBreakdown = Object.fromEntries(
							Object.entries(comparison.candidate.breakdown).map(([k, v]) => [k, v.score])
						);

						logger.info('[DryRun] Upgrade comparison', {
							episode: title,
							existingFile: existingFileName,
							existingScore: comparison.existing.totalScore,
							candidate: release.title,
							candidateScore: comparison.candidate.totalScore,
							improvement: comparison.improvement,
							minRequired: seriesData.scoringProfile?.minScoreIncrement || 0,
							isUpgrade: comparison.isUpgrade,
							verdict: comparison.isUpgrade ? 'WOULD GRAB' : 'REJECTED'
						});

						// Track best candidate (even if not accepted)
						if (!bestCandidate || comparison.candidate.totalScore > bestCandidate.score) {
							bestCandidate = {
								name: release.title,
								score: comparison.candidate.totalScore,
								improvement: comparison.improvement,
								breakdown: candidateBreakdown
							};
							if (comparison.isUpgrade) {
								wouldGrabReason = 'Upgrade accepted';
							} else if (comparison.improvement <= 0) {
								wouldGrabReason = `Score not better (improvement: ${comparison.improvement})`;
							} else {
								wouldGrabReason = `Improvement ${comparison.improvement} below minimum ${seriesData.scoringProfile?.minScoreIncrement || 0}`;
							}
						}
					}
				}

				const upgradeResult = await upgradeSpec.isSatisfied(context, releaseCandidate);
				if (upgradeResult.accepted) {
					if (dryRun) {
						// In dry-run mode, don't actually grab - just report what would happen
						logger.info('[DryRun] Would grab upgrade', {
							episode: title,
							release: release.title,
							existingFile: existingFileName,
							existingScore,
							candidateScore: release.totalScore ?? 0
						});

						const result: ItemSearchResult = {
							itemId: episode.id,
							itemType: 'episode',
							title,
							searched: true,
							releasesFound: searchResult.releases.length,
							grabbed: false, // Didn't actually grab
							grabbedRelease: release.title // What would have been grabbed
						};
						const detail: UpgradeDecisionDetail = {
							itemId: episode.id,
							itemType: 'episode',
							title,
							existingFile: {
								name: existingFileName,
								score: existingScore,
								breakdown: existingBreakdown
							},
							bestCandidate: bestCandidate ?? {
								name: release.title,
								score: release.totalScore ?? 0,
								improvement: (release.totalScore ?? 0) - existingScore
							},
							candidatesChecked,
							wouldGrab: true,
							reason: 'Upgrade accepted - would grab'
						};
						return { result, detail };
					}

					// This is an upgrade! Grab it
					const grabResult = await this.grabRelease(release, {
						mediaType: 'tv',
						seriesId: seriesData.id,
						episodeIds: [episode.id],
						seasonNumber: episode.seasonNumber,
						isAutomatic: true,
						isUpgrade: true
					});

					return {
						result: {
							itemId: episode.id,
							itemType: 'episode',
							title,
							searched: true,
							releasesFound: searchResult.releases.length,
							grabbed: grabResult.success,
							grabbedRelease: grabResult.releaseName,
							queueItemId: grabResult.queueItemId,
							error: grabResult.error
						}
					};
				}
			}

			// No upgrades found
			const result: ItemSearchResult = {
				itemId: episode.id,
				itemType: 'episode',
				title,
				searched: true,
				releasesFound: searchResult.releases.length,
				grabbed: false
			};
			const detail: UpgradeDecisionDetail | undefined = dryRun
				? {
						itemId: episode.id,
						itemType: 'episode',
						title,
						existingFile: {
							name: existingFileName,
							score: existingScore,
							breakdown: existingBreakdown
						},
						bestCandidate,
						candidatesChecked,
						wouldGrab: false,
						reason: wouldGrabReason
					}
				: undefined;
			return { result, detail };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			const result: ItemSearchResult = {
				itemId: episode.id,
				itemType: 'episode',
				title,
				searched: true,
				releasesFound: 0,
				grabbed: false,
				error: message
			};
			const detail: UpgradeDecisionDetail | undefined = dryRun
				? {
						itemId: episode.id,
						itemType: 'episode',
						title,
						existingFile: {
							name: existingFileName,
							score: existingScore,
							breakdown: existingBreakdown
						},
						bestCandidate: null,
						candidatesChecked: 0,
						wouldGrab: false,
						reason: `Error: ${message}`
					}
				: undefined;
			return { result, detail };
		}
	}

	/**
	 * Search for newly aired episodes
	 * @param intervalHours - How far back to look for new episodes
	 * @param signal - Optional AbortSignal for cancellation support
	 */
	async searchNewEpisodes(intervalHours: number, signal?: AbortSignal): Promise<SearchResults> {
		logger.info('[MonitoringSearch] Starting new episode search', { intervalHours });

		const results: ItemSearchResult[] = [];

		try {
			// Check for cancellation
			if (signal?.aborted) {
				logger.info('[MonitoringSearch] New episode search cancelled');
				throw new TaskCancelledException('search');
			}

			// Calculate cutoff date
			const cutoffDate = new Date();
			cutoffDate.setHours(cutoffDate.getHours() - intervalHours);

			// Query recently aired episodes without files
			const recentEpisodes = await db.query.episodes.findMany({
				where: and(
					eq(episodes.monitored, true),
					eq(episodes.hasFile, false),
					lte(episodes.airDate, new Date().toISOString()),
					gte(episodes.airDate, cutoffDate.toISOString())
				),
				with: {
					series: {
						with: {
							scoringProfile: true
						}
					},
					season: true
				}
			});

			logger.info('[MonitoringSearch] Found recently aired episodes', {
				count: recentEpisodes.length
			});

			// Preload season episode counts to avoid N+1 queries
			const uniqueSeriesIds = [...new Set(recentEpisodes.map((e) => e.seriesId))];
			await this.preloadSeasonEpisodeCounts(uniqueSeriesIds);

			// Filter through specifications
			const newEpisodeSpec = new NewEpisodeSpecification({ intervalHours });
			const monitoredSpec = new EpisodeMonitoredSpecification();
			const readOnlySpec = new EpisodeReadOnlyFolderSpecification();

			for (const episode of recentEpisodes) {
				// Check for cancellation before each episode
				if (signal?.aborted) {
					throw new TaskCancelledException('search');
				}

				if (!episode.series) continue;

				const context: EpisodeContext = {
					series: episode.series,
					episode,
					profile: episode.series.scoringProfile ?? undefined
				};

				// Check monitored
				const monitoredResult = await monitoredSpec.isSatisfied(context);
				if (!monitoredResult.accepted) {
					results.push({
						itemId: episode.id,
						itemType: 'episode',
						title: `${episode.series.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: monitoredResult.reason
					});
					continue;
				}

				// Skip episodes in read-only folders (imports would fail anyway)
				const readOnlyResult = await readOnlySpec.isSatisfied(context);
				if (!readOnlyResult.accepted) {
					results.push({
						itemId: episode.id,
						itemType: 'episode',
						title: `${episode.series.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
						searched: false,
						releasesFound: 0,
						grabbed: false,
						skipped: true,
						skipReason: readOnlyResult.reason
					});
					continue;
				}

				// Check if newly aired
				const newEpisodeResult = await newEpisodeSpec.isSatisfied(context);
				if (!newEpisodeResult.accepted) {
					continue; // Skip silently if not in time window
				}

				// Search and grab
				const searchResult = await this.searchAndGrabEpisode(episode.series, episode);
				results.push(searchResult);

				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} catch (error) {
			logger.error('[MonitoringSearch] New episodes search failed', error);
		} finally {
			// Clear the cache after search completes
			this.clearSeasonEpisodeCountCache();
		}

		return this.aggregateResults(results);
	}

	/**
	 * Search and grab the best release for a movie
	 */
	private async searchAndGrabMovie(
		movie: typeof movies.$inferSelect & {
			scoringProfile?: typeof scoringProfiles.$inferSelect | null;
		}
	): Promise<ItemSearchResult> {
		try {
			// Check if movie already has an active download
			const alreadyDownloading = await this.isMovieAlreadyDownloading(movie.id);
			if (alreadyDownloading) {
				logger.debug('[MonitoringSearch] Movie already downloading, skipping', {
					movieId: movie.id,
					title: movie.title
				});
				return {
					itemId: movie.id,
					itemType: 'movie',
					title: movie.title,
					searched: false,
					releasesFound: 0,
					grabbed: false,
					skipped: true,
					skipReason: 'already_downloading'
				};
			}

			const indexerManager = await getIndexerManager();

			// Get all search titles (primary + original + alternates)
			const searchTitles = await getMovieSearchTitles(movie.id);

			// Build search criteria
			const criteria: SearchCriteria = {
				searchType: 'movie',
				query: movie.title,
				tmdbId: movie.tmdbId,
				imdbId: movie.imdbId ?? undefined,
				year: movie.year ?? undefined,
				searchTitles
			};

			// Perform enriched search (automatic - background monitoring)
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: movie.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE
				}
			});

			if (searchResult.releases.length === 0) {
				return {
					itemId: movie.id,
					itemType: 'movie',
					title: movie.title,
					searched: true,
					releasesFound: 0,
					grabbed: false
				};
			}

			// Find best non-blocklisted release that meets scoring requirements
			const blocklistSpec = new ReleaseBlocklistSpecification({ movieId: movie.id });
			let grabResult: {
				success: boolean;
				releaseName?: string;
				queueItemId?: string;
				error?: string;
			} | null = null;

			// Load scoring profile for explicit validation
			let profile: ScoringProfile | undefined;
			if (movie.scoringProfile) {
				profile = (await qualityFilter.getProfile(movie.scoringProfile.id)) ?? undefined;
			}

			for (const release of searchResult.releases) {
				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					infoHash: release.infoHash,
					indexerId: release.indexerId
				};

				// Check blocklist
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					logger.debug('[MonitoringSearch] Release blocklisted, trying next', {
						title: release.title,
						reason: blocklistResult.reason
					});
					continue;
				}

				// Reject TV episodes when searching for movies
				// This prevents mismatches like "Doom.Patrol.S03E06.1917.Patrol" being grabbed for movie "1917"
				const episodeInfo = release.parsed.episode;
				if (episodeInfo && (episodeInfo.season !== undefined || episodeInfo.episodes?.length)) {
					logger.debug('[MonitoringSearch] Release rejected - TV episode, not a movie', {
						movieId: movie.id,
						title: release.title,
						season: episodeInfo.season,
						episodes: episodeInfo.episodes
					});
					continue;
				}

				// Validate release against scoring profile (defense-in-depth check)
				if (profile) {
					const scoreResult = scoreRelease(release.title, profile, undefined, release.size, {
						mediaType: 'movie'
					});
					if (!scoreResult.meetsMinimum || scoreResult.isBanned || scoreResult.sizeRejected) {
						logger.debug('[MonitoringSearch] Release rejected by scoring profile', {
							movieId: movie.id,
							title: release.title,
							score: scoreResult.totalScore,
							meetsMinimum: scoreResult.meetsMinimum,
							isBanned: scoreResult.isBanned,
							sizeRejected: scoreResult.sizeRejected,
							reason: scoreResult.isBanned
								? 'banned'
								: scoreResult.sizeRejected
									? scoreResult.sizeRejectionReason
									: `score ${scoreResult.totalScore} below minimum ${profile.minScore ?? 0}`
						});
						continue;
					}
				}

				// Found a valid release, try to grab it
				grabResult = await this.grabRelease(release, {
					mediaType: 'movie',
					movieId: movie.id,
					isAutomatic: true
				});

				if (grabResult.success) {
					break; // Successfully grabbed
				}
			}

			return {
				itemId: movie.id,
				itemType: 'movie',
				title: movie.title,
				searched: true,
				releasesFound: searchResult.releases.length,
				grabbed: grabResult?.success ?? false,
				grabbedRelease: grabResult?.releaseName,
				queueItemId: grabResult?.queueItemId,
				error: grabResult?.error
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				itemId: movie.id,
				itemType: 'movie',
				title: movie.title,
				searched: true,
				releasesFound: 0,
				grabbed: false,
				error: message
			};
		}
	}

	/**
	 * Search and grab the best release for an episode
	 */
	private async searchAndGrabEpisode(
		seriesData: typeof series.$inferSelect,
		episode: typeof episodes.$inferSelect
	): Promise<ItemSearchResult> {
		const title = `${seriesData.title} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`;

		try {
			// Check if episode already has an active download
			const alreadyDownloading = await this.areEpisodesAlreadyDownloading([episode.id]);
			if (alreadyDownloading) {
				logger.debug('[MonitoringSearch] Episode already downloading, skipping', {
					episodeId: episode.id,
					title
				});
				return {
					itemId: episode.id,
					itemType: 'episode',
					title,
					searched: false,
					releasesFound: 0,
					grabbed: false,
					skipped: true,
					skipReason: 'already_downloading'
				};
			}

			const indexerManager = await getIndexerManager();

			// Get episode count for the target season (for season pack size validation)
			const seasonEpisodeCount = await this.getSeasonEpisodeCount(
				seriesData.id,
				episode.seasonNumber
			);

			// Get all search titles (primary + original + alternates)
			const searchTitles = await getSeriesSearchTitles(seriesData.id);

			// Build search criteria
			const criteria: SearchCriteria = {
				searchType: 'tv',
				query: seriesData.title,
				tmdbId: seriesData.tmdbId,
				tvdbId: seriesData.tvdbId ?? undefined,
				imdbId: seriesData.imdbId ?? undefined,
				season: episode.seasonNumber,
				episode: episode.episodeNumber,
				searchTitles
			};

			// Perform enriched search (automatic - background monitoring)
			// Pass seasonEpisodeCount for proper season pack size validation during enrichment
			const searchResult = await indexerManager.searchEnhanced(criteria, {
				searchSource: 'automatic',
				enrichment: {
					scoringProfileId: seriesData.scoringProfileId ?? undefined,
					filterRejected: true,
					minScore: this.AUTO_GRAB_MIN_SCORE,
					seasonEpisodeCount
				}
			});

			if (searchResult.releases.length === 0) {
				return {
					itemId: episode.id,
					itemType: 'episode',
					title,
					searched: true,
					releasesFound: 0,
					grabbed: false
				};
			}

			// Find best non-blocklisted release that meets scoring requirements
			const blocklistSpec = new ReleaseBlocklistSpecification({ seriesId: seriesData.id });
			let grabResult: {
				success: boolean;
				releaseName?: string;
				queueItemId?: string;
				error?: string;
			} | null = null;

			// Load scoring profile for explicit validation
			let profile: ScoringProfile | undefined;
			if (seriesData.scoringProfileId) {
				profile = (await qualityFilter.getProfile(seriesData.scoringProfileId)) ?? undefined;
			}
			if (!profile) {
				profile = await qualityFilter.getDefaultScoringProfile();
			}

			for (const release of searchResult.releases) {
				const releaseCandidate: ReleaseCandidate = {
					title: release.title,
					score: release.totalScore ?? 0,
					size: release.size,
					infoHash: release.infoHash,
					indexerId: release.indexerId
				};

				// Check blocklist
				const blocklistResult = await blocklistSpec.isSatisfied(releaseCandidate);
				if (!blocklistResult.accepted) {
					logger.debug('[MonitoringSearch] Release blocklisted, trying next', {
						title: release.title,
						reason: blocklistResult.reason
					});
					continue;
				}

				// Validate release against scoring profile (defense-in-depth check)
				if (profile) {
					// Check if this is a season pack and get episode count for proper size validation
					const isSeasonPack =
						release.parsed.episode?.isSeasonPack ?? release.episodeMatch?.isSeasonPack ?? false;
					let episodeCount: number | undefined;
					if (isSeasonPack) {
						// For season packs, we need episode count for per-episode size calculation
						const releaseSeasons = release.parsed.episode?.seasons ?? release.episodeMatch?.seasons;
						const targetSeason = releaseSeasons?.[0] ?? episode.seasonNumber;
						episodeCount = await this.getSeasonEpisodeCount(seriesData.id, targetSeason);
					}

					const scoreResult = scoreRelease(release.title, profile, undefined, release.size, {
						mediaType: 'tv',
						isSeasonPack,
						episodeCount
					});
					if (!scoreResult.meetsMinimum || scoreResult.isBanned || scoreResult.sizeRejected) {
						logger.debug('[MonitoringSearch] Release rejected by scoring profile', {
							seriesId: seriesData.id,
							episodeId: episode.id,
							title: release.title,
							score: scoreResult.totalScore,
							meetsMinimum: scoreResult.meetsMinimum,
							isBanned: scoreResult.isBanned,
							sizeRejected: scoreResult.sizeRejected,
							isSeasonPack,
							episodeCount,
							reason: scoreResult.isBanned
								? 'banned'
								: scoreResult.sizeRejected
									? scoreResult.sizeRejectionReason
									: `score ${scoreResult.totalScore} below minimum ${profile.minScore ?? 0}`
						});
						continue;
					}
				}

				// Found a valid release, try to grab it
				grabResult = await this.grabRelease(release, {
					mediaType: 'tv',
					seriesId: seriesData.id,
					episodeIds: [episode.id],
					seasonNumber: episode.seasonNumber,
					isAutomatic: true
				});

				if (grabResult.success) {
					break; // Successfully grabbed
				}
			}

			return {
				itemId: episode.id,
				itemType: 'episode',
				title,
				searched: true,
				releasesFound: searchResult.releases.length,
				grabbed: grabResult?.success ?? false,
				grabbedRelease: grabResult?.releaseName,
				queueItemId: grabResult?.queueItemId,
				error: grabResult?.error
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				itemId: episode.id,
				itemType: 'episode',
				title,
				searched: true,
				releasesFound: 0,
				grabbed: false,
				error: message
			};
		}
	}

	/**
	 * Grab a release and add to download queue.
	 * Delegates to ReleaseGrabService for proper protocol-specific handling.
	 */
	private async grabRelease(
		release: EnhancedReleaseResult,
		options: {
			mediaType: 'movie' | 'tv';
			movieId?: string;
			seriesId?: string;
			episodeIds?: string[];
			seasonNumber?: number;
			isAutomatic?: boolean;
			isUpgrade?: boolean;
		}
	): Promise<{ success: boolean; releaseName?: string; error?: string; queueItemId?: string }> {
		const releaseGrabService = getReleaseGrabService();
		return releaseGrabService.grabRelease(release, {
			...options,
			isAutomatic: options.isAutomatic ?? true
		});
	}

	// TODO: Remove handleStreamingGrab and handleStreamingSeasonPack methods
	// These are now dead code since grabRelease() delegates to ReleaseGrabService
	// which has its own streaming handling. Can be safely deleted in a future cleanup.

	/**
	 * Handle streaming releases - create .strm file directly instead of using download client
	 * Supports both single episodes and season packs
	 * @deprecated No longer called - ReleaseGrabService handles streaming now
	 */
	private async handleStreamingGrab(
		release: EnhancedReleaseResult,
		options: {
			mediaType: 'movie' | 'tv';
			movieId?: string;
			seriesId?: string;
			episodeIds?: string[];
			seasonNumber?: number;
			isAutomatic?: boolean;
			isUpgrade?: boolean;
		}
	): Promise<{ success: boolean; releaseName?: string; error?: string; queueItemId?: string }> {
		const { mediaType, movieId, seriesId, seasonNumber, episodeIds, isUpgrade } = options;

		logger.info('[MonitoringSearch] Handling streaming release', {
			title: release.title,
			downloadUrl: release.downloadUrl
		});

		// Parse the stream:// URL to get TMDB ID and episode info
		const parsed = StrmService.parseStreamUrl(release.downloadUrl);
		if (!parsed) {
			return { success: false, error: `Invalid streaming URL: ${release.downloadUrl}` };
		}

		// Determine base URL for the .strm file content (from indexer settings, env var, or default)
		const baseUrl = await getStreamingBaseUrl('http://localhost:5173');

		// Handle season pack (multiple episodes)
		if (parsed.isSeasonPack && mediaType === 'tv' && seriesId && parsed.season !== undefined) {
			return this.handleStreamingSeasonPack(release, {
				seriesId,
				seasonNumber: parsed.season,
				tmdbId: parsed.tmdbId,
				baseUrl,
				isUpgrade,
				episodeIds
			});
		}

		// Single file handling (movie or single episode)
		const result = await strmService.createStrmFile({
			mediaType,
			tmdbId: parsed.tmdbId,
			movieId,
			seriesId,
			season: parsed.season ?? seasonNumber,
			episode: parsed.episode,
			baseUrl
		});

		if (!result.success || !result.filePath) {
			logger.error('[MonitoringSearch] Failed to create .strm file', {
				title: release.title,
				error: result.error
			});
			return { success: false, error: result.error };
		}

		logger.info('[MonitoringSearch] Created .strm file for streaming release', {
			title: release.title,
			filePath: result.filePath
		});

		// Now add the file to the database (immediate import)
		try {
			// Get file stats
			const stats = statSync(result.filePath);

			// Parse quality from release title
			const parsedRelease = parser.parse(release.title);
			const quality = {
				resolution: parsedRelease.resolution ?? '1080p',
				source: 'Streaming',
				codec: 'HLS',
				hdr: undefined
			};

			if (mediaType === 'movie' && movieId) {
				// Get movie for root folder path
				const movie = await db.query.movies.findFirst({
					where: eq(movies.id, movieId),
					with: { rootFolder: true }
				});

				if (!movie || !movie.rootFolder) {
					return { success: false, error: 'Movie or root folder not found' };
				}

				const allowStrmProbe = movie.scoringProfileId !== 'streamer';
				const mediaInfo = await mediaInfoService.extractMediaInfo(result.filePath, {
					allowStrmProbe
				});

				// Calculate relative path from root folder
				const relativePath = relative(movie.rootFolder.path, result.filePath);

				// Delete existing files if this is an upgrade
				if (isUpgrade) {
					const existingFiles = await db.query.movieFiles.findMany({
						where: eq(movieFiles.movieId, movieId)
					});
					for (const oldFile of existingFiles) {
						// Delete physical file from disk
						const oldFilePath = join(movie.rootFolder.path, movie.path, oldFile.relativePath);
						try {
							if (await fileExists(oldFilePath)) {
								await unlink(oldFilePath);
								logger.info('[MonitoringSearch] Deleted old movie file from disk', {
									movieId,
									path: oldFilePath
								});
							}
						} catch (deleteError) {
							logger.warn('[MonitoringSearch] Failed to delete old file from disk (continuing)', {
								path: oldFilePath,
								error: deleteError instanceof Error ? deleteError.message : String(deleteError)
							});
						}
						// Delete DB record
						await db.delete(movieFiles).where(eq(movieFiles.id, oldFile.id));
						logger.info('[MonitoringSearch] Deleted old movie file record for streaming upgrade', {
							movieId,
							oldFileId: oldFile.id
						});
					}
				}

				// Create movie file record
				const fileId = randomUUID();
				await db.insert(movieFiles).values({
					id: fileId,
					movieId,
					relativePath,
					size: stats.size,
					dateAdded: new Date().toISOString(),
					sceneName: release.title,
					releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
					quality,
					mediaInfo
				});

				// Update movie hasFile flag
				await db.update(movies).set({ hasFile: true }).where(eq(movies.id, movieId));

				// Create history record
				await db.insert(downloadHistory).values({
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: 'streaming',
					movieId,
					status: 'streaming',
					size: stats.size,
					quality,
					importedPath: result.filePath,
					movieFileId: fileId,
					grabbedAt: new Date().toISOString(),
					importedAt: new Date().toISOString()
				});

				logger.info('[MonitoringSearch] Added streaming movie file to database', {
					movieId,
					fileId,
					relativePath
				});
			} else if (
				mediaType === 'tv' &&
				seriesId &&
				parsed.season !== undefined &&
				parsed.episode !== undefined
			) {
				// Get series for root folder path
				const show = await db.query.series.findFirst({
					where: eq(series.id, seriesId),
					with: { rootFolder: true }
				});

				if (!show || !show.rootFolder) {
					return { success: false, error: 'Series or root folder not found' };
				}

				const allowStrmProbe = show.scoringProfileId !== 'streamer';
				const mediaInfo = await mediaInfoService.extractMediaInfo(result.filePath, {
					allowStrmProbe
				});

				// Find the episode
				const episodeRow = await db.query.episodes.findFirst({
					where: and(
						eq(episodes.seriesId, seriesId),
						eq(episodes.seasonNumber, parsed.season),
						eq(episodes.episodeNumber, parsed.episode)
					)
				});

				if (!episodeRow) {
					return { success: false, error: `Episode S${parsed.season}E${parsed.episode} not found` };
				}

				// Calculate relative path from root folder
				const relativePath = relative(show.rootFolder.path, result.filePath);

				// Delete existing episode file if this is an upgrade
				if (isUpgrade) {
					// Episode files use episodeIds array, find files containing this episode
					const allSeriesFiles = await db.query.episodeFiles.findMany({
						where: eq(episodeFiles.seriesId, seriesId)
					});
					const existingFiles = allSeriesFiles.filter((f) => f.episodeIds?.includes(episodeRow.id));
					for (const oldFile of existingFiles) {
						// Delete physical file from disk
						const oldFilePath = join(show.rootFolder.path, show.path, oldFile.relativePath);
						try {
							if (await fileExists(oldFilePath)) {
								await unlink(oldFilePath);
								logger.info('[MonitoringSearch] Deleted old episode file from disk', {
									episodeId: episodeRow.id,
									path: oldFilePath
								});
							}
						} catch (deleteError) {
							logger.warn(
								'[MonitoringSearch] Failed to delete old episode file from disk (continuing)',
								{
									path: oldFilePath,
									error: deleteError instanceof Error ? deleteError.message : String(deleteError)
								}
							);
						}
						// Delete DB record
						await db.delete(episodeFiles).where(eq(episodeFiles.id, oldFile.id));
						logger.info(
							'[MonitoringSearch] Deleted old episode file record for streaming upgrade',
							{
								episodeId: episodeRow.id,
								oldFileId: oldFile.id
							}
						);
					}
				}

				// Create/update episode file record
				const fileId = await upsertEpisodeFileByPath(db, {
					seriesId,
					seasonNumber: parsed.season,
					episodeIds: [episodeRow.id],
					relativePath,
					size: stats.size,
					dateAdded: new Date().toISOString(),
					sceneName: release.title,
					releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
					quality,
					mediaInfo
				});

				// Update episode hasFile flag
				await db.update(episodes).set({ hasFile: true }).where(eq(episodes.id, episodeRow.id));

				// Create history record
				await db.insert(downloadHistory).values({
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: 'streaming',
					seriesId,
					episodeIds: [episodeRow.id],
					seasonNumber: parsed.season,
					status: 'streaming',
					size: stats.size,
					quality,
					importedPath: result.filePath,
					episodeFileIds: [fileId],
					grabbedAt: new Date().toISOString(),
					importedAt: new Date().toISOString()
				});

				logger.info('[MonitoringSearch] Added streaming episode file to database', {
					seriesId,
					episodeId: episodeRow.id,
					fileId,
					relativePath
				});
			} else {
				return { success: false, error: 'Invalid media type or missing required IDs' };
			}

			return {
				success: true,
				releaseName: release.title
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[MonitoringSearch] Failed to add streaming file to database', {
				title: release.title,
				error: message
			});
			return { success: false, error: `Database error: ${message}` };
		}
	}

	/**
	 * Handle streaming season pack - create .strm files for all episodes in a season
	 */
	private async handleStreamingSeasonPack(
		release: EnhancedReleaseResult,
		options: {
			seriesId: string;
			seasonNumber: number;
			tmdbId: string;
			baseUrl: string;
			isUpgrade?: boolean;
			episodeIds?: string[];
		}
	): Promise<{ success: boolean; releaseName?: string; error?: string; queueItemId?: string }> {
		const { seriesId, seasonNumber, tmdbId, baseUrl, isUpgrade } = options;

		logger.info('[MonitoringSearch] Handling streaming season pack', {
			seriesId,
			seasonNumber,
			title: release.title
		});

		// Get series for root folder path
		const show = await db.query.series.findFirst({
			where: eq(series.id, seriesId),
			with: { rootFolder: true }
		});

		if (!show || !show.rootFolder) {
			return { success: false, error: 'Series or root folder not found' };
		}
		const allowStrmProbe = show.scoringProfileId !== 'streamer';

		// Create .strm files for all episodes in the season
		const strmResult = await strmService.createSeasonStrmFiles({
			seriesId,
			seasonNumber,
			tmdbId,
			baseUrl
		});

		if (!strmResult.success || strmResult.results.length === 0) {
			logger.error('[MonitoringSearch] Failed to create season pack .strm files', {
				seriesId,
				seasonNumber,
				error: strmResult.error
			});
			return { success: false, error: strmResult.error || 'Failed to create .strm files' };
		}

		// Parse quality from release title
		const parsedRelease = parser.parse(release.title);
		const quality = {
			resolution: parsedRelease.resolution ?? '1080p',
			source: 'Streaming',
			codec: 'HLS',
			hdr: undefined
		};

		// Collect file info before starting transaction
		const episodeFileData: Array<{
			episodeId: string;
			episodeNumber: number;
			filePath: string;
			fileSize: number;
			relativePath: string;
			mediaInfo: Awaited<ReturnType<typeof mediaInfoService.extractMediaInfo>>;
		}> = [];

		// First pass: collect file info and validate (outside transaction)
		for (const epResult of strmResult.results) {
			if (!epResult.filePath) {
				logger.warn('[MonitoringSearch] Skipping episode without .strm file', {
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					error: epResult.error
				});
				continue;
			}

			try {
				const stats = statSync(epResult.filePath);
				const mediaInfo = await mediaInfoService.extractMediaInfo(epResult.filePath, {
					allowStrmProbe
				});
				const relativePath = relative(show.rootFolder!.path, epResult.filePath);

				episodeFileData.push({
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					filePath: epResult.filePath,
					fileSize: Number(stats.size), // Convert bigint to number if needed
					relativePath,
					mediaInfo
				});
			} catch (error) {
				logger.error('[MonitoringSearch] Failed to get file info for episode', {
					episodeId: epResult.episodeId,
					episodeNumber: epResult.episodeNumber,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		if (episodeFileData.length === 0) {
			// Don't clean up .strm files - let the LibraryWatcher try to link them
			// Even if we failed to get file info, the watcher might succeed
			logger.warn(
				'[MonitoringSearch] Failed to get file info for any episodes, keeping files for watcher',
				{
					seriesId,
					seasonNumber,
					filesCreated: strmResult.results.filter((r) => r.filePath).length
				}
			);
			return { success: false, error: 'Failed to get file info for any episodes' };
		}

		const createdEpisodeIds: string[] = [];
		const createdFileIds: string[] = [];
		let totalSize = 0;

		// Use transaction for all database operations to ensure atomicity
		try {
			await db.transaction(async (tx) => {
				for (const epData of episodeFileData) {
					// Delete existing episode file if this is an upgrade
					if (isUpgrade) {
						const allSeriesFiles = await tx.query.episodeFiles.findMany({
							where: eq(episodeFiles.seriesId, seriesId)
						});
						const existingFiles = allSeriesFiles.filter((f) =>
							f.episodeIds?.includes(epData.episodeId)
						);
						for (const oldFile of existingFiles) {
							// Delete physical file from disk (best effort)
							const oldFilePath = join(show.rootFolder!.path, show.path, oldFile.relativePath);
							try {
								if (await fileExists(oldFilePath)) {
									await unlink(oldFilePath);
									logger.debug('[MonitoringSearch] Deleted old episode file from disk', {
										episodeId: epData.episodeId,
										path: oldFilePath
									});
								}
							} catch (deleteError) {
								logger.warn(
									'[MonitoringSearch] Failed to delete old episode file from disk (continuing)',
									{
										path: oldFilePath,
										error: deleteError instanceof Error ? deleteError.message : String(deleteError)
									}
								);
							}
							// Delete DB record
							await tx.delete(episodeFiles).where(eq(episodeFiles.id, oldFile.id));
							logger.debug(
								'[MonitoringSearch] Deleted old episode file record for streaming upgrade',
								{
									episodeId: epData.episodeId,
									oldFileId: oldFile.id
								}
							);
						}
					}

					// Create/update episode file record
					const fileId = await upsertEpisodeFileByPath(tx, {
						seriesId,
						seasonNumber,
						episodeIds: [epData.episodeId],
						relativePath: epData.relativePath,
						size: epData.fileSize,
						dateAdded: new Date().toISOString(),
						sceneName: release.title,
						releaseGroup: parsedRelease.releaseGroup ?? 'Streaming',
						quality,
						mediaInfo: epData.mediaInfo
					});

					// Update episode hasFile flag
					await tx.update(episodes).set({ hasFile: true }).where(eq(episodes.id, epData.episodeId));

					createdEpisodeIds.push(epData.episodeId);
					createdFileIds.push(fileId);
					totalSize += epData.fileSize;

					logger.debug('[MonitoringSearch] Created episode file record', {
						episodeId: epData.episodeId,
						episodeNumber: epData.episodeNumber,
						fileId
					});
				}

				// Create single history record for the entire season pack
				await tx.insert(downloadHistory).values({
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: 'streaming',
					seriesId,
					episodeIds: createdEpisodeIds,
					seasonNumber,
					status: 'streaming',
					size: totalSize,
					quality,
					episodeFileIds: createdFileIds,
					grabbedAt: new Date().toISOString(),
					importedAt: new Date().toISOString()
				});
			});
		} catch (txError) {
			// Transaction failed - do NOT delete files, let LibraryWatcher handle them
			// Deleting files here causes a race condition where E01 gets deleted before
			// the watcher has a chance to process and link it
			logger.error('[MonitoringSearch] Transaction failed for streaming season pack', {
				seriesId,
				seasonNumber,
				error: txError instanceof Error ? txError.message : 'Unknown error',
				filesCreated: episodeFileData.length,
				note: 'Keeping .strm files for LibraryWatcher to process'
			});

			// Don't delete files - the LibraryWatcher will detect them and link properly
			// This avoids the race condition where files get deleted before watcher processes them

			return {
				success: false,
				error: txError instanceof Error ? txError.message : 'Database transaction failed'
			};
		}

		if (createdFileIds.length === 0) {
			return { success: false, error: 'Failed to create any episode file records' };
		}

		logger.info('[MonitoringSearch] Created streaming season pack files', {
			seriesId,
			seasonNumber,
			episodesCreated: createdFileIds.length,
			totalEpisodes: strmResult.results.length
		});

		return {
			success: true,
			releaseName: release.title
		};
	}

	/**
	 * Aggregate search results into summary
	 */
	private aggregateResults(items: ItemSearchResult[]): SearchResults {
		const summary = {
			searched: items.filter((i) => i.searched).length,
			found: items.filter((i) => i.releasesFound > 0).length,
			grabbed: items.filter((i) => i.grabbed).length,
			skipped: items.filter((i) => i.skipped).length,
			errors: items.filter((i) => i.error).length
		};

		return { items, summary };
	}
}

// Export singleton instance
export const monitoringSearchService = new MonitoringSearchService();
