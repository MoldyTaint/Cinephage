import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import type { SearchCriteria } from '$lib/server/indexers/types';
import { getCategoriesForSearchType } from '$lib/server/indexers/types';
import { searchQuerySchema } from '$lib/validation/schemas';
import { qualityFilter, type EnrichmentOptions } from '$lib/server/quality';
import { logger } from '$lib/logging';
import { redactUrl } from '$lib/server/utils/urlSecurity';
import { db } from '$lib/server/db';
import { movies, series } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { evaluateIndexerSearchAvailability } from '$lib/server/indexers/search/availability';
import {
	getMovieSearchTitles,
	getSeriesSearchTitles,
	fetchAndStoreMovieAlternateTitles,
	fetchAndStoreSeriesAlternateTitles
} from '$lib/server/services/AlternateTitleService';

/**
 * Redact sensitive URLs from release objects before returning in API responses.
 * This prevents API keys from being exposed to clients.
 */
function redactReleaseUrls<T extends { downloadUrl?: string | null }>(releases: T[]): T[] {
	return releases.map((release) => ({
		...release,
		downloadUrl: release.downloadUrl ? redactUrl(release.downloadUrl) : null
	}));
}

/**
 * GET /api/search?q=query&searchType=movie&imdbId=tt1234567&categories=2000
 * Performs a search across all enabled indexers with typed criteria.
 *
 * Enrichment options:
 * - enrich=true: Enable quality filtering and scoring
 * - scoringProfileId=xxx: Scoring profile ID to use
 * - matchToTmdb=true: Match releases to TMDB entries
 * - filterRejected=true: Filter out releases that don't meet quality requirements
 * - minScore=500: Minimum score to include (0-1000)
 */
