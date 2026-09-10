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
import { enrichAnimeMetadata } from '$lib/server/metadata/provider-resolution.js';
import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
import { createChildLogger } from '$lib/logging';
import {
	startRefresh,
	stopRefresh,
	isMovieRefreshing
} from '$lib/server/library/ActiveSearchTracker.js';

const logger = createChildLogger({ module: 'LibraryMovieRefreshApi', logDomain: 'scans' });

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
		// Fetch fresh data from TMDB (canonical identity/overview/genres)
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

		// Determine anime classification from TMDB metadata
		const animeSignal = isLikelyAnimeMedia({
			genres: tmdbMovie.genres,
			originalLanguage: tmdbMovie.original_language,
			productionCountries: tmdbMovie.production_countries,
			originCountries: tmdbMovie.production_countries?.map((country) => country.iso_3166_1),
			title: tmdbMovie.title,
			originalTitle: tmdbMovie.original_title
		});

		// Fetch supplementary anime enrichment (alt titles, adult flag) from AniList + Jikan.
		// Runs in parallel; failures are silently skipped.
		const providerRefs = (movieData.providerRefs ?? {}) as Record<string, string>;
		let adultFromEnrichment = false;
		const adultSources: string[] = [];
		if (animeSignal) {
			const enrichment = await enrichAnimeMetadata(
				{
					tmdbTitle: tmdbMovie.title,
					aliases: [tmdbMovie.original_title ?? '', movieData.title, movieData.originalTitle ?? ''],
					year: tmdbMovie.release_date
						? new Date(tmdbMovie.release_date).getFullYear()
						: movieData.year
				},
				'anime'
			);
			Object.assign(providerRefs, enrichment.refs);
			for (const [pid, details] of Object.entries(enrichment.details)) {
				if (details.isAdult) {
					adultFromEnrichment = true;
					adultSources.push(pid);
				}
			}
		}
		// TMDB adult flag (authoritative for non-anime too)
		if (tmdbMovie.adult === true) {
			adultFromEnrichment = true;
			adultSources.push('tmdb');
		}
		// Sticky-OR: once adult, always adult
		const newAdult = (movieData.adult ?? false) || adultFromEnrichment;
		const newAdultSource =
			adultSources.length > 0 ? adultSources.join(',') : (movieData.adultSource ?? null);
		const newAdultConfidence = adultFromEnrichment
			? 'provider'
			: (movieData.adultConfidence ?? null);

		// Update movie metadata - TMDB is canonical for identity/overview/genres
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
				providerRefs,
				year: tmdbMovie.release_date
					? new Date(tmdbMovie.release_date).getFullYear()
					: movieData.year,
				imdbId: externalIds?.imdb_id || movieData.imdbId,
				tmdbCollectionId: tmdbMovie.belongs_to_collection?.id ?? movieData.tmdbCollectionId,
				collectionName: tmdbMovie.belongs_to_collection?.name ?? movieData.collectionName,
				adult: newAdult,
				adultSource: newAdultSource,
				adultConfidence: newAdultConfidence
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
