/**
 * Subtitle Search Service
 *
 * Orchestrates subtitle searches across multiple providers.
 * Handles deduplication, scoring, and result aggregation.
 */

import { db } from '$lib/server/db';
import {
	movies,
	episodes,
	series,
	movieFiles,
	episodeFiles,
	subtitleBlacklist,
	rootFolders
} from '$lib/server/db/schema';
import { join } from 'path';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'subtitles' as const });
import type {
	SubtitleSearchCriteria,
	SubtitleSearchResult,
	AggregatedSearchResult,
	MediaContext
} from '../types';
import { getSubtitleProviderManager } from './SubtitleProviderManager';
import { getSubtitleScoringService } from './SubtitleScoringService';

const criteriaIdCache = new Map<string, { imdbId?: string; tvdbId?: number; expires: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function clearIdCacheForTests(): void {
	criteriaIdCache.clear();
}

/** Search options */
export interface SubtitleSearchOptions {
	/** Specific provider IDs to search (null = all enabled) */
	providerIds?: string[];
	/** Maximum results per provider */
	maxResultsPerProvider?: number;
	/** Request timeout in ms */
	timeout?: number;
	/** Whether to include blacklisted results (filtered by default) */
	includeBlacklisted?: boolean;
}

/**
 * Service for searching subtitles across providers
 */
export class SubtitleSearchService {
	private static instance: SubtitleSearchService | null = null;

	private constructor() {}

	static getInstance(): SubtitleSearchService {
		if (!SubtitleSearchService.instance) {
			SubtitleSearchService.instance = new SubtitleSearchService();
		}
		return SubtitleSearchService.instance;
	}

	/**
	 * Search for subtitles for a movie
	 */
	async searchForMovie(
		movieId: string,
		languages: string[],
		options?: SubtitleSearchOptions
	): Promise<AggregatedSearchResult> {
		// Get movie details
		const movie = await db.select().from(movies).where(eq(movies.id, movieId)).limit(1);

		if (!movie[0]) {
			throw new Error(`Movie not found: ${movieId}`);
		}

		// Get movie file for hash calculation
		const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId));
		const file = files[0];

		// Get root folder path
		let filePath: string | undefined;
		if (file && movie[0].rootFolderId) {
			const rootFolder = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, movie[0].rootFolderId))
				.limit(1);
			if (rootFolder[0]) {
				filePath = join(rootFolder[0].path, movie[0].path, file.relativePath);
			}
		}

		// Build search criteria
		const criteria: SubtitleSearchCriteria = {
			title: movie[0].title,
			originalTitle: movie[0].originalTitle || undefined,
			year: movie[0].year || undefined,
			imdbId: movie[0].imdbId || undefined,
			tmdbId: movie[0].tmdbId,
			languages,
			filePath,
			fileSize: file?.size || undefined
		};

		return this.search(criteria, { movieId }, options);
	}

	/**
	 * Search for subtitles for an episode
	 */
	async searchForEpisode(
		episodeId: string,
		languages: string[],
		options?: SubtitleSearchOptions
	): Promise<AggregatedSearchResult> {
		// Get episode with series details
		const episode = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1);

		if (!episode[0]) {
			throw new Error(`Episode not found: ${episodeId}`);
		}

		const seriesData = await db
			.select()
			.from(series)
			.where(eq(series.id, episode[0].seriesId))
			.limit(1);

		if (!seriesData[0]) {
			throw new Error(`Series not found for episode: ${episodeId}`);
		}

		// Get episode file
		const files = await db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, episode[0].seriesId));
		const file = files.find((f) => {
			const ids = f.episodeIds as string[] | null;
			return ids?.includes(episodeId);
		});

		// Get root folder path
		let filePath: string | undefined;
		if (file && seriesData[0].rootFolderId) {
			const rootFolder = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, seriesData[0].rootFolderId))
				.limit(1);
			if (rootFolder[0]) {
				filePath = join(rootFolder[0].path, seriesData[0].path, file.relativePath);
			}
		}

		// Build search criteria
		const criteria: SubtitleSearchCriteria = {
			title: episode[0].title || seriesData[0].title,
			seriesTitle: seriesData[0].title,
			originalTitle: seriesData[0].originalTitle || undefined,
			year: seriesData[0].year || undefined,
			season: episode[0].seasonNumber,
			episode: episode[0].episodeNumber,
			episodeTitle: episode[0].title || undefined,
			imdbId: seriesData[0].imdbId || undefined,
			tmdbId: seriesData[0].tmdbId,
			languages,
			filePath,
			fileSize: file?.size || undefined
		};

		return this.search(criteria, { episodeId }, options);
	}

	/**
	 * Resolve missing external IDs (imdbId, tvdbId) from TMDB when tmdbId is available.
	 * This ensures all providers get the IDs they need regardless of what's stored in the DB.
	 */
	private async enrichCriteria(criteria: SubtitleSearchCriteria): Promise<SubtitleSearchCriteria> {
		if (!criteria.tmdbId) return criteria;

		const needsImdb = !criteria.imdbId;
		const needsTvdb = !criteria.tvdbId && criteria.season !== undefined;
		if (!needsImdb && !needsTvdb) return criteria;

		const cacheKey = `${criteria.tmdbId}:${criteria.season !== undefined ? 'tv' : 'movie'}`;
		const cached = criteriaIdCache.get(cacheKey);
		if (cached && cached.expires > Date.now()) {
			if (needsImdb && cached.imdbId) criteria.imdbId = cached.imdbId;
			if (needsTvdb && cached.tvdbId) criteria.tvdbId = cached.tvdbId;
			return criteria;
		}

		try {
			const { tmdb } = await import('$lib/server/tmdb');
			const isTv = criteria.season !== undefined;
			let resolvedImdb: string | undefined;
			let resolvedTvdb: number | undefined;

			if (isTv) {
				const ids = await tmdb.getTvExternalIds(criteria.tmdbId);
				resolvedImdb = ids.imdb_id ?? undefined;
				resolvedTvdb = ids.tvdb_id ?? undefined;
			} else {
				const ids = await tmdb.getMovieExternalIds(criteria.tmdbId);
				resolvedImdb = ids.imdb_id ?? undefined;
			}

			if (resolvedImdb || resolvedTvdb) {
				logger.debug(
					{
						tmdbId: criteria.tmdbId,
						imdbId: resolvedImdb,
						tvdbId: resolvedTvdb,
						type: isTv ? 'tv' : 'movie'
					},
					'[Subtitles] Resolved external IDs via TMDB'
				);
			}

			criteriaIdCache.set(cacheKey, {
				imdbId: resolvedImdb,
				tvdbId: resolvedTvdb,
				expires: Date.now() + CACHE_TTL_MS
			});

			if (needsImdb && resolvedImdb) criteria.imdbId = resolvedImdb;
			if (needsTvdb && resolvedTvdb) criteria.tvdbId = resolvedTvdb;
		} catch {
			logger.debug({ tmdbId: criteria.tmdbId }, '[Subtitles] TMDB ID resolution failed');
		}

		return criteria;
	}

	/**
	 * Search with custom criteria
	 */
	async search(
		criteria: SubtitleSearchCriteria,
		mediaRef: { movieId?: string; episodeId?: string },
		options?: SubtitleSearchOptions
	): Promise<AggregatedSearchResult> {
		const startTime = Date.now();
		const providerManager = getSubtitleProviderManager();
		const scoringService = getSubtitleScoringService();

		const enrichedCriteria = await this.enrichCriteria(criteria);

		// Get providers to search
		let providers = await providerManager.getEnabledProviders();

		if (options?.providerIds?.length) {
			providers = providers.filter((p) => options.providerIds!.includes(p.id));
		}

		if (providers.length === 0) {
			return {
				results: [],
				totalResults: 0,
				searchTimeMs: Date.now() - startTime,
				providerResults: []
			};
		}

		// Get blacklisted subtitles
		const blacklist = options?.includeBlacklisted
			? new Set<string>()
			: await this.getBlacklist(mediaRef);

		// Search all providers concurrently
		const providerResults: AggregatedSearchResult['providerResults'] = [];
		const allResults: SubtitleSearchResult[] = [];

		const searchPromises = providers.map(async (provider) => {
			const providerStart = Date.now();
			try {
				// Check if provider can search
				if (!provider.canSearch(enrichedCriteria)) {
					return {
						providerId: provider.id,
						providerName: provider.name,
						resultCount: 0,
						error: 'Provider cannot search with given criteria',
						searchTimeMs: 0
					};
				}

				const results = await provider.search(enrichedCriteria, {
					maxResults: options?.maxResultsPerProvider || 25,
					timeout: options?.timeout || 30000
				});

				// Score each result
				for (const result of results) {
					result.matchScore = scoringService.score(result, enrichedCriteria);
				}

				// Record success
				await providerManager.recordSuccess(provider.id);

				const searchTimeMs = Date.now() - providerStart;
				return {
					providerId: provider.id,
					providerName: provider.name,
					resultCount: results.length,
					searchTimeMs,
					results
				};
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				logger.error({ err: error }, `Provider search failed: ${provider.name}`);

				// Record error - pass actual error object to preserve type information for proper throttling
				await providerManager.recordError(provider.id, error instanceof Error ? error : errorMsg);

				return {
					providerId: provider.id,
					providerName: provider.name,
					resultCount: 0,
					error: errorMsg,
					searchTimeMs: Date.now() - providerStart
				};
			}
		});

		const searchResults = await Promise.all(searchPromises);

		// Aggregate results
		for (const result of searchResults) {
			providerResults.push({
				providerId: result.providerId,
				providerName: result.providerName,
				resultCount: result.resultCount,
				error: result.error,
				searchTimeMs: result.searchTimeMs
			});

			if ('results' in result && result.results) {
				allResults.push(...result.results);
			}
		}

		// Filter blacklisted
		const filteredResults = allResults.filter(
			(r) => !blacklist.has(`${r.providerId}:${r.providerSubtitleId}`)
		);

		// Deduplicate by provider+id
		const uniqueResults = this.deduplicateResults(filteredResults);

		// Sort by score
		const rankedResults = scoringService.rank(uniqueResults);

		return {
			results: rankedResults,
			totalResults: rankedResults.length,
			searchTimeMs: Date.now() - startTime,
			providerResults
		};
	}

	/**
	 * Build media context for a movie
	 */
	async getMovieContext(movieId: string): Promise<MediaContext | null> {
		const movie = await db.select().from(movies).where(eq(movies.id, movieId)).limit(1);
		if (!movie[0]) return null;

		const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId));
		const file = files[0];

		// Get root folder path
		let filePath: string | undefined;
		if (file && movie[0].rootFolderId) {
			const rootFolder = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, movie[0].rootFolderId))
				.limit(1);
			if (rootFolder[0]) {
				filePath = join(rootFolder[0].path, movie[0].path, file.relativePath);
			}
		}

		return {
			type: 'movie',
			id: movieId,
			title: movie[0].title,
			year: movie[0].year || undefined,
			imdbId: movie[0].imdbId || undefined,
			tmdbId: movie[0].tmdbId,
			filePath,
			fileSize: file?.size || undefined
		};
	}

	/**
	 * Build media context for an episode
	 */
	async getEpisodeContext(episodeId: string): Promise<MediaContext | null> {
		const episode = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1);
		if (!episode[0]) return null;

		const seriesData = await db
			.select()
			.from(series)
			.where(eq(series.id, episode[0].seriesId))
			.limit(1);
		if (!seriesData[0]) return null;

		const files = await db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, episode[0].seriesId));
		const file = files.find((f) => {
			const ids = f.episodeIds as string[] | null;
			return ids?.includes(episodeId);
		});

		// Get root folder path
		let filePath: string | undefined;
		if (file && seriesData[0].rootFolderId) {
			const rootFolder = await db
				.select()
				.from(rootFolders)
				.where(eq(rootFolders.id, seriesData[0].rootFolderId))
				.limit(1);
			if (rootFolder[0]) {
				filePath = join(rootFolder[0].path, seriesData[0].path, file.relativePath);
			}
		}

		return {
			type: 'episode',
			id: episodeId,
			title: episode[0].title || seriesData[0].title,
			year: seriesData[0].year || undefined,
			imdbId: seriesData[0].imdbId || undefined,
			tmdbId: seriesData[0].tmdbId,
			seriesId: seriesData[0].id,
			seriesTitle: seriesData[0].title,
			season: episode[0].seasonNumber,
			episode: episode[0].episodeNumber,
			filePath,
			fileSize: file?.size || undefined
		};
	}

	/**
	 * Get blacklisted subtitle IDs for media
	 */
	private async getBlacklist(mediaRef: {
		movieId?: string;
		episodeId?: string;
	}): Promise<Set<string>> {
		const conditions = [];
		if (mediaRef.movieId) {
			conditions.push(eq(subtitleBlacklist.movieId, mediaRef.movieId));
		}
		if (mediaRef.episodeId) {
			conditions.push(eq(subtitleBlacklist.episodeId, mediaRef.episodeId));
		}

		if (conditions.length === 0) return new Set();

		const blacklisted = await db
			.select()
			.from(subtitleBlacklist)
			.where(conditions.length === 1 ? conditions[0] : and(...conditions));

		return new Set(blacklisted.map((b) => `${b.providerId}:${b.providerSubtitleId}`));
	}

	/**
	 * Deduplicate results from multiple providers
	 */
	private deduplicateResults(results: SubtitleSearchResult[]): SubtitleSearchResult[] {
		const seen = new Map<string, SubtitleSearchResult>();

		for (const result of results) {
			const key = `${result.providerId}:${result.providerSubtitleId}`;

			// Keep the one with higher score
			const existing = seen.get(key);
			if (!existing || result.matchScore > existing.matchScore) {
				seen.set(key, result);
			}
		}

		return Array.from(seen.values());
	}
}

/**
 * Get the singleton SubtitleSearchService
 */
export function getSubtitleSearchService(): SubtitleSearchService {
	return SubtitleSearchService.getInstance();
}
