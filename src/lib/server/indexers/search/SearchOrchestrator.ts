/**
 * Search Orchestrator - Manages tiered search across multiple indexers.
 * Handles ID-based search with fallback to text search.
 */

import type {
	IIndexer,
	SearchCriteria,
	ReleaseResult,
	SearchResult,
	IndexerSearchResult,
	RejectedIndexer,
	EnhancedReleaseResult
} from '../types';
import {
	hasSearchableIds,
	createIdOnlyCriteria,
	createTextOnlyCriteria,
	criteriaToString,
	supportsParam,
	isMovieSearch,
	isTvSearch,
	indexerHasCategoriesForSearchType,
	categoryMatchesSearchType,
	getCategoryContentType
} from '../types';
import type { EpisodeFormatType } from '../types';
import {
	getEffectiveEpisodeFormats,
	getEpisodeFormats,
	type EpisodeFormat
} from './SearchFormatProvider';
import { getPersistentStatusTracker, type PersistentStatusTracker } from '../status';
import { getRateLimitRegistry, type RateLimitRegistry } from '../ratelimit';
import { getHostRateLimiter, type HostRateLimiter } from '../ratelimit/HostRateLimiter';
import { ReleaseDeduplicator } from './ReleaseDeduplicator';
import { ReleaseRanker } from './ReleaseRanker';
import { ReleaseCache } from './ReleaseCache';
import { parseRelease } from '../parser';
import { CloudflareProtectedError } from '../http/CloudflareDetection';
import {
	releaseEnricher,
	type EnrichmentOptions,
	type IndexerConfigForEnrichment
} from '../../quality';
import { logger } from '$lib/logging';
import { tmdb } from '$lib/server/tmdb';

/** Options for search orchestration */
export interface SearchOrchestratorOptions {
	/** Search source: 'interactive' (manual) or 'automatic' (background) */
	searchSource?: 'interactive' | 'automatic';
	/** Skip disabled indexers (default: true) */
	respectEnabled?: boolean;
	/** Skip indexers in backoff (default: true) */
	respectBackoff?: boolean;
	/** Use tiered search strategy (default: true) */
	useTieredSearch?: boolean;
	/** Maximum concurrent indexer searches (default: 5) */
	concurrency?: number;
	/** Timeout per indexer in ms (default: 30000) */
	timeout?: number;
	/** Use cache (default: true) */
	useCache?: boolean;
	/** Enrichment options for quality filtering and TMDB matching */
	enrichment?: EnrichmentOptions;
	/** Filter indexers by protocol (from scoring profile's allowedProtocols) */
	protocolFilter?: string[];
}

/** Enhanced search result with enriched releases */
export interface EnhancedSearchResult {
	/** Enriched releases (parsed, scored, optionally TMDB-matched) */
	releases: EnhancedReleaseResult[];
	/** Total results across all indexers before filtering */
	totalResults: number;
	/** Number of releases rejected by quality filter */
	rejectedCount: number;
	/** Total search time in milliseconds */
	searchTimeMs: number;
	/** Enrichment time in milliseconds */
	enrichTimeMs: number;
	/** Whether results came from cache */
	fromCache?: boolean;
	/** Per-indexer results */
	indexerResults: IndexerSearchResult[];
	/** Indexers that were rejected from this search */
	rejectedIndexers?: RejectedIndexer[];
	/** Scoring profile used for quality scoring */
	scoringProfileId?: string;
}

/** Resolved options after merging with defaults */
type ResolvedSearchOptions = Required<
	Omit<SearchOrchestratorOptions, 'enrichment' | 'searchSource' | 'protocolFilter'>
> & {
	enrichment?: EnrichmentOptions;
	searchSource?: 'interactive' | 'automatic';
	protocolFilter?: string[];
};

const DEFAULT_OPTIONS: Required<
	Omit<SearchOrchestratorOptions, 'enrichment' | 'searchSource' | 'protocolFilter'>
> = {
	respectEnabled: true,
	respectBackoff: true,
	useTieredSearch: true,
	concurrency: 5,
	timeout: 30000,
	useCache: true
};

/**
 * Orchestrates searches across multiple indexers with tiered strategy.
 */
export class SearchOrchestrator {
	private statusTracker: PersistentStatusTracker;
	/** Cache for season episode counts (tmdbId:season -> count) */
	private seasonEpisodeCountCache: Map<string, number> = new Map();
	private rateLimitRegistry: RateLimitRegistry;
	private hostRateLimiter: HostRateLimiter;
	private deduplicator: ReleaseDeduplicator;
	private ranker: ReleaseRanker;
	private cache: ReleaseCache;

	constructor() {
		this.statusTracker = getPersistentStatusTracker();
		this.rateLimitRegistry = getRateLimitRegistry();
		this.hostRateLimiter = getHostRateLimiter();
		this.deduplicator = new ReleaseDeduplicator();
		this.ranker = new ReleaseRanker();
		this.cache = new ReleaseCache();
	}

