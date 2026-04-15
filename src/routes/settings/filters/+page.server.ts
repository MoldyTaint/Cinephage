import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { tmdb } from '$lib/server/tmdb';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { GlobalTmdbFilters } from '$lib/types/tmdb';
import { logger } from '$lib/logging';

export const load: PageServerLoad = async () => {
	// Fetch current settings
	const settingsData = await db.query.settings.findFirst({
		where: eq(settings.key, 'global_filters')
	});

	let currentFilters: GlobalTmdbFilters = {
		include_adult: false,
		min_vote_average: 0,
		min_vote_count: 0,
		language: 'en-US',
		region: 'US',
		excluded_genre_ids: []
	};

	if (settingsData) {
		try {
			currentFilters = { ...currentFilters, ...JSON.parse(settingsData.value) };
		} catch (e) {
			logger.error({ err: e }, 'Failed to parse global_filters');
		}
	}

	// Check if TMDB is configured
	const tmdbConfigured = await tmdb.isConfigured();

	// Fetch Genres (only if TMDB is configured)
	let genres: { id: number; name: string }[] = [];
	if (tmdbConfigured) {
		try {
			const [movieGenres, tvGenres] = await Promise.all([
				tmdb.fetch('/genre/movie/list') as Promise<{
					genres: { id: number; name: string }[];
				} | null>,
				tmdb.fetch('/genre/tv/list') as Promise<{ genres: { id: number; name: string }[] } | null>
			]);

			// Handle null responses (API key not configured)
			if (movieGenres && tvGenres) {
				// Merge and deduplicate
				const genreMap = new Map<number, string>();
				movieGenres.genres.forEach((g) => genreMap.set(g.id, g.name));
				tvGenres.genres.forEach((g) => genreMap.set(g.id, g.name));

				genres = Array.from(genreMap.entries())
					.map(([id, name]) => ({ id, name }))
					.sort((a, b) => a.name.localeCompare(b.name));
			}
		} catch (e) {
			logger.error({ err: e }, 'Failed to fetch genres');
		}
	}

	return {
		filters: currentFilters,
		genres,
		tmdbConfigured
	};
};
