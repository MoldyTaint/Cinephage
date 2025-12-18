/**
 * PendingReleaseTask
 *
 * Processes releases that have been waiting for their delay period to expire.
 * Part of the delay profiles feature that allows waiting for better releases.
 *
 * Runs periodically to:
 * 1. Check for pending releases past their processAt time
 * 2. Verify the release is still the best option
 * 3. Grab the release if appropriate
 * 4. Clean up expired/superseded entries
 */

import { db } from '$lib/server/db/index.js';
import { pendingReleases, movies, series, episodes } from '$lib/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager.js';
import { delayProfileService } from '../specifications/DelaySpecification.js';
import { blocklistService } from '../specifications/BlocklistSpecification.js';
import { logger } from '$lib/logging/index.js';
import type { TaskResult } from '../MonitoringScheduler.js';
import type { TaskExecutionContext } from '$lib/server/tasks/TaskExecutionContext.js';

/**
 * Statistics for pending release processing
 */
interface ProcessingStats {
	processed: number;
	grabbed: number;
	expired: number;
	superseded: number;
	failed: number;
}

/**
 * Execute the pending release processing task
 * @param ctx - Execution context for cancellation support and activity tracking
 */
export async function executePendingReleaseTask(
	ctx: TaskExecutionContext | null
): Promise<TaskResult> {
	const startTime = Date.now();
	const taskHistoryId = ctx?.historyId;
	logger.info('[PendingReleaseTask] Starting pending release processing', { taskHistoryId });

	const stats: ProcessingStats = {
		processed: 0,
		grabbed: 0,
		expired: 0,
		superseded: 0,
		failed: 0
	};

	try {
		// Check for cancellation before starting
		ctx?.checkCancelled();

		// Get releases ready to process
		const readyReleases = await delayProfileService.getReadyReleases();
		logger.info('[PendingReleaseTask] Found ready releases', { count: readyReleases.length });

		// Process releases with cancellation support
		const releases = ctx ? ctx.iterate(readyReleases) : readyReleases;
		for await (const release of releases) {
			stats.processed++;

			try {
				const result = await processRelease(release);
				if (result.grabbed) {
					stats.grabbed++;
				} else if (result.expired) {
					stats.expired++;
				} else if (result.superseded) {
					stats.superseded++;
				}
			} catch (error) {
				stats.failed++;
				logger.error('[PendingReleaseTask] Failed to process release', {
					id: release.id,
					title: release.title,
					error
				});
			}
		}

		// Cleanup old releases (older than 72 hours)
		await delayProfileService.cleanupOldReleases(72);

		const duration = Date.now() - startTime;
		logger.info('[PendingReleaseTask] Completed', { stats, durationMs: duration });

		return {
			taskType: 'pendingRelease',
			itemsProcessed: stats.processed,
			itemsGrabbed: stats.grabbed,
			errors: stats.failed,
			executedAt: new Date(startTime)
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error('[PendingReleaseTask] Task failed', { error: message, durationMs: duration });

		return {
			taskType: 'pendingRelease',
			itemsProcessed: stats.processed,
			itemsGrabbed: stats.grabbed,
			errors: stats.failed + 1,
			executedAt: new Date(startTime)
		};
	}
}

/**
 * Process a single pending release
 */
async function processRelease(
	release: typeof pendingReleases.$inferSelect
): Promise<{ grabbed: boolean; expired: boolean; superseded: boolean }> {
	const result = { grabbed: false, expired: false, superseded: false };

	// Check if content still exists and needs the file
	if (release.movieId) {
		const movie = await db.query.movies.findFirst({
			where: eq(movies.id, release.movieId)
		});

		if (!movie) {
			logger.debug('[PendingReleaseTask] Movie no longer exists, expiring release', {
				releaseId: release.id
			});
			await delayProfileService.markAsExpired(release.id);
			result.expired = true;
			return result;
		}

		// Check if movie already has a file
		if (movie.hasFile) {
			logger.debug('[PendingReleaseTask] Movie already has file, expiring release', {
				releaseId: release.id,
				movieId: movie.id
			});
			await delayProfileService.markAsExpired(release.id);
			result.expired = true;
			return result;
		}

		// Check if not monitored anymore
		if (!movie.monitored) {
			logger.debug('[PendingReleaseTask] Movie no longer monitored, expiring release', {
				releaseId: release.id
			});
			await delayProfileService.markAsExpired(release.id);
			result.expired = true;
			return result;
		}
	}

	if (release.seriesId) {
		const seriesData = await db.query.series.findFirst({
			where: eq(series.id, release.seriesId)
		});

		if (!seriesData) {
			logger.debug('[PendingReleaseTask] Series no longer exists, expiring release', {
				releaseId: release.id
			});
			await delayProfileService.markAsExpired(release.id);
			result.expired = true;
			return result;
		}

		// Check episode status if episode IDs provided
		if (release.episodeIds && release.episodeIds.length > 0) {
			const episodeData = await db.query.episodes.findMany({
				where: inArray(episodes.id, release.episodeIds)
			});

			// Check if all episodes already have files
			const allHaveFiles = episodeData.every((e) => e.hasFile);
			if (allHaveFiles) {
				logger.debug('[PendingReleaseTask] All episodes already have files, expiring release', {
					releaseId: release.id
				});
				await delayProfileService.markAsExpired(release.id);
				result.expired = true;
				return result;
			}
		}
	}

	// Check blocklist
	const blocklistResult = await blocklistService.isBlocklisted(
		{
			title: release.title,
			score: release.score,
			infoHash: release.infoHash ?? undefined
		},
		{
			movieId: release.movieId ?? undefined,
			seriesId: release.seriesId ?? undefined
		}
	);

	if (blocklistResult.blocked) {
		logger.debug('[PendingReleaseTask] Release is now blocklisted, expiring', {
			releaseId: release.id,
			reason: blocklistResult.reason
		});
		await delayProfileService.markAsExpired(release.id);
		result.expired = true;
		return result;
	}

	// Try to grab the release
	const grabResult = await grabPendingRelease(release);

	if (grabResult.success) {
		await delayProfileService.markAsGrabbed(release.id);
		result.grabbed = true;
		logger.info('[PendingReleaseTask] Successfully grabbed pending release', {
			releaseId: release.id,
			title: release.title
		});
	} else {
		// If grab failed, add to blocklist and expire
		await blocklistService.addToBlocklist(
			{
				title: release.title,
				infoHash: release.infoHash ?? undefined,
				indexerId: release.indexerId ?? undefined,
				quality: release.quality ?? undefined,
				size: release.size ?? undefined,
				protocol: release.protocol
			},
			{
				movieId: release.movieId ?? undefined,
				seriesId: release.seriesId ?? undefined,
				episodeIds: release.episodeIds ?? undefined,
				reason: 'download_failed',
				message: grabResult.error,
				expiresInHours: 24 // Short expiry for transient errors
			}
		);

		await delayProfileService.markAsExpired(release.id);
		result.expired = true;
		logger.warn('[PendingReleaseTask] Failed to grab pending release, blocklisted', {
			releaseId: release.id,
			error: grabResult.error
		});
	}

	return result;
}

/**
 * Attempt to grab a pending release
 */
async function grabPendingRelease(
	release: typeof pendingReleases.$inferSelect
): Promise<{ success: boolean; error?: string }> {
	try {
		const downloadClientManager = await getDownloadClientManager();

		// Get enabled torrent clients (we only support torrent for now)
		// TODO: Add usenet client support
		if (release.protocol === 'usenet') {
			return { success: false, error: 'Usenet downloads not yet supported' };
		}

		const enabledClients = await downloadClientManager.getEnabledClients();
		if (enabledClients.length === 0) {
			return { success: false, error: 'No enabled download clients' };
		}

		// Use first enabled client
		const { client, instance } = enabledClients[0];
		const category = release.movieId ? client.movieCategory || 'movies' : client.tvCategory || 'tv';

		// Build download options
		const downloadOptions = {
			magnetUri: release.magnetUrl ?? undefined,
			downloadUrl: release.downloadUrl ?? undefined,
			infoHash: release.infoHash ?? undefined,
			category
		};

		// Add the download
		if (release.magnetUrl) {
			await instance.addDownload({ ...downloadOptions, magnetUri: release.magnetUrl });
		} else if (release.downloadUrl) {
			await instance.addDownload({ ...downloadOptions, downloadUrl: release.downloadUrl });
		} else {
			return { success: false, error: 'No download URL or magnet for release' };
		}

		logger.info('[PendingReleaseTask] Successfully sent to download client', {
			title: release.title,
			client: client.name
		});

		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return { success: false, error: message };
	}
}