	/** Search across all provided indexers */
	async search(
		indexers: IIndexer[],
		criteria: SearchCriteria,
		options: SearchOrchestratorOptions = {}
	): Promise<SearchResult> {
		const startTime = Date.now();
		const opts = { ...DEFAULT_OPTIONS, ...options };
		const indexerResults: IndexerSearchResult[] = [];

		logger.debug('Starting search orchestration', {
			criteria: criteriaToString(criteria),
			indexerCount: indexers.length,
			options: opts
		});

		// Enrich criteria with missing IDs (e.g., look up IMDB ID from TMDB ID)
		const enrichedCriteria = await this.enrichCriteriaWithIds(criteria);

		// Check cache first (use enriched criteria for cache key)
		if (opts.useCache) {
			const cached = this.cache.get(enrichedCriteria);
			if (cached) {
				logger.debug('Cache hit', { resultCount: cached.length });
				return {
					releases: cached,
					totalResults: cached.length,
					searchTimeMs: Date.now() - startTime,
					fromCache: true,
					indexerResults: []
				};
			}
		}

		// Filter indexers (use enriched criteria for eligibility check)
		const { eligible: eligibleIndexers, rejected: rejectedIndexers } = this.filterIndexers(
			indexers,
			enrichedCriteria,
			opts
		);

		if (eligibleIndexers.length === 0) {
			logger.warn('No eligible indexers for search', {
				criteria: criteriaToString(criteria)
			});
			return {
				releases: [],
				totalResults: 0,
				searchTimeMs: Date.now() - startTime,
				fromCache: false,
				indexerResults: [],
				rejectedIndexers
			};
		}

		// Sort by priority
		eligibleIndexers.sort((a, b) => {
			const statusA = this.statusTracker.getStatusSync(a.id);
			const statusB = this.statusTracker.getStatusSync(b.id);
			return statusA.priority - statusB.priority;
		});

		// Execute searches with enriched criteria (includes IMDB ID if looked up)
		const allReleases = await this.executeSearches(
			eligibleIndexers,
			enrichedCriteria,
			indexerResults,
			opts
		);

		// Deduplicate
		const { releases: deduped } = this.deduplicator.deduplicate(allReleases);

		// Filter by season/episode if specified (use original criteria for filtering)
		let filtered = this.filterBySeasonEpisode(deduped, criteria);

		// Filter by category match (reject releases in wrong categories)
		if (criteria.searchType !== 'basic') {
			const searchType = criteria.searchType as 'movie' | 'tv' | 'music' | 'book';
			filtered = this.filterByCategoryMatch(filtered, searchType);
		}

		// Rank
		const ranked = this.ranker.rank(filtered);

		// Apply limit
		const limited = ranked.slice(0, criteria.limit ?? 100);

		// Cache results (use enriched criteria for cache key consistency)
		if (opts.useCache && limited.length > 0) {
			this.cache.set(enrichedCriteria, limited);
		}

		const result: SearchResult = {
			releases: limited,
			totalResults: allReleases.length,
			searchTimeMs: Date.now() - startTime,
			fromCache: false,
			indexerResults,
			rejectedIndexers
		};

		logger.info('Search completed', {
			totalResults: result.totalResults,
			returned: result.releases.length,
			timeMs: result.searchTimeMs
		});

		return result;
	}

