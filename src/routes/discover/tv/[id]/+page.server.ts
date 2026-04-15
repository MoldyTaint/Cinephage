import { tmdb } from '$lib/server/tmdb';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logger } from '$lib/logging';
import { enrichWithLibraryStatus, getLibraryStatus } from '$lib/server/library/status';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) {
		throw error(400, 'Invalid TV Show ID');
	}

	// Check if TMDB is configured
	const tmdbConfigured = await tmdb.isConfigured();
	if (!tmdbConfigured) {
		throw error(503, {
			message:
				'TMDB API key not configured. Please configure your TMDB API key in Settings > Integrations.'
		});
	}

	try {
		const tv = await tmdb.getTVShow(id);

		// Handle null response (shouldn't happen since we checked config, but be safe)
		if (!tv) {
			throw error(503, {
				message:
					'TMDB API key not configured. Please configure your TMDB API key in Settings > Integrations.'
			});
		}

		// Get library status for the TV show itself
		const tvStatus = await getLibraryStatus([id], 'tv');
		const tvWithStatus = {
			...tv,
			inLibrary: tvStatus[id]?.inLibrary ?? false,
			hasFile: tvStatus[id]?.hasFile ?? false,
			libraryId: tvStatus[id]?.libraryId
		};

		// Enrich recommendations and similar with library status
		const [enrichedRecommendations, enrichedSimilar] = await Promise.all([
			tv.recommendations?.results
				? enrichWithLibraryStatus(tv.recommendations.results, 'tv')
				: Promise.resolve([]),
			tv.similar?.results ? enrichWithLibraryStatus(tv.similar.results, 'tv') : Promise.resolve([])
		]);

		// Update tv object with enriched data
		if (tvWithStatus.recommendations) {
			tvWithStatus.recommendations = {
				...tvWithStatus.recommendations,
				results: enrichedRecommendations
			};
		}
		if (tvWithStatus.similar) {
			tvWithStatus.similar = {
				...tvWithStatus.similar,
				results: enrichedSimilar
			};
		}

		return {
			tv: tvWithStatus
		};
	} catch (e) {
		logger.error({ err: e, ...{ tvShowId: id } }, 'Failed to fetch TV show');
		throw error(404, 'TV Show not found');
	}
};
