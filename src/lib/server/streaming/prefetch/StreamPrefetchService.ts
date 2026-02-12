/**
 * Stream Prefetch Service
 *
 * Proactively prefetches streams for popular content during off-peak hours.
 * This warms the cache for content users are likely to watch.
 *
 * Features:
 * - Prefetches streams for recently added library items
 * - Respects rate limits and provider health
 * - Can be scheduled via monitoring scheduler
 * - Skips items with existing cache entries or negative cache
 */

import { db } from '$lib/server/db';
import { movies, series, episodes } from '$lib/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { getStreamCache } from '../cache';
import { MultiLevelStreamCache } from '../cache/StreamCache';

const streamLog = { logCategory: 'streams' as const };

/** Maximum items to prefetch in a single run */
const MAX_PREFETCH_ITEMS = 20;

/** Delay between prefetch requests (ms) to avoid overwhelming providers */
const PREFETCH_DELAY_MS = 2000;

/** Timeout for each prefetch request (ms) */
const PREFETCH_TIMEOUT_MS = 10000;

interface PrefetchResult {
	success: boolean;
	tmdbId: number;
	mediaType: 'movie' | 'tv';
	season?: number;
	episode?: number;
	cached: boolean;
	error?: string;
}

/**
 * Stream Prefetch Service
 * Warms the cache by prefetching streams for popular/recent content
 */
export class StreamPrefetchService {
	private isRunning = false;
	private abortController: AbortController | null = null;

	/**
	 * Prefetch streams for recently added movies
	 */
	async prefetchRecentMovies(limit: number = 10): Promise<PrefetchResult[]> {
		const results: PrefetchResult[] = [];

		try {
			// Get recently added movies that have files (monitored and available)
			const recentMovies = await db
				.select({
					tmdbId: movies.tmdbId
				})
				.from(movies)
				.where(and(eq(movies.monitored, true), eq(movies.hasFile, true)))
				.orderBy(desc(movies.added))
				.limit(limit);

			for (const movie of recentMovies) {
				if (this.abortController?.signal.aborted) break;

				const result = await this.prefetchStream(movie.tmdbId, 'movie');
				results.push(result);

				// Delay between requests
				await this.delay(PREFETCH_DELAY_MS);
			}
		} catch (error) {
			logger.error('Failed to prefetch recent movies', {
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			});
		}

		return results;
	}

	/**
	 * Prefetch streams for recently aired episodes
	 */
	async prefetchRecentEpisodes(limit: number = 10): Promise<PrefetchResult[]> {
		const results: PrefetchResult[] = [];

		try {
			// Get recently aired episodes that have files
			const recentEpisodes = await db
				.select({
					seriesTmdbId: series.tmdbId,
					seasonNumber: episodes.seasonNumber,
					episodeNumber: episodes.episodeNumber
				})
				.from(episodes)
				.innerJoin(series, eq(episodes.seriesId, series.id))
				.where(and(eq(episodes.monitored, true), eq(episodes.hasFile, true)))
				.orderBy(desc(episodes.airDate))
				.limit(limit);

			for (const ep of recentEpisodes) {
				if (this.abortController?.signal.aborted) break;

				const result = await this.prefetchStream(
					ep.seriesTmdbId,
					'tv',
					ep.seasonNumber,
					ep.episodeNumber
				);
				results.push(result);

				// Delay between requests
				await this.delay(PREFETCH_DELAY_MS);
			}
		} catch (error) {
			logger.error('Failed to prefetch recent episodes', {
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			});
		}

		return results;
	}

	/**
	 * Prefetch a single stream and warm the cache
	 */
	private async prefetchStream(
		tmdbId: number,
		mediaType: 'movie' | 'tv',
		season?: number,
		episode?: number
	): Promise<PrefetchResult> {
		const result: PrefetchResult = {
			success: false,
			tmdbId,
			mediaType,
			season,
			episode,
			cached: false
		};

		// Check if already cached (skip if so)
		const cacheKey = MultiLevelStreamCache.streamKey(tmdbId.toString(), mediaType, season, episode);

		const streamCache = getStreamCache();
		if (streamCache.getStream(cacheKey)) {
			result.cached = true;
			result.success = true;
			return result;
		}

		// Check negative cache (skip if recently failed)
		if (streamCache.hasNegative(cacheKey)) {
			result.cached = true;
			result.success = false;
			result.error = 'In negative cache';
			return result;
		}

		try {
			// Build the resolve URL
			let resolveUrl: string;
			if (mediaType === 'movie') {
				resolveUrl = `/api/streaming/resolve/movie/${tmdbId}?prefetch=1`;
			} else {
				resolveUrl = `/api/streaming/resolve/tv/${tmdbId}/${season}/${episode}?prefetch=1`;
			}

			// Make the prefetch request
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);

			try {
				// Use internal fetch to trigger the stream resolution
				// This populates the cache as a side effect
				const response = await fetch(`http://localhost:3000${resolveUrl}`, {
					signal: controller.signal,
					headers: {
						'X-Prefetch': 'true'
					}
				});

				clearTimeout(timeoutId);

				if (response.ok) {
					result.success = true;
					logger.debug('Prefetched stream', {
						tmdbId,
						mediaType,
						season,
						episode,
						...streamLog
					});
				} else {
					result.error = `HTTP ${response.status}`;
				}
			} catch (fetchError) {
				clearTimeout(timeoutId);
				if (fetchError instanceof Error && fetchError.name === 'AbortError') {
					result.error = 'Timeout';
				} else {
					result.error = fetchError instanceof Error ? fetchError.message : 'Fetch failed';
				}
			}
		} catch (error) {
			result.error = error instanceof Error ? error.message : 'Unknown error';
		}

		return result;
	}

	/**
	 * Run a full prefetch cycle for recent content
	 */
	async runPrefetchCycle(): Promise<{
		movies: PrefetchResult[];
		episodes: PrefetchResult[];
	}> {
		if (this.isRunning) {
			logger.warn('Prefetch cycle already running', streamLog);
			return { movies: [], episodes: [] };
		}

		this.isRunning = true;
		this.abortController = new AbortController();

		try {
			logger.info('Starting stream prefetch cycle', streamLog);

			const movieResults = await this.prefetchRecentMovies(MAX_PREFETCH_ITEMS / 2);
			const episodeResults = await this.prefetchRecentEpisodes(MAX_PREFETCH_ITEMS / 2);

			const totalSuccess =
				movieResults.filter((r) => r.success).length +
				episodeResults.filter((r) => r.success).length;
			const totalCached =
				movieResults.filter((r) => r.cached).length + episodeResults.filter((r) => r.cached).length;

			logger.info('Stream prefetch cycle completed', {
				moviesProcessed: movieResults.length,
				episodesProcessed: episodeResults.length,
				totalSuccess,
				alreadyCached: totalCached,
				...streamLog
			});

			return { movies: movieResults, episodes: episodeResults };
		} finally {
			this.isRunning = false;
			this.abortController = null;
		}
	}

	/**
	 * Cancel the current prefetch cycle
	 */
	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
	}

	/**
	 * Check if a prefetch cycle is currently running
	 */
	get running(): boolean {
		return this.isRunning;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// Singleton instance
let prefetchServiceInstance: StreamPrefetchService | null = null;

/**
 * Get the global stream prefetch service instance
 */
export function getStreamPrefetchService(): StreamPrefetchService {
	if (!prefetchServiceInstance) {
		prefetchServiceInstance = new StreamPrefetchService();
	}
	return prefetchServiceInstance;
}