	/**
	 * Search with enrichment - parses, scores, and optionally matches to TMDB.
	 * Returns EnhancedReleaseResult with quality scores and parsed metadata.
	 */
	async searchEnhanced(
		indexers: IIndexer[],
		criteria: SearchCriteria,
		options: SearchOrchestratorOptions = {}
	): Promise<EnhancedSearchResult> {
		const startTime = Date.now();
		const opts = { ...DEFAULT_OPTIONS, ...options };
		const indexerResults: IndexerSearchResult[] = [];

		logger.debug('Starting enhanced search orchestration', {
			criteria: criteriaToString(criteria),
			indexerCount: indexers.length,
			enrichment: opts.enrichment
		});

		// Enrich criteria with missing IDs (e.g., look up IMDB ID from TMDB ID)
		const enrichedCriteria = await this.enrichCriteriaWithIds(criteria);

		// Filter indexers
		const { eligible: eligibleIndexers, rejected: rejectedIndexers } = this.filterIndexers(
			indexers,
			enrichedCriteria,
			opts
		);

		if (eligibleIndexers.length === 0) {
			logger.warn('No eligible indexers for search', {
				criteria: criteriaToString(enrichedCriteria)
			});
			return {
				releases: [],
				totalResults: 0,
				rejectedCount: 0,
				searchTimeMs: Date.now() - startTime,
				enrichTimeMs: 0,
				fromCache: false,
				indexerResults: [],
				rejectedIndexers
			};
		}

		// Sort by priority
		eligibleIndexers.sort((a, b) => {
			const statusA = this.statusTracker.getStatusSync(a.id);
			const statusB = this.statusTracker.getStatusSync(b.id);
			return statusA.priority - statusB.priority;
		});

		// Execute searches
		const allReleases = await this.executeSearches(
			eligibleIndexers,
			enrichedCriteria,
			indexerResults,
			opts
		);

		const searchTimeMs = Date.now() - startTime;

		// Deduplicate
		const { releases: deduped } = this.deduplicator.deduplicate(allReleases);

		// Debug: log YTS releases after deduplication
		const ytsAfterDedup = deduped.filter((r) => r.indexerName === 'YTS');
		logger.info('[SearchOrchestrator] After deduplication', {
			totalDeduped: deduped.length,
			ytsCount: ytsAfterDedup.length,
			ytsTitles: ytsAfterDedup.slice(0, 5).map((r) => r.title),
			sampleIndexers: deduped.slice(0, 10).map((r) => r.indexerName)
		});

		// Filter by season/episode if specified
		let filtered = this.filterBySeasonEpisode(deduped, enrichedCriteria);

		// Filter by category match (reject releases in wrong categories)
		if (enrichedCriteria.searchType !== 'basic') {
			const searchType = enrichedCriteria.searchType as 'movie' | 'tv' | 'music' | 'book';
			filtered = this.filterByCategoryMatch(filtered, searchType);
		}

		// Enrich with quality scoring and optional TMDB matching
		// Determine media type from search criteria for size validation
		const mediaType =
			enrichedCriteria.searchType === 'movie'
				? 'movie'
				: enrichedCriteria.searchType === 'tv'
					? 'tv'
					: undefined;

		// Get season episode count for TV season searches (for season pack size validation)
		// Use provided value, or fetch from TMDB if we have tmdbId + season
		let seasonEpisodeCount = opts.enrichment?.seasonEpisodeCount;
		if (
			seasonEpisodeCount === undefined &&
			isTvSearch(enrichedCriteria) &&
			enrichedCriteria.season !== undefined
		) {
			seasonEpisodeCount = await this.getSeasonEpisodeCount(enrichedCriteria);
		}

		// Build indexer config map for protocol-specific rejection (seeder minimums, dead torrents, etc.)
		const indexerConfigs = new Map<string, IndexerConfigForEnrichment>();
		for (const indexer of eligibleIndexers) {
			indexerConfigs.set(indexer.id, {
				id: indexer.id,
				name: indexer.name,
				protocol: indexer.protocol,
				protocolSettings: indexer.protocolSettings
			});
		}

		const enrichmentOpts: EnrichmentOptions = {
			scoringProfileId: opts.enrichment?.scoringProfileId,
			matchToTmdb: opts.enrichment?.matchToTmdb ?? false,
			tmdbHint: opts.enrichment?.tmdbHint,
			filterRejected: opts.enrichment?.filterRejected ?? false,
			minScore: opts.enrichment?.minScore,
			useEnhancedScoring: opts.enrichment?.useEnhancedScoring,
			mediaType,
			seasonEpisodeCount,
			indexerConfigs
		};

		const enrichResult = await releaseEnricher.enrich(filtered, enrichmentOpts);

		// Debug: log YTS releases after enrichment
		const ytsAfterEnrich = enrichResult.releases.filter((r) => r.indexerName === 'YTS');
		if (ytsAfterEnrich.length > 0 || ytsAfterDedup.length > 0) {
			logger.info('[SearchOrchestrator] YTS releases after enrichment', {
				countBefore: ytsAfterDedup.length,
				countAfter: ytsAfterEnrich.length,
				titles: ytsAfterEnrich.map((r) => r.title),
				rejected: ytsAfterEnrich.filter((r) => r.rejected).length
			});
		}

		// Apply limit (enricher already sorts by totalScore)
		const limited = enrichResult.releases.slice(0, enrichedCriteria.limit ?? 100);

		const result: EnhancedSearchResult = {
			releases: limited,
			totalResults: allReleases.length,
			rejectedCount: enrichResult.rejectedCount,
			searchTimeMs,
			enrichTimeMs: enrichResult.enrichTimeMs,
			fromCache: false,
			indexerResults,
			rejectedIndexers,
			scoringProfileId: enrichResult.scoringProfile?.id
		};

		logger.info('Enhanced search completed', {
			totalResults: result.totalResults,
			returned: result.releases.length,
			rejected: result.rejectedCount,
			searchTimeMs: result.searchTimeMs,
			enrichTimeMs: result.enrichTimeMs
		});

		return result;
	}

