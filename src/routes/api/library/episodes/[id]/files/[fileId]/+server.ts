import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { episodes, episodeFiles, series, rootFolders } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { unlink, rmdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from '$lib/logging';

/**
 * DELETE /api/library/episodes/[id]/files/[fileId]
 * Delete a specific file associated with an episode
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { id: episodeId, fileId } = params;

		// Get the episode to verify it exists
		const [episode] = await db
			.select({ id: episodes.id, seriesId: episodes.seriesId })
			.from(episodes)
			.where(eq(episodes.id, episodeId));

		if (!episode) {
			return json({ success: false, error: 'Episode not found' }, { status: 404 });
		}

		// Get file with series and root folder info
		const [file] = await db
			.select({
				id: episodeFiles.id,
				relativePath: episodeFiles.relativePath,
				seriesId: episodeFiles.seriesId,
				episodeIds: episodeFiles.episodeIds,
				seriesPath: series.path,
				rootFolderPath: rootFolders.path,
				rootFolderReadOnly: rootFolders.readOnly
			})
			.from(episodeFiles)
			.innerJoin(series, eq(episodeFiles.seriesId, series.id))
			.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
			.where(eq(episodeFiles.id, fileId));

		if (!file) {
			return json({ success: false, error: 'File not found' }, { status: 404 });
		}

		// Verify this file is associated with the episode
		const fileEpisodeIds = file.episodeIds || [];
		if (!fileEpisodeIds.includes(episodeId)) {
			return json(
				{ success: false, error: 'File is not associated with this episode' },
				{ status: 400 }
			);
		}

		// Block deletion from read-only folders
		if (file.rootFolderReadOnly) {
			return json(
				{ success: false, error: 'Cannot delete files from read-only folder' },
				{ status: 400 }
			);
		}

		// Delete file from disk
		if (file.rootFolderPath && file.seriesPath && file.relativePath) {
			const fullPath = join(file.rootFolderPath, file.seriesPath, file.relativePath);
			try {
				await unlink(fullPath);
				logger.debug('[API] Deleted episode file', { fullPath });
			} catch {
				logger.warn('[API] Could not delete episode file from disk', { fullPath });
			}

			// Try to remove empty parent directories up to series folder
			const seriesFolder = join(file.rootFolderPath, file.seriesPath);
			let currentDir = dirname(fullPath);
			while (currentDir !== seriesFolder && currentDir.startsWith(seriesFolder)) {
				try {
					await rmdir(currentDir);
					logger.debug('[API] Removed empty directory', { dir: currentDir });
					currentDir = dirname(currentDir);
				} catch {
					// Directory not empty or doesn't exist
					break;
				}
			}
		}

		// Delete file record from database
		await db.delete(episodeFiles).where(eq(episodeFiles.id, fileId));

		// Update hasFile for all episodes that were covered by this file
		if (fileEpisodeIds.length > 0) {
			// Get all remaining files for this series
			const remainingFiles = await db
				.select({ episodeIds: episodeFiles.episodeIds })
				.from(episodeFiles)
				.where(eq(episodeFiles.seriesId, file.seriesId));

			// For each episode, check if it still has any files
			for (const epId of fileEpisodeIds) {
				const stillHasFile = remainingFiles.some(
					(f) => f.episodeIds && f.episodeIds.includes(epId)
				);

				if (!stillHasFile) {
					await db
						.update(episodes)
						.set({ hasFile: false, lastSearchTime: null })
						.where(eq(episodes.id, epId));
				}
			}
		}

		return json({ success: true });
	} catch (error) {
		logger.error('[API] Error deleting episode file', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete file'
			},
			{ status: 500 }
		);
	}
};
