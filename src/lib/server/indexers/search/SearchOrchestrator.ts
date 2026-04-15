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
	getCategoryContentType,
	CINEPHAGE_STREAM_DEFINITION_ID
} from '../types';

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
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'indexers' as const });
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
	/** Total results across all indexers before any filtering (raw from indexers) */
	totalResults: number;
	/** Results after first deduplication pass (before enrichment) */
	afterDedup?: number;
	/** Results after season/category filtering (before enrichment) */
	afterFiltering?: number;
	/** Results after enrichment (before limit applied) */
	afterEnrichment?: number;
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
	concurrency: getPositiveIntEnv('INDEXER_SEARCH_CONCURRENCY', 5),
	timeout: getPositiveIntEnv('INDEXER_SEARCH_TIMEOUT_MS', 30_000),
	useCache: true
};

const CYRILLIC_REGEX = /\p{Script=Cyrillic}/u;

function containsCyrillic(value: string): boolean {
	return CYRILLIC_REGEX.test(value);
}

function prefersNativeCyrillicTitles(indexer: IIndexer): boolean {
	const name = indexer.name.toLowerCase();
	return name.includes('rutracker') || name.includes('kinozal');
}

const NON_VIDEO_ARTIFACT_TITLE_PATTERNS: RegExp[] = [
	/\boriginal\s+soundtrack\b/i,
	/\bsoundtrack\b/i,
	/\b(?:film|movie|motion\s+picture|series)\s+score\b/i,
	/\[(?:\s*(?:score|soundtrack|ost)\s*(?:,\s*(?:score|soundtrack|ost)\s*)*)\]/i,
	/\((?:\s*(?:score|soundtrack|ost)\s*(?:,\s*(?:score|soundtrack|ost)\s*)*)\)/i,
	/\bost\b/i,
	/\bdiscography\b/i,
	/\balbum\b/i,
	/\bvinyl\b/i,
	/\blossless\b/i,
	/\bflac\b/i,
	/\bmp3\b/i,
	/\baac\b/i,
	/\bm4a\b/i,
	/\btrailer\b/i,
	/\bteaser\b/i,
	/\bpromo\b/i,
	/\bpreview\b/i,
	/\bclip\b/i,
	/\bfeaturette\b/i,
	/\b(?:audio\s*)?cd\b/i,
	/\b(?:epub|pdf|mobi|azw3|cbz|cbr)\b/i
];

const TRAILER_ARTIFACT_TITLE_PATTERNS: RegExp[] = [
	/\btrailer\b/i,
	/\bteaser\b/i,
	/\bpromo\b/i,
	/\bpreview\b/i,
	/\bclip\b/i,
	/\bfeaturette\b/i
];

const VIDEO_SIGNAL_PATTERN =
	/\b(?:\d{3,4}p|4k|8k|web[-.\s]?dl|web[-.\s]?rip|webrip|bluray|bdrip|bdremux|remux|hdtv|dvdrip|x264|x265|h\.?264|h\.?265|hevc|av1|s\d{1,2}e\d{1,3}|\d{1,2}x\d{2,3})\b/i;

const RUTRACKER_AUTOMATIC_MAX_TITLES = 2;
const RUTRACKER_AUTOMATIC_SEASON_CACHE_TTL_MS = 3 * 60_000;

interface TvEpisodeCounts {
	seriesEpisodeCount?: number;
	seasonEpisodeCounts: Map<number, number>;
}

interface SeasonEpisodeFilterContext {
	seasonEpisodeCount?: number;
	seasonEpisodeCounts?: Map<number, number>;
}

function getPositiveIntEnv(name: string, fallback: number): number {
	const envValue = process.env[name];
	if (!envValue) return fallback;

	const parsed = Number(envValue);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

	return Math.round(parsed);
}

/**
 * Orchestrates searches across multiple indexers with tiered strategy.
 */
export class SearchOrchestrator {
	private statusTracker: PersistentStatusTracker;
	/** Cache for season episode counts (tmdbId:season -> count) */
	private seasonEpisodeCountCache: Map<string, number> = new Map();
	/** Cache for TV show episode counts (tmdbId -> aggregate + per-season counts) */
	private tvEpisodeCountsCache: Map<number, TvEpisodeCounts> = new Map();
	/** Short-lived cache for RuTracker automatic TV season searches (reduces per-episode query fan-out). */
	private rutrackerAutomaticSeasonSearchCache: Map<
		string,
		{ cachedAtMs: number; releases: ReleaseResult[] }
	> = new Map();
	/** In-flight dedupe for identical RuTracker automatic season searches. */
	private rutrackerAutomaticSeasonSearchInFlight: Map<string, Promise<ReleaseResult[]>> = new Map();
	/** Single-lane queue for RuTracker automatic season searches to avoid bursty host traffic. */
	private rutrackerAutomaticSearchLane: Promise<void> = Promise.resolve();
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
		const criteriaWithSource = opts.searchSource
			? { ...criteria, searchSource: opts.searchSource }
			: criteria;

		logger.debug(
			{
				criteria: criteriaToString(criteriaWithSource),
				indexerCount: indexers.length,
				options: opts
			},
			'Starting search orchestration'
		);

		// Enrich criteria with missing IDs (e.g., look up IMDB ID from TMDB ID)
		const enrichedCriteria = await this.enrichCriteriaWithIds(criteriaWithSource);