	/** Filter indexers based on criteria and options, returning both eligible and rejected */
	private filterIndexers(
		indexers: IIndexer[],
		criteria: SearchCriteria,
		options: ResolvedSearchOptions
	): { eligible: IIndexer[]; rejected: RejectedIndexer[] } {
		const eligible: IIndexer[] = [];
		const rejected: RejectedIndexer[] = [];

		for (const indexer of indexers) {
			// Check if indexer can handle this search type at all (categories + basic capability)
			// Use relaxed check that allows text-only indexers
			if (!this.canIndexerHandleSearchType(indexer, criteria)) {
				rejected.push({
					indexerId: indexer.id,
					indexerName: indexer.name,
					reason: 'searchType',
					message: `Cannot handle ${criteria.searchType} search (missing categories or search mode)`
				});
				logger.debug(`Indexer ${indexer.name} rejected: cannot handle search type`, {
					indexerId: indexer.id,
					searchType: criteria.searchType,
					tvSearchMode: indexer.capabilities.tvSearch,
					movieSearchMode: indexer.capabilities.movieSearch
				});
				continue;
			}

			// Check search source capability (interactive/automatic)
			if (options.searchSource) {
				let allowed = true;
				if (options.searchSource === 'interactive' && !indexer.enableInteractiveSearch) {
					allowed = false;
				} else if (options.searchSource === 'automatic' && !indexer.enableAutomaticSearch) {
					allowed = false;
				}
				if (!allowed) {
					rejected.push({
						indexerId: indexer.id,
						indexerName: indexer.name,
						reason: 'searchSource',
						message: `${options.searchSource} search is disabled for this indexer`
					});
					logger.debug(
						`Indexer ${indexer.name} rejected: ${options.searchSource} search disabled`,
						{
							indexerId: indexer.id,
							searchSource: options.searchSource,
							enableInteractiveSearch: indexer.enableInteractiveSearch,
							enableAutomaticSearch: indexer.enableAutomaticSearch
						}
					);
					continue;
				}
			}

			// Check enabled status
			if (options.respectEnabled) {
				const status = this.statusTracker.getStatusSync(indexer.id);
				if (!status.isEnabled) {
					rejected.push({
						indexerId: indexer.id,
						indexerName: indexer.name,
						reason: 'disabled',
						message: 'Indexer is disabled'
					});
					logger.debug(`Indexer ${indexer.name} rejected: disabled by user`, {
						indexerId: indexer.id
					});
					continue;
				}
			}

			// Check backoff status
			if (options.respectBackoff) {
				if (!this.statusTracker.canUse(indexer.id)) {
					rejected.push({
						indexerId: indexer.id,
						indexerName: indexer.name,
						reason: 'backoff',
						message: 'Indexer is in backoff due to recent failures'
					});
					logger.debug(`Indexer ${indexer.name} rejected: in backoff period`, {
						indexerId: indexer.id
					});
					continue;
				}
			}

			// Check specific indexer filter
			if (criteria.indexerIds?.length && !criteria.indexerIds.includes(indexer.id)) {
				rejected.push({
					indexerId: indexer.id,
					indexerName: indexer.name,
					reason: 'indexerFilter',
					message: 'Excluded by indexer filter'
				});
				continue;
			}

			// Check protocol filter (from scoring profile's allowedProtocols)
			if (options.protocolFilter && options.protocolFilter.length > 0) {
				if (!options.protocolFilter.includes(indexer.protocol)) {
					rejected.push({
						indexerId: indexer.id,
						indexerName: indexer.name,
						reason: 'protocol',
						message: `Protocol '${indexer.protocol}' not in allowed protocols: ${options.protocolFilter.join(', ')}`
					});
					logger.debug(`Indexer ${indexer.name} rejected: protocol not allowed`, {
						indexerId: indexer.id,
						protocol: indexer.protocol,
						allowedProtocols: options.protocolFilter
					});
					continue;
				}
			}

			logger.debug(`Indexer ${indexer.name} eligible for search`, {
				indexerId: indexer.id
			});
			eligible.push(indexer);
		}

		// Log summary at info level for visibility
		if (rejected.length > 0 || indexers.length > 0) {
			const rejectedByReason = rejected.reduce(
				(acc, r) => {
					acc[r.reason] = acc[r.reason] || [];
					acc[r.reason].push(r.indexerName);
					return acc;
				},
				{} as Record<string, string[]>
			);

			logger.info('Indexer filtering complete', {
				searchType: criteria.searchType,
				searchSource: options.searchSource,
				total: indexers.length,
				eligible: eligible.length,
				rejected: rejected.length,
				rejectedBySearchType: rejectedByReason.searchType,
				rejectedBySearchSource: rejectedByReason.searchSource,
				rejectedByDisabled: rejectedByReason.disabled,
				rejectedByBackoff: rejectedByReason.backoff,
				rejectedByFilter: rejectedByReason.indexerFilter,
				rejectedByProtocol: rejectedByReason.protocol,
				eligibleIndexers: eligible.map((i) => i.name)
			});
		}

		return { eligible, rejected };
	}

