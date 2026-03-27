import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	downloadHistory,
	downloadQueue,
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
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager.js';
import { deleteAllAlternateTitles } from '$lib/server/services/index.js';
import { deleteDirectoryWithinRoot } from '$lib/server/filesystem/delete-helpers.js';
import { logger } from '$lib/logging';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import { tmdb } from '$lib/server/tmdb.js';
import { movieUpdateSchema } from '$lib/validation/schemas';
import { parseBody } from '$lib/server/api/validate.js';
import {
	validateRootFolder,
	getAnimeSubtypeEnforcement
} from '$lib/server/library/LibraryAddService.js';
import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';

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
				logger.warn(
					{
						movieId: movie.id,
						tmdbId: movie.tmdbId,
						error: err instanceof Error ? err.message : String(err)
					},
					'[API] Failed to fetch movie release info'
				);
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
					providerId: s.providerId,
					dateAdded: s.dateAdded,
					wasSynced: s.wasSynced,
					syncOffset: s.syncOffset
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
	const body = await parseBody(request, movieUpdateSchema);

	// Capture current state before update (for subtitle trigger detection)
	const [currentMovie] = await db
		.select({
			tmdbId: movies.tmdbId,
			title: movies.title,
			rootFolderId: movies.rootFolderId,
			wantsSubtitles: movies.wantsSubtitles,
			languageProfileId: movies.languageProfileId,
			hasFile: movies.hasFile
		})
		.from(movies)
		.where(eq(movies.id, params.id));

	const updateData: Record<string, unknown> = {};

	if (body.monitored !== undefined) {
		updateData.monitored = body.monitored;
	}
	if (body.scoringProfileId !== undefined) {
		updateData.scoringProfileId = body.scoringProfileId;
	}
	if (body.minimumAvailability !== undefined) {
		updateData.minimumAvailability = body.minimumAvailability;
	}
	if (body.rootFolderId !== undefined) {
		const nextRootFolderId = body.rootFolderId === '' ? null : body.rootFolderId;
		const currentRootFolderId = currentMovie?.rootFolderId ?? null;

		// Only validate/apply when reassignment is requested.
		if (nextRootFolderId !== currentRootFolderId) {
			if (nextRootFolderId === null) {
				updateData.rootFolderId = null;
			} else {
				const enforceAnimeSubtype = await getAnimeSubtypeEnforcement();
				let isAnimeMedia = false;
				if (enforceAnimeSubtype && currentMovie) {
					const movieDetails = await tmdb.getMovie(currentMovie.tmdbId);
					isAnimeMedia = isLikelyAnimeMedia({
						genres: movieDetails.genres,
						originalLanguage: movieDetails.original_language,
						originCountries: movieDetails.production_countries?.map(
							(country) => country.iso_3166_1
						),
						productionCountries: movieDetails.production_countries,
						title: movieDetails.title,
						originalTitle: movieDetails.original_title
					});
				}

				await validateRootFolder(nextRootFolderId, 'movie', {
					enforceAnimeSubtype,
					isAnimeMedia,
					mediaTitle: currentMovie?.title
				});
				updateData.rootFolderId = nextRootFolderId;
			}
		}
	}
	if (body.wantsSubtitles !== undefined) {
		updateData.wantsSubtitles = body.wantsSubtitles;
	}
	if (body.languageProfileId !== undefined) {
		updateData.languageProfileId = body.languageProfileId;
	}

	await db.update(movies).set(updateData).where(eq(movies.id, params.id));

	// Check if subtitle monitoring was just enabled
	if (currentMovie?.hasFile) {
		const wasEnabled = currentMovie.wantsSubtitles === true && currentMovie.languageProfileId;
		const newWantsSubtitles = body.wantsSubtitles ?? currentMovie.wantsSubtitles;
		const newProfileId = body.languageProfileId ?? currentMovie.languageProfileId;
		const isNowEnabled = newWantsSubtitles === true && newProfileId;

		// Trigger subtitle search if just enabled (wasn't before, is now)
		if (!wasEnabled && isNowEnabled) {
			const settings = await monitoringScheduler.getSettings();
			if (settings.subtitleSearchOnImportEnabled) {
				logger.info(
					{
						movieId: params.id
					},
					'[API] Subtitle monitoring enabled for movie, triggering search'
				);
				// Fire-and-forget: don't await
				searchSubtitlesForNewMedia('movie', params.id).catch((err) => {
					logger.warn(
						{
							movieId: params.id,
							error: err instanceof Error ? err.message : String(err)
						},
						'[API] Background subtitle search failed'
					);
				});
			}
		}
	}

	libraryMediaEvents.emitMovieUpdated(params.id);

	return json({ success: true });
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
			const movieFolder = await deleteDirectoryWithinRoot(movie.rootFolderPath, movie.path);
			logger.debug({ movieFolder }, '[API] Removed movie folder and all contents');
		}

		// Delete movie file records from database
		if (files.length > 0) {
			await db.delete(movieFiles).where(eq(movieFiles.movieId, params.id));
		}

		if (removeFromLibrary) {
			// Cancel active downloads from client before removing
			const activeQueueItems = await db
				.select()
				.from(downloadQueue)
				.where(eq(downloadQueue.movieId, params.id));

			for (const queueItem of activeQueueItems) {
				if (queueItem.downloadClientId) {
					try {
						const isTorrent = queueItem.protocol === 'torrent';
						const clientDownloadId = isTorrent
							? queueItem.infoHash || queueItem.downloadId
							: queueItem.downloadId || queueItem.infoHash;
						if (clientDownloadId) {
							const clientInstance = await getDownloadClientManager().getClientInstance(
								queueItem.downloadClientId
							);
							if (clientInstance) {
								await clientInstance.removeDownload(clientDownloadId, true);
							}
						}
					} catch (err) {
						logger.warn(
							{
								queueItemId: queueItem.id,
								error: err instanceof Error ? err.message : 'Unknown'
							},
							'[API] Failed to remove download from client'
						);
					}
				}
				// Delete queue record
				await db.delete(downloadQueue).where(eq(downloadQueue.id, queueItem.id));
			}

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

			logger.info({ movieId: params.id }, '[API] Removed movie from library');
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
