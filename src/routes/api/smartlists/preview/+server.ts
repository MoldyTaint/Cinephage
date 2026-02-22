/**
 * Smart List Preview API
 * POST /api/smartlists/preview - Preview filter results without saving
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tmdb, type DiscoverParams } from '$lib/server/tmdb.js';
import { movies, series, type SmartListFilters } from '$lib/server/db/schema.js';
import { db } from '$lib/server/db/index.js';
import { logger } from '$lib/logging';
import { z } from 'zod';

// Helper to handle empty strings from HTML number inputs
const optionalNumber = z.preprocess(
	(v) => (v === '' || v === null ? undefined : v),
	z.number().optional()
);

const optionalNumberWithRange = (min: number, max: number) =>
	z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.number().min(min).max(max).optional()
	);

const previewSchema = z.object({
	mediaType: z.enum(['movie', 'tv']),
	filters: z.object({
		withGenres: z.array(z.number()).optional(),
		withoutGenres: z.array(z.number()).optional(),
		genreMode: z.enum(['and', 'or']).optional(),
		yearMin: optionalNumber,
		yearMax: optionalNumber,
		releaseDateMin: z.string().optional(),
		releaseDateMax: z.string().optional(),
		voteAverageMin: optionalNumberWithRange(0, 10),
		voteAverageMax: optionalNumberWithRange(0, 10),
		voteCountMin: optionalNumber,
		popularityMin: optionalNumber,
		popularityMax: optionalNumber,
		withCast: z.array(z.number()).optional(),
		withCrew: z.array(z.number()).optional(),
		withKeywords: z.array(z.number()).optional(),
		withoutKeywords: z.array(z.number()).optional(),
		withWatchProviders: z.array(z.number()).optional(),
		watchRegion: z.string().optional(),
		certification: z.string().optional(),
		certificationCountry: z.string().optional(),
		runtimeMin: optionalNumber,
		runtimeMax: optionalNumber,
		withOriginalLanguage: z.string().optional(),
		withStatus: z.string().optional(),
		withReleaseType: z.array(z.number()).optional()
	}),
	sortBy: z
		.enum([
			'popularity.desc',
			'popularity.asc',
			'vote_average.desc',
			'vote_average.asc',
			'primary_release_date.desc',
			'primary_release_date.asc',
			'first_air_date.desc',
			'first_air_date.asc',
			'revenue.desc',
			'revenue.asc',
			'title.asc',
			'title.desc'
		])
		.optional()
		.default('popularity.desc'),
	itemLimit: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.number().min(1).max(1000).optional().default(100)
	),
	page: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z.number().optional().default(1)
	)
});

function buildDiscoverParams(filters: SmartListFilters, sortBy: string): DiscoverParams {
	const params: DiscoverParams = {
		sort_by: sortBy
	};

	if (filters.withGenres?.length) {
		params.with_genres =
			filters.genreMode === 'and' ? filters.withGenres.join(',') : filters.withGenres.join('|');
	}
	if (filters.withoutGenres?.length) {
		params.without_genres = filters.withoutGenres.join(',');
	}

	if (filters.yearMin) {
		params['primary_release_date.gte'] = `${filters.yearMin}-01-01`;
		params['first_air_date.gte'] = `${filters.yearMin}-01-01`;
	}
	if (filters.yearMax) {
		params['primary_release_date.lte'] = `${filters.yearMax}-12-31`;
		params['first_air_date.lte'] = `${filters.yearMax}-12-31`;
	}

	if (filters.voteAverageMin !== undefined) {
		params['vote_average.gte'] = filters.voteAverageMin;
	}
	if (filters.voteAverageMax !== undefined) {
		params['vote_average.lte'] = filters.voteAverageMax;
	}
	if (filters.voteCountMin !== undefined) {
		params['vote_count.gte'] = filters.voteCountMin;
	}

	if (filters.withCast?.length) {
		params.with_cast = filters.withCast.join(',');
	}
	if (filters.withCrew?.length) {
		params.with_crew = filters.withCrew.join(',');
	}

	if (filters.withKeywords?.length) {
		params.with_keywords = filters.withKeywords.join(',');
	}
	if (filters.withoutKeywords?.length) {
		params.without_keywords = filters.withoutKeywords.join(',');
	}

	if (filters.withWatchProviders?.length) {
		params.with_watch_providers = filters.withWatchProviders.join('|');
		params.watch_region = filters.watchRegion ?? 'US';
	}

	if (filters.certification) {
		params.certification = filters.certification;
		params.certification_country = filters.certificationCountry ?? 'US';
	}

	if (filters.runtimeMin !== undefined) {
		params['with_runtime.gte'] = filters.runtimeMin;
	}
	if (filters.runtimeMax !== undefined) {
		params['with_runtime.lte'] = filters.runtimeMax;
	}

	if (filters.withOriginalLanguage) {
		params.with_original_language = filters.withOriginalLanguage;
	}

	if (filters.withStatus) {
		params.with_status = filters.withStatus;
	}

	if (filters.withReleaseType?.length) {
		params.with_release_type = filters.withReleaseType.join('|');
	}

	return params;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		logger.debug('[Preview API] Received body', body);
		const data = previewSchema.parse(body);

		const params = buildDiscoverParams(data.filters, data.sortBy);
		const TMDB_PAGE_SIZE = 20;
		const PREVIEW_PAGE_SIZE = 27; // 3 rows of 8 items for better grid display, can adjust as needed
		const startIndex = (data.page - 1) * PREVIEW_PAGE_SIZE;
		const tmdbStartPage = Math.floor(startIndex / TMDB_PAGE_SIZE) + 1;
		const tmdbOffset = startIndex % TMDB_PAGE_SIZE;

		const fetchDiscoverPage = async (page: number) => {
			const pageParams: DiscoverParams = { ...params, page };
			return data.mediaType === 'movie'
				? tmdb.discoverMovies(pageParams, true)
				: tmdb.discoverTv(pageParams, true);
		};

		const firstResult = await fetchDiscoverPage(tmdbStartPage);
		const cappedTotalResults = Math.min(firstResult.total_results, data.itemLimit);
		const totalPages = Math.ceil(cappedTotalResults / PREVIEW_PAGE_SIZE);

		if (cappedTotalResults === 0 || data.page > totalPages) {
			return json({
				items: [],
				page: data.page,
				totalPages,
				totalResults: cappedTotalResults,
				itemLimit: data.itemLimit,
				unfilteredTotal: firstResult.total_results
			});
		}

		const endIndexExclusive = Math.min(startIndex + PREVIEW_PAGE_SIZE, cappedTotalResults);
		const neededCount = Math.max(0, endIndexExclusive - startIndex);

		let items = firstResult.results.slice(tmdbOffset, tmdbOffset + neededCount);

		if (items.length < neededCount) {
			const nextTmdbPage = tmdbStartPage + 1;
			if (nextTmdbPage <= firstResult.total_pages) {
				const secondResult = await fetchDiscoverPage(nextTmdbPage);
				const remaining = neededCount - items.length;
				items = [...items, ...secondResult.results.slice(0, remaining)];
			}
		}

		// Check which items are already in the library
		const tmdbIds = items.map((item) => item.id);
		const libraryTmdbIds = new Set<number>();

		if (tmdbIds.length > 0) {
			if (data.mediaType === 'movie') {
				const libraryMovies = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
				for (const movie of libraryMovies) {
					if (tmdbIds.includes(movie.tmdbId)) {
						libraryTmdbIds.add(movie.tmdbId);
					}
				}
			} else {
				const librarySeries = db.select({ tmdbId: series.tmdbId }).from(series).all();
				for (const show of librarySeries) {
					if (tmdbIds.includes(show.tmdbId)) {
						libraryTmdbIds.add(show.tmdbId);
					}
				}
			}
		}

		// Add inLibrary flag to each item
		const itemsWithLibraryStatus = items.map((item) => ({
			...item,
			inLibrary: libraryTmdbIds.has(item.id)
		}));

		return json({
			items: itemsWithLibraryStatus,
			page: data.page,
			totalPages,
			totalResults: cappedTotalResults,
			itemLimit: data.itemLimit,
			unfilteredTotal: firstResult.total_results
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			logger.error('[Preview API] Validation error', { issues: error.issues });
			return json({ error: 'Validation failed', details: error.issues }, { status: 400 });
		}
		logger.error('[Preview API] Error', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