	/** Execute searches across indexers with concurrency control */
	private async executeSearches(
		indexers: IIndexer[],
		criteria: SearchCriteria,
		results: IndexerSearchResult[],
		options: ResolvedSearchOptions
	): Promise<ReleaseResult[]> {
		const allReleases: ReleaseResult[] = [];

		logger.info('[executeSearches] Starting', {
			indexerCount: indexers.length,
			criteria: { type: criteria.searchType, query: criteria.query },
			concurrency: options.concurrency
		});

		// Process in batches for concurrency control
		for (let i = 0; i < indexers.length; i += options.concurrency) {
			const batch = indexers.slice(i, i + options.concurrency);

			const batchResults = await Promise.all(
				batch.map((indexer) =>
					this.searchIndexer(indexer, criteria, options.timeout, options.useTieredSearch)
				)
			);

			for (const result of batchResults) {
				logger.info('[executeSearches] Indexer result', {
					indexer: result.indexerName,
					resultCount: result.results.length,
					timeMs: result.searchTimeMs,
					error: result.error
				});
				results.push(result);
				allReleases.push(...result.results);
			}
		}

		logger.info('[executeSearches] Completed', {
			totalReleases: allReleases.length
		});

		return allReleases;
	}

	/** Search a single indexer with tiered strategy */
	private async searchIndexer(
		indexer: IIndexer,
		criteria: SearchCriteria,
		timeout: number,
		useTieredSearch: boolean
	): Promise<IndexerSearchResult> {
		const startTime = Date.now();

		try {
			// Check both indexer rate limit AND host rate limit
			const limiter = this.rateLimitRegistry.get(indexer.id);
			const hostCheck = this.hostRateLimiter.checkRateLimits(indexer.id, indexer.baseUrl, limiter);

			if (!hostCheck.canProceed) {
				const waitTime = hostCheck.waitTimeMs;
				logger.debug('Rate limited', {
					indexer: indexer.name,
					reason: hostCheck.reason,
					waitTimeMs: waitTime
				});

				// Wait or skip based on wait time
				if (waitTime > timeout) {
					return {
						indexerId: indexer.id,
						indexerName: indexer.name,
						results: [],
						searchTimeMs: Date.now() - startTime,
						error: `Rate limited: ${hostCheck.reason} (wait: ${waitTime}ms)`
					};
				}

				await this.delay(waitTime);
			}

			// Execute search with timeout
			const searchPromise = useTieredSearch
				? this.executeWithTiering(indexer, criteria)
				: this.executeSimple(indexer, criteria);

			const { releases, searchMethod } = await Promise.race([
				searchPromise,
				this.createTimeoutPromise(timeout)
			]);

			// Record success for both indexer and host rate limits
			limiter.recordRequest();
			this.hostRateLimiter.recordRequest(indexer.baseUrl);
			this.statusTracker.recordSuccess(indexer.id, Date.now() - startTime);

			return {
				indexerId: indexer.id,
				indexerName: indexer.name,
				results: releases,
				searchTimeMs: Date.now() - startTime,
				searchMethod
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Handle Cloudflare protection specifically
			if (error instanceof CloudflareProtectedError) {
				logger.warn('Cloudflare protection detected', {
					indexer: indexer.name,
					host: error.host,
					statusCode: error.statusCode
				});

				// Record failure with Cloudflare-specific message
				this.statusTracker.recordFailure(indexer.id, `Cloudflare protection on ${error.host}`);

				return {
					indexerId: indexer.id,
					indexerName: indexer.name,
					results: [],
					searchTimeMs: Date.now() - startTime,
					error: `Cloudflare protection detected on ${error.host}`
				};
			}

			logger.warn('Indexer search failed', {
				indexer: indexer.name,
				error: message
			});

			// Record failure
			this.statusTracker.recordFailure(indexer.id, message);

			return {
				indexerId: indexer.id,
				indexerName: indexer.name,
				results: [],
				searchTimeMs: Date.now() - startTime,
				error: message
			};
		}
	}

	/** Execute search with tiered strategy: prefer ID search, fall back to text */
	private async executeWithTiering(
		indexer: IIndexer,
		criteria: SearchCriteria
	): Promise<{ releases: ReleaseResult[]; searchMethod: 'id' | 'text' }> {
		// Check if criteria has IDs AND if the indexer supports those specific IDs
		const indexerSupportsIds = this.indexerSupportsSearchIds(indexer, criteria);

		// Tier 1: If criteria has searchable IDs AND indexer supports them, use ID search
		if (hasSearchableIds(criteria) && indexerSupportsIds) {
			const idCriteria = createIdOnlyCriteria(criteria);
			const releases = await indexer.search(idCriteria);
			return { releases, searchMethod: 'id' };
		}

		// Tier 2: Fall back to text search with multi-title support
		// This allows text-only indexers to participate
		// and searches with multiple titles for better regional tracker coverage
		const allReleases = await this.executeMultiTitleTextSearch(indexer, criteria);

		if (allReleases.length > 0) {
			return { releases: allReleases, searchMethod: 'text' };
		}

		// No results from any title variant
		if (!criteria.query && (!criteria.searchTitles || criteria.searchTitles.length === 0)) {
			logger.debug('Skipping indexer: no supported IDs and no query text', {
				indexer: indexer.name
			});
		}
		return { releases: [], searchMethod: 'text' };
	}

	/**
	 * Execute text search with multiple title variants.
	 * For TV searches, tries different episode format types based on indexer capabilities.
	 * 
	 * Architecture note: Episode format handling is now driven by:
	 * 1. Indexer's searchFormats.episode capability (if specified in YAML)
	 * 2. Default fallback to all common formats (standard, european, compact)
	 * 
	 * The query passed downstream is CLEAN (just the title). TemplateEngine is the
	 * sole component responsible for composing the final search keywords by adding
	 * the appropriate episode token to .Keywords.
	 */
	private async executeMultiTitleTextSearch(
		indexer: IIndexer,
		criteria: SearchCriteria
	): Promise<ReleaseResult[]> {
		const allReleases: ReleaseResult[] = [];
		const seenGuids = new Set<string>();

		// Build list of titles to search
		const titlesToSearch: string[] = [];
		if (criteria.searchTitles && criteria.searchTitles.length > 0) {
			titlesToSearch.push(...criteria.searchTitles);
		} else if (criteria.query) {
			titlesToSearch.push(criteria.query);
		}

		if (titlesToSearch.length === 0) {
			return [];
		}

		// Get episode formats to try based on indexer capabilities
		let episodeFormats: EpisodeFormat[] = [];
		if (isTvSearch(criteria) && criteria.season !== undefined) {
			// Get format types from indexer capabilities, or use all formats as fallback
			const formatTypes = getEffectiveEpisodeFormats(
				indexer.capabilities.searchFormats?.episode,
				true // useAllFormats fallback for backwards compatibility
			);
			episodeFormats = getEpisodeFormats(criteria, formatTypes);
		}

		// Search with each title variant (limit to 3 titles to avoid excessive queries)
		for (const title of titlesToSearch.slice(0, 3)) {
			try {
				if (episodeFormats.length > 0) {
					// TV search: try each episode format
					// Pass CLEAN query (just title) with preferredEpisodeFormat set
					// TemplateEngine uses preferredEpisodeFormat to add the correct token
					for (const format of episodeFormats) {
						const textCriteria = createTextOnlyCriteria({
							...criteria,
							// Clean query: just the title, no episode token embedded
							query: title,
							// Tell TemplateEngine which format to use for this request
							preferredEpisodeFormat: format.type
						});
						
						const releases = await indexer.search(textCriteria);

						// Add unique releases (dedupe by guid)
						for (const release of releases) {
							if (!seenGuids.has(release.guid)) {
								seenGuids.add(release.guid);
								allReleases.push(release);
							}
						}
					}
				} else {
					// Movie/other search: just use title
					const textCriteria = createTextOnlyCriteria({
						...criteria,
						query: title
					});
					const releases = await indexer.search(textCriteria);

					// Add unique releases
					for (const release of releases) {
						if (!seenGuids.has(release.guid)) {
							seenGuids.add(release.guid);
							allReleases.push(release);
						}
					}
				}
			} catch (error) {
				logger.debug('Multi-title search variant failed', {
					indexer: indexer.name,
					title,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		if (allReleases.length > 0) {
			logger.debug('Multi-title search completed', {
				indexer: indexer.name,
				titlesSearched: Math.min(titlesToSearch.length, 3),
				formatsUsed: episodeFormats.length || 1,
				totalResults: allReleases.length
			});
		}

		return allReleases;
	}

	/** Check if the indexer supports the specific IDs in the search criteria */
	private indexerSupportsSearchIds(indexer: IIndexer, criteria: SearchCriteria): boolean {
		const caps = indexer.capabilities;

		if (isMovieSearch(criteria)) {
			// Check if indexer supports any of the IDs in the criteria
			if (criteria.imdbId && supportsParam(caps, 'movie', 'imdbId')) return true;
			if (criteria.tmdbId && supportsParam(caps, 'movie', 'tmdbId')) return true;
			return false;
		}

		if (isTvSearch(criteria)) {
			// Check if indexer supports any of the IDs in the criteria
			if (criteria.imdbId && supportsParam(caps, 'tv', 'imdbId')) return true;
			if (criteria.tmdbId && supportsParam(caps, 'tv', 'tmdbId')) return true;
			if (criteria.tvdbId && supportsParam(caps, 'tv', 'tvdbId')) return true;
			if (criteria.tvMazeId && supportsParam(caps, 'tv', 'tvMazeId')) return true;
			return false;
		}

		return false;
	}

	/**
	 * Check if indexer can handle the search type (categories + basic capability).
	 * This is a relaxed check that allows text-only indexers.
	 */
	private canIndexerHandleSearchType(indexer: IIndexer, criteria: SearchCriteria): boolean {
		const caps = indexer.capabilities;
		const searchType = criteria.searchType;

		// Check categories match (movie indexer for movie search, etc.)
		if (searchType === 'movie') {
			const hasMovieCategories = indexerHasCategoriesForSearchType(caps.categories, 'movie');
			if (!hasMovieCategories) return false;
			// Check if movie search mode is available (regardless of ID support)
			return caps.movieSearch?.available ?? false;
		}

		if (searchType === 'tv') {
			const hasTvCategories = indexerHasCategoriesForSearchType(caps.categories, 'tv');
			if (!hasTvCategories) return false;
			// Check if TV search mode is available (regardless of ID support)
			return caps.tvSearch?.available ?? false;
		}

		// Basic search - just needs to be enabled
		return true;
	}

	/** Simple search without tiering */
	private async executeSimple(
		indexer: IIndexer,
		criteria: SearchCriteria
	): Promise<{ releases: ReleaseResult[]; searchMethod: 'text' }> {
		const releases = await indexer.search(criteria);
		return { releases, searchMethod: 'text' };
	}

	/** Create a timeout promise */
	private createTimeoutPromise(timeout: number): Promise<never> {
		return new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`Search timeout after ${timeout}ms`)), timeout)
		);
	}

	/** Delay for given milliseconds */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Filter releases by season/episode when specified in criteria.
	 *
	 * For movie searches: Rejects releases that are clearly TV episodes (have S01E03 patterns)
	 *
	 * For TV searches with season/episode specified:
	 * - Season-only search: Returns season packs (single or multi-season) that contain the target season
	 * - Season+episode search: Returns matching individual episodes AND season packs containing the episode
	 *   (Season packs will be scored higher via pack bonus, so they'll naturally float to the top)
	 *
	 * Optimization: Caches parsed results on releases to avoid re-parsing in enricher.
	 */
	private filterBySeasonEpisode(
		releases: ReleaseResult[],
		criteria: SearchCriteria
	): ReleaseResult[] {
		// For movie searches, reject releases that are clearly TV episodes
		if (isMovieSearch(criteria)) {
			return releases.filter((release) => {
				const releaseWithCache = release as ReleaseResult & {
					_parsedRelease?: ReturnType<typeof parseRelease>;
				};
				if (!releaseWithCache._parsedRelease) {
					releaseWithCache._parsedRelease = parseRelease(release.title);
				}
				const parsed = releaseWithCache._parsedRelease;

				// Reject if release has episode info (S01E03, season pack, etc.)
				if (parsed.episode) {
					logger.debug('[SearchOrchestrator] Rejecting TV release for movie search', {
						title: release.title,
						episode: parsed.episode
					});
					return false;
				}
				return true;
			});
		}

		if (!isTvSearch(criteria)) {
			return releases;
		}

		const targetSeason = criteria.season;
		const targetEpisode = criteria.episode;

		// If no season/episode specified, return all
		if (targetSeason === undefined && targetEpisode === undefined) {
			return releases;
		}

		return releases.filter((release) => {
			// Parse the release title to get episode info
			// Cache parsed result on release to avoid re-parsing in ReleaseEnricher
			const releaseWithCache = release as ReleaseResult & {
				_parsedRelease?: ReturnType<typeof parseRelease>;
			};
			if (!releaseWithCache._parsedRelease) {
				releaseWithCache._parsedRelease = parseRelease(release.title);
			}
			const parsed = releaseWithCache._parsedRelease;
			const episodeInfo = parsed.episode;

			// Exclude releases that couldn't be parsed for episode info
			if (!episodeInfo) {
				return false;
			}

			// Helper to check if the release contains the target season
			const containsTargetSeason = (): boolean => {
				// Complete series always matches any season
				if (episodeInfo.isCompleteSeries) {
					return true;
				}
				// Multi-season pack: check if target season is in the range
				if (episodeInfo.seasons?.length) {
					return episodeInfo.seasons.includes(targetSeason!);
				}
				// Single season: exact match
				return episodeInfo.season === targetSeason;
			};

			// Season-only search: filter to season packs that contain the target season
			if (targetSeason !== undefined && targetEpisode === undefined) {
				return episodeInfo.isSeasonPack && containsTargetSeason();
			}

			// Season + episode search: include BOTH specific episodes AND season packs
			// Season packs will get a higher score via pack bonus, so they'll naturally
			// rank higher than individual episodes of similar quality
			if (targetSeason !== undefined && targetEpisode !== undefined) {
				// Include season packs that contain the target season
				if (episodeInfo.isSeasonPack && containsTargetSeason()) {
					return true;
				}
				// Include individual episodes that match exactly
				return (
					episodeInfo.season === targetSeason &&
					!episodeInfo.isSeasonPack &&
					episodeInfo.episodes?.includes(targetEpisode)
				);
			}

			// Episode-only search (rare): match episode number or include any season pack
			if (targetEpisode !== undefined) {
				if (episodeInfo.isSeasonPack) {
					return true; // Season packs always match episode-only searches
				}
				return episodeInfo.episodes?.includes(targetEpisode);
			}

			return true;
		});
	}

	/**
	 * Filter releases by category match.
	 * Rejects releases where the category doesn't match the search type
	 * (e.g., audio releases for movie searches).
	 */
	private filterByCategoryMatch(
		releases: ReleaseResult[],
		searchType: 'movie' | 'tv' | 'music' | 'book'
	): ReleaseResult[] {
		return releases.filter((release) => {
			// If release has no categories, allow it (benefit of the doubt)
			if (!release.categories || release.categories.length === 0) {
				return true;
			}

			// Check if ANY of the release's categories match the search type
			const hasMatchingCategory = release.categories.some((cat) =>
				categoryMatchesSearchType(cat, searchType)
			);

			if (!hasMatchingCategory) {
				const actualContentType = getCategoryContentType(release.categories[0]);
				logger.debug('[SearchOrchestrator] Rejecting release due to category mismatch', {
					title: release.title,
					categories: release.categories,
					expectedSearchType: searchType,
					actualContentType
				});
			}

			return hasMatchingCategory;
		});
	}

	/**
	 * Get episode count for a TV season from TMDB.
	 * Used for season pack size validation (per-episode size calculation).
	 * Returns undefined if unable to fetch (allows search to proceed without size validation).
	 */
	private async getSeasonEpisodeCount(criteria: SearchCriteria): Promise<number | undefined> {
		// Only works for TV searches with TMDB ID and season number
		if (!isTvSearch(criteria) || criteria.season === undefined) {
			return undefined;
		}

		// Need TMDB ID to fetch season details
		const tmdbId = criteria.tmdbId;
		if (!tmdbId) {
			return undefined;
		}

		// Check cache first
		const cacheKey = `${tmdbId}:${criteria.season}`;
		if (this.seasonEpisodeCountCache.has(cacheKey)) {
			return this.seasonEpisodeCountCache.get(cacheKey);
		}

		try {
			const season = await tmdb.getSeason(tmdbId, criteria.season);
			const episodeCount = season.episode_count ?? season.episodes?.length;

			if (episodeCount && episodeCount > 0) {
				// Cache the result
				this.seasonEpisodeCountCache.set(cacheKey, episodeCount);
				logger.debug('Fetched season episode count from TMDB', {
					tmdbId,
					season: criteria.season,
					episodeCount
				});
				return episodeCount;
			}
		} catch (error) {
			// Log but don't fail - search can proceed without episode count
			// Size validation will be skipped for season packs
			logger.warn('Failed to fetch season episode count from TMDB', {
				tmdbId,
				season: criteria.season,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return undefined;
	}

	/**
	 * Enrich search criteria with missing external IDs.
	 * If we have TMDB ID but no IMDB ID, look it up from TMDB.
	 * This enables more indexers to match the search.
	 */
	private async enrichCriteriaWithIds(criteria: SearchCriteria): Promise<SearchCriteria> {
		// Only enrich movie and TV searches
		if (criteria.searchType !== 'movie' && criteria.searchType !== 'tv') {
			return criteria;
		}

		// If we already have IMDB ID, no enrichment needed
		if ('imdbId' in criteria && criteria.imdbId) {
			return criteria;
		}

		// If we have TMDB ID but no IMDB ID, look it up
		if ('tmdbId' in criteria && criteria.tmdbId) {
			try {
				const externalIds =
					criteria.searchType === 'movie'
						? await tmdb.getMovieExternalIds(criteria.tmdbId)
						: await tmdb.getTvExternalIds(criteria.tmdbId);

				if (externalIds.imdb_id) {
					logger.debug('Enriched search criteria with IMDB ID', {
						tmdbId: criteria.tmdbId,
						imdbId: externalIds.imdb_id
					});

					return {
						...criteria,
						imdbId: externalIds.imdb_id
					};
				}
			} catch (error) {
				// Log but don't fail - search can still proceed without IMDB ID
				logger.warn('Failed to look up IMDB ID from TMDB', {
					tmdbId: criteria.tmdbId,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return criteria;
	}
}

/** Singleton instance */
let orchestratorInstance: SearchOrchestrator | null = null;

/** Get the singleton SearchOrchestrator */
export function getSearchOrchestrator(): SearchOrchestrator {
	if (!orchestratorInstance) {
		orchestratorInstance = new SearchOrchestrator();
	}
	return orchestratorInstance;
}

/** Reset the singleton (for testing) */
export function resetSearchOrchestrator(): void {
	orchestratorInstance = null;
}