export const GET: RequestHandler = async ({ url }) => {
	const params = Object.fromEntries(url.searchParams);
	const result = searchQuerySchema.safeParse(params);

	if (!result.success) {
		return json(
			{
				error: 'Invalid query parameters',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const {
		q,
		searchType,
		searchMode,
		categories,
		indexers,
		limit,
		imdbId,
		tmdbId,
		tvdbId,
		year,
		season,
		episode,
		enrich,
		scoringProfileId,
		matchToTmdb,
		filterRejected,
		minScore
	} = result.data;
	let effectiveScoringProfileId = scoringProfileId;
	const isMultiSeasonPackTvSearch = searchType === 'tv' && searchMode === 'multiSeasonPack';

	// Build typed search criteria based on searchType
	// Auto-apply categories based on search type if none specified
	const effectiveCategories = isMultiSeasonPackTvSearch
		? (categories ?? [])
		: (categories ?? getCategoriesForSearchType(searchType));
	const effectiveLimit = isMultiSeasonPackTvSearch ? (limit ?? 200) : limit;

	let criteria: SearchCriteria;

	if (searchType === 'movie') {
		criteria = {
			searchType: 'movie',
			query: q,
			categories: effectiveCategories.length > 0 ? effectiveCategories : undefined,
			indexerIds: indexers,
			limit: effectiveLimit,
			imdbId,
			tmdbId,
			year
		};
	} else if (searchType === 'tv') {
		criteria = {
			searchType: 'tv',
			query: q,
			categories: effectiveCategories.length > 0 ? effectiveCategories : undefined,
			indexerIds: indexers,
			limit: effectiveLimit,
			imdbId,
			tmdbId,
			tvdbId,
			season,
			episode
		};
	} else {
		// Basic search requires a query
		if (!q) {
			return json({ error: 'Query (q) is required for basic search' }, { status: 400 });
		}
		criteria = {
			searchType: 'basic',
			query: q,
			categories: effectiveCategories.length > 0 ? effectiveCategories : undefined,
			indexerIds: indexers,
			limit: effectiveLimit
		};
	}

	if (isMultiSeasonPackTvSearch) {
		logger.info(
			{
				query: criteria.query,
				limit: criteria.limit,
				categoriesApplied: !!(criteria.categories && criteria.categories.length > 0)
			},
			'[SearchAPI] Multi-season TV search mode enabled'
		);
	}

	// Populate searchTitles from alternate titles in the library database
	// This enables multi-title text fallback search and title relevance filtering
	if (tmdbId && (searchType === 'movie' || searchType === 'tv')) {
		try {
			let searchTitles: string[] | undefined;
			if (searchType === 'movie') {
				const movie = await db.query.movies.findFirst({
					where: eq(movies.tmdbId, tmdbId),
					columns: { id: true }
				});
				if (movie) {
					searchTitles = await getMovieSearchTitles(movie.id);
					// If we only have a single title variant, refresh alternates from TMDB once.
					if (searchTitles.length <= 1) {
						await fetchAndStoreMovieAlternateTitles(movie.id, tmdbId);
						searchTitles = await getMovieSearchTitles(movie.id);
					}
				}
			} else {
				const show = await db.query.series.findFirst({
					where: eq(series.tmdbId, tmdbId),
					columns: { id: true }
				});
				if (show) {
					searchTitles = await getSeriesSearchTitles(show.id);
					// If we only have a single title variant, refresh alternates from TMDB once.
					if (searchTitles.length <= 1) {
						await fetchAndStoreSeriesAlternateTitles(show.id, tmdbId);
						searchTitles = await getSeriesSearchTitles(show.id);
					}
				}
			}
			if (searchTitles && searchTitles.length > 0) {
				criteria.searchTitles = searchTitles;
			}
		} catch (error) {
			logger.warn(
				{
					tmdbId,
					searchType,
					error: error instanceof Error ? error.message : String(error)
				},
				'[SearchAPI] Failed to look up alternate titles'
			);
		}
	}

	const manager = await getIndexerManager();
	const configuredIndexers = await manager.getIndexers();

	// Use enhanced search if enrichment is requested
	if (enrich) {
		if (!effectiveScoringProfileId) {
			const defaultScoringProfile = await qualityFilter.getDefaultScoringProfile();
			effectiveScoringProfileId = defaultScoringProfile.id;
		}

		// Load the scoring profile to get allowedProtocols for indexer filtering
		let protocolFilter: string[] | undefined;
		if (effectiveScoringProfileId) {
			const profile = await qualityFilter.getProfile(effectiveScoringProfileId);
			if (profile?.allowedProtocols && profile.allowedProtocols.length > 0) {
				protocolFilter = profile.allowedProtocols;
			}
		}

		// Debug logging for profile issues
		logger.info(
			{
				scoringProfileId: effectiveScoringProfileId ?? 'none',
				protocolFilter
			},
			'[SearchAPI] Enrichment requested'
		);

		const enrichmentOpts: EnrichmentOptions = {
			scoringProfileId: effectiveScoringProfileId,
			matchToTmdb: matchToTmdb ?? false,
			filterRejected: filterRejected ?? false,
			minScore,
			// Pass TMDB hint if we have IDs from criteria
			tmdbHint:
				tmdbId || imdbId
					? {
							tmdbId,
							imdbId,
							tvdbId,
							mediaType: searchType === 'tv' ? 'tv' : 'movie'
						}
					: undefined
		};

		const availability = evaluateIndexerSearchAvailability(configuredIndexers, {
			searchType,
			searchSource: 'interactive',
			protocolFilter,
			scoringProfileId: effectiveScoringProfileId,
			getDefinitionCapabilities: (definitionId) => manager.getDefinitionCapabilities(definitionId)
		});

		if (!availability.ok) {
			return json(
				{
					error: availability.message,
					errorCode: availability.code
				},
				{ status: 400 }
			);
		}

		const searchResult = await manager.searchEnhanced(criteria, {
			searchSource: 'interactive',
			enrichment: enrichmentOpts,
			protocolFilter,
			timeout: 70000
		});

		return json({
			releases: redactReleaseUrls(searchResult.releases),
			meta: {
				totalResults: searchResult.totalResults,
				afterDedup: searchResult.afterDedup,
				afterFiltering: searchResult.afterFiltering,
				afterEnrichment: searchResult.afterEnrichment,
				rejectedCount: searchResult.rejectedCount,
				searchTimeMs: searchResult.searchTimeMs,
				enrichTimeMs: searchResult.enrichTimeMs,
				scoringProfileId: searchResult.scoringProfileId,
				indexerCount: searchResult.indexerResults.length,
				indexerResults: Object.fromEntries(
					searchResult.indexerResults.map((ir) => [
						ir.indexerId,
						{
							name: ir.indexerName,
							count: ir.results.length,
							durationMs: ir.searchTimeMs,
							error: ir.error,
							searchMethod: ir.searchMethod
						}
					])
				),
				rejectedIndexers: searchResult.rejectedIndexers
			}
		});
	}

	const availability = evaluateIndexerSearchAvailability(configuredIndexers, {
		searchType,
		searchSource: 'interactive',
		scoringProfileId: effectiveScoringProfileId,
		getDefinitionCapabilities: (definitionId) => manager.getDefinitionCapabilities(definitionId)
	});

	if (!availability.ok) {
		return json(
			{
				error: availability.message,
				errorCode: availability.code
			},
			{ status: 400 }
		);
	}

	// Standard search without enrichment (interactive)
	const searchResult = await manager.search(criteria, {
		searchSource: 'interactive',
		timeout: 70000
	});

	return json({
		releases: redactReleaseUrls(searchResult.releases),
		meta: {
			totalResults: searchResult.totalResults,
			searchTimeMs: searchResult.searchTimeMs,
			indexerCount: searchResult.indexerResults.length,
			indexerResults: searchResult.indexerResults.map((ir) => ({
				indexerId: ir.indexerId,
				indexerName: ir.indexerName,
				count: ir.results.length,
				durationMs: ir.searchTimeMs,
				error: ir.error,
				searchMethod: ir.searchMethod
			})),
			rejectedIndexers: searchResult.rejectedIndexers
		}
	});
};
