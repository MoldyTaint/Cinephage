import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	downloadHistory,
	series,
	seasons,
	episodes,
	episodeFiles,
	rootFolders
} from '$lib/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { unlink, rmdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '$lib/logging';
import { deleteAllAlternateTitles } from '$lib/server/services/index.js';

/**
 * PATCH /api/library/series/batch
 * Batch update series settings (monitored, scoringProfileId)
 *
 * Body:
 * - seriesIds: string[] - Array of series IDs to update
 * - updates: { monitored?: boolean, scoringProfileId?: string | null }
 */
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { seriesIds, updates } = body;

		if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
			return json(
				{ success: false, error: 'seriesIds array is required and must not be empty' },
				{ status: 400 }
			);
		}

		if (!updates || typeof updates !== 'object') {
			return json({ success: false, error: 'updates object is required' }, { status: 400 });
		}

		const updateData: Record<string, unknown> = {};

		if (typeof updates.monitored === 'boolean') {
			updateData.monitored = updates.monitored;
		}

		if (updates.scoringProfileId !== undefined) {
			updateData.scoringProfileId = updates.scoringProfileId;
		}

		if (Object.keys(updateData).length === 0) {
			return json({ success: false, error: 'No valid fields to update' }, { status: 400 });
		}

		const result = await db.update(series).set(updateData).where(inArray(series.id, seriesIds));

		return json({
			success: true,
			updatedCount: result.changes
		});
	} catch (error) {
		logger.error('[API] Error batch updating series', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to batch update series'
			},
			{ status: 500 }
		);
	}
};

// Alias PUT to PATCH for convenience
export const PUT: RequestHandler = PATCH;

/**
 * DELETE /api/library/series/batch
 * Batch delete series files
 *
 * Body:
 * - seriesIds: string[] - Array of series IDs to delete files for
 * - deleteFiles?: boolean - Whether to delete files from disk (default: false)
 * - removeFromLibrary?: boolean - Whether to remove series from library entirely (default: false)
 */
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { seriesIds, deleteFiles = false, removeFromLibrary = false } = body;

		if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
			return json(
				{ success: false, error: 'seriesIds array is required and must not be empty' },
				{ status: 400 }
			);
		}

		let deletedCount = 0;
		let removedCount = 0;
		let skippedCount = 0;
		const errors: Array<{ id: string; error: string }> = [];

		for (const seriesId of seriesIds) {
			try {
				// Get series with root folder info
				const [seriesItem] = await db
					.select({
						id: series.id,
						path: series.path,
						rootFolderPath: rootFolders.path,
						rootFolderReadOnly: rootFolders.readOnly
					})
					.from(series)
					.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
					.where(eq(series.id, seriesId));

				if (!seriesItem) {
					errors.push({ id: seriesId, error: 'Series not found' });
					continue;
				}

				// Get files for this series
				const files = await db
					.select()
					.from(episodeFiles)
					.where(eq(episodeFiles.seriesId, seriesId));

				// Skip if no files and not removing from library
				if (files.length === 0 && !removeFromLibrary) {
					skippedCount++;
					continue;
				}

				// Block file deletion from read-only folders
				if (deleteFiles && seriesItem.rootFolderReadOnly) {
					errors.push({ id: seriesId, error: 'Cannot delete files from read-only folder' });
					continue;
				}

				// Delete files from disk if requested
				if (deleteFiles && seriesItem.rootFolderPath && seriesItem.path) {
					for (const file of files) {
						const fullPath = join(seriesItem.rootFolderPath, seriesItem.path, file.relativePath);
						try {
							await unlink(fullPath);
						} catch {
							// File may not exist, continue anyway
						}
					}

					// Try to remove empty season folders and the series folder
					const seriesFolder = join(seriesItem.rootFolderPath, seriesItem.path);
					try {
						const entries = await readdir(seriesFolder, { withFileTypes: true });
						for (const entry of entries) {
							if (entry.isDirectory()) {
								try {
									await rmdir(join(seriesFolder, entry.name));
								} catch {
									// Not empty
								}
							}
						}
						await rmdir(seriesFolder);
					} catch {
						// Folder not empty or doesn't exist
					}
				}

				// Delete all episode file records from database
				if (files.length > 0) {
					await db.delete(episodeFiles).where(eq(episodeFiles.seriesId, seriesId));
				}

				if (removeFromLibrary) {
					// Preserve activity audit trail after media rows are deleted (FKs become null on delete)
					await db
						.update(downloadHistory)
						.set({ status: 'removed', statusReason: null })
						.where(eq(downloadHistory.seriesId, seriesId));

					// Delete alternate titles (not cascaded automatically)
					await deleteAllAlternateTitles('series', seriesId);

					// Delete the series from database - CASCADE will handle related records
					await db.delete(series).where(eq(series.id, seriesId));
					removedCount++;
				} else {
					// Update all episodes to hasFile=false
					await db.update(episodes).set({ hasFile: false }).where(eq(episodes.seriesId, seriesId));

					// Update all seasons' episode file count to 0
					await db
						.update(seasons)
						.set({ episodeFileCount: 0 })
						.where(eq(seasons.seriesId, seriesId));

					// Update series episode file count
					await db.update(series).set({ episodeFileCount: 0 }).where(eq(series.id, seriesId));

					deletedCount++;
				}
			} catch (error) {
				errors.push({
					id: seriesId,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		return json({
			success: errors.length === 0,
			deletedCount,
			removedCount,
			skippedCount,
			failedCount: errors.length,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (error) {
		logger.error(
			'[API] Error batch deleting series files',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to batch delete series files'
			},
			{ status: 500 }
		);
	}
};
