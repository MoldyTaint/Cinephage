import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	downloadHistory,
	movies,
	movieFiles,
	rootFolders,
	subtitles
} from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { mediaInfoService } from '$lib/server/library/index.js';
import { getLanguageProfileService } from '$lib/server/subtitles/services/LanguageProfileService.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';
import { monitoringScheduler } from '$lib/server/monitoring/MonitoringScheduler.js';
import { deleteAllAlternateTitles } from '$lib/server/services/index.js';
import { unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '$lib/logging';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import { tmdb } from '$lib/server/tmdb.js';

/**
 * GET /api/library/movies/[id]
 * Get a specific movie with full details
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [movie] = await db
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
				languageProfileId: movies.languageProfileId,
				monitored: movies.monitored,
				minimumAvailability: movies.minimumAvailability,
				added: movies.added,
				hasFile: movies.hasFile,
				wantsSubtitles: movies.wantsSubtitles
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.where(eq(movies.id, params.id));

		if (!movie) {
			return json({ success: false, error: 'Movie not found' }, { status: 404 });
		}

		const [files, existingSubtitles, subtitleStatus, releaseInfo] = await Promise.all([
			db.select().from(movieFiles).where(eq(movieFiles.movieId, movie.id)),
			db.select().from(subtitles).where(eq(subtitles.movieId, movie.id)),
			getLanguageProfileService().getMovieSubtitleStatus(movie.id),
			tmdb.getMovieReleaseInfo(movie.tmdbId).catch((err) => {
				logger.warn('[API] Failed to fetch movie release info', {
					movieId: movie.id,
					tmdbId: movie.tmdbId,
					error: err instanceof Error ? err.message : String(err)
				});
				return null;
			})
		]);

		return json({
			success: true,
			movie: {
				...movie,
				tmdbStatus: releaseInfo?.status ?? null,
				releaseDate: releaseInfo?.release_date ?? null,
				files: files.map((f) => ({
					id: f.id,
					relativePath: f.relativePath,
					size: f.size,
					sizeFormatted: mediaInfoService.constructor.prototype.constructor.formatFileSize
						? MediaInfoService.formatFileSize(f.size ?? undefined)
						: undefined,
					dateAdded: f.dateAdded,
					quality: f.quality,
					mediaInfo: f.mediaInfo,
					releaseGroup: f.releaseGroup,
					edition: f.edition
				})),
				subtitles: existingSubtitles.map((s) => ({
					id: s.id,
					language: s.language,
					relativePath: s.relativePath,
					isForced: s.isForced,
					isHearingImpaired: s.isHearingImpaired,
					format: s.format,
					matchScore: s.matchScore,
					dateAdded: s.dateAdded
				})),
				subtitleStatus: {
					satisfied: subtitleStatus.satisfied,
					missing: subtitleStatus.missing,
					existing: subtitleStatus.existing
				}
			}
		});
	} catch (error) {
		logger.error('[API] Error fetching movie', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch movie'
			},
			{ status: 500 }
		);
	}
};

/**
 * PATCH /api/library/movies/[id]
 * Update movie settings (monitored, quality profile, etc.)
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const {
			monitored,
			scoringProfileId,
			minimumAvailability,
			rootFolderId,
			wantsSubtitles,
			languageProfileId
		} = body;

		// Capture current state before update (for subtitle trigger detection)
		const [currentMovie] = await db
			.select({
				wantsSubtitles: movies.wantsSubtitles,
				languageProfileId: movies.languageProfileId,
				hasFile: movies.hasFile
			})
			.from(movies)
			.where(eq(movies.id, params.id));

		const updateData: Record<string, unknown> = {};

		if (typeof monitored === 'boolean') {
			updateData.monitored = monitored;
		}
		if (scoringProfileId !== undefined) {
			updateData.scoringProfileId = scoringProfileId;
		}
		if (minimumAvailability) {
			updateData.minimumAvailability = minimumAvailability;
		}
		if (rootFolderId !== undefined) {
			updateData.rootFolderId = rootFolderId;
		}
		if (typeof wantsSubtitles === 'boolean') {
			updateData.wantsSubtitles = wantsSubtitles;
		}
		if (languageProfileId !== undefined) {
			updateData.languageProfileId = languageProfileId;
		}

		if (Object.keys(updateData).length === 0) {
			return json({ success: false, error: 'No valid fields to update' }, { status: 400 });
		}

		await db.update(movies).set(updateData).where(eq(movies.id, params.id));

		// Check if subtitle monitoring was just enabled
		if (currentMovie?.hasFile) {
			const wasEnabled = currentMovie.wantsSubtitles === true && currentMovie.languageProfileId;
			const newWantsSubtitles = wantsSubtitles ?? currentMovie.wantsSubtitles;
			const newProfileId = languageProfileId ?? currentMovie.languageProfileId;
			const isNowEnabled = newWantsSubtitles === true && newProfileId;

			// Trigger subtitle search if just enabled (wasn't before, is now)
			if (!wasEnabled && isNowEnabled) {
				const settings = await monitoringScheduler.getSettings();
				if (settings.subtitleSearchOnImportEnabled) {
					logger.info('[API] Subtitle monitoring enabled for movie, triggering search', {
						movieId: params.id
					});
					// Fire-and-forget: don't await
					searchSubtitlesForNewMedia('movie', params.id).catch((err) => {
						logger.warn('[API] Background subtitle search failed', {
							movieId: params.id,
							error: err instanceof Error ? err.message : String(err)
						});
					});
				}
			}
		}

		libraryMediaEvents.emitMovieUpdated(params.id);

		return json({ success: true });
	} catch (error) {
		logger.error('[API] Error updating movie', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update movie'
			},
			{ status: 500 }
		);
	}
};

// Alias PUT to PATCH for convenience
export const PUT: RequestHandler = PATCH;

/**
 * DELETE /api/library/movies/[id]
 * Delete files for a movie (keeps metadata, marks as missing)
 * With removeFromLibrary=true, removes the movie entirely from the database
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const deleteFiles = url.searchParams.get('deleteFiles') === 'true';
		const removeFromLibrary = url.searchParams.get('removeFromLibrary') === 'true';

		// Get movie with root folder info
		const [movie] = await db
			.select({
				id: movies.id,
				path: movies.path,
				hasFile: movies.hasFile,
				rootFolderPath: rootFolders.path,
				rootFolderReadOnly: rootFolders.readOnly
			})
			.from(movies)
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.where(eq(movies.id, params.id));

		if (!movie) {
			return json({ success: false, error: 'Movie not found' }, { status: 404 });
		}

		// Get all files for this movie
		const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, params.id));

		// Only require files if not removing from library entirely
		if (files.length === 0 && !removeFromLibrary) {
			return json({ success: false, error: 'Movie has no files to delete' }, { status: 400 });
		}

		// Block file deletion from read-only folders
		if (deleteFiles && movie.rootFolderReadOnly) {
			return json(
				{ success: false, error: 'Cannot delete files from read-only folder' },
				{ status: 400 }
			);
		}

		// Delete files from disk if requested
		if (deleteFiles && movie.rootFolderPath && movie.path) {
			for (const file of files) {
				const fullPath = join(movie.rootFolderPath, movie.path, file.relativePath);
				try {
					await unlink(fullPath);
					logger.debug('[API] Deleted file', { fullPath });
				} catch {
					logger.warn('[API] Could not delete file', { fullPath });
				}
			}

			// Try to remove the movie folder if it's empty
			const movieFolder = join(movie.rootFolderPath, movie.path);
			try {
				await rmdir(movieFolder);
				logger.debug('[API] Removed movie folder', { movieFolder });
			} catch {
				// Folder not empty or doesn't exist - that's fine
			}
		}

		// Delete movie file records from database
		if (files.length > 0) {
			await db.delete(movieFiles).where(eq(movieFiles.movieId, params.id));
		}

		if (removeFromLibrary) {
			// Preserve activity audit trail after media row is deleted (FKs become null on delete)
			await db
				.update(downloadHistory)
				.set({ status: 'removed', statusReason: null })
				.where(eq(downloadHistory.movieId, params.id));

			// Delete alternate titles (not cascaded automatically)
			await deleteAllAlternateTitles('movie', params.id);

			// Delete the movie from database - CASCADE will handle:
			// - subtitles, downloadQueue, pendingReleases, blocklist, etc.
			await db.delete(movies).where(eq(movies.id, params.id));
			libraryMediaEvents.emitMovieUpdated(params.id);

			logger.info('[API] Removed movie from library', { movieId: params.id });
			return json({ success: true, removed: true });
		} else {
			// Update movie to show as missing
			await db
				.update(movies)
				.set({ hasFile: false, lastSearchTime: null })
				.where(eq(movies.id, params.id));
			libraryMediaEvents.emitMovieUpdated(params.id);

			// Note: Movie metadata is kept - it will show as "missing"
			return json({ success: true });
		}
	} catch (error) {
		logger.error('[API] Error deleting movie files', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete movie files'
			},
			{ status: 500 }
		);
	}
};

// Import for static method access
import { MediaInfoService } from '$lib/server/library/index.js';
