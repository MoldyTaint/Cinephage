import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { importService } from '$lib/server/downloadClients/import';
import { db } from '$lib/server/db';
import { movies, movieFiles, rootFolders, downloadQueue, subtitles } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';
import type { LibraryMovie, MovieFile } from '$lib/types/library';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';

interface QueueItem {
	id: string;
	title: string;
	status: string;
	progress?: string;
}

interface FileImportedEvent {
	mediaType: 'movie';
	movieId: string;
	file: {
		id: string;
		relativePath: string;
		size: number;
		dateAdded: string;
		sceneName?: string;
		releaseGroup?: string;
		quality: MovieFile['quality'];
		mediaInfo: MovieFile['mediaInfo'];
		edition?: string;
	};
	wasUpgrade: boolean;
	replacedFileIds?: string[];
}

interface FileDeletedEvent {
	mediaType: 'movie';
	movieId: string;
	fileId: string;
}

/**
 * Get movie data for SSE initial state
 */
async function getMovieData(movieId: string): Promise<LibraryMovie | null> {
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
			monitored: movies.monitored,
			minimumAvailability: movies.minimumAvailability,
			wantsSubtitles: movies.wantsSubtitles,
			added: movies.added,
			hasFile: movies.hasFile
		})
		.from(movies)
		.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
		.where(eq(movies.id, movieId));

	if (!movie) return null;

	const files = await db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId));

	const movieSubtitles = await db
		.select({
			id: subtitles.id,
			language: subtitles.language,
			isForced: subtitles.isForced,
			isHearingImpaired: subtitles.isHearingImpaired,
			format: subtitles.format
		})
		.from(subtitles)
		.where(eq(subtitles.movieId, movieId));

	return {
		...movie,
		added: movie.added ?? new Date().toISOString(),
		files: files.map((f) => ({
			id: f.id,
			relativePath: f.relativePath,
			size: f.size,
			dateAdded: f.dateAdded,
			quality: f.quality as MovieFile['quality'],
			mediaInfo: f.mediaInfo as MovieFile['mediaInfo'],
			releaseGroup: f.releaseGroup,
			edition: f.edition
		})),
		subtitles: movieSubtitles.map((s) => ({
			id: s.id,
			language: s.language,
			isForced: s.isForced ?? undefined,
			isHearingImpaired: s.isHearingImpaired ?? undefined,
			format: s.format ?? undefined
		}))
	};
}

/**
 * Get active queue item for movie
 */
async function getQueueItem(movieId: string): Promise<QueueItem | null> {
	const [queueItem] = await db
		.select({
			id: downloadQueue.id,
			title: downloadQueue.title,
			status: downloadQueue.status,
			progress: downloadQueue.progress
		})
		.from(downloadQueue)
		.where(and(eq(downloadQueue.movieId, movieId), eq(downloadQueue.status, 'downloading')));

	if (!queueItem) return null;

	return {
		id: queueItem.id,
		title: queueItem.title,
		status: queueItem.status ?? 'queued',
		progress: queueItem.progress ?? undefined
	};
}

/**
 * Server-Sent Events endpoint for real-time movie detail updates
 *
 * Events emitted:
 * - media:initial - Full movie state on connect
 * - queue:updated - Queue item progress/status change
 * - file:added - New file imported
 * - file:removed - File deleted
 * - media:updated - Movie metadata changes (from other sources)
 */
export const GET: RequestHandler = async ({ params }) => {
	const movieId = params.id;

	if (!movieId) {
		return new Response('Movie ID is required', { status: 400 });
	}

	return createSSEStream((send) => {
		// Send initial state
		const sendInitialState = async () => {
			try {
				const [movie, queueItem] = await Promise.all([
					getMovieData(movieId),
					getQueueItem(movieId)
				]);

				if (movie) {
					send('media:initial', { movie, queueItem });
				}
			} catch {
				// Error fetching initial state
			}
		};

		// Send initial state immediately
		sendInitialState();

		// Handle queue updates for this movie
		const onQueueUpdated = (item: unknown) => {
			const typedItem = item as QueueItem & { movieId?: string };
			if (typedItem.movieId === movieId) {
				send('queue:updated', {
					id: typedItem.id,
					title: typedItem.title,
					status: typedItem.status,
					progress: typedItem.progress ? parseFloat(typedItem.progress) : null
				});
			}
		};

		// Handle file imports for this movie
		const onFileImported = (data: unknown) => {
			const typedData = data as FileImportedEvent;
			if (typedData.mediaType === 'movie' && typedData.movieId === movieId) {
				send('file:added', {
					file: typedData.file,
					wasUpgrade: typedData.wasUpgrade,
					replacedFileIds: typedData.replacedFileIds
				});

				// If files were replaced, send deletion events
				if (typedData.replacedFileIds) {
					for (const replacedId of typedData.replacedFileIds) {
						send('file:removed', { fileId: replacedId });
					}
				}
			}
		};

		// Handle file deletions for this movie
		const onFileDeleted = (data: unknown) => {
			const typedData = data as FileDeletedEvent;
			if (typedData.mediaType === 'movie' && typedData.movieId === movieId) {
				send('file:removed', { fileId: typedData.fileId });
			}
		};

		// Handle metadata/subtitle/settings updates for this movie
		const onMovieUpdated = (event: { movieId: string }) => {
			if (event.movieId === movieId) {
				sendInitialState();
			}
		};

		// Register handlers
		downloadMonitor.on('queue:updated', onQueueUpdated);
		importService.on('file:imported', onFileImported);
		importService.on('file:deleted', onFileDeleted);
		libraryMediaEvents.onMovieUpdated(onMovieUpdated);

		// Return cleanup function
		return () => {
			downloadMonitor.off('queue:updated', onQueueUpdated);
			importService.off('file:imported', onFileImported);
			importService.off('file:deleted', onFileDeleted);
			libraryMediaEvents.offMovieUpdated(onMovieUpdated);
		};
	});
};
