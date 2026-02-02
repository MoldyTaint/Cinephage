import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { movies } from '$lib/server/db/schema.js';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { NamingService, type MediaNamingInfo } from '$lib/server/library/naming/NamingService.js';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService.js';
import {
	validateRootFolder,
	getEffectiveScoringProfileId,
	getLanguageProfileId,
	fetchMovieDetails,
	fetchMovieExternalIds,
	triggerMovieSearch
} from '$lib/server/library/LibraryAddService.js';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';

/**
 * Schema for bulk adding movies to the library
 */
const bulkAddMoviesSchema = z.object({
	tmdbIds: z.array(z.number().int().positive()).min(1).max(50),
	rootFolderId: z.string().min(1),
	scoringProfileId: z.string().optional(),
	monitored: z.boolean().default(true),
	minimumAvailability: z.enum(['announced', 'inCinemas', 'released', 'preDb']).default('released'),
	searchOnAdd: z.boolean().default(true),
	wantsSubtitles: z.boolean().default(true)
});

/**
 * Generate a folder name for a movie using the naming service
 * Uses database naming configuration instead of defaults
 */
function generateMovieFolderName(title: string, year?: number, tmdbId?: number): string {
	const config = namingSettingsService.getConfigSync();
	const namingService = new NamingService(config);
	const info: MediaNamingInfo = {
		title,
		year,
		tmdbId
	};
	return namingService.generateMovieFolderName(info);
}

interface BulkAddResult {
	added: number;
	skipped: number;
	errors: { tmdbId: number; title?: string; error: string }[];
	movies: { id: string; tmdbId: number; title: string }[];
}

/**
 * POST /api/library/movies/bulk
 * Add multiple movies to the library by TMDB IDs
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const result = bulkAddMoviesSchema.safeParse(body);

		if (!result.success) {
			throw new ValidationError('Validation failed', {
				details: result.error.flatten()
			});
		}

		const {
			tmdbIds,
			rootFolderId,
			scoringProfileId,
			monitored,
			minimumAvailability,
			searchOnAdd: shouldSearch,
			wantsSubtitles
		} = result.data;

		// Verify root folder exists and is for movies
		await validateRootFolder(rootFolderId, 'movie');

		// Check which movies already exist in library
		const existingMovies = await db
			.select({ tmdbId: movies.tmdbId })
			.from(movies)
			.where(inArray(movies.tmdbId, tmdbIds));

		const existingTmdbIds = new Set(existingMovies.map((m) => m.tmdbId));

		// Filter to only movies that need to be added
		const moviesToAdd = tmdbIds.filter((id) => !existingTmdbIds.has(id));

		// Get the effective scoring profile once (shared across all movies)
		const effectiveProfileId = await getEffectiveScoringProfileId(scoringProfileId);

		const results: BulkAddResult = {
			added: 0,
			skipped: existingTmdbIds.size,
			errors: [],
			movies: []
		};

		// Add each movie
		for (const tmdbId of moviesToAdd) {
			try {
				// Fetch movie details from TMDB
				const movieDetails = await fetchMovieDetails(tmdbId);

				// Generate folder path
				const year = movieDetails.release_date
					? new Date(movieDetails.release_date).getFullYear()
					: undefined;
				const folderName = generateMovieFolderName(movieDetails.title, year, tmdbId);

				// Extract external IDs
				const { imdbId } = await fetchMovieExternalIds(tmdbId);

				// Get the language profile if subtitles wanted
				const languageProfileId = await getLanguageProfileId(wantsSubtitles, tmdbId);

				// Insert movie into database
				const [newMovie] = await db
					.insert(movies)
					.values({
						tmdbId,
						imdbId,
						title: movieDetails.title,
						originalTitle: movieDetails.original_title,
						year,
						overview: movieDetails.overview,
						posterPath: movieDetails.poster_path,
						backdropPath: movieDetails.backdrop_path,
						runtime: movieDetails.runtime,
						genres: movieDetails.genres?.map((g) => g.name) ?? [],
						path: folderName,
						rootFolderId,
						scoringProfileId: effectiveProfileId,
						monitored,
						minimumAvailability,
						hasFile: false,
						wantsSubtitles,
						languageProfileId
					})
					.returning();

				results.added++;
				results.movies.push({
					id: newMovie.id,
					tmdbId: newMovie.tmdbId,
					title: newMovie.title
				});

				// Trigger search if requested and movie is monitored
				if (shouldSearch && monitored) {
					await triggerMovieSearch({
						movieId: newMovie.id,
						tmdbId,
						imdbId,
						title: movieDetails.title,
						year,
						scoringProfileId
					});
				}
			} catch (error) {
				logger.error(
					'[API] Error adding movie in bulk',
					error instanceof Error ? error : undefined,
					{
						tmdbId
					}
				);
				results.errors.push({
					tmdbId,
					error: error instanceof Error ? error.message : 'Failed to add movie'
				});
			}
		}

		return json({
			success: true,
			...results
		});
	} catch (error) {
		logger.error('[API] Error in bulk movie add', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add movies'
			},
			{ status: 500 }
		);
	}
};
