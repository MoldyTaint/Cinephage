import { tmdb } from '$lib/server/tmdb';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logger } from '$lib/logging';
import { enrichWithLibraryStatus, getLibraryStatus } from '$lib/server/library/status';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) {
		throw error(400, 'Invalid movie ID');
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
		const movie = await tmdb.getMovie(id);

		// Handle null response (shouldn't happen since we checked config, but be safe)
		if (!movie) {
			throw error(503, {
				message:
					'TMDB API key not configured. Please configure your TMDB API key in Settings > Integrations.'
			});
		}
		let collection = null;

		if (movie.belongs_to_collection) {
			try {
				collection = await tmdb.getCollection(movie.belongs_to_collection.id);
			} catch (e) {
				logger.error(
					{
						err: e,
						...{
							collectionId: movie.belongs_to_collection.id
						}
					},
					'Failed to fetch collection'
				);
			}
		}

		// Get library status for the movie itself
		const movieStatus = await getLibraryStatus([id], 'movie');
		const movieWithStatus = {
			...movie,
			inLibrary: movieStatus[id]?.inLibrary ?? false,
			hasFile: movieStatus[id]?.hasFile ?? false,
			libraryId: movieStatus[id]?.libraryId
		};

		// Enrich recommendations, similar, and collection with library status
		const [enrichedRecommendations, enrichedSimilar, enrichedCollection] = await Promise.all([
			movie.recommendations?.results
				? enrichWithLibraryStatus(movie.recommendations.results, 'movie')
				: Promise.resolve([]),
			movie.similar?.results
				? enrichWithLibraryStatus(movie.similar.results, 'movie')
				: Promise.resolve([]),
			collection?.parts ? enrichWithLibraryStatus(collection.parts, 'movie') : Promise.resolve(null)
		]);

		// Update movie object with enriched data
		if (movieWithStatus.recommendations) {
			movieWithStatus.recommendations = {
				...movieWithStatus.recommendations,
				results: enrichedRecommendations
			};
		}
		if (movieWithStatus.similar) {
			movieWithStatus.similar = {
				...movieWithStatus.similar,
				results: enrichedSimilar
			};
		}

		// Update collection with enriched parts
		const enrichedCollectionData =
			collection && enrichedCollection
				? {
						...collection,
						parts: enrichedCollection
					}
				: null;

		return {
			movie: movieWithStatus,
			collection: enrichedCollectionData
		};
	} catch (e) {
		logger.error({ err: e, ...{ movieId: id } }, 'Failed to fetch movie');
		throw error(404, 'Movie not found');
	}
};
