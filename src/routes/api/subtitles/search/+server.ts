import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleSearchService } from '$lib/server/subtitles/services/SubtitleSearchService';
import { LanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService';
import { subtitleSearchSchema } from '$lib/validation/schemas';
import { db } from '$lib/server/db';
import { movies, episodes, series } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { SubtitleSearchCriteria } from '$lib/server/subtitles/types';
import { parseBody } from '$lib/server/api/validate.js';

/**
 * POST /api/subtitles/search
 * Search for subtitles across configured providers.
 */
export const POST: RequestHandler = async ({ request }) => {
	const validated = await parseBody(request, subtitleSearchSchema);
	const searchService = getSubtitleSearchService();
	const profileService = LanguageProfileService.getInstance();

	// Search for movie subtitles
	if (validated.movieId) {
		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, validated.movieId)
		});

		if (!movie) {
			return json({ error: 'Movie not found' }, { status: 404 });
		}

		// Get languages from profile or request
		let languages = validated.languages || [];
		if (languages.length === 0) {
			const profile = await profileService.getProfileForMovie(validated.movieId);
			if (profile) {
				languages = profile.languages.map((l) => l.code);
			}
		}
		if (languages.length === 0) {
			languages = ['en']; // Default to English
		}

		const results = await searchService.searchForMovie(validated.movieId, languages, {
			providerIds: validated.providerIds
		});

		return json(results);
	}

	// Search for episode subtitles
	if (validated.episodeId) {
		const episode = await db.query.episodes.findFirst({
			where: eq(episodes.id, validated.episodeId)
		});

		if (!episode) {
			return json({ error: 'Episode not found' }, { status: 404 });
		}

		const seriesData = await db.query.series.findFirst({
			where: eq(series.id, episode.seriesId)
		});

		if (!seriesData) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		// Get languages from profile or request
		let languages = validated.languages || [];
		if (languages.length === 0) {
			const profile = await profileService.getProfileForSeries(seriesData.id);
			if (profile) {
				languages = profile.languages.map((l) => l.code);
			}
		}
		if (languages.length === 0) {
			languages = ['en']; // Default to English
		}

		const results = await searchService.searchForEpisode(validated.episodeId, languages, {
			providerIds: validated.providerIds
		});

		return json(results);
	}

	// Manual search with provided parameters
	if (!validated.title) {
		return json({ error: 'Either movieId, episodeId, or title is required' }, { status: 400 });
	}

	const criteria: SubtitleSearchCriteria = {
		title: validated.title,
		year: validated.year,
		imdbId: validated.imdbId,
		tmdbId: validated.tmdbId,
		seriesTitle: validated.seriesTitle,
		season: validated.season,
		episode: validated.episode,
		languages: validated.languages || ['en'],
		includeForced: validated.includeForced,
		includeHearingImpaired: validated.includeHearingImpaired,
		excludeHearingImpaired: validated.excludeHearingImpaired
	};

	const results = await searchService.search(
		criteria,
		{},
		{
			providerIds: validated.providerIds
		}
	);

	return json(results);
};
