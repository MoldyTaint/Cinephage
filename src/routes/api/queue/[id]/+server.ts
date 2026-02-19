import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	downloadQueue,
	downloadHistory,
	movies,
	series,
	downloadClients
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getDownloadClientManager } from '$lib/server/downloadClients/DownloadClientManager';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { logger } from '$lib/logging';

/**
 * GET - Get a single queue item by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		const queueItem = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).get();

		if (!queueItem) {
			throw error(404, 'Queue item not found');
		}

		// Get associated media info
		let mediaInfo = null;
		if (queueItem.movieId) {
			const movie = await db
				.select({ id: movies.id, title: movies.title, year: movies.year })
				.from(movies)
				.where(eq(movies.id, queueItem.movieId))
				.get();
			mediaInfo = { type: 'movie', ...movie };
		} else if (queueItem.seriesId) {
			const seriesData = await db
				.select({ id: series.id, title: series.title, year: series.year })
				.from(series)
				.where(eq(series.id, queueItem.seriesId))
				.get();
			mediaInfo = { type: 'series', ...seriesData };
		}

		// Get download client info
		let clientInfo = null;
		if (queueItem.downloadClientId) {
			const client = await db
				.select({
					id: downloadClients.id,
					name: downloadClients.name,
					implementation: downloadClients.implementation
				})
				.from(downloadClients)
				.where(eq(downloadClients.id, queueItem.downloadClientId))
				.get();
			clientInfo = client;
		}

		return json({
			...queueItem,
			media: mediaInfo,
			downloadClient: clientInfo
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		logger.error('Error fetching queue item', err instanceof Error ? err : undefined);
		throw error(500, 'Failed to fetch queue item');
	}
};

/**
 * PATCH - Update a queue item (e.g., pause, resume, change priority)
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	try {
		const body = await request.json();
		const { action } = body as { action?: string };

		// Verify item exists
		const queueItem = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).get();

		if (!queueItem) {
			throw error(404, 'Queue item not found');
		}

		// Handle different actions using downloadMonitor which emits SSE events
		if (action === 'pause') {
			await downloadMonitor.pauseDownload(id);
			return json({ success: true, action: 'paused' });
		}

		if (action === 'resume') {
			await downloadMonitor.resumeDownload(id);
			return json({ success: true, action: 'resumed' });
		}

		throw error(400, 'No valid action specified');
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		logger.error('Error updating queue item', err instanceof Error ? err : undefined);
		throw error(500, 'Failed to update queue item');
	}
};

/**
 * DELETE - Remove a queue item from queue and optionally from download client
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	const removeFromClient = url.searchParams.get('removeFromClient') !== 'false';
	const deleteFiles = url.searchParams.get('deleteFiles') === 'true';
	const addToBlocklist = url.searchParams.get('blocklist') === 'true';

	try {
		// Get queue item
		const queueItem = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).get();

		if (!queueItem) {
			throw error(404, 'Queue item not found');
		}

		// Remove from download client first (required when removeFromClient=true).
		if (removeFromClient) {
			if (!queueItem.downloadClientId) {
				throw error(400, 'Queue item is missing a download client');
			}

			// Torrents usually use infoHash while usenet clients use downloadId (e.g. nzo_id).
			const isTorrent = queueItem.protocol === 'torrent';
			const clientDownloadId = isTorrent
				? queueItem.infoHash || queueItem.downloadId
				: queueItem.downloadId || queueItem.infoHash;
			if (!clientDownloadId) {
				throw error(400, 'Queue item is missing a client download identifier');
			}

			const clientInstance = await getDownloadClientManager().getClientInstance(
				queueItem.downloadClientId
			);
			if (!clientInstance) {
				throw error(503, 'Download client is unavailable');
			}

			await clientInstance.removeDownload(clientDownloadId, deleteFiles);
		}

		// Add to blocklist if requested
		// Note: Blocklist table not yet implemented - would store infoHash to prevent re-downloading
		if (addToBlocklist && queueItem.infoHash) {
			logger.warn('Blocklist not yet implemented', { infoHash: queueItem.infoHash });
		}

		// Create history record before deleting
		await db.insert(downloadHistory).values({
			downloadClientId: queueItem.downloadClientId,
			downloadId: queueItem.downloadId,
			title: queueItem.title,
			status: 'removed',
			movieId: queueItem.movieId,
			seriesId: queueItem.seriesId,
			seasonNumber: queueItem.seasonNumber,
			episodeIds: queueItem.episodeIds,
			indexerId: queueItem.indexerId,
			indexerName: queueItem.indexerName,
			protocol: queueItem.protocol,
			size: queueItem.size,
			quality: queueItem.quality,
			grabbedAt: queueItem.addedAt,
			completedAt: queueItem.completedAt,
			importedAt: null,
			createdAt: new Date().toISOString()
		});

		// Delete from queue
		await db.delete(downloadQueue).where(eq(downloadQueue.id, id));

		return json({ success: true, message: 'Queue item removed' });
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		logger.error('Error deleting queue item', err instanceof Error ? err : undefined);
		throw error(500, 'Failed to delete queue item');
	}
};
