import { getDiscoverResults } from '$lib/server/discover';
import { enrichWithLibraryStatus, filterInLibrary } from '$lib/server/library/status';
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
	with_watch_providers: z.string().default(''),
	watch_region: z.string().default('US'),
	with_genres: z.string().default(''),
	'primary_release_date.gte': z.string().nullable().default(null),
	'primary_release_date.lte': z.string().nullable().default(null),
	'vote_average.gte': z.string().nullable().default(null),
	exclude_in_library: z.enum(['true', 'false']).optional()
});

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
		const { results, pagination } = await getDiscoverResults({
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
