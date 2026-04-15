/**
 * Stream Prefetch Service
 *
 * Proactively prefetches streams for popular content during off-peak hours.
 * This warms the cache for content users are likely to watch.
 *
 * Features:
 * - Prefetches streams for recently added library items
 * - Respects upstream rate limits and cache state
 * - Can be scheduled via monitoring scheduler
 * - Skips items with existing cache entries or negative cache
 */

import { db } from '$lib/server/db';
import { movies, series, episodes } from '$lib/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { getStreamCache, MultiLevelStreamCache } from '../cache';
import { getPlaybackSessionService, getPlaybackSessionStore } from '..';

const streamLog = { logDomain: 'streams' as const };

/** Maximum items to prefetch in a single run */
const MAX_PREFETCH_ITEMS = 20;

/** Delay between prefetch requests (ms) to avoid overwhelming the resolver */
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
	private pendingPrefetches = new Map<string, Promise<PrefetchResult>>();

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
			logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				},
				'Failed to prefetch recent movies'
			);
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
			logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				},
				'Failed to prefetch recent episodes'
			);
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
		const cacheKey = MultiLevelStreamCache.streamKey(tmdbId.toString(), mediaType, season, episode);
		const pending = this.pendingPrefetches.get(cacheKey);
		if (pending) {
			return pending;
		}

		const prefetchPromise = this.runPrefetchStream(cacheKey, tmdbId, mediaType, season, episode);
		this.pendingPrefetches.set(cacheKey, prefetchPromise);

		try {
			return await prefetchPromise;
		} finally {
			this.pendingPrefetches.delete(cacheKey);
		}
	}

	private async runPrefetchStream(
		cacheKey: string,
		tmdbId: number,
		mediaType: 'movie' | 'tv',
		season?: number,
		episode?: number
	): Promise<PrefetchResult> {
		const streamCache = getStreamCache();
		const result: PrefetchResult = {
			success: false,
			tmdbId,
			mediaType,
			season,
			episode,
			cached: false
		};

		// Reusable sessions should win even if an older prefetch failure left a
		// negative-cache entry behind.
		const sessionStore = getPlaybackSessionStore();
		if (sessionStore.findReusableSession(mediaType, tmdbId, season, episode)) {
			result.cached = true;
			result.success = true;
			return result;
		}

		if (streamCache.hasNegative(cacheKey)) {
			result.cached = true;
			result.error = streamCache.getNegativeReason(cacheKey) ?? 'Recently failed';
			return result;
		}

		try {
			const signal = AbortSignal.timeout(PREFETCH_TIMEOUT_MS);
			const sessionService = getPlaybackSessionService();
			const sessionResult = await sessionService.createOrReuseSession({
				tmdbId,
				type: mediaType,
				season,
				episode,
				signal
			});

			if (sessionResult.session) {
				if (sessionResult.extractionResult?.sources.length) {
					streamCache.setStream(
						cacheKey,
						{
							success: sessionResult.extractionResult.success,
							sources: sessionResult.extractionResult.sources,
							error: sessionResult.extractionResult.error,
							provider: sessionResult.session.provider
						},
						sessionResult.session.provider
					);
				}

				result.success = true;
				result.cached = false;
			} else {
				result.error =
					sessionResult.error === 'Aborted' && signal.aborted
						? 'Timeout'
						: (sessionResult.error ?? 'Playback session unavailable');
				streamCache.setNegativeWithType(
					cacheKey,
					result.error,
					result.error.toLowerCase().includes('not found')
						? 'content_not_found'
						: result.error.toLowerCase().includes('offline')
							? 'provider_offline'
							: 'unknown'
				);
			}
		} catch (error) {
			result.error = error instanceof Error ? error.message : 'Unknown error';
			streamCache.setNegativeWithType(
				cacheKey,
				result.error,
				result.error === 'Timeout' ? 'timeout' : 'unknown'
			);
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

			logger.info(
				{
					moviesProcessed: movieResults.length,
					episodesProcessed: episodeResults.length,
					totalSuccess,
					alreadyCached: totalCached,
					...streamLog
				},
				'Stream prefetch cycle completed'
			);

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
