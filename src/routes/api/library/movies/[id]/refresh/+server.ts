/**
 * Refresh Movie API
 *
 * POST /api/library/movies/[id]/refresh
 * Refreshes movie metadata from TMDB including external IDs
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index.js';
import { movies, libraries } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
import { resolveProviderWithFallback } from '$lib/server/metadata/provider-resolution.js';
import { resolveAnimeProviderRef } from '$lib/server/metadata/provider-ref-resolver.js';
import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
import {
	startRefresh,
	stopRefresh,
	isMovieRefreshing
} from '$lib/server/library/ActiveSearchTracker.js';

export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Get the movie
	const [movieData] = await db.select().from(movies).where(eq(movies.id, id));

	if (!movieData) {
		error(404, 'Movie not found');
	}

	// Check if a refresh is already running for this movie
	if (isMovieRefreshing(id)) {
		error(409, 'A refresh is already in progress for this movie');
	}

	// Track this refresh
	const refreshId = `movie-refresh-${id}`;
	startRefresh(refreshId, { movieId: id });

	try {
		// Fetch fresh data from TMDB
		const [tmdbMovie, externalIds] = await Promise.all([
			tmdb.getMovie(movieData.tmdbId),
			tmdb.getMovieExternalIds(movieData.tmdbId).catch((err) => {
				logger.warn(
					{
						tmdbId: movieData.tmdbId,
						error: err instanceof Error ? err.message : String(err)
					},
					'[API] Failed to fetch movie external IDs'
				);
				return null;
			})
		]);

		const [libraryRow] = movieData.libraryId
			? await db
					.select({ metadataProvider: libraries.metadataProvider })
					.from(libraries)
					.where(eq(libraries.id, movieData.libraryId))
					.limit(1)
			: [];
		const animeSignal = isLikelyAnimeMedia({
			genres: tmdbMovie.genres,
			originalLanguage: tmdbMovie.original_language,
			productionCountries: tmdbMovie.production_countries,
			originCountries: tmdbMovie.production_countries?.map((country) => country.iso_3166_1),
			title: tmdbMovie.title,
			originalTitle: tmdbMovie.original_title
		});
		const mediaType = animeSignal ? 'anime' : 'movie';
		const providerResolution = await resolveProviderWithFallback({
			mediaType,
			seriesProvider: (movieData.metadataProvider as 'auto' | 'tmdb' | 'anilist' | 'mal') ?? 'auto',
			libraryProvider:
				(libraryRow?.metadataProvider as 'auto' | 'tmdb' | 'anilist' | 'mal') ?? 'auto'
		});
		const providerRefs = (movieData.providerRefs ?? {}) as Record<string, string>;
		const pinnedExternal = movieData.pinnedExternal as {
			provider: 'tmdb' | 'anilist' | 'mal';
			id: string;
		} | null;
		let resolvedProviderRef: string | undefined =
			pinnedExternal?.provider === providerResolution.selectedProviderId
				? pinnedExternal.id
				: providerRefs[providerResolution.selectedProviderId];
		let providerDetails: {
			id: string;
			title: string;
			originalTitle?: string;
			overview?: string;
			year?: number | null;
			genres?: string[];
			status?: string;
			studios?: string[];
		} | null = null;
		if (providerResolution.selectedProviderId !== 'tmdb') {
			if (!resolvedProviderRef) {
				resolvedProviderRef = await resolveAnimeProviderRef({
					providerId: providerResolution.selectedProviderId,
					title: tmdbMovie.title,
					aliases: [tmdbMovie.original_title ?? '', movieData.title, movieData.originalTitle ?? ''],
					year: tmdbMovie.release_date
						? new Date(tmdbMovie.release_date).getFullYear()
						: movieData.year
				});
			}
			if (resolvedProviderRef) {
				providerDetails = await providerResolution.provider.getDetails(
					resolvedProviderRef,
					mediaType
				);
			}
		}

		// Update movie metadata
		await db
			.update(movies)
			.set({
				// Keep canonical identity from TMDB to avoid provider switches renaming media.
				title: tmdbMovie.title,
				originalTitle: tmdbMovie.original_title,
				overview: providerDetails?.overview ?? tmdbMovie.overview,
				posterPath: tmdbMovie.poster_path,
				backdropPath: tmdbMovie.backdrop_path,
				runtime: tmdbMovie.runtime,
				genres: providerDetails?.genres ?? tmdbMovie.genres?.map((g) => g.name),
				metadataProvider:
					movieData.metadataProvider ??
					(libraryRow?.metadataProvider as 'auto' | 'tmdb' | 'anilist' | 'mal') ??
					'auto',
				providerRefs:
					providerResolution.selectedProviderId !== 'tmdb' && resolvedProviderRef
						? {
								...providerRefs,
								[providerResolution.selectedProviderId]: resolvedProviderRef
							}
						: providerRefs,
				year: tmdbMovie.release_date
					? new Date(tmdbMovie.release_date).getFullYear()
					: movieData.year,
				imdbId: externalIds?.imdb_id || movieData.imdbId,
				tmdbCollectionId: tmdbMovie.belongs_to_collection?.id ?? movieData.tmdbCollectionId,
				collectionName: tmdbMovie.belongs_to_collection?.name ?? movieData.collectionName
			})
			.where(eq(movies.id, id));

		// Fetch updated movie data
		const [updatedMovie] = await db.select().from(movies).where(eq(movies.id, id));

		logger.info(
			{
				id,
				title: updatedMovie.title,
				imdbId: updatedMovie.imdbId
			},
			'[API] Movie metadata refreshed'
		);

		return json({
			success: true,
			movie: {
				id: updatedMovie.id,
				tmdbId: updatedMovie.tmdbId,
				imdbId: updatedMovie.imdbId,
				title: updatedMovie.title,
				year: updatedMovie.year,
				overview: updatedMovie.overview,
				posterPath: updatedMovie.posterPath,
				backdropPath: updatedMovie.backdropPath,
				runtime: updatedMovie.runtime,
				genres: updatedMovie.genres
			}
		});
	} catch (err) {
		logger.error(
			{
				err: err instanceof Error ? err : undefined,
				...{
					id,
					tmdbId: movieData.tmdbId
				}
			},
			'[API] Failed to refresh movie metadata'
		);

		error(500, err instanceof Error ? err.message : 'Failed to refresh movie metadata');
	} finally {
		stopRefresh(refreshId);
	}
};
