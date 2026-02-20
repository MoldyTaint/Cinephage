import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { movies, movieFiles, rootFolders } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { unlink, rmdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from '$lib/logging';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';

/**
 * DELETE /api/library/movies/[id]/files/[fileId]
 * Delete a specific file from a movie
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { id: movieId, fileId } = params;

		// Get file with movie and root folder info
		const [file] = await db
			.select({
				id: movieFiles.id,
				relativePath: movieFiles.relativePath,
				movieId: movieFiles.movieId,
				moviePath: movies.path,
				rootFolderPath: rootFolders.path,
				rootFolderReadOnly: rootFolders.readOnly
			})
			.from(movieFiles)
			.innerJoin(movies, eq(movieFiles.movieId, movies.id))
			.leftJoin(rootFolders, eq(movies.rootFolderId, rootFolders.id))
			.where(and(eq(movieFiles.id, fileId), eq(movieFiles.movieId, movieId)));

		if (!file) {
			return json({ success: false, error: 'File not found' }, { status: 404 });
		}

		// Block deletion from read-only folders
		if (file.rootFolderReadOnly) {
			return json(
				{ success: false, error: 'Cannot delete files from read-only folder' },
				{ status: 400 }
			);
		}

		// Delete file from disk
		if (file.rootFolderPath && file.moviePath && file.relativePath) {
			const fullPath = join(file.rootFolderPath, file.moviePath, file.relativePath);
			try {
				await unlink(fullPath);
				logger.debug('[API] Deleted movie file', { fullPath });
			} catch {
				logger.warn('[API] Could not delete movie file from disk', { fullPath });
			}

			// Try to remove empty parent directories up to movie folder
			const movieFolder = join(file.rootFolderPath, file.moviePath);
			const fileDir = dirname(fullPath);
			if (fileDir !== movieFolder) {
				try {
					await rmdir(fileDir);
					logger.debug('[API] Removed empty directory', { fileDir });
				} catch {
					// Directory not empty or doesn't exist
				}
			}
		}

		// Delete file record from database
		await db.delete(movieFiles).where(eq(movieFiles.id, fileId));

		// Check if movie has any remaining files and update hasFile flag
		const remainingFiles = await db
			.select({ id: movieFiles.id })
			.from(movieFiles)
			.where(eq(movieFiles.movieId, movieId))
			.limit(1);

		if (remainingFiles.length === 0) {
			await db
				.update(movies)
				.set({ hasFile: false, lastSearchTime: null })
				.where(eq(movies.id, movieId));
		}

		libraryMediaEvents.emitMovieUpdated(movieId);

		return json({ success: true });
	} catch (error) {
		logger.error('[API] Error deleting movie file', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete file'
			},
			{ status: 500 }
		);
	}
};
