import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tmdb } from '$lib/server/tmdb';
import { contentFilterPipeline } from '$lib/server/filters/ContentFilterPipeline.js';
import { enrichWithReleaseDates } from '$lib/server/release-enrichment.js';
import { z } from 'zod';
import { logger } from '$lib/logging';

const searchQuerySchema = z.object({
	query: z.string().min(1, 'Search query is required'),
	type: z.enum(['all', 'movie', 'tv', 'person']).default('all'),
	page: z.coerce.number().int().min(1).default(1),
	exclude_in_library: z.enum(['true', 'false']).optional()
});

export const GET: RequestHandler = async ({ url }) => {
	const params = Object.fromEntries(url.searchParams.entries());
	const result = searchQuerySchema.safeParse(params);

	if (!result.success) {
		return json({ error: 'Invalid parameters', details: result.error.flatten() }, { status: 400 });
	}

	const { query, type, page, exclude_in_library } = result.data;

	// Check if TMDB is configured
	const tmdbConfigured = await tmdb.isConfigured();
	if (!tmdbConfigured) {
		return json({ error: 'TMDB API key not configured' }, { status: 503 });
	}

	// Type for TMDB search responses
	interface SearchResponse {
		results: Array<Record<string, unknown> & { id: number }>;
		total_results: number;
		total_pages: number;
	}

	try {
		let results: Array<{ id: number; media_type?: string; [key: string]: unknown }> = [];
		let totalResults = 0;
		let totalPages = 0;

		if (type === 'movie') {
			const data = (await tmdb.fetch(
				`/search/movie?query=${encodeURIComponent(query)}&page=${page}`
			)) as SearchResponse | null;
			if (!data) return json({ error: 'TMDB API key not configured' }, { status: 503 });
			results = data.results.map((m) => ({ ...m, media_type: 'movie' }));
			totalResults = data.total_results;
			totalPages = data.total_pages;
		} else if (type === 'tv') {
			const data = (await tmdb.fetch(
				`/search/tv?query=${encodeURIComponent(query)}&page=${page}`
			)) as SearchResponse | null;
			if (!data) return json({ error: 'TMDB API key not configured' }, { status: 503 });
			results = data.results.map((t) => ({ ...t, media_type: 'tv' }));
			totalResults = data.total_results;
			totalPages = data.total_pages;
		} else if (type === 'person') {
			const data = (await tmdb.fetch(
				`/search/person?query=${encodeURIComponent(query)}&page=${page}`
			)) as SearchResponse | null;
			if (!data) return json({ error: 'TMDB API key not configured' }, { status: 503 });
			results = data.results.map((p) => ({ ...p, media_type: 'person' }));
			totalResults = data.total_results;
			totalPages = data.total_pages;
		} else {
			// Use multi search for combined results (movies, TV, and persons)
			const data = (await tmdb.fetch(
				`/search/multi?query=${encodeURIComponent(query)}&page=${page}`
			)) as SearchResponse | null;
			if (!data) return json({ error: 'TMDB API key not configured' }, { status: 503 });
			results = data.results;
			totalResults = data.total_results;
			totalPages = data.total_pages;
		}

		const mediaTypeFilter = type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : 'all';
		const { results: filteredResults } = await contentFilterPipeline.apply(results, {
			mediaType: mediaTypeFilter,
			excludeInLibrary: exclude_in_library === 'true'
		});
		const enrichedResults = await enrichWithReleaseDates(filteredResults);

		return json({
			results: enrichedResults,
			pagination: {
				page,
				total_pages: totalPages,
				total_results: totalResults
			}
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		logger.error({ err: e, ...{ errorMessage: message, query } }, 'Search API error');
		return json({ error: 'Search failed' }, { status: 500 });
	}
};
