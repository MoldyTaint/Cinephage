import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tmdb } from '$lib/server/tmdb';
import { enrichWithLibraryStatus } from '$lib/server/library/status';
import { createChildLogger } from '$lib/logging';
import type { PersonCastCredit, PersonCrewCredit } from '$lib/types/tmdb';

const PAGE_SIZE = 20;

interface PaginatedSection<T> {
	results: T[];
	page: number;
	total_pages: number;
	total_results: number;
}

/**
 * Person credits endpoint with two modes:
 *
 * 1. Batch mode (no type param): Returns all credit types in one response
 *    GET /api/tmdb/person/{id}/credits
 *    Returns { movies: {...}, tv: {...}, crew: {...} }
 *
 * 2. Paginated mode (with type param): For infinite scroll
 *    GET /api/tmdb/person/{id}/credits?type=movie|tv|crew&page=1
 *    Returns { results: Credit[], page, total_pages, total_results }
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const { correlationId } = locals;
	const log = createChildLogger({ correlationId, service: 'person-credits' });

	const personId = parseInt(params.id);
	if (isNaN(personId)) {
		return json({ error: 'Invalid person ID' }, { status: 400 });
	}

	const type = url.searchParams.get('type');
	const page = parseInt(url.searchParams.get('page') || '1');

	try {
		// Fetch credits (cached for 1 hour)
		const combinedCredits = await tmdb.getPersonCredits(personId);
		const allCast = combinedCredits.cast ?? [];
		const allCrew = combinedCredits.crew ?? [];

		// Sort once
		const sortedCast = [...allCast].sort((a, b) => b.popularity - a.popularity);
		const sortedCrew = [...allCrew].sort((a, b) => b.popularity - a.popularity);

		// Batch mode: return all types in one response
		if (!type) {
			const movieCredits = sortedCast.filter((c) => c.media_type === 'movie');
			const tvCredits = sortedCast.filter((c) => c.media_type === 'tv');

			// Paginate first page of each
			const moviePage = movieCredits.slice(0, PAGE_SIZE);
			const tvPage = tvCredits.slice(0, PAGE_SIZE);
			const crewPage = sortedCrew.slice(0, PAGE_SIZE);

			// Collect all IDs for single library status lookup
			const allItems = [...moviePage, ...tvPage, ...crewPage];
			const enrichedAll = await enrichWithLibraryStatus(allItems, 'all');

			// Split back into sections
			const enrichedMovies = enrichedAll.slice(0, moviePage.length);
			const enrichedTv = enrichedAll.slice(moviePage.length, moviePage.length + tvPage.length);
			const enrichedCrew = enrichedAll.slice(moviePage.length + tvPage.length);

			log.debug(
				{
					personId,
					movies: movieCredits.length,
					tv: tvCredits.length,
					crew: sortedCrew.length
				},
				'Returning batch person credits'
			);

			return json({
				movies: {
					results: enrichedMovies,
					page: 1,
					total_pages: Math.ceil(movieCredits.length / PAGE_SIZE),
					total_results: movieCredits.length
				} as PaginatedSection<PersonCastCredit>,
				tv: {
					results: enrichedTv,
					page: 1,
					total_pages: Math.ceil(tvCredits.length / PAGE_SIZE),
					total_results: tvCredits.length
				} as PaginatedSection<PersonCastCredit>,
				crew: {
					results: enrichedCrew,
					page: 1,
					total_pages: Math.ceil(sortedCrew.length / PAGE_SIZE),
					total_results: sortedCrew.length
				} as PaginatedSection<PersonCrewCredit>
			});
		}

		// Paginated mode: single type with page number
		if (!['movie', 'tv', 'crew'].includes(type)) {
			return json({ error: 'Invalid type. Must be movie, tv, or crew' }, { status: 400 });
		}

		let filteredCredits: (PersonCastCredit | PersonCrewCredit)[];
		let mediaType: 'movie' | 'tv' | 'all';

		if (type === 'crew') {
			filteredCredits = sortedCrew;
			mediaType = 'all';
		} else {
			filteredCredits = sortedCast.filter((c) => c.media_type === type);
			mediaType = type as 'movie' | 'tv';
		}

		// Calculate pagination
		const totalResults = filteredCredits.length;
		const totalPages = Math.ceil(totalResults / PAGE_SIZE);
		const startIndex = (page - 1) * PAGE_SIZE;
		const paginatedCredits = filteredCredits.slice(startIndex, startIndex + PAGE_SIZE);

		// Enrich with library status
		const enrichedCredits = await enrichWithLibraryStatus(paginatedCredits, mediaType);

		log.debug(
			{
				personId,
				type,
				page,
				count: enrichedCredits.length,
				totalResults
			},
			'Returning person credits'
		);

		return json({
			results: enrichedCredits,
			page,
			total_pages: totalPages,
			total_results: totalResults
		});
	} catch (e) {
		log.error({ err: e, ...{ personId, type, page } }, 'Failed to fetch person credits');
		return json({ error: 'Failed to fetch credits' }, { status: 500 });
	}
};
