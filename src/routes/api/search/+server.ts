import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import type { SearchCriteria } from '$lib/server/indexers/types';
import { getCategoriesForSearchType } from '$lib/server/indexers/types';
import {
	searchQuerySchema,
	searchCriteriaSchema,
	enrichmentOptionsSchema
} from '$lib/validation/schemas';
import { qualityFilter, type EnrichmentOptions } from '$lib/server/quality';
import { logger } from '$lib/logging';

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
		qualityPresetId,
		matchToTmdb,
		filterRejected,
		minScore
	} = result.data;

	// Build typed search criteria based on searchType
	// Auto-apply categories based on search type if none specified
	const effectiveCategories = categories ?? getCategoriesForSearchType(searchType);

	let criteria: SearchCriteria;

	if (searchType === 'movie') {
		criteria = {
			searchType: 'movie',
			query: q,
			categories: effectiveCategories.length > 0 ? effectiveCategories : undefined,
			indexerIds: indexers,
			limit,
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
			limit,
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
			limit
		};
	}

	const manager = await getIndexerManager();

	// Use enhanced search if enrichment is requested
	if (enrich) {
		const effectiveProfileId = scoringProfileId ?? qualityPresetId;

		// Load the scoring profile to get allowedProtocols for indexer filtering
		let protocolFilter: string[] | undefined;
		if (effectiveProfileId) {
			const profile = await qualityFilter.getProfile(effectiveProfileId);
			if (profile?.allowedProtocols && profile.allowedProtocols.length > 0) {
				protocolFilter = profile.allowedProtocols;
			}
		}

		// Debug logging for profile issues
		logger.info('[SearchAPI] Enrichment requested', {
			scoringProfileId,
			qualityPresetId,
			effectiveProfileId: effectiveProfileId ?? 'none',
			protocolFilter
		});

		const enrichmentOpts: EnrichmentOptions = {
			scoringProfileId: effectiveProfileId, // Support legacy qualityPresetId
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

		const searchResult = await manager.searchEnhanced(criteria, {
			searchSource: 'interactive',
			enrichment: enrichmentOpts,
			protocolFilter
		});

		return json({
			releases: searchResult.releases,
			meta: {
				totalResults: searchResult.totalResults,
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

	// Standard search without enrichment (interactive)
	const searchResult = await manager.search(criteria, { searchSource: 'interactive' });

	return json({
		releases: searchResult.releases,
		meta: {
			totalResults: searchResult.totalResults,
			searchTimeMs: searchResult.searchTimeMs,
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
};

/**
 * POST /api/search
 * Performs a search with typed criteria in request body.
 *
 * Body format:
 * {
 *   "criteria": { ...searchCriteria },
 *   "enrichment": { ...enrichmentOptions }  // optional
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// Parse as object with criteria and optional enrichment
	const body = data as { criteria?: unknown; enrichment?: unknown };

	// If data doesn't have a criteria field, treat the whole body as criteria (backwards compat)
	const criteriaData = body.criteria ?? data;
	const enrichmentData = body.enrichment;

	const criteriaResult = searchCriteriaSchema.safeParse(criteriaData);

	if (!criteriaResult.success) {
		return json(
			{
				error: 'Validation failed',
				details: criteriaResult.error.flatten()
			},
			{ status: 400 }
		);
	}

	const manager = await getIndexerManager();
	const criteria = criteriaResult.data as SearchCriteria;

	// Use enhanced search if enrichment is provided
	if (enrichmentData) {
		const enrichmentResult = enrichmentOptionsSchema.safeParse(enrichmentData);

		if (!enrichmentResult.success) {
			return json(
				{
					error: 'Invalid enrichment options',
					details: enrichmentResult.error.flatten()
				},
				{ status: 400 }
			);
		}

		// Load the scoring profile to get allowedProtocols for indexer filtering
		let protocolFilter: string[] | undefined;
		const effectiveProfileId = enrichmentResult.data.scoringProfileId;
		if (effectiveProfileId) {
			const profile = await qualityFilter.getProfile(effectiveProfileId);
			if (profile?.allowedProtocols && profile.allowedProtocols.length > 0) {
				protocolFilter = profile.allowedProtocols;
			}
		}

		const enrichmentOpts: EnrichmentOptions = {
			...enrichmentResult.data,
			// Pass TMDB hint from criteria if available
			tmdbHint:
				'tmdbId' in criteria || 'imdbId' in criteria
					? {
							tmdbId: 'tmdbId' in criteria ? (criteria.tmdbId as number) : undefined,
							imdbId: 'imdbId' in criteria ? (criteria.imdbId as string) : undefined,
							tvdbId: 'tvdbId' in criteria ? (criteria.tvdbId as number) : undefined,
							mediaType: criteria.searchType === 'tv' ? 'tv' : 'movie'
						}
					: undefined
		};

		const searchResult = await manager.searchEnhanced(criteria, {
			searchSource: 'interactive',
			enrichment: enrichmentOpts,
			protocolFilter
		});

		return json({
			releases: searchResult.releases,
			meta: {
				totalResults: searchResult.totalResults,
				rejectedCount: searchResult.rejectedCount,
				searchTimeMs: searchResult.searchTimeMs,
				enrichTimeMs: searchResult.enrichTimeMs,
				scoringProfileId: searchResult.scoringProfileId,
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
	}

	// Standard search without enrichment (interactive)
	const searchResult = await manager.search(criteria, { searchSource: 'interactive' });

	return json({
		releases: searchResult.releases,
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
