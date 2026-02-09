import { getDiscoverResults } from '$lib/server/discover';
import { enrichWithLibraryStatus, filterInLibrary } from '$lib/server/library/status';
import { tmdb } from '$lib/server/tmdb';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { logger } from '$lib/logging';

/**
 * Query parameter validation schema for discover endpoint.
 */
const discoverQuerySchema = z.object({
	type: z.enum(['movie', 'tv', 'all']).default('all'),
	page: z.coerce.number().int().min(1).default(1),
	sort_by: z.string().default('popularity.desc'),
	trending: z.enum(['day', 'week']).optional(),
	top_rated: z.enum(['true', 'false']).optional(),
	with_watch_providers: z.string().default(''),
	watch_region: z.string().default('US'),
	with_genres: z.string().default(''),
	'primary_release_date.gte': z.string().nullable().default(null),
	'primary_release_date.lte': z.string().nullable().default(null),
	'vote_average.gte': z.string().nullable().default(null),
	exclude_in_library: z.enum(['true', 'false']).optional()
});

interface TmdbPaginatedResult {
	results: Array<{ id: number; vote_average?: number; media_type?: string }>;
	page: number;
	total_pages: number;
	total_results: number;
}

export const GET: RequestHandler = async ({ url }) => {
	// Parse query parameters into an object
	const queryParams = Object.fromEntries(url.searchParams.entries());
	const result = discoverQuerySchema.safeParse(queryParams);

	if (!result.success) {
		return json(
			{
				error: 'Invalid query parameters',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const params = result.data;

	try {
		let results: Array<{ id: number }>;
		let pagination: { page: number; total_pages: number; total_results: number };

		if (params.top_rated === 'true') {
			// Handle top_rated endpoint
			if (params.type === 'movie') {
				const data = (await tmdb.fetch(
					`/movie/top_rated?page=${params.page}`
				)) as TmdbPaginatedResult;
				results = data.results.map((r) => ({ ...r, media_type: 'movie' }));
				pagination = {
					page: data.page,
					total_pages: data.total_pages,
					total_results: data.total_results
				};
			} else if (params.type === 'tv') {
				const data = (await tmdb.fetch(`/tv/top_rated?page=${params.page}`)) as TmdbPaginatedResult;
				results = data.results.map((r) => ({ ...r, media_type: 'tv' }));
				pagination = {
					page: data.page,
					total_pages: data.total_pages,
					total_results: data.total_results
				};
			} else {
				// For 'all', fetch both and combine
				const [moviesData, tvData] = (await Promise.all([
					tmdb.fetch(`/movie/top_rated?page=${params.page}`),
					tmdb.fetch(`/tv/top_rated?page=${params.page}`)
				])) as TmdbPaginatedResult[];

				const movieResults = moviesData.results.map((m) => ({ ...m, media_type: 'movie' }));
				const tvResults = tvData.results.map((t) => ({ ...t, media_type: 'tv' }));
				results = [...movieResults, ...tvResults].sort(
					(a, b) => (b.vote_average || 0) - (a.vote_average || 0)
				);
				pagination = {
					page: 1,
					total_pages: Math.max(moviesData.total_pages, tvData.total_pages),
					total_results: moviesData.total_results + tvData.total_results
				};
			}
		} else {
			// Use regular discover results
			const discoverResult = await getDiscoverResults({
				type: params.type,
				page: String(params.page),
				sortBy: params.sort_by,
				trending: params.trending ?? null,
				withWatchProviders: params.with_watch_providers,
				watchRegion: params.watch_region,
				withGenres: params.with_genres,
				minDate: params['primary_release_date.gte'],
				maxDate: params['primary_release_date.lte'],
				minRating: params['vote_average.gte']
			});
			results = discoverResult.results;
			pagination = discoverResult.pagination;
		}

		// Enrich results with library status
		const mediaTypeFilter = params.type === 'movie' ? 'movie' : params.type === 'tv' ? 'tv' : 'all';
		const enrichedResults = await enrichWithLibraryStatus(results, mediaTypeFilter);
		const shouldExcludeInLibrary = params.exclude_in_library === 'true';
		const filteredResults = filterInLibrary(enrichedResults, shouldExcludeInLibrary);

		return json({
			results: filteredResults,
			pagination
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		logger.error('Discover API error', e, { errorMessage: message });
		return json({ error: 'Failed to load content' }, { status: 500 });
	}
};