		// Check cache first (use enriched criteria for cache key)
		if (opts.useCache) {
			const cached = this.cache.get(enrichedCriteria);
			if (cached) {
				logger.debug({ resultCount: cached.length }, 'Cache hit');
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
			logger.warn(
				{
					criteria: criteriaToString(criteria)
				},
				'No eligible indexers for search'
			);
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

		// Filter by season/episode if specified.
		// Use criteriaWithSource so interactive/automatic behavior is respected.
		// (season/episode fields are unchanged from original criteria)
		let filtered = this.filterBySeasonEpisode(deduped, criteriaWithSource);

		// Filter by category match (reject releases in wrong categories)
		if (criteria.searchType !== 'basic') {
			const searchType = criteria.searchType as 'movie' | 'tv' | 'music' | 'book';
			filtered = this.filterByCategoryMatch(filtered, searchType);
		}
		filtered = this.filterOutNonVideoArtifacts(filtered, criteriaWithSource);

		// Rank
		const ranked = this.ranker.rank(filtered);

		// Apply limit (only if explicitly specified)
		const limited = criteria.limit ? ranked.slice(0, criteria.limit) : ranked;

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

		logger.info(
			{
				totalResults: result.totalResults,
				returned: result.releases.length,
				timeMs: result.searchTimeMs
			},
			'Search completed'
		);

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
		const criteriaWithSource = opts.searchSource
			? { ...criteria, searchSource: opts.searchSource }
			: criteria;

		logger.debug(
			{
				criteria: criteriaToString(criteriaWithSource),
				indexerCount: indexers.length,
				enrichment: opts.enrichment
			},
			'Starting enhanced search orchestration'
		);

		// Enrich criteria with missing IDs (e.g., look up IMDB ID from TMDB ID)
		const enrichedCriteria = await this.enrichCriteriaWithIds(criteriaWithSource);

		// Filter indexers
		const { eligible: eligibleIndexers, rejected: rejectedIndexers } = this.filterIndexers(
			indexers,
			enrichedCriteria,
			opts
		);

		if (eligibleIndexers.length === 0) {
			logger.warn(
				{
					criteria: criteriaToString(enrichedCriteria)
				},
				'No eligible indexers for search'
			);
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

		// TEMP DEBUG: Log per-indexer result counts
		logger.info(
			{
				indexerCounts: indexerResults.map((r) => ({
					indexer: r.indexerName,
					returned: r.results?.length ?? 0,
					duration: r.searchTimeMs,
					error: r.error
				}))
			},
			'[SearchOrchestrator] PER-INDEXER RESULT COUNTS (DEBUG)'
		);

		// Pass 1: Basic deduplication (by infoHash/title, prefer more seeders)
		const { releases: deduped } = this.deduplicator.deduplicate(allReleases);
		const afterDedupCount = deduped.length;

		// Debug: log YTS releases after deduplication
		const ytsAfterDedup = deduped.filter((r) => r.indexerName === 'YTS');
		logger.info(
			{
				totalDeduped: deduped.length,
				ytsCount: ytsAfterDedup.length,
				ytsTitles: ytsAfterDedup.slice(0, 5).map((r) => r.title),
				sampleIndexers: deduped.slice(0, 10).map((r) => r.indexerName)
			},
			'[SearchOrchestrator] After deduplication'
		);

		// Get TV episode counts from TMDB for season-pack size validation and
		// RuTracker season-pack completion gating.
		let seriesEpisodeCount = opts.enrichment?.seriesEpisodeCount;
		let seasonEpisodeCounts = opts.enrichment?.seasonEpisodeCounts;
		if (
			isTvSearch(enrichedCriteria) &&
			enrichedCriteria.tmdbId &&
			(seriesEpisodeCount === undefined || !seasonEpisodeCounts || seasonEpisodeCounts.size === 0)
		) {
			const tvCounts = await this.getTvEpisodeCounts(enrichedCriteria.tmdbId);
			if (tvCounts) {
				seriesEpisodeCount ??= tvCounts.seriesEpisodeCount;
				seasonEpisodeCounts ??= tvCounts.seasonEpisodeCounts;
			}
		}

		let seasonEpisodeCount = opts.enrichment?.seasonEpisodeCount;
		if (
			seasonEpisodeCount === undefined &&
			isTvSearch(enrichedCriteria) &&
			enrichedCriteria.season !== undefined
		) {
			seasonEpisodeCount =
				seasonEpisodeCounts?.get(enrichedCriteria.season) ??
				(await this.getSeasonEpisodeCount(enrichedCriteria));
		}

		// Filter by season/episode if specified
		let filtered = this.filterBySeasonEpisode(deduped, enrichedCriteria, {
			seasonEpisodeCount,
			seasonEpisodeCounts
		});
		// TEMP DEBUG: Log after season/episode filter
		logger.debug(
			{ afterSeasonEpisode: filtered.length },
			'[SearchOrchestrator] DEBUG: after season/episode filter'
		);

		// Filter by category match (reject releases in wrong categories)
		if (enrichedCriteria.searchType !== 'basic') {
			const searchType = enrichedCriteria.searchType as 'movie' | 'tv' | 'music' | 'book';
			filtered = this.filterByCategoryMatch(filtered, searchType);
		}
		// TEMP DEBUG: Log after category filter
		logger.debug(
			{ afterCategory: filtered.length },
			'[SearchOrchestrator] DEBUG: after category filter'
		);

		filtered = this.filterOutNonVideoArtifacts(filtered, enrichedCriteria);
		// TEMP DEBUG: Log after non-video filter
		logger.debug(
			{ afterNonVideo: filtered.length },
			'[SearchOrchestrator] DEBUG: after non-video filter'
		);

		// Hard filter by ID match with title+year fallback
		// Completely removes releases with wrong IDs or mismatched title/year
		if (isMovieSearch(enrichedCriteria) || isTvSearch(enrichedCriteria)) {
			filtered = this.filterByIdOrTitleMatch(filtered, enrichedCriteria);
		}
		// TEMP DEBUG: Log after ID/title filter
		logger.debug(
			{ afterIdTitle: filtered.length },
			'[SearchOrchestrator] DEBUG: after ID/title filter'
		);

		// Filter by title relevance (safety net for irrelevant results)
		if (enrichedCriteria.searchType !== 'basic') {
			filtered = this.filterByTitleRelevance(filtered, enrichedCriteria);
		}
		// TEMP DEBUG: Log after title relevance filter
		logger.debug(
			{ afterTitleRelevance: filtered.length },
			'[SearchOrchestrator] DEBUG: after title relevance filter'
		);
		const afterFilteringCount = filtered.length;

		// Enrich with quality scoring and optional TMDB matching
		// Determine media type from search criteria for size validation
		const mediaType =
			enrichedCriteria.searchType === 'movie'
				? 'movie'
				: enrichedCriteria.searchType === 'tv'
					? 'tv'
					: undefined;

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
			seriesEpisodeCount,
			seasonEpisodeCounts,
			indexerConfigs
		};

		const enrichResult = await releaseEnricher.enrich(filtered, enrichmentOpts);

		// TEMP DEBUG: Log enrichment results per indexer
		logger.info(
			{
				beforeEnrich: filtered.length,
				afterEnrichTotal: enrichResult.releases.length,
				rejectedCount: enrichResult.rejectedCount,
				acceptedCount: enrichResult.releases.filter((r) => !r.rejected).length,
				perIndexer: [...new Set(enrichResult.releases.map((r) => r.indexerName))].map((name) => ({
					indexer: name,
					total: enrichResult.releases.filter((r) => r.indexerName === name).length,
					rejected: enrichResult.releases.filter((r) => r.indexerName === name && r.rejected)
						.length,
					accepted: enrichResult.releases.filter((r) => r.indexerName === name && !r.rejected)
						.length,
					sampleTitles: enrichResult.releases
						.filter((r) => r.indexerName === name)
						.slice(0, 3)
						.map((r) => r.title)
				}))
			},
			'[SearchOrchestrator] DEBUG: After enrichment - per indexer results'
		);

		// TEMP DEBUG: Log rejected releases details
		const rejectedReleases = enrichResult.releases.filter((r) => r.rejected);
		if (rejectedReleases.length > 0) {
			logger.info(
				{
					rejectedCount: rejectedReleases.length,
					sampleRejected: rejectedReleases.slice(0, 5).map((r) => ({
						indexer: r.indexerName,
						title: r.title,
						size: r.size,
						rejectionReason: r.rejectionReason
					}))
				},
				'[SearchOrchestrator] DEBUG: Sample rejected releases'
			);
		}

		// Pass 2: Enhanced deduplication using Radarr-style preference logic
		// Now that we have rejection counts, prefer releases with fewer rejections and higher indexer priority
		const { releases: smartDeduped } = this.deduplicator.deduplicateEnhanced(enrichResult.releases);
		const afterEnrichmentCount = smartDeduped.length;

		logger.debug(
			{
				beforeDedup: enrichResult.releases.length,
				afterDedup: smartDeduped.length,
				removed: enrichResult.releases.length - smartDeduped.length
			},
			'[SearchOrchestrator] After enhanced deduplication'
		);

		// Apply limit (releases are already sorted by totalScore from enricher)
		const limited = enrichedCriteria.limit
			? smartDeduped.slice(0, enrichedCriteria.limit)
			: smartDeduped;

		// Assign releaseWeight (position in final sorted results, 1 = best)
		const withWeights = limited.map((release, index) => ({
			...release,
			releaseWeight: index + 1
		}));

		const result: EnhancedSearchResult = {
			releases: withWeights,
			totalResults: allReleases.length,
			afterDedup: afterDedupCount,
			afterFiltering: afterFilteringCount,
			afterEnrichment: afterEnrichmentCount,
			rejectedCount: enrichResult.rejectedCount,
			searchTimeMs,
			enrichTimeMs: enrichResult.enrichTimeMs,
			fromCache: false,
			indexerResults,
			rejectedIndexers,
			scoringProfileId: enrichResult.scoringProfile?.id
		};

		logger.info(
			{
				totalResults: result.totalResults,
				afterDedup: result.afterDedup,
				afterFiltering: result.afterFiltering,
				afterEnrichment: result.afterEnrichment,
				returned: result.releases.length,
				rejected: result.rejectedCount,
				searchTimeMs: result.searchTimeMs,
				enrichTimeMs: result.enrichTimeMs
			},
			'Enhanced search completed'
		);

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
				logger.debug(
					{
						indexerId: indexer.id,
						searchType: criteria.searchType,
						tvSearchMode: indexer.capabilities.tvSearch,
						movieSearchMode: indexer.capabilities.movieSearch
					},
					`Indexer ${indexer.name} rejected: cannot handle search type`
				);
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
						{
							indexerId: indexer.id,
							searchSource: options.searchSource,
							enableInteractiveSearch: indexer.enableInteractiveSearch,
							enableAutomaticSearch: indexer.enableAutomaticSearch
						},
						`Indexer ${indexer.name} rejected: ${options.searchSource} search disabled`
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
					logger.debug(
						{
							indexerId: indexer.id
						},
						`Indexer ${indexer.name} rejected: disabled by user`
					);
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
						message: 'Indexer auto-disabled due to repeated failures'
					});
					logger.debug(
						{
							indexerId: indexer.id
						},
						`Indexer ${indexer.name} rejected: in backoff period`
					);
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

