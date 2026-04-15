/**
 * Refresh Movie API
 *
 * POST /api/library/movies/[id]/refresh
 * Refreshes movie metadata from TMDB including external IDs
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index.js';
import { movies } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';
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

		// Update movie metadata
		await db
			.update(movies)
			.set({
				title: tmdbMovie.title,
				originalTitle: tmdbMovie.original_title,
				overview: tmdbMovie.overview,
				posterPath: tmdbMovie.poster_path,
				backdropPath: tmdbMovie.backdrop_path,
				runtime: tmdbMovie.runtime,
				genres: tmdbMovie.genres?.map((g) => g.name),
				year: tmdbMovie.release_date
					? new Date(tmdbMovie.release_date).getFullYear()
					: movieData.year,
				imdbId: externalIds?.imdb_id || movieData.imdbId
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
