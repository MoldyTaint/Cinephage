import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { tmdb } from '$lib/server/tmdb';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { GlobalTmdbFilters } from '$lib/types/tmdb';
import { logger } from '$lib/logging';

import { TMDB } from '$lib/config/constants.js';

export const load: PageServerLoad = async () => {
	// Fetch current settings
	const settingsData = await db.query.settings.findFirst({
		where: eq(settings.key, 'global_filters')
	});

	let currentFilters: GlobalTmdbFilters = {
		include_adult: false,
		min_vote_average: 0,
		min_vote_count: 0,
		language: `en-${TMDB.DEFAULT_REGION}`,
		region: TMDB.DEFAULT_REGION,
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

	// Fetch Genres, Countries, and Languages (only if TMDB is configured)
	let genres: { id: number; name: string }[] = [];
	let countries: { code: string; name: string }[] = [];
	let languages: { code: string; name: string }[] = [];

	if (tmdbConfigured) {
		try {
			const [movieGenres, tvGenres, countriesData, languagesData] = await Promise.all([
				tmdb.fetch('/genre/movie/list') as Promise<{
					genres: { id: number; name: string }[];
				} | null>,
				tmdb.fetch('/genre/tv/list') as Promise<{ genres: { id: number; name: string }[] } | null>,
				tmdb.getCountries(),
				tmdb.getLanguages()
			]);

			// Handle genres
			if (movieGenres && tvGenres) {
				const genreMap = new Map<number, string>();
				movieGenres.genres.forEach((g) => genreMap.set(g.id, g.name));
				tvGenres.genres.forEach((g) => genreMap.set(g.id, g.name));

				genres = Array.from(genreMap.entries())
					.map(([id, name]) => ({ id, name }))
					.sort((a, b) => a.name.localeCompare(b.name));
			}

			// Handle countries
			if (countriesData) {
				countries = countriesData
					.map((c) => ({
						code: c.iso_3166_1,
						name: c.english_name
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			}

			// Handle languages
			if (languagesData) {
				languages = languagesData
					.map((l) => ({
						code: l.iso_639_1,
						name: l.english_name
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			}
		} catch (e) {
			logger.error({ err: e }, 'Failed to fetch TMDB configuration');
		}
	}

	return {
		filters: currentFilters,
		genres,
		countries,
		languages,
		tmdbConfigured
	};
};
