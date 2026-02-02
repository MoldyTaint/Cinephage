import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { movies, movieFiles, rootFolders } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
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
import { fetchAndStoreMovieAlternateTitles } from '$lib/server/services/AlternateTitleService.js';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';

/**
 * Schema for adding a movie to the library
 */
const addMovieSchema = z.object({
	tmdbId: z.number().int().positive(),
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

/**
 * GET /api/library/movies
 * List all movies in the library
 */
export const GET: RequestHandler = async () => {
	try {
		// Fetch all movies (1 query)
		const allMovies = await db
			.select({
				id: movies.id,
				tmdbId: movies.tmdbId,
				imdbId: movies.imdbId,
				title: movies.title,
				originalTitle: movies.originalTitle,
				year: movies.year,
				overview: movies.overview,
				posterPath: movies.posterPath,
				backdropPath: movies.backdropPath,
				runtime: movies.runtime,
				genres: movies.genres,
				path: movies.path,
				rootFolderId: movies.rootFolderId,
				rootFolderPath: rootFolders.path,
				scoringProfileId: movies.scoringProfileId,
				monitored: movies.monitored,
				minimumAvailability: movies.minimumAvailability,
				added: movies.added,
				hasFile: movies.hasFile
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id));

		// Fetch all movie files in a single query (1 query instead of N)
		const allFiles = await db.select().from(movieFiles);

		// Group files by movieId in memory (O(n) complexity, much faster than N queries)
		const filesByMovieId = new Map<string, typeof allFiles>();
		for (const file of allFiles) {
			const existing = filesByMovieId.get(file.movieId) || [];
			existing.push(file);
			filesByMovieId.set(file.movieId, existing);
		}

		// Map movies with their files (O(n) memory operation)
		const moviesWithFiles = allMovies.map((movie) => {
			const files = filesByMovieId.get(movie.id) || [];
			return {
				...movie,
				files: files.map((f) => ({
					id: f.id,
					relativePath: f.relativePath,
					size: f.size,
					dateAdded: f.dateAdded,
					quality: f.quality,
					mediaInfo: f.mediaInfo,
					releaseGroup: f.releaseGroup,
					edition: f.edition
				}))
			};
		});

		return json({
			success: true,
			movies: moviesWithFiles,
			total: moviesWithFiles.length
		});
	} catch (error) {
		logger.error('[API] Error fetching movies', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch movies'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/library/movies
 * Add a movie to the library by TMDB ID
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const result = addMovieSchema.safeParse(body);

		if (!result.success) {
			throw new ValidationError('Validation failed', {
				details: result.error.flatten()
			});
		}

		const {
			tmdbId,
			rootFolderId,
			scoringProfileId,
			monitored,
			minimumAvailability,
			searchOnAdd: shouldSearch,
			wantsSubtitles
		} = result.data;

		// Check if movie already exists
		const existingMovie = await db
			.select({ id: movies.id })
			.from(movies)
			.where(eq(movies.tmdbId, tmdbId))
			.limit(1);

		if (existingMovie.length > 0) {
			return json(
				{
					success: false,
					error: 'Movie already exists in library',
					movieId: existingMovie[0].id
				},
				{ status: 409 }
			);
		}

		// Verify root folder exists and is for movies (shared logic)
		await validateRootFolder(rootFolderId, 'movie');

		// Fetch movie details from TMDB (shared logic with error handling)
		const movieDetails = await fetchMovieDetails(tmdbId);

		// Generate folder path
		const year = movieDetails.release_date
			? new Date(movieDetails.release_date).getFullYear()
			: undefined;
		const folderName = generateMovieFolderName(movieDetails.title, year, tmdbId);

		// Extract external IDs (shared logic)
		const { imdbId } = await fetchMovieExternalIds(tmdbId);

		// Get the effective scoring profile (shared logic)
		const effectiveProfileId = await getEffectiveScoringProfileId(scoringProfileId);

		// Get the language profile if subtitles wanted (shared logic)
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

		// Fetch and store alternate titles from TMDB (non-blocking)
		fetchAndStoreMovieAlternateTitles(newMovie.id, tmdbId).catch((err) => {
			logger.warn('Failed to fetch alternate titles for movie', {
				movieId: newMovie.id,
				tmdbId,
				error: err instanceof Error ? err.message : String(err)
			});
		});

		// Trigger search if requested and movie is monitored (shared logic)
		let searchTriggered = false;
		if (shouldSearch && monitored) {
			const searchResult = await triggerMovieSearch({
				movieId: newMovie.id,
				tmdbId,
				imdbId,
				title: movieDetails.title,
				year,
				scoringProfileId
			});
			searchTriggered = searchResult.triggered;
		}

		return json({
			success: true,
			movie: {
				id: newMovie.id,
				tmdbId: newMovie.tmdbId,
				title: newMovie.title,
				year: newMovie.year,
				path: newMovie.path,
				monitored: newMovie.monitored,
				searchTriggered
			}
		});
	} catch (error) {
		logger.error('[API] Error adding movie', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add movie'
			},
			{ status: 500 }
		);
	}
};