			// Streamer profile must only search the internal Cinephage Library indexer.
			// This prevents auto-grab from hitting torrent/usenet/external indexers when
			// the profile is explicitly configured for .strm streaming behavior.
			if (
				options.enrichment?.scoringProfileId === 'streamer' &&
				indexer.definitionId !== CINEPHAGE_STREAM_DEFINITION_ID
			) {
				rejected.push({
					indexerId: indexer.id,
					indexerName: indexer.name,
					reason: 'indexerFilter',
					message: 'Excluded by streamer profile indexer rule (Cinephage Library only)'
				});
				logger.debug(
					{
						indexerId: indexer.id,
						definitionId: indexer.definitionId
					},
					`Indexer ${indexer.name} rejected: streamer profile rule`
				);
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
					logger.debug(
						{
							indexerId: indexer.id,
							protocol: indexer.protocol,
							allowedProtocols: options.protocolFilter
						},
						`Indexer ${indexer.name} rejected: protocol not allowed`
					);
					continue;
				}
			}

			logger.debug(
				{
					indexerId: indexer.id
				},
				`Indexer ${indexer.name} eligible for search`
			);
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

			logger.info(
				{
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
				},
				'Indexer filtering complete'
			);
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

		logger.info(
			{
				indexerCount: indexers.length,
				criteria: { type: criteria.searchType, query: criteria.query },
				concurrency: options.concurrency
			},
			'[executeSearches] Starting'
		);

		// Process in batches for concurrency control
		for (let i = 0; i < indexers.length; i += options.concurrency) {
			const batch = indexers.slice(i, i + options.concurrency);

			const batchResults = await Promise.all(
				batch.map((indexer) =>
					this.searchIndexer(indexer, criteria, options.timeout, options.useTieredSearch)
				)
			);

			for (const result of batchResults) {
				logger.info(
					{
						indexer: result.indexerName,
						resultCount: result.results.length,
						timeMs: result.searchTimeMs,
						error: result.error
					},
					'[executeSearches] Indexer result'
				);
				results.push(result);
				allReleases.push(...result.results);
			}
		}

		logger.info(
			{
				totalReleases: allReleases.length
			},
			'[executeSearches] Completed'
		);

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
				logger.debug(
					{
						indexer: indexer.name,
						reason: hostCheck.reason,
						waitTimeMs: waitTime
					},
					'Rate limited'
				);

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
			await this.statusTracker.recordSuccess(indexer.id, Date.now() - startTime);

			// Attach indexer priority to each release for Radarr-style deduplication
			// Lower priority number = higher preference (1 is highest priority)
			const indexerPriority = this.statusTracker.getStatusSync(indexer.id).priority;
			const releasesWithPriority = releases.map((r) => ({
				...r,
				indexerPriority
			}));

			return {
				indexerId: indexer.id,
				indexerName: indexer.name,
				results: releasesWithPriority,
				searchTimeMs: Date.now() - startTime,
				searchMethod
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Handle Cloudflare protection specifically
			if (error instanceof CloudflareProtectedError) {
				logger.warn(
					{
						indexer: indexer.name,
						host: error.host,
						statusCode: error.statusCode
					},
					'Cloudflare protection detected'
				);

				// Record failure with Cloudflare-specific message
				await this.statusTracker.recordFailure(
					indexer.id,
					`Cloudflare protection on ${error.host}`
				);

				return {
					indexerId: indexer.id,
					indexerName: indexer.name,
					results: [],
					searchTimeMs: Date.now() - startTime,
					error: `Cloudflare protection detected on ${error.host}`
				};
			}

			logger.warn(
				{
					indexer: indexer.name,
					error: message
				},
				'Indexer search failed'
			);

			// Record failure
			await this.statusTracker.recordFailure(indexer.id, message);

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

		// Tier 1: If criteria has searchable IDs AND indexer supports them, use ID search.
		// If the ID query returns no results, fall back to text search for providers
		// with incomplete ID mapping (common on some Newznab instances).
		if (hasSearchableIds(criteria) && indexerSupportsIds) {
			const idCriteria = createIdOnlyCriteria(criteria);
			let idReleases = await indexer.search(idCriteria);

			const hasTextFallbackSource =
				!!criteria.query || !!(criteria.searchTitles && criteria.searchTitles.length > 0);

			// Some Newznab providers over-constrain movie ID searches when q/year
			// are present together. Retry once with IDs only before text fallback.
			if (idReleases.length === 0 && isMovieSearch(criteria) && (criteria.query || criteria.year)) {
				const movieIdOnlyCriteria = {
					...criteria,
					query: undefined,
					year: undefined
				};
				const movieIdOnlyReleases = await indexer.search(movieIdOnlyCriteria);
				if (movieIdOnlyReleases.length > 0) {
					logger.debug(
						{
							indexer: indexer.name,
							imdbId: criteria.imdbId,
							tmdbId: criteria.tmdbId
						},
						'Movie ID retry without q/year returned results'
					);
					idReleases = movieIdOnlyReleases;
				}
			}

			if (idReleases.length > 0) {
				// For interactive movie searches, supplement ID results with text variants.
				// This matches NZBHydra-style behavior where text variants can surface
				// additional releases even when ID lookup succeeds.
				const shouldSupplementWithText =
					isMovieSearch(criteria) &&
					criteria.searchSource === 'interactive' &&
					hasTextFallbackSource;
				if (shouldSupplementWithText) {
					const textReleases = await this.executeMultiTitleTextSearch(indexer, criteria);
					if (textReleases.length > 0) {
						const merged = [...idReleases];
						const seenGuids = new Set(idReleases.map((r) => r.guid));
						for (const release of textReleases) {
							if (!seenGuids.has(release.guid)) {
								seenGuids.add(release.guid);
								merged.push(release);
							}
						}
						logger.debug(
							{
								indexer: indexer.name,
								idResults: idReleases.length,
								textResults: textReleases.length,
								mergedResults: merged.length
							},
							'Supplemented movie ID results with text fallback'
						);
						return { releases: merged, searchMethod: 'text' };
					}
				}
				return { releases: idReleases, searchMethod: 'id' };
			}

			if (!hasTextFallbackSource) {
				return { releases: [], searchMethod: 'id' };
			}

			logger.debug(
				{
					indexer: indexer.name,
					searchType: criteria.searchType,
					query: criteria.query,
					hasSearchTitles: !!criteria.searchTitles?.length
				},
				'ID search returned no results, falling back to text search'
			);

			const fallbackReleases = await this.executeMultiTitleTextSearch(indexer, criteria);
			return { releases: fallbackReleases, searchMethod: 'text' };
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
			logger.debug(
				{
					indexer: indexer.name
				},
				'Skipping indexer: no supported IDs and no query text'
			);
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

		// Build list of titles to search and drop empty/noise variants.
		const rawTitles: string[] =
			criteria.searchTitles && criteria.searchTitles.length > 0
				? criteria.searchTitles
				: criteria.query
					? [criteria.query]
					: [];

		let titlesToSearch = [...new Set(rawTitles.map((title) => title.trim()).filter(Boolean))];

		if (prefersNativeCyrillicTitles(indexer)) {
			const nativeCyrillicTitles = titlesToSearch.filter((title) => containsCyrillic(title));
			if (nativeCyrillicTitles.length > 0) {
				titlesToSearch = nativeCyrillicTitles;
			}

			titlesToSearch = [...titlesToSearch].sort((a, b) => {
				const aCyrillic = containsCyrillic(a) ? 1 : 0;
				const bCyrillic = containsCyrillic(b) ? 1 : 0;
				return bCyrillic - aCyrillic;
			});
		}

		if (titlesToSearch.length === 0) {
			return [];
		}

		if (this.shouldUseRuTrackerAutomaticSeasonSearch(indexer, criteria)) {
			return this.executeRuTrackerAutomaticSeasonSearch(indexer, criteria, titlesToSearch);
		}

		// Get episode formats to try based on indexer capabilities.
		// Do not force season-only tokens for season 0 (specials / unknown season),
		// because many trackers return no results for S00-only keyword suffixes.
		let episodeFormats: EpisodeFormat[] = [];
		if (isTvSearch(criteria)) {
			const hasEpisode = criteria.episode !== undefined;
			const hasPositiveSeason = criteria.season !== undefined && criteria.season > 0;
			if (!hasEpisode && !hasPositiveSeason) {
				episodeFormats = [];
			} else {
				// Get format types from indexer capabilities, or use all formats as fallback
				const formatTypes = getEffectiveEpisodeFormats(
					indexer.capabilities.searchFormats?.episode,
					true // useAllFormats fallback for backwards compatibility
				);
				episodeFormats = getEpisodeFormats(criteria, formatTypes);
			}
		}

		let attemptedVariants = 0;
		let successfulVariants = 0;
		const variantErrors: string[] = [];

		// Search with each title variant. Russian trackers benefit from a slightly
		// larger budget because native-script titles may appear after English variants.
		const titleBudget = prefersNativeCyrillicTitles(indexer) ? 5 : 3;
		for (const title of titlesToSearch.slice(0, titleBudget)) {
			if (episodeFormats.length > 0) {
				const shouldTryInteractiveTvTitleOnlyFallback =
					isTvSearch(criteria) &&
					criteria.searchSource === 'interactive' &&
					(criteria.season !== undefined || criteria.episode !== undefined);

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

					attemptedVariants++;
					try {
						const releases = await indexer.search(textCriteria);
						successfulVariants++;

						// Add unique releases (dedupe by guid)
						for (const release of releases) {
							if (!seenGuids.has(release.guid)) {
								seenGuids.add(release.guid);
								allReleases.push(release);
							}
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						variantErrors.push(message);
						logger.debug(
							{
								indexer: indexer.name,
								title,
								format: format.type,
								error: message
							},
							'Multi-title search variant failed'
						);
					}
				}

				// Interactive TV fallback: also try title-only (no season/episode token in query).
				// Some trackers index packs as "Season X / Episodes 1-9" and miss SxxEyy forms.
				if (shouldTryInteractiveTvTitleOnlyFallback) {
					const titleOnlyCriteria = createTextOnlyCriteria({
						...criteria,
						query: title,
						season: undefined,
						episode: undefined,
						preferredEpisodeFormat: undefined
					});

					attemptedVariants++;
					try {
						const releases = await indexer.search(titleOnlyCriteria);
						successfulVariants++;

						for (const release of releases) {
							if (!seenGuids.has(release.guid)) {
								seenGuids.add(release.guid);
								allReleases.push(release);
							}
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						variantErrors.push(message);
						logger.debug(
							{
								indexer: indexer.name,
								title,
								format: 'titleOnly',
								error: message
							},
							'Multi-title search variant failed'
						);
					}
				}
			} else if (isMovieSearch(criteria)) {
				// Movie search: try provider-configured format variants.
				// Default fallback includes noYear to avoid false negatives on indexers
				// that over-constrain title+year keyword searches.
				const movieFormats = indexer.capabilities.searchFormats?.movie ?? ['standard', 'noYear'];
				const seenMovieVariants = new Set<string>();

				for (const format of movieFormats) {
					let movieQuery = title;
					let movieYear = criteria.year;

					if (format === 'noYear') {
						movieYear = undefined;
					} else if (format === 'yearOnly') {
						if (!criteria.year) continue;
						movieQuery = String(criteria.year);
						movieYear = undefined;
					}

					const variantKey = `${movieQuery}::${movieYear ?? ''}`;
					if (seenMovieVariants.has(variantKey)) {
						continue;
					}
					seenMovieVariants.add(variantKey);

					const textCriteria = createTextOnlyCriteria({
						...criteria,
						query: movieQuery,
						year: movieYear
					});

					attemptedVariants++;
					try {
						const releases = await indexer.search(textCriteria);
						successfulVariants++;

						for (const release of releases) {
							if (!seenGuids.has(release.guid)) {
								seenGuids.add(release.guid);
								allReleases.push(release);
							}
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						variantErrors.push(message);
						logger.debug(
							{
								indexer: indexer.name,
								title: movieQuery,
								year: movieYear,
								format,
								error: message
							},
							'Multi-title search variant failed'
						);
					}
				}
			} else {
				// Other search types: just use title
				const textCriteria = createTextOnlyCriteria({
					...criteria,
					query: title
				});

				attemptedVariants++;
				try {
					const releases = await indexer.search(textCriteria);
					successfulVariants++;

					// Add unique releases
					for (const release of releases) {
						if (!seenGuids.has(release.guid)) {
							seenGuids.add(release.guid);
							allReleases.push(release);
						}
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					variantErrors.push(message);
					logger.debug(
						{
							indexer: indexer.name,
							title,
							error: message
						},
						'Multi-title search variant failed'
					);
				}
			}
		}

		// If every variant failed, surface failure so status tracking records it.
		if (attemptedVariants > 0 && successfulVariants === 0 && variantErrors.length > 0) {
			const uniqueErrors = [...new Set(variantErrors.filter(Boolean))];
			throw new Error(uniqueErrors.slice(0, 2).join('; ') || 'All text search attempts failed');
		}

		if (allReleases.length > 0) {
			logger.debug(
				{
					indexer: indexer.name,
					titlesSearched: Math.min(titlesToSearch.length, 3),
					formatsUsed: episodeFormats.length || 1,
					totalResults: allReleases.length
				},
				'Multi-title search completed'
			);
		}

		return allReleases;
	}

	private shouldUseRuTrackerAutomaticSeasonSearch(
		indexer: IIndexer,
		criteria: SearchCriteria
	): boolean {
		return (
			isTvSearch(criteria) &&
			criteria.season !== undefined &&
			criteria.episode !== undefined &&
			this.isRuTrackerHost(indexer.baseUrl) &&
			this.isRuTrackerIndexerName(indexer.name)
		);
	}

	private async executeRuTrackerAutomaticSeasonSearch(
		indexer: IIndexer,
		criteria: SearchCriteria,
		titlesToSearch: string[]
	): Promise<ReleaseResult[]> {
		const cacheKey = this.buildRuTrackerAutomaticSeasonCacheKey(indexer, criteria, titlesToSearch);
		const now = Date.now();
		const cached = this.rutrackerAutomaticSeasonSearchCache.get(cacheKey);

		if (cached && now - cached.cachedAtMs <= RUTRACKER_AUTOMATIC_SEASON_CACHE_TTL_MS) {
			return cached.releases;
		}

		const existingInFlight = this.rutrackerAutomaticSeasonSearchInFlight.get(cacheKey);
		if (existingInFlight) {
			return existingInFlight;
		}

		const inFlightPromise = this.enqueueRuTrackerAutomaticSeasonSearch(async () => {
			const allReleases: ReleaseResult[] = [];
			const seenGuids = new Set<string>();
			const limitedTitles = titlesToSearch.slice(0, RUTRACKER_AUTOMATIC_MAX_TITLES);

			for (const title of limitedTitles) {
				const seasonOnlyCriteria = createTextOnlyCriteria({
					...criteria,
					query: title,
					episode: undefined,
					preferredEpisodeFormat: 'standard'
				});

				try {
					const releases = await indexer.search(seasonOnlyCriteria);
					for (const release of releases) {
						if (!seenGuids.has(release.guid)) {
							seenGuids.add(release.guid);
							allReleases.push(release);
						}
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					logger.debug(
						{
							indexer: indexer.name,
							title,
							error: message
						},
						'Pointer-indexer season search variant failed'
					);
				}
			}

			this.rutrackerAutomaticSeasonSearchCache.set(cacheKey, {
				cachedAtMs: Date.now(),
				releases: allReleases
			});

			return allReleases;
		});

		this.rutrackerAutomaticSeasonSearchInFlight.set(cacheKey, inFlightPromise);
		try {
			return await inFlightPromise;
		} finally {
			this.rutrackerAutomaticSeasonSearchInFlight.delete(cacheKey);
		}
	}

	private enqueueRuTrackerAutomaticSeasonSearch<T>(work: () => Promise<T>): Promise<T> {
		const queuedWork = this.rutrackerAutomaticSearchLane.then(work, work);
		this.rutrackerAutomaticSearchLane = queuedWork.then(
			() => undefined,
			() => undefined
		);
		return queuedWork;
	}

	private buildRuTrackerAutomaticSeasonCacheKey(
		indexer: IIndexer,
		criteria: SearchCriteria,
		titlesToSearch: string[]
	): string {
		const tmdbId = 'tmdbId' in criteria ? criteria.tmdbId : undefined;
		const tvdbId = 'tvdbId' in criteria ? criteria.tvdbId : undefined;
		const imdbId = 'imdbId' in criteria ? criteria.imdbId : undefined;
		const season = 'season' in criteria ? criteria.season : undefined;
		const primaryId =
			tmdbId?.toString() ?? tvdbId?.toString() ?? imdbId ?? criteria.query ?? 'unknown';
		const normalizedTitles = titlesToSearch
			.slice(0, RUTRACKER_AUTOMATIC_MAX_TITLES)
			.map((title) => this.normalizeForComparison(title))
			.filter(Boolean)
			.join('|');
		return `${indexer.id}::${primaryId}::s${season ?? 'x'}::${normalizedTitles}`;
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
	 * - Season-only search: Returns single-season packs that exactly match the target season
	 *   (multi-season packs and complete series are excluded; pointer-indexer packs must be verifiably complete)
	 * - Season+episode search:
	 *   - RuTracker/Kinozal: returns episode pointers from matching season packs (never raw season packs)
	 *   - Other indexers:
	 *     - interactive: returns exact episodes, falls back to season-pack pointers
	 *     - automatic: returns exact episodes and season-pack candidates
	 * - Episode-only search:
	 *   - RuTracker/Kinozal: returns episode pointers from matching season packs (never raw season packs)
	 *   - Other indexers:
	 *     - interactive: returns exact episodes, falls back to season-pack pointers
	 *     - automatic: returns exact episodes and season-pack candidates
	 *
	 * Optimization: Caches parsed results on releases to avoid re-parsing in enricher.
	 */
	private filterBySeasonEpisode(
		releases: ReleaseResult[],
		criteria: SearchCriteria,
		context?: SeasonEpisodeFilterContext
	): ReleaseResult[] {
		// For movie searches, reject releases that are clearly TV episodes
		if (isMovieSearch(criteria)) {
			return releases.filter((release) => {
				const releaseWithCache = release as ReleaseResult & {
					_parsedRelease?: ReturnType<typeof parseRelease>;
				};
				if (!releaseWithCache._parsedRelease) {
					releaseWithCache._parsedRelease = parseRelease(release.title, {
						sourceLanguage: release.sourceLanguage
					});
				}
				const parsed = releaseWithCache._parsedRelease;

				// Reject if release has episode info (S01E03, season pack, etc.)
				if (parsed.episode) {
					logger.debug(
						{
							title: release.title,
							episode: parsed.episode
						},
						'[SearchOrchestrator] Rejecting TV release for movie search'
					);
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
		const isInteractiveSearch = criteria.searchSource === 'interactive';
		const expectedSeasonEpisodeCount =
			targetSeason === undefined
				? undefined
				: (context?.seasonEpisodeCount ?? context?.seasonEpisodeCounts?.get(targetSeason));

		// If no season/episode specified, return all
		if (targetSeason === undefined && targetEpisode === undefined) {
			return releases;
		}

		const parsedReleases = releases
			.map((release) => {
				// Parse the release title to get episode info
				// Cache parsed result on release to avoid re-parsing in ReleaseEnricher
				const releaseWithCache = release as ReleaseResult & {
					_parsedRelease?: ReturnType<typeof parseRelease>;
				};
				if (!releaseWithCache._parsedRelease) {
					releaseWithCache._parsedRelease = parseRelease(release.title, {
						sourceLanguage: release.sourceLanguage
					});
				}
				return {
					release,
					episodeInfo: releaseWithCache._parsedRelease.episode
				};
			})
			.filter(
				(
					item
				): item is {
					release: ReleaseResult;
					episodeInfo: NonNullable<ReturnType<typeof parseRelease>['episode']>;
				} => Boolean(item.episodeInfo)
			);

		const isSingleSeasonMatch = (
			episodeInfo: NonNullable<ReturnType<typeof parseRelease>['episode']>
		): boolean => {
			// Reject complete series packs (e.g., "Complete Series", "All Seasons")
			if (episodeInfo.isCompleteSeries) {
				return false;
			}
			// Reject multi-season packs (e.g., S01-S05, Seasons 1-5)
			if (episodeInfo.seasons && episodeInfo.seasons.length > 1) {
				return false;
			}
			// Single season: exact match
			return targetSeason !== undefined && episodeInfo.season === targetSeason;
		};

		const seasonPackContainsEpisode = (
			episodeInfo: NonNullable<ReturnType<typeof parseRelease>['episode']>,
			episode: number
		): boolean => {
			if (!episodeInfo.isSeasonPack) return false;
			if (episodeInfo.episodes && episodeInfo.episodes.length > 0) {
				return episodeInfo.episodes.includes(episode);
			}
			// If pack episode boundaries are unknown, keep as a fallback candidate.
			return true;
		};

		// Season-only search: filter to single-season packs matching the target season
		if (targetSeason !== undefined && targetEpisode === undefined) {
			return parsedReleases
				.filter(
					({ release, episodeInfo }) =>
						episodeInfo.isSeasonPack &&
						isSingleSeasonMatch(episodeInfo) &&
						this.isAllowedSeasonPackForSeasonOnlySearch(
							release,
							episodeInfo,
							expectedSeasonEpisodeCount
						)
				)
				.map(({ release }) => this.withFormattedSeasonPackTitle(release));
		}

		// Season + episode search:
		// - interactive: prefer exact episodes, fallback to matching single-season packs
		// - automatic: include exact episodes and matching single-season packs
		if (targetSeason !== undefined && targetEpisode !== undefined) {
			const exactEpisodeMatches = parsedReleases.filter(
				({ episodeInfo }) =>
					!episodeInfo.isSeasonPack &&
					episodeInfo.season === targetSeason &&
					episodeInfo.episodes?.includes(targetEpisode)
			);
			const seasonPackMatches = parsedReleases.filter(
				({ episodeInfo }) =>
					episodeInfo.isSeasonPack &&
					isSingleSeasonMatch(episodeInfo) &&
					seasonPackContainsEpisode(episodeInfo, targetEpisode)
			);
			const rutrackerSeasonPackPointers = seasonPackMatches
				.filter(({ release }) => this.shouldCreateRutrackerEpisodePointer(release))
				.map(({ release, episodeInfo }) =>
					this.createEpisodePointerRelease(release, targetEpisode, targetSeason, episodeInfo)
				);
			const nonRuTrackerExactReleases = exactEpisodeMatches
				.filter(({ release }) => !this.shouldCreateRutrackerEpisodePointer(release))
				.map(({ release }) => release);
			const nonRuTrackerSeasonPackReleases = seasonPackMatches
				.filter(({ release }) => !this.shouldCreateRutrackerEpisodePointer(release))
				.map(({ release }) => release);

			if (isInteractiveSearch) {
				if (rutrackerSeasonPackPointers.length > 0) {
					return [...nonRuTrackerExactReleases, ...rutrackerSeasonPackPointers];
				}

				if (nonRuTrackerExactReleases.length > 0) {
					return nonRuTrackerExactReleases;
				}

				return seasonPackMatches.map(({ release, episodeInfo }) =>
					this.createEpisodePointerRelease(release, targetEpisode, targetSeason, episodeInfo)
				);
			}

			return [
				...nonRuTrackerExactReleases,
				...rutrackerSeasonPackPointers,
				...nonRuTrackerSeasonPackReleases
			];
		}

		// Episode-only search (rare):
		// - interactive: prefer exact episode match, fallback to season packs containing episode
		// - automatic: include exact episodes and season packs
		if (targetEpisode !== undefined) {
			const exactEpisodeMatches = parsedReleases.filter(
				({ episodeInfo }) =>
					!episodeInfo.isSeasonPack && episodeInfo.episodes?.includes(targetEpisode)
			);
			const seasonPackMatches = parsedReleases.filter(({ episodeInfo }) =>
				seasonPackContainsEpisode(episodeInfo, targetEpisode)
			);
			const rutrackerSeasonPackPointers = seasonPackMatches
				.filter(({ release }) => this.shouldCreateRutrackerEpisodePointer(release))
				.map(({ release, episodeInfo }) =>
					this.createEpisodePointerRelease(release, targetEpisode, undefined, episodeInfo)
				);
			const nonRuTrackerExactReleases = exactEpisodeMatches
				.filter(({ release }) => !this.shouldCreateRutrackerEpisodePointer(release))
				.map(({ release }) => release);
			const nonRuTrackerSeasonPackReleases = seasonPackMatches
				.filter(({ release }) => !this.shouldCreateRutrackerEpisodePointer(release))
				.map(({ release }) => release);

			if (isInteractiveSearch) {
				if (rutrackerSeasonPackPointers.length > 0) {
					return [...nonRuTrackerExactReleases, ...rutrackerSeasonPackPointers];
				}

				if (nonRuTrackerExactReleases.length > 0) {
					return nonRuTrackerExactReleases;
				}

				return seasonPackMatches.map(({ release, episodeInfo }) =>
					this.createEpisodePointerRelease(release, targetEpisode, undefined, episodeInfo)
				);
			}

			return [
				...nonRuTrackerExactReleases,
				...rutrackerSeasonPackPointers,
				...nonRuTrackerSeasonPackReleases
			];
		}

		return releases;
	}

	private shouldCreateRutrackerEpisodePointer(release: ReleaseResult): boolean {
		return this.isRuTrackerIndexerName(release.indexerName);
	}

	private isAllowedSeasonPackForSeasonOnlySearch(
		release: ReleaseResult,
		episodeInfo: NonNullable<ReturnType<typeof parseRelease>['episode']>,
		expectedSeasonEpisodeCount?: number
	): boolean {
		if (!this.isRuTrackerIndexerName(release.indexerName)) {
			return true;
		}

		const isCompleted = this.isCompletedRuTrackerSeasonPack(
			release.title,
			episodeInfo,
			expectedSeasonEpisodeCount
		);

		if (!isCompleted) {
			logger.debug(
				{
					title: release.title,
					indexer: release.indexerName,
					expectedSeasonEpisodeCount
				},
				'[SearchOrchestrator] Rejecting incomplete pointer-indexer season pack for season-only search'
			);
		}

		return isCompleted;
	}

	private isCompletedRuTrackerSeasonPack(
		title: string,
		episodeInfo: NonNullable<ReturnType<typeof parseRelease>['episode']>,
		expectedSeasonEpisodeCount?: number
	): boolean {
		if (!episodeInfo.isSeasonPack) {
			return false;
		}

		if (this.titleLooksLikeMultiSeasonPack(title)) {
			return false;
		}

		const coveredEpisodes = Array.from(
			new Set((episodeInfo.episodes ?? []).filter((ep) => Number.isInteger(ep) && ep > 0))
		).sort((a, b) => a - b);
		if (coveredEpisodes.length === 0) {
			return false;
		}

		const explicitTotal = this.extractExplicitSeasonEpisodeTotal(title);
		const expectedTotal =
			typeof expectedSeasonEpisodeCount === 'number' && expectedSeasonEpisodeCount > 0
				? expectedSeasonEpisodeCount
				: explicitTotal;

		// For pointer-indexer season-pack grabs we require a verifiable complete-season signal.
		if (expectedTotal === undefined || expectedTotal <= 0) {
			return false;
		}

		if (coveredEpisodes[0] !== 1) {
			return false;
		}

		const maxCoveredEpisode = coveredEpisodes[coveredEpisodes.length - 1];
		if (maxCoveredEpisode !== expectedTotal || coveredEpisodes.length !== expectedTotal) {
			return false;
		}

		for (let episodeNumber = 1; episodeNumber <= expectedTotal; episodeNumber++) {
			if (coveredEpisodes[episodeNumber - 1] !== episodeNumber) {
				return false;
			}
		}

		return true;
	}

	private titleLooksLikeMultiSeasonPack(title: string): boolean {
		const multiSeasonPatterns = [
			/\bseasons?\s*[:\s]*\d{1,2}\s*[-–]\s*\d{1,2}\b/iu,
			/\bseason\s*[:\s]*\d{1,2}\s*-\s*\d{1,2}\b/iu,
			/\bS\d{1,2}\s*[-–]\s*S?\d{1,2}\b/iu,
			/\bepisodes?\s*[:\s]*\d{1,3}\s*[-–]\s*\d{3,4}\b/iu
		];
		return multiSeasonPatterns.some((pattern) => pattern.test(title));
	}

	private extractExplicitSeasonEpisodeTotal(title: string): number | undefined {
		const patterns = [
			/\bepisodes?\s*:\s*\d{1,3}\s*[-–]\s*\d{1,3}\s*of\s*(\d{1,3})\b/iu,
			/\bS\d{1,2}E\d{1,3}\s*[-–]\s*\d{1,3}\s*of\s*(\d{1,3})\b/iu,
			/\bS\d{1,2}E\d{1,3}\s*[-–]\s*\d{1,3}\s+(\d{1,3})\b/iu
		];
		for (const pattern of patterns) {
			const match = title.match(pattern);
			if (!match) {
				continue;
			}
			const parsed = Number(match[1]);
			if (Number.isInteger(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return undefined;
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

	/**
	 * Build an interactive episode pointer from a season pack release.
	 * The pointer keeps the original download URL, but presents an episode-focused title.
	 */
	private createEpisodePointerRelease(
		release: ReleaseResult,
		targetEpisode: number,
		targetSeason: number | undefined,
		episodeInfo: NonNullable<ReturnType<typeof parseRelease>['episode']>
	): ReleaseResult {
		const season = targetSeason ?? episodeInfo.season;
		const episodeToken = this.formatEpisodeToken(season, targetEpisode);
		const readablePointer =
			season === undefined
				? `Episode ${targetEpisode}`
				: `Season ${season} Episode ${targetEpisode}`;
		const cleanedTitle = this.formatPointerDisplayTitle(release.title);

		// Estimate per-episode size for display when pack episode count is known.
		const episodeCount = episodeInfo.episodes?.length ?? 0;
		const pointerSize =
			episodeCount > 0 && release.size > 0
				? Math.max(1, Math.round(release.size / episodeCount))
				: release.size;

		return {
			...release,
			guid: `${release.guid}::episode-pointer::${episodeToken.toLowerCase()}`,
			title: `${readablePointer} - ${cleanedTitle}`,
			size: pointerSize,
			season,
			episode: targetEpisode
		};
	}

	private formatPointerDisplayTitle(title: string): string {
		let normalized = title.trim();
		normalized = normalized.replace(/^\s*[-–—]+\s*\/\s*/u, '');
		normalized = normalized.replace(/^\s*\/\s*/u, '');
		normalized = normalized.replace(/\b(S\d+E\d+(?:-\d+)?)\s+(\d{1,2})(?=\s*\[)/iu, '$1 of $2');
		normalized = normalized.replace(
			/^(.+?)\s*\/\s*(S\d+E\d+(?:-\d+)?(?:\s+of\s+\d+)?\b)/iu,
			'$1: $2'
		);
		normalized = normalized.replace(/\s{2,}/g, ' ');
		return normalized.trim();
	}

	private withFormattedSeasonPackTitle(release: ReleaseResult): ReleaseResult {
		const formatted = this.formatPointerDisplayTitle(release.title);
		if (formatted === release.title) {
			return release;
		}
		return {
			...release,
			title: formatted
		};
	}

	private formatEpisodeToken(season: number | undefined, episode: number): string {
		if (season === undefined || season < 0) {
			return `E${String(episode).padStart(2, '0')}`;
		}
		return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
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
				logger.debug(
					{
						title: release.title,
						categories: release.categories,
						expectedSearchType: searchType,
						actualContentType
					},
					'[SearchOrchestrator] Rejecting release due to category mismatch'
				);
			}

			return hasMatchingCategory;
		});
	}

	/**
	 * Filter non-video artifacts (soundtracks/scores/audio collections) for movie/TV searches.
	 * This is a safety net for indexers that mislabel categories or provide incomplete metadata.
	 */
	private filterOutNonVideoArtifacts(
		releases: ReleaseResult[],
		criteria: SearchCriteria
	): ReleaseResult[] {
		if (!isMovieSearch(criteria) && !isTvSearch(criteria)) {
			return releases;
		}

		const beforeCount = releases.length;
		const filtered = releases.filter((release) => {
			const title = release.title ?? '';
			if (!this.matchesNonVideoArtifactTitle(title)) {
				return true;
			}

			if (this.matchesTrailerArtifactTitle(title)) {
				logger.debug(
					{
						title: release.title,
						searchType: criteria.searchType,
						indexer: release.indexerName
					},
					'[SearchOrchestrator] Rejecting trailer/promo style release'
				);
				return false;
			}

			const releaseWithCache = release as ReleaseResult & {
				_parsedRelease?: ReturnType<typeof parseRelease>;
			};
			if (!releaseWithCache._parsedRelease) {
				releaseWithCache._parsedRelease = parseRelease(title);
			}
			const parsed = releaseWithCache._parsedRelease;

			// Keep only when there are strong video signals.
			// We intentionally avoid trusting weak parser hints here because
			// soundtrack-style titles can contain ambiguous tokens.
			const hasVideoSignals =
				VIDEO_SIGNAL_PATTERN.test(title) ||
				parsed.episode !== undefined ||
				(parsed.resolution !== null && parsed.resolution !== 'unknown');

			if (!hasVideoSignals) {
				logger.debug(
					{
						title: release.title,
						searchType: criteria.searchType,
						indexer: release.indexerName
					},
					'[SearchOrchestrator] Rejecting non-video artifact release'
				);
			}

			return hasVideoSignals;
		});

		if (filtered.length < beforeCount) {
			logger.info(
				{
					before: beforeCount,
					after: filtered.length,
					removed: beforeCount - filtered.length,
					searchType: criteria.searchType
				},
				'[SearchOrchestrator] Non-video artifact filter removed releases'
			);
		}

		return filtered;
	}

	private matchesNonVideoArtifactTitle(title: string): boolean {
		return NON_VIDEO_ARTIFACT_TITLE_PATTERNS.some((pattern) => pattern.test(title));
	}

	private matchesTrailerArtifactTitle(title: string): boolean {
		return TRAILER_ARTIFACT_TITLE_PATTERNS.some((pattern) => pattern.test(title));
	}

	/**
	 * Filter releases by title relevance.
	 * Safety net to reject releases that are clearly for a different title
	 * (e.g., random TV shows returned by a generic RSS feed when ID search fails).
	 * Only filters when we have a known title to compare against.
	 */
	private filterByTitleRelevance(
		releases: ReleaseResult[],
		criteria: SearchCriteria
	): ReleaseResult[] {
		const isTvSearchCriteria = criteria.searchType === 'tv';
		const hasEpisodeTarget = isTvSearchCriteria && criteria.episode !== undefined;
		const hasSeasonTarget = isTvSearchCriteria && criteria.season !== undefined;
		const allowInteractiveTvFallback =
			isTvSearchCriteria &&
			criteria.searchSource === 'interactive' &&
			!hasEpisodeTarget &&
			!hasSeasonTarget;
		const allowInteractiveMovieFallback = false;
		const allowInteractiveFallback = allowInteractiveTvFallback || allowInteractiveMovieFallback;

		// Collect all expected titles: query + searchTitles
		const expectedTitles: string[] = [];
		if (criteria.query) expectedTitles.push(criteria.query);
		if (criteria.searchTitles) expectedTitles.push(...criteria.searchTitles);

		// If we have no titles to compare against, skip filtering
		if (expectedTitles.length === 0) return releases;

		// Normalize titles for comparison while preserving Unicode letters/numbers.
		const normalize = (s: string): string =>
			this.normalizeForComparison(s).replace(/\s+/g, '').trim();

		const normalizedExpected = expectedTitles.map(normalize).filter((t) => t.length > 0);
		if (normalizedExpected.length === 0) return releases;

		const beforeCount = releases.length;
		const filtered = releases.filter((release) => {
			const releaseWithCache = release as ReleaseResult & {
				_parsedRelease?: ReturnType<typeof parseRelease>;
			};
			if (!releaseWithCache._parsedRelease) {
				releaseWithCache._parsedRelease = parseRelease(release.title, {
					sourceLanguage: release.sourceLanguage
				});
			}
			const parsed = releaseWithCache._parsedRelease;
			const releaseName = normalize(parsed.cleanTitle);
			// If we cannot derive a comparable title token, keep only for
			// interactive browsing fallbacks; targeted episode/season lookups stay strict.
			if (releaseName.length === 0) return allowInteractiveFallback;

			// Check if any expected title is similar enough to the release name
			// Using Levenshtein distance-based similarity instead of substring matching
			// to prevent false positives like "TransformersOne" matching "Transformers"
			const matches = normalizedExpected.some((expected) => {
				const similarity = this.calculateTitleSimilarity(releaseName, expected);
				if (similarity >= 0.7) {
					return true;
				}

				// Accept strong containment matches for tracker titles that append
				// extensive metadata after the base title (common on RuTracker).
				return (
					releaseName.length >= 5 &&
					expected.length >= 5 &&
					(releaseName.includes(expected) || expected.includes(releaseName))
				);
			});

			if (!matches) {
				// TEMP DEBUG: Log detailed similarity info for rejected releases
				const simDetails = normalizedExpected.map((expected) => ({
					expected,
					similarity: this.calculateTitleSimilarity(releaseName, expected),
					containsEachOther: releaseName.includes(expected) || expected.includes(releaseName)
				}));
				logger.info(
					{
						releaseTitle: release.title,
						releaseName, // normalized release name
						parsedName: parsed.cleanTitle,
						normalizedExpected,
						similarityDetails: simDetails,
						indexer: release.indexerName,
						size: release.size
					},
					'[SearchOrchestrator] DEBUG: TITLE MISMATCH - Release rejected by title filter'
				);
			}

			return matches;
		});

		if (filtered.length < beforeCount) {
			logger.info(
				{
					before: beforeCount,
					after: filtered.length,
					removed: beforeCount - filtered.length,
					expectedTitles: expectedTitles.slice(0, 3),
					searchType: criteria.searchType,
					searchSource: criteria.searchSource
				},
				'[SearchOrchestrator] Title relevance filter removed irrelevant results'
			);
		}

		// For interactive TV, avoid a hard zero-result failure mode caused by
		// localization/transliteration mismatches in tracker titles.
		if (allowInteractiveFallback && beforeCount > 0 && filtered.length === 0) {
			logger.info(
				{
					before: beforeCount,
					expectedTitles: expectedTitles.slice(0, 3),
					searchType: criteria.searchType,
					searchSource: criteria.searchSource,
					season: isTvSearchCriteria ? criteria.season : undefined,
					episode: isTvSearchCriteria ? criteria.episode : undefined
				},
				'[SearchOrchestrator] Title relevance fallback applied for interactive search'
			);
			return releases;
		}

		return filtered;
	}

	/**
	 * Calculate title similarity using Levenshtein distance.
	 * Returns a value between 0 (completely different) and 1 (identical).
	 */
	private calculateTitleSimilarity(a: string, b: string): number {
		if (a === b) return 1.0;

		const m = a.length;
		const n = b.length;

		// Create distance matrix
		const d: number[][] = [];
		for (let i = 0; i <= n; i++) {
			d[i] = [i];
		}
		for (let j = 0; j <= m; j++) {
			d[0][j] = j;
		}

		// Fill the matrix
		for (let i = 1; i <= n; i++) {
			for (let j = 1; j <= m; j++) {
				if (b.charAt(i - 1) === a.charAt(j - 1)) {
					d[i][j] = d[i - 1][j - 1];
				} else {
					d[i][j] = Math.min(
						d[i - 1][j - 1] + 1, // substitution
						d[i][j - 1] + 1, // insertion
						d[i - 1][j] + 1 // deletion
					);
				}
			}
		}

		const maxLength = Math.max(m, n);
		if (maxLength === 0) return 1.0;

		return 1 - d[n][m] / maxLength;
	}

	/**
	 * Filter releases by ID match with title+year fallback.
	 *
	 * PRIORITY 1: ID Matching (preferred)
	 * - If indexer provides TMDB/IMDB/TVDB ID and it doesn't match search criteria, hard reject
	 * - If IDs match exactly, accept immediately
	 *
	 * PRIORITY 2: Title + Year Fallback (when no IDs)
	 * - Validate title similarity >= 0.7 AND year within 1 year
	 * - If can't validate (no criteria), keep release
	 *
	 * This completely removes mismatched releases (not just marks as rejected).
	 */
	private filterByIdOrTitleMatch(
		releases: ReleaseResult[],
		criteria: SearchCriteria
	): ReleaseResult[] {
		// Only process movie or TV searches
		if (!isMovieSearch(criteria) && !isTvSearch(criteria)) {
			return releases;
		}

		// Get search IDs (type-safe access)
		const searchTmdbId =
			isMovieSearch(criteria) || isTvSearch(criteria) ? criteria.tmdbId : undefined;
		const searchImdbId =
			isMovieSearch(criteria) || isTvSearch(criteria) ? criteria.imdbId : undefined;
		const searchTvdbId = isTvSearch(criteria) ? criteria.tvdbId : undefined;
		const searchYear = isMovieSearch(criteria) || isTvSearch(criteria) ? criteria.year : undefined;

		// Skip if we have no way to validate (no search IDs or titles)
		const hasSearchIds = searchTmdbId || searchImdbId || searchTvdbId;
		const hasSearchTitles = criteria.searchTitles && criteria.searchTitles.length > 0;
		const hasSearchYear = searchYear;

		if (!hasSearchIds && !hasSearchTitles && !hasSearchYear) {
			return releases;
		}

		const beforeCount = releases.length;
		const isInteractiveSearch = criteria.searchSource === 'interactive';
		const allowInteractiveFallback =
			isInteractiveSearch && isTvSearch(criteria) && !criteria.season && !criteria.episode;

		const filtered = releases.filter((release) => {
			let parsed: ReturnType<typeof parseRelease> | undefined;
			const getParsed = () => {
				if (!parsed) {
					parsed = parseRelease(release.title, {
						sourceLanguage: release.sourceLanguage
					});
				}
				return parsed;
			};

			// PRIORITY 1: ID Matching (if both sides have IDs)
			const releasePrefersNativeCyrillic = prefersNativeCyrillicTitles({
				name: release.indexerName ?? ''
			} as IIndexer);

			// TMDB ID check
			if (searchTmdbId && release.tmdbId) {
				if (release.tmdbId !== searchTmdbId) {
					// TEMP DEBUG: Log TMDB ID mismatch with indexer
					logger.info(
						{
							releaseTitle: release.title,
							releaseTmdbId: release.tmdbId,
							criteriaTmdbId: searchTmdbId,
							indexer: release.indexerName,
							hasReleaseIds: !!(release.tmdbId || release.imdbId || release.tvdbId)
						},
						'[SearchOrchestrator] DEBUG: TMDB ID mismatch - removing release'
					);
					return false; // Hard reject
				}
				// IDs match - accept immediately
				return true;
			}

			// IMDB ID check
			if (searchImdbId && release.imdbId) {
				if (release.imdbId !== searchImdbId) {
					// TEMP DEBUG: Log IMDB ID mismatch with indexer
					logger.info(
						{
							releaseTitle: release.title,
							releaseImdbId: release.imdbId,
							criteriaImdbId: searchImdbId,
							indexer: release.indexerName,
							hasReleaseIds: !!(release.tmdbId || release.imdbId || release.tvdbId)
						},
						'[SearchOrchestrator] DEBUG: IMDB ID mismatch - removing release'
					);
					return false; // Hard reject
				}
				// IDs match - accept immediately
				return true;
			}

			// TVDB ID check (TV only)
			if (searchTvdbId && release.tvdbId) {
				if (release.tvdbId !== searchTvdbId) {
					logger.debug(
						{
							releaseTitle: release.title,
							releaseTvdbId: release.tvdbId,
							criteriaTvdbId: searchTvdbId,
							indexer: release.indexerName
						},
						'[SearchOrchestrator] TVDB ID mismatch - removing release'
					);
					return false; // Hard reject
				}
				// IDs match - accept immediately
				return true;
			}

			// For movies, enforce strict year matching whenever we can parse a year
			// from the release title, even if title variants are unavailable.
			if (isMovieSearch(criteria) && searchYear) {
				const parsedRelease = getParsed();
				if (parsedRelease.year && parsedRelease.year !== searchYear) {
					// TEMP DEBUG: Log year mismatch details
					logger.info(
						{
							releaseTitle: release.title,
							releaseYear: parsedRelease.year,
							criteriaYear: searchYear,
							indexer: release.indexerName,
							releaseHasAnyId: !!(release.tmdbId || release.imdbId || release.tvdbId)
						},
						'[SearchOrchestrator] DEBUG: YEAR MISMATCH - removing movie release'
					);
					return false;
				}
			}

			// PRIORITY 2: Title + Year Fallback (if no ID match possible)
			if (hasSearchTitles && hasSearchYear) {
				const isEpisodeTarget = isTvSearch(criteria) && criteria.episode !== undefined;
				const isSeasonTarget = isTvSearch(criteria) && criteria.season !== undefined;
				const releaseHasAnyId = !!(release.tmdbId || release.imdbId || release.tvdbId);

				// Parse release title
				const parsedRelease = getParsed();

				// Check title similarity. Include query as a fallback candidate in case
				// alternate-title storage is incomplete for this language.
				const titleCandidates = [
					...criteria.searchTitles!,
					...(criteria.query ? [criteria.query] : [])
				];
				const normalizedCandidates = titleCandidates
					.map((candidate) => this.normalizeForComparison(candidate))
					.filter((candidate) => candidate.length > 0);

				const releaseName = this.normalizeForComparison(parsedRelease.cleanTitle);
				const hasAnyLetterOrNumber = /[\p{L}\p{N}]/u.test(parsedRelease.cleanTitle);
				const isUnmappableLocalizedTitle = releaseName.length === 0 && hasAnyLetterOrNumber;

				let titleMatch = true;
				if (normalizedCandidates.length > 0 && releaseName.length > 0) {
					titleMatch = normalizedCandidates.some((expectedName) => {
						const similarity = this.calculateTitleSimilarity(releaseName, expectedName);
						if (similarity >= 0.7) {
							return true;
						}
						// Accept strong containment matches (e.g. release title has extra descriptors).
						return (
							releaseName.length >= 5 &&
							expectedName.length >= 5 &&
							(releaseName.includes(expectedName) || expectedName.includes(releaseName))
						);
					});
				} else if (isUnmappableLocalizedTitle) {
					// Interactive searches should not blank out results when title validation
					// is impossible due to script mismatch (e.g. Cyrillic-only tracker titles).
					titleMatch =
						isInteractiveSearch && (isTvSearch(criteria) || releasePrefersNativeCyrillic);
				}

				// Check year.
				// If year is absent in title, allow interactive fallback.
				const yearMatch = parsedRelease.year
					? parsedRelease.year === searchYear!
					: isInteractiveSearch;

				if (!titleMatch || !yearMatch) {
					// Interactive fallback for localized/transliterated indexer titles that
					// don't match stored title variants yet, while still enforcing year.
					// Keep this strict for targeted TV lookups (season/episode).
					const allowInteractiveTitleFallback =
						isInteractiveSearch &&
						yearMatch &&
						!releaseHasAnyId &&
						((isTvSearch(criteria) && !isEpisodeTarget && !isSeasonTarget) ||
							(isMovieSearch(criteria) && releasePrefersNativeCyrillic));
					if (allowInteractiveTitleFallback) {
						logger.info(
							{
								releaseTitle: release.title,
								parsedTitle: parsedRelease.cleanTitle,
								parsedYear: parsedRelease.year,
								criteriaYear: searchYear,
								titleMatch,
								yearMatch,
								isInteractiveSearch,
								releaseHasAnyId
							},
							'[SearchOrchestrator] DEBUG: Applying interactive localized-title fallback'
						);
						return true;
					}

					// TEMP DEBUG: Log title/year mismatch details
					const simDetails = normalizedCandidates.map((expectedName) => ({
						expected: expectedName,
						similarity: this.calculateTitleSimilarity(releaseName, expectedName),
						containsEachOther:
							releaseName.includes(expectedName) || expectedName.includes(releaseName)
					}));
					logger.info(
						{
							releaseTitle: release.title,
							parsedTitle: parsedRelease.cleanTitle,
							releaseName, // normalized
							parsedYear: parsedRelease.year,
							criteriaYear: searchYear,
							titleMatch,
							yearMatch,
							isInteractiveSearch,
							releaseHasAnyId,
							normalizedCandidates,
							similarityDetails: simDetails
						},
						'[SearchOrchestrator] DEBUG: TITLE/YEAR MISMATCH - removing release'
					);
					return false; // Hard reject
				}

				// Title and year match - accept
				return true;
			}

			// If we have no way to validate (no IDs, no criteria), keep it
			// Let downstream filters handle it
			return true;
		});

		if (filtered.length < beforeCount) {
			logger.info(
				{
					before: beforeCount,
					after: filtered.length,
					removed: beforeCount - filtered.length,
					criteriaTmdbId: searchTmdbId,
					criteriaImdbId: searchImdbId,
					hadSearchTitles: hasSearchTitles,
					criteriaYear: searchYear
				},
				'[SearchOrchestrator] ID/Title filter removed mismatched releases'
			);
		}

		// Interactive localized searches should not hard-fail here when the
		// tracker returns relevant releases in a different script/transliteration
		// and none of them expose authoritative IDs. Keep explicit ID mismatches
		// strict, but fall back to the pre-filtered set when everything else
		// would be removed.
		if (allowInteractiveFallback && beforeCount > 0 && filtered.length === 0) {
			const releasesWithoutIdConflicts = releases.filter((release) => {
				if (searchTmdbId && release.tmdbId && release.tmdbId !== searchTmdbId) {
					return false;
				}
				if (searchImdbId && release.imdbId && release.imdbId !== searchImdbId) {
					return false;
				}
				if (searchTvdbId && release.tvdbId && release.tvdbId !== searchTvdbId) {
					return false;
				}
				return true;
			});

			if (releasesWithoutIdConflicts.length > 0) {
				logger.info(
					{
						before: beforeCount,
						kept: releasesWithoutIdConflicts.length,
						searchType: criteria.searchType,
						searchSource: criteria.searchSource,
						criteriaTmdbId: searchTmdbId,
						criteriaImdbId: searchImdbId,
						criteriaTvdbId: searchTvdbId,
						criteriaYear: searchYear
					},
					'[SearchOrchestrator] ID/title fallback applied for interactive search'
				);
				return releasesWithoutIdConflicts;
			}
		}

		return filtered;
	}

	/**
	 * Normalize a string for title comparison.
	 * Removes diacritics, punctuation, converts to lowercase, normalizes whitespace.
	 */
	private normalizeForComparison(str: string): string {
		return str
			.normalize('NFD') // Decompose diacritics (e.g., ů → u + combining dot)
			.replace(/[\u0300-\u036f]/g, '') // Remove combining diacritics
			.normalize('NFKC') // Re-compose for consistent representation
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s]/gu, '') // Remove punctuation, keep Unicode letters/numbers
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();
	}

	/**
	 * Get aggregate and per-season episode counts for a TV show from TMDB.
	 * Excludes specials (season 0) from series totals to match library sizing semantics.
	 */
	private async getTvEpisodeCounts(tmdbId: number): Promise<TvEpisodeCounts | undefined> {
		if (this.tvEpisodeCountsCache.has(tmdbId)) {
			return this.tvEpisodeCountsCache.get(tmdbId);
		}

		try {
			const show = await tmdb.getTVShow(tmdbId);
			const seasonEpisodeCounts = new Map<number, number>();

			for (const season of show.seasons ?? []) {
				const seasonNumber = season.season_number;
				const episodeCount = season.episode_count;
				if (seasonNumber > 0 && episodeCount > 0) {
					seasonEpisodeCounts.set(seasonNumber, episodeCount);
				}
			}

			let seriesEpisodeCount = Array.from(seasonEpisodeCounts.values()).reduce(
				(total, count) => total + count,
				0
			);

			// Fallback to TMDB aggregate count if seasons were unavailable
			if (seriesEpisodeCount <= 0 && show.number_of_episodes > 0) {
				seriesEpisodeCount = show.number_of_episodes;
			}

			const counts: TvEpisodeCounts = {
				seriesEpisodeCount: seriesEpisodeCount > 0 ? seriesEpisodeCount : undefined,
				seasonEpisodeCounts
			};

			this.tvEpisodeCountsCache.set(tmdbId, counts);
			return counts;
		} catch (error) {
			logger.warn(
				{
					tmdbId,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to fetch TV episode counts from TMDB'
			);
			return undefined;
		}
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

		// Reuse cached TV episode counts if available
		const cachedTvCounts = this.tvEpisodeCountsCache.get(tmdbId);
		if (cachedTvCounts) {
			const cachedSeasonCount = cachedTvCounts.seasonEpisodeCounts.get(criteria.season);
			if (cachedSeasonCount && cachedSeasonCount > 0) {
				return cachedSeasonCount;
			}
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
				logger.debug(
					{
						tmdbId,
						season: criteria.season,
						episodeCount
					},
					'Fetched season episode count from TMDB'
				);
				return episodeCount;
			}
		} catch (error) {
			// Log but don't fail - search can proceed without episode count
			// Size validation will be skipped for season packs
			logger.warn(
				{
					tmdbId,
					season: criteria.season,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to fetch season episode count from TMDB'
			);
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

		const hasImdb = 'imdbId' in criteria && !!criteria.imdbId;
		const hasTvdb = criteria.searchType === 'tv' && 'tvdbId' in criteria && !!criteria.tvdbId;

		// If we already have all relevant IDs, no enrichment needed
		if (hasImdb && (criteria.searchType === 'movie' || hasTvdb)) {
			return criteria;
		}

		// If we have TMDB ID, look up missing external IDs
		if ('tmdbId' in criteria && criteria.tmdbId) {
			try {
				const externalIds =
					criteria.searchType === 'movie'
						? await tmdb.getMovieExternalIds(criteria.tmdbId)
						: await tmdb.getTvExternalIds(criteria.tmdbId);

				let enriched = { ...criteria };

				if (!hasImdb && externalIds.imdb_id) {
					enriched = { ...enriched, imdbId: externalIds.imdb_id };
				}

				if (criteria.searchType === 'tv' && !hasTvdb && externalIds.tvdb_id) {
					enriched = { ...enriched, tvdbId: externalIds.tvdb_id } as typeof enriched;
				}

				logger.debug(
					{
						tmdbId: criteria.tmdbId,
						imdbId: 'imdbId' in enriched ? (enriched.imdbId as string) : null,
						tvdbId: 'tvdbId' in enriched ? (enriched.tvdbId as number) : null
					},
					'Enriched search criteria with external IDs'
				);

				return enriched as SearchCriteria;
			} catch (error) {
				// Log but don't fail - search can still proceed without external IDs
				logger.warn(
					{
						tmdbId: criteria.tmdbId,
						error: error instanceof Error ? error.message : String(error)
					},
					'Failed to look up external IDs from TMDB'
				);
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
