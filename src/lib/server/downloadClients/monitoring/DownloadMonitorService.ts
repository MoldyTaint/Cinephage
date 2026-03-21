/**
 * Download Monitor Service
 *
 * Polls download clients to track download progress, detect completions,
 * and trigger imports. Uses adaptive polling (faster when active downloads,
 * slower when idle).
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { stat } from 'fs/promises';
import { db } from '$lib/server/db';
import { downloadQueue, downloadHistory, downloadClients } from '$lib/server/db/schema';
import { eq, and, inArray, not, notInArray } from 'drizzle-orm';
import { getDownloadClientManager } from '../DownloadClientManager';
import { mapClientPathToLocal } from './PathMapping';
import { extractInfoHash } from '../utils/hashUtils';
import {
	cleanupExpiredQueueTombstones,
	extendQueueTombstonesFromDownloads,
	getQueueTombstoneCleanupIntervalMs,
	isQueueItemSuppressed
} from './QueueTombstoneService';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'imports' as const });
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';
import type { IDownloadClient, DownloadInfo } from '../core/interfaces';
import type { DownloadClient } from '$lib/types/downloadClient';
import {
	isImportedQueueStatus,
	POST_IMPORT_QUEUE_STATUSES,
	TERMINAL_QUEUE_STATUSES,
	type QueueStatus,
	type QueueItem,
	type QueueStats,
	type QueueEvent
} from '$lib/types/queue';

// Import service is loaded lazily to avoid circular dependencies
let importServiceInstance: import('../import').ImportService | null = null;
async function getImportService() {
	if (!importServiceInstance) {
		const { importService } = await import('../import');
		importServiceInstance = importService;
	}
	return importServiceInstance;
}

/**
 * Polling intervals in milliseconds
 */
const DEFAULT_POLL_INTERVAL_ACTIVE_MS = 5_000; // 5 seconds when active downloads
const DEFAULT_POLL_INTERVAL_IDLE_MS = 30_000; // 30 seconds when idle

function getPositiveIntEnv(name: string, fallback: number): number {
	const envValue = process.env[name];
	if (!envValue) {
		return fallback;
	}

	const parsed = Number(envValue);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.round(parsed);
}

const POLL_INTERVAL_ACTIVE = getPositiveIntEnv(
	'DOWNLOAD_MONITOR_POLL_ACTIVE_MS',
	DEFAULT_POLL_INTERVAL_ACTIVE_MS
);
const POLL_INTERVAL_IDLE = getPositiveIntEnv(
	'DOWNLOAD_MONITOR_POLL_IDLE_MS',
	DEFAULT_POLL_INTERVAL_IDLE_MS
);

const STARTUP_SYNC_ENABLED = process.env.DOWNLOAD_MONITOR_STARTUP_SYNC_ENABLED !== 'false';
const DEFAULT_STARTUP_SYNC_TIMEOUT_MS = 10_000; // 10 seconds per client

function getStartupSyncTimeoutMs(): number {
	return getPositiveIntEnv(
		'DOWNLOAD_MONITOR_STARTUP_SYNC_TIMEOUT_MS',
		DEFAULT_STARTUP_SYNC_TIMEOUT_MS
	);
}

const STARTUP_SYNC_TIMEOUT_MS = getStartupSyncTimeoutMs();
const QUEUE_TOMBSTONE_CLEANUP_INTERVAL_MS = getQueueTombstoneCleanupIntervalMs();

/**
 * Max import attempts before marking as failed
 */
const MAX_IMPORT_ATTEMPTS = 10;

/**
 * Grace period for completed items during queue-to-history transition.
 * SABnzbd needs extra time for post-processing (extracting large archives,
 * moving files, running scripts) before items appear in history.
 * Increased to 5 minutes to handle large archive extractions reliably.
 */
const COMPLETED_GRACE_PERIOD_MS = 300_000; // 5 minutes
const MISSING_GRACE_PERIOD_MS = 30_000; // 30 seconds
const TORRENT_MISSING_GRACE_PERIOD_MS = 180_000; // 3 minutes
const TORRENT_MAGNET_METADATA_GRACE_PERIOD_MS = 600_000; // 10 minutes

/**
 * Terminal statuses - items that are completely done and hidden from queue UI.
 * Failed items stay visible for user action and should not be treated as terminal.
 */
const TERMINAL_STATUSES: QueueStatus[] = [...TERMINAL_QUEUE_STATUSES];

/**
 * Post-import statuses - items that are imported but still visible in queue (seeding)
 * These should NOT be updated by polling - they're managed by removeCompletedDownloads()
 */
const POST_IMPORT_STATUSES: QueueStatus[] = [...POST_IMPORT_QUEUE_STATUSES];

/**
 * Convert database row to QueueItem
 */
function rowToQueueItem(row: typeof downloadQueue.$inferSelect): QueueItem {
	return {
		id: row.id,
		downloadClientId: row.downloadClientId,
		downloadId: row.downloadId,
		infoHash: row.infoHash,
		title: row.title,
		indexerId: row.indexerId,
		indexerName: row.indexerName,
		downloadUrl: row.downloadUrl,
		magnetUrl: row.magnetUrl,
		protocol: row.protocol,
		movieId: row.movieId,
		seriesId: row.seriesId,
		episodeIds: row.episodeIds as string[] | null,
		seasonNumber: row.seasonNumber,
		status: row.status as QueueStatus,
		progress: parseFloat(row.progress || '0'),
		size: row.size,
		downloadSpeed: row.downloadSpeed || 0,
		uploadSpeed: row.uploadSpeed || 0,
		eta: row.eta,
		ratio: parseFloat(row.ratio || '0'),
		clientDownloadPath: row.clientDownloadPath,
		outputPath: row.outputPath,
		importedPath: row.importedPath,
		quality: row.quality as QueueItem['quality'],
		releaseGroup: row.releaseGroup,
		addedAt: row.addedAt || new Date().toISOString(),
		startedAt: row.startedAt,
		completedAt: row.completedAt,
		importedAt: row.importedAt,
		errorMessage: row.errorMessage,
		importAttempts: row.importAttempts || 0,
		lastAttemptAt: row.lastAttemptAt,
		isAutomatic: !!row.isAutomatic,
		isUpgrade: !!row.isUpgrade
	};
}

/**
 * Map download client status to queue status.
 * Validates progress is in valid range and logs unknown statuses.
 */
function mapDownloadStatusToQueueStatus(
	downloadStatus: DownloadInfo['status'],
	progress: number
): QueueStatus {
	// Validate and clamp progress to 0-1 range
	const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

	switch (downloadStatus) {
		case 'downloading':
			return 'downloading';
		case 'stalled':
			return 'stalled';
		case 'paused':
			return 'paused';
		case 'seeding':
			// Trust the client - if it says seeding, it's seeding
			// Zero progress can happen with empty/skipped torrents
			return 'seeding';
		case 'completed':
			return 'completed';
		case 'postprocessing':
			return 'postprocessing';
		case 'queued':
			return 'queued';
		case 'error':
			return 'failed';
		default:
			// Log unknown status for debugging
			logger.warn(
				{
					downloadStatus,
					progress: safeProgress
				},
				'Unknown download status encountered, defaulting to queued'
			);
			return 'queued';
	}
}

/**
 * Events emitted by DownloadMonitorService
 */
export interface DownloadMonitorEvents {
	/** Queue item added */
	'queue:added': (item: QueueItem) => void;
	/** Queue item updated */
	'queue:updated': (item: QueueItem) => void;
	/** Queue item removed */
	'queue:removed': (id: string) => void;
	/** Download completed (ready for import) */
	'queue:completed': (item: QueueItem) => void;
	/** Download imported */
	'queue:imported': (item: QueueItem) => void;
	/** Download failed */
	'queue:failed': (item: QueueItem) => void;
	/** Stats updated */
	'queue:stats': (stats: QueueStats) => void;
}

/**
 * Download Monitor Service
 *
 * Singleton service that continuously monitors download clients and updates
 * the download queue in the database. Implements BackgroundService for
 * lifecycle management via ServiceManager.
 */
export class DownloadMonitorService extends EventEmitter implements BackgroundService {
	private static instance: DownloadMonitorService | null = null;

	readonly name = 'DownloadMonitor';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	private isRunning = false;
	private isPolling = false; // Prevents concurrent poll() calls
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private lastPollTime = 0;
	private activeDownloadCount = 0;

	// SSE clients for real-time updates
	private sseClients: Set<(event: QueueEvent) => void> = new Set();

	// Last time orphan cleanup was run (runs every 10 minutes)
	private lastOrphanCleanupTime = 0;
	private lastQueueTombstoneCleanupTime = 0;
	private static readonly ORPHAN_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

	private constructor() {
		super();
	}

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	static getInstance(): DownloadMonitorService {
		if (!DownloadMonitorService.instance) {
			DownloadMonitorService.instance = new DownloadMonitorService();
		}
		return DownloadMonitorService.instance;
	}

	/** Reset the singleton instance (for testing) */
	static async resetInstance(): Promise<void> {
		if (DownloadMonitorService.instance) {
			await DownloadMonitorService.instance.stop();
			DownloadMonitorService.instance = null;
		}
	}

	/**
	 * Start the monitoring service (non-blocking)
	 * Implements BackgroundService.start()
	 */
	start(): void {
		if (this.isRunning || this._status === 'starting') {
			logger.debug('Download monitor already running');
			return;
		}

		this._status = 'starting';
		this.isRunning = true;
		logger.info('Starting download monitor service');

		// Perform async startup in background
		setImmediate(() => {
			if (!STARTUP_SYNC_ENABLED) {
				logger.info('Skipping download monitor startup sync (disabled by config)');
				this._status = 'ready';
				this.schedulePoll(0); // Poll immediately on start
				return;
			}

			this.performStartupSync()
				.then(() => {
					this._status = 'ready';
					this.schedulePoll(0); // Poll immediately on start
				})
				.catch((err) => {
					this._error = err instanceof Error ? err : new Error(String(err));
					this._status = 'error';
					logger.error({ err: this._error }, 'Download monitor startup failed');
				});
		});
	}

	/**
	 * Perform startup sync to reconcile orphaned downloads
	 *
	 * This checks all enabled download clients for downloads that exist in the client
	 * but are not tracked in our queue. These could be:
	 * - Downloads added manually
	 * - Downloads from before app was restarted
	 * - Downloads that failed to be tracked properly
	 *
	 * We log these orphans for visibility but don't auto-add them since we don't
	 * know which media they belong to.
	 */
	private async performStartupSync(): Promise<void> {
		logger.info('Performing startup sync to check for orphaned downloads');

		try {
			const manager = getDownloadClientManager();
			const enabledClients = await manager.getEnabledClients();

			if (enabledClients.length === 0) {
				logger.debug('No enabled download clients for startup sync');
				return;
			}

			// Get all active queue items (non-terminal)
			const activeQueueItems = await db
				.select()
				.from(downloadQueue)
				.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

			// Build sets of known download IDs and info hashes for quick lookup
			const knownDownloadIds = new Set<string>();
			const knownInfoHashes = new Set<string>();

			for (const item of activeQueueItems) {
				knownDownloadIds.add(item.downloadId.toLowerCase());
				if (item.infoHash) {
					knownInfoHashes.add(item.infoHash.toLowerCase());
				}
			}

			// Sync all clients in parallel with timeout for faster startup
			const syncResults = await Promise.all(
				enabledClients.map(async ({ client, instance }) => {
					try {
						// Race between client sync and timeout
						const downloads = await Promise.race([
							instance.getDownloads(),
							new Promise<never>((_, reject) =>
								setTimeout(() => reject(new Error('Sync timeout')), STARTUP_SYNC_TIMEOUT_MS)
							)
						]);

						const orphanedDownloads: DownloadInfo[] = [];

						for (const download of downloads) {
							const hashLower = download.hash.toLowerCase();

							// Check if we're already tracking this download
							const isTracked = knownDownloadIds.has(hashLower) || knownInfoHashes.has(hashLower);

							if (!isTracked) {
								// Check if it's in our category (if client supports categories)
								const isOurCategory =
									!client.tvCategory ||
									download.category === client.tvCategory ||
									download.category === client.movieCategory;

								if (isOurCategory) {
									orphanedDownloads.push(download);
								}
							}
						}

						if (orphanedDownloads.length > 0) {
							logger.warn(
								{
									clientName: client.name,
									clientId: client.id,
									orphanCount: orphanedDownloads.length,
									orphans: orphanedDownloads.map((d) => ({
										name: d.name,
										hash: d.hash,
										status: d.status,
										progress: Math.round(d.progress * 100) + '%',
										category: d.category,
										savePath: d.savePath
									}))
								},
								'Found orphaned downloads in client not tracked by queue'
							);

							// For completed orphans, we could attempt to identify and import them
							// For now, just log them so user is aware
							const completedOrphans = orphanedDownloads.filter(
								(d) => d.progress >= 1 && d.status !== 'error'
							);

							if (completedOrphans.length > 0) {
								logger.info(
									{
										clientName: client.name,
										completedOrphans: completedOrphans.map((d) => ({
											name: d.name,
											hash: d.hash,
											savePath: d.savePath,
											contentPath: d.contentPath
										}))
									},
									'Some orphaned downloads are completed and may be ready for manual import'
								);
							}
						} else {
							logger.debug(
								{
									clientName: client.name,
									totalDownloads: downloads.length,
									trackedCount: activeQueueItems.filter((q) => q.downloadClientId === client.id)
										.length
								},
								'No orphaned downloads found in client'
							);
						}

						return orphanedDownloads.length;
					} catch (error) {
						const isTimeout = error instanceof Error && error.message === 'Sync timeout';
						logger.warn(
							isTimeout
								? 'Download client sync timed out on startup'
								: 'Failed to sync with download client on startup',
							{
								clientName: client.name,
								clientId: client.id,
								error: error instanceof Error ? error.message : String(error)
							}
						);
						return 0;
					}
				})
			);

			const totalOrphans = syncResults.reduce((sum, count) => sum + count, 0);

			if (totalOrphans > 0) {
				logger.warn(
					`Startup sync complete: found ${totalOrphans} orphaned download(s) not tracked in queue`
				);
			} else {
				logger.info('Startup sync complete: all downloads are properly tracked');
			}
		} catch (error) {
			logger.error({ err: error }, 'Failed to perform startup sync');
		}
	}

	/**
	 * Clean up orphaned completed torrents that are not tracked in the queue.
	 * This removes torrents that have met their seeding requirements (canBeRemoved=true)
	 * but were never tracked by Cinephage (legacy/manual downloads).
	 *
	 * @param dryRun If true, only reports what would be removed without actually removing
	 * @returns Summary of removed/removable torrents
	 */
	async cleanupOrphanedDownloads(dryRun = false): Promise<{
		removed: { name: string; hash: string; ratio: number }[];
		skipped: { name: string; hash: string; reason: string }[];
		errors: { name: string; hash: string; error: string }[];
	}> {
		const result = {
			removed: [] as { name: string; hash: string; ratio: number }[],
			skipped: [] as { name: string; hash: string; reason: string }[],
			errors: [] as { name: string; hash: string; error: string }[]
		};

		logger.info({ dryRun }, 'Starting orphaned download cleanup');

		try {
			const manager = getDownloadClientManager();
			const enabledClients = await manager.getEnabledClients();

			if (enabledClients.length === 0) {
				logger.info('No enabled download clients for orphan cleanup');
				return result;
			}

			// Get all tracked queue items
			const activeQueueItems = await db
				.select()
				.from(downloadQueue)
				.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

			const knownHashes = new Set<string>();
			for (const item of activeQueueItems) {
				knownHashes.add(item.downloadId.toLowerCase());
				if (item.infoHash) {
					knownHashes.add(item.infoHash.toLowerCase());
				}
			}

			for (const { client, instance } of enabledClients) {
				try {
					const downloads = await instance.getDownloads();

					for (const download of downloads) {
						const hashLower = download.hash.toLowerCase();

						// Skip if tracked
						if (knownHashes.has(hashLower)) {
							continue;
						}

						// Skip if not in our category
						const isOurCategory =
							!client.tvCategory ||
							download.category === client.tvCategory ||
							download.category === client.movieCategory;

						if (!isOurCategory) {
							continue;
						}

						// Check if it can be removed (completed + met seeding limits)
						if (!download.canBeRemoved) {
							result.skipped.push({
								name: download.name,
								hash: download.hash,
								reason:
									download.progress < 1
										? 'Still downloading'
										: 'Still seeding (limits not met or not paused)'
							});
							continue;
						}

						// This orphan can be removed
						if (dryRun) {
							result.removed.push({
								name: download.name,
								hash: download.hash,
								ratio: download.ratio || 0
							});
							logger.info(
								{
									name: download.name,
									hash: download.hash,
									ratio: download.ratio,
									seedingTime: download.seedingTime
								},
								'[DRY RUN] Would remove orphaned torrent'
							);
						} else {
							try {
								await instance.removeDownload(download.hash, false);
								result.removed.push({
									name: download.name,
									hash: download.hash,
									ratio: download.ratio || 0
								});
								logger.info(
									{
										name: download.name,
										hash: download.hash,
										ratio: download.ratio,
										seedingTime: download.seedingTime
									},
									'Removed orphaned torrent'
								);
							} catch (removeError) {
								result.errors.push({
									name: download.name,
									hash: download.hash,
									error: removeError instanceof Error ? removeError.message : String(removeError)
								});
							}
						}
					}
				} catch (error) {
					logger.error(
						{ err: error, clientName: client.name },
						'Failed to process client for orphan cleanup'
					);
				}
			}
		} catch (error) {
			logger.error({ err: error }, 'Failed to cleanup orphaned downloads');
		}

		logger.info(
			{
				dryRun,
				removed: result.removed.length,
				skipped: result.skipped.length,
				errors: result.errors.length
			},
			'Orphaned download cleanup complete'
		);

		return result;
	}

	/**
	 * Clear failed queue items from the database.
	 * Optionally filters by age (e.g., only clear items older than X days).
	 *
	 * @param options.olderThanDays - Only clear items that failed more than X days ago
	 * @param options.dryRun - Preview what would be removed without actually removing
	 * @returns Summary of cleared items
	 */
	async clearFailedItems(
		options: {
			olderThanDays?: number;
			dryRun?: boolean;
		} = {}
	): Promise<{
		cleared: { id: string; title: string; errorMessage?: string | null }[];
		total: number;
	}> {
		const { olderThanDays, dryRun = false } = options;

		logger.info({ olderThanDays, dryRun }, 'Clearing failed queue items');

		// Get all failed items
		let failedItems = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.status, 'failed'));

		// Filter by age if specified
		if (olderThanDays !== undefined && olderThanDays > 0) {
			const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
			failedItems = failedItems.filter((item) => {
				const failedAt = item.lastAttemptAt
					? new Date(item.lastAttemptAt).getTime()
					: item.addedAt
						? new Date(item.addedAt).getTime()
						: Date.now();
				return failedAt < cutoff;
			});
		}

		const result = {
			cleared: [] as { id: string; title: string; errorMessage?: string | null }[],
			total: failedItems.length
		};

		if (dryRun) {
			// Just return what would be cleared
			result.cleared = failedItems.map((item) => ({
				id: item.id,
				title: item.title,
				errorMessage: item.errorMessage
			}));
		} else {
			// Actually clear the items
			for (const item of failedItems) {
				try {
					// Mark as removed
					await db
						.update(downloadQueue)
						.set({ status: 'removed' })
						.where(eq(downloadQueue.id, item.id));

					result.cleared.push({
						id: item.id,
						title: item.title,
						errorMessage: item.errorMessage
					});

					this.emit('queue:removed', item.id);
					this.emitSSE('queue:removed', { id: item.id });
				} catch (error) {
					logger.error(
						{
							id: item.id,
							title: item.title,
							error: error instanceof Error ? error.message : String(error)
						},
						'Failed to clear failed item'
					);
				}
			}
		}

		logger.info(
			{
				dryRun,
				cleared: result.cleared.length,
				total: result.total
			},
			'Failed queue items cleared'
		);

		return result;
	}

	/**
	 * Stop the monitoring service
	 * Implements BackgroundService.stop()
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) return;

		this.isRunning = false;
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		this._status = 'pending';
		logger.info('Stopped download monitor service');
	}

	/**
	 * Register an SSE client for real-time updates
	 */
	registerSSEClient(callback: (event: QueueEvent) => void): () => void {
		this.sseClients.add(callback);
		return () => this.sseClients.delete(callback);
	}

	/**
	 * Emit an event to SSE clients
	 */
	private emitSSE(type: QueueEvent['type'], data: QueueEvent['data']): void {
		const event: QueueEvent = {
			type,
			data,
			timestamp: new Date().toISOString()
		};

		const failedClients: Array<(event: QueueEvent) => void> = [];
		for (const client of this.sseClients) {
			try {
				client(event);
			} catch (error) {
				logger.warn({ error }, 'Failed to send SSE event, removing client');
				failedClients.push(client);
			}
		}
		// Remove failed clients to prevent accumulation
		for (const client of failedClients) {
			this.sseClients.delete(client);
		}
	}

	/**
	 * Schedule the next poll
	 */
	private schedulePoll(delayMs?: number): void {
		if (!this.isRunning) return;

		const interval =
			delayMs ?? (this.activeDownloadCount > 0 ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE);

		this.pollTimer = setTimeout(() => this.poll(), interval);
	}

	/**
	 * Poll all download clients and update queue
	 */
	async poll(): Promise<void> {
		if (!this.isRunning) return;

		// Prevent concurrent polls (e.g., from forcePoll while regular poll is running)
		if (this.isPolling) {
			logger.debug('Skipping poll - another poll is already in progress');
			return;
		}

		this.isPolling = true;
		const startTime = Date.now();
		this.lastPollTime = startTime;

		try {
			await this.pollClients();

			// Periodic orphan cleanup (every 10 minutes)
			if (
				startTime - this.lastOrphanCleanupTime >
				DownloadMonitorService.ORPHAN_CLEANUP_INTERVAL_MS
			) {
				this.lastOrphanCleanupTime = startTime;
				// Run orphan cleanup in background (don't block polling)
				this.runOrphanCleanup().catch((err) => {
					logger.warn(
						{
							error: err instanceof Error ? err.message : String(err)
						},
						'Orphan cleanup failed'
					);
				});
			}

			if (startTime - this.lastQueueTombstoneCleanupTime > QUEUE_TOMBSTONE_CLEANUP_INTERVAL_MS) {
				this.lastQueueTombstoneCleanupTime = startTime;
				this.runQueueTombstoneCleanup().catch((err) => {
					logger.warn(
						{
							error: err instanceof Error ? err.message : String(err)
						},
						'Queue tombstone cleanup failed'
					);
				});
			}
		} catch (error) {
			logger.error(
				{
					error: error instanceof Error ? error.message : String(error)
				},
				'Error during download poll'
			);
		} finally {
			this.isPolling = false;
		}

		// Schedule next poll
		this.schedulePoll();
	}

	/**
	 * Run orphan cleanup in background
	 */
	private async runOrphanCleanup(): Promise<void> {
		logger.debug('Running periodic orphan cleanup');
		const result = await this.cleanupOrphanedDownloads(false);
		if (result.removed.length > 0) {
			logger.info(
				{
					removed: result.removed.length,
					skipped: result.skipped.length,
					errors: result.errors.length
				},
				'Orphan cleanup completed'
			);
		}
	}

	/**
	 * Force an immediate poll (useful after a grab)
	 */
	async forcePoll(): Promise<void> {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		await this.poll();
	}

	/**
	 * Poll all enabled download clients
	 */
	private async pollClients(): Promise<void> {
		const manager = getDownloadClientManager();
		const enabledClients = await manager.getEnabledClients();

		if (enabledClients.length === 0) {
			this.activeDownloadCount = 0;
			return;
		}

		// Get queue items that need polling (exclude terminal, post-import, and failed statuses)
		// Post-import items are handled by removeCompletedDownloads(), not regular polling
		const queueItems = await db
			.select()
			.from(downloadQueue)
			.where(
				and(
					not(inArray(downloadQueue.status, TERMINAL_STATUSES)),
					not(inArray(downloadQueue.status, POST_IMPORT_STATUSES)),
					not(eq(downloadQueue.status, 'failed'))
				)
			);

		// Group by client
		const itemsByClient = new Map<string, (typeof queueItems)[0][]>();
		for (const item of queueItems) {
			const existing = itemsByClient.get(item.downloadClientId) || [];
			existing.push(item);
			itemsByClient.set(item.downloadClientId, existing);
		}

		let totalActive = 0;

		// Poll each client
		for (const { client, instance } of enabledClients) {
			try {
				const clientItems = itemsByClient.get(client.id) || [];
				const activeCount = await this.pollClient(client, instance, clientItems);
				totalActive += activeCount;
			} catch (error) {
				logger.error(
					{
						clientId: client.id,
						clientName: client.name,
						error: error instanceof Error ? error.message : String(error)
					},
					'Failed to poll download client'
				);
			}
		}

		this.activeDownloadCount = totalActive;

		// Check for and remove completed downloads that have met seeding requirements
		// This follows Radarr's pattern of removing after seeding is done
		await this.removeCompletedDownloads(enabledClients);

		// Note: Pending import retries are now handled by ImportService

		// Emit stats update
		const stats = await this.getStats();
		this.emitSSE('queue:stats', stats);
	}

	/**
	 * Remove completed downloads that have met their seeding requirements.
	 * Follows Radarr's RemoveCompletedDownloads pattern.
	 *
	 * This checks for queue items that are 'imported' or 'seeding-imported' and whose torrent
	 * has canBeRemoved=true (paused after reaching seed limits).
	 */
	private async removeCompletedDownloads(
		enabledClients: { client: DownloadClient; instance: IDownloadClient }[]
	): Promise<void> {
		// Get imported queue items that haven't been cleaned up yet
		// Check both 'imported' (usenet) and 'seeding-imported' (torrents still seeding)
		const importedItems = await db
			.select()
			.from(downloadQueue)
			.where(inArray(downloadQueue.status, ['imported', 'seeding-imported']));

		if (importedItems.length === 0) {
			return;
		}

		// Create a map of clients for quick lookup
		const clientMap = new Map<string, IDownloadClient>();
		for (const { client, instance } of enabledClients) {
			clientMap.set(client.id, instance);
		}

		for (const item of importedItems) {
			const clientInstance = clientMap.get(item.downloadClientId);
			if (!clientInstance) {
				continue;
			}

			try {
				// Check if the download still exists and can be removed
				const downloadHash = item.infoHash || item.downloadId;
				const download = await clientInstance.getDownload(downloadHash);

				if (!download) {
					// Download already removed from client, clean up queue entry
					logger.debug(
						{
							title: item.title,
							hash: downloadHash,
							protocol: item.protocol
						},
						'Download already removed from client, cleaning up queue entry'
					);
					await db.delete(downloadQueue).where(eq(downloadQueue.id, item.id));
					this.emit('queue:removed', item.id);
					this.emitSSE('queue:removed', { id: item.id });
					continue;
				}

				if (download.canBeRemoved) {
					// Download has met requirements (seeding limits for torrents, completed for usenet)
					logger.info(
						{
							title: item.title,
							hash: downloadHash,
							protocol: item.protocol,
							ratio: download.ratio,
							seedingTime: download.seedingTime,
							ratioLimit: download.ratioLimit,
							seedingTimeLimit: download.seedingTimeLimit
						},
						'Removing completed download from client'
					);

					const deleteFiles = item.protocol === 'torrent';
					await clientInstance.removeDownload(downloadHash, deleteFiles);

					// Clean up queue entry
					await db.delete(downloadQueue).where(eq(downloadQueue.id, item.id));

					logger.info(
						{
							title: item.title,
							hash: downloadHash,
							protocol: item.protocol,
							deleteFiles
						},
						'Successfully removed completed download'
					);

					this.emit('queue:removed', item.id);
					this.emitSSE('queue:removed', { id: item.id });
				} else {
					// Still seeding/processing, leave it alone
					logger.debug(
						{
							title: item.title,
							hash: downloadHash,
							ratio: download.ratio,
							status: download.status,
							canBeRemoved: download.canBeRemoved
						},
						'Imported download still active'
					);
				}
			} catch (error) {
				logger.warn(
					{
						title: item.title,
						error: error instanceof Error ? error.message : String(error)
					},
					'Failed to check/remove completed download'
				);
			}
		}
	}

	private async runQueueTombstoneCleanup(): Promise<void> {
		await cleanupExpiredQueueTombstones();
	}

	/**
	 * Poll a single download client
	 */
	private async pollClient(
		client: DownloadClient,
		instance: IDownloadClient,
		queueItems: (typeof downloadQueue.$inferSelect)[]
	): Promise<number> {
		// Get all downloads from this client
		const downloads = await instance.getDownloads();
		const clientProtocol =
			client.implementation === 'sabnzbd' || client.implementation === 'nzbget'
				? 'usenet'
				: 'torrent';
		await extendQueueTombstonesFromDownloads({
			downloadClientId: client.id,
			protocol: clientProtocol,
			downloads
		});

		// Create a map for quick lookup by download ID (hash)
		const downloadMap = new Map<string, DownloadInfo>();
		for (const dl of downloads) {
			downloadMap.set(dl.hash.toLowerCase(), dl);
		}

		let activeCount = 0;

		// Update each queue item
		for (const queueItem of queueItems) {
			// Try multiple strategies to find the download:
			// 1. By downloadId (primary)
			// 2. By stored infoHash
			// 3. By extracting hash from magnetUrl
			// 4. By title (SABnzbd only - nzo_id changes on re-grab)
			let download = downloadMap.get(queueItem.downloadId.toLowerCase());
			let matchedBy: 'downloadId' | 'infoHash' | 'magnetUrl' | 'title' | null = download
				? 'downloadId'
				: null;

			// Fallback: try infoHash if stored
			if (!download && queueItem.infoHash) {
				download = downloadMap.get(queueItem.infoHash.toLowerCase());
				if (download) matchedBy = 'infoHash';
			}

			// Fallback: try extracting hash from magnetUrl
			if (!download && queueItem.magnetUrl) {
				const extractedHash = extractInfoHash(queueItem.magnetUrl);
				if (extractedHash) {
					download = downloadMap.get(extractedHash.toLowerCase());
					if (download) matchedBy = 'magnetUrl';
				}
			}

			// Fallback for SABnzbd-compatible clients: try matching by title
			// SABnzbd generates new nzo_id when downloads are re-added,
			// unlike torrent hashes which are persistent
			if (!download && client.implementation === 'sabnzbd') {
				download = downloads.find((d) => d.name.toLowerCase() === queueItem.title.toLowerCase());
				if (download) matchedBy = 'title';
			}

			if (download) {
				// If we matched by a fallback method, update downloadId for future lookups
				if (matchedBy && matchedBy !== 'downloadId') {
					logger.info(
						{
							title: queueItem.title,
							oldDownloadId: queueItem.downloadId,
							newDownloadId: download.hash,
							matchedBy
						},
						'Updating downloadId from fallback match'
					);
					await db
						.update(downloadQueue)
						.set({
							downloadId: download.hash,
							infoHash: queueItem.infoHash || download.hash
						})
						.where(eq(downloadQueue.id, queueItem.id));
					// Update local reference for the rest of this iteration
					queueItem.downloadId = download.hash;
				}

				// Count active downloads for adaptive polling
				const isNowDownloading = download.status === 'downloading';

				if (isNowDownloading || download.status === 'queued') {
					activeCount++;
				}

				await this.updateQueueItem(queueItem, download, client);

				// Radarr pattern: Check every completed download on every poll
				// This catches downloads that:
				// - Just finished
				// - Were already complete when we started tracking
				// - Completed between polls
				// Don't rely on transition detection which can miss fast downloads
				const isReadyForImport =
					download.status === 'completed' ||
					(download.status === 'seeding' && download.progress >= 1) ||
					(download.status === 'paused' && download.progress >= 1);

				// Only check items that haven't been imported yet
				// Radarr checks items in 'Downloading' or 'ImportBlocked' state
				const canBeChecked =
					queueItem.status === 'downloading' ||
					queueItem.status === 'queued' ||
					queueItem.status === 'seeding' ||
					queueItem.status === 'completed' ||
					queueItem.status === 'stalled';

				if (isReadyForImport && canBeChecked && !queueItem.importedAt) {
					// This download is ready for import - request import via ImportService
					const updatedItem = await this.getQueueItem(queueItem.id);
					if (updatedItem) {
						this.emit('queue:completed', updatedItem);
						this.emitSSE('queue:completed', updatedItem);

						// Request import through ImportService (handles all validation and deduplication)
						const importService = await getImportService();
						importService.requestImport(updatedItem.id).catch((err) => {
							logger.error(
								{
									queueId: updatedItem.id,
									title: updatedItem.title,
									error: err instanceof Error ? err.message : String(err)
								},
								'Failed to request import for completed download'
							);
						});
					}
				}
			} else {
				// Download no longer exists in client
				// This could mean it was removed or finished seeding
				await this.handleMissingDownload(queueItem, client, downloads);
			}
		}

		return activeCount;
	}

	/**
	 * Update a queue item from download client data
	 */
	private async updateQueueItem(
		queueItem: typeof downloadQueue.$inferSelect,
		download: DownloadInfo,
		client: DownloadClient
	): Promise<void> {
		const now = new Date().toISOString();

		// Use contentPath (full path to torrent folder/file) for import
		// contentPath is the actual location of the downloaded files
		// savePath is just the parent directory
		// Use user-configured path mappings for both completed and temp folders
		const outputPath = mapClientPathToLocal(
			download.contentPath || download.savePath,
			client.downloadPathLocal,
			client.downloadPathRemote ?? null,
			client.tempPathLocal,
			client.tempPathRemote
		);

		// Determine new status
		const newStatus = mapDownloadStatusToQueueStatus(download.status, download.progress);

		// Check if this is meaningful change
		const oldProgress = parseFloat(queueItem.progress || '0');
		const progressChanged = Math.abs(download.progress - oldProgress) > 0.001;
		const statusChanged = queueItem.status !== newStatus;
		const newClientDownloadPath = download.contentPath || download.savePath;
		const pathChanged =
			queueItem.clientDownloadPath !== newClientDownloadPath || queueItem.outputPath !== outputPath;

		// Build update object
		const updates: Partial<typeof downloadQueue.$inferInsert> = {
			progress: download.progress.toString(),
			size: download.size,
			downloadSpeed: download.downloadSpeed,
			uploadSpeed: download.uploadSpeed,
			eta: download.eta,
			ratio: download.ratio?.toString() || '0',
			clientDownloadPath: newClientDownloadPath,
			outputPath,
			status: newStatus
		};

		// Set startedAt on first download progress
		if (newStatus === 'downloading' && !queueItem.startedAt) {
			updates.startedAt = now;
		}

		// Set completedAt when finished downloading
		if ((newStatus === 'completed' || newStatus === 'seeding') && !queueItem.completedAt) {
			updates.completedAt = now;
		}

		// Capture error message and timestamp when download fails
		if (newStatus === 'failed') {
			if (download.errorMessage) {
				updates.errorMessage = download.errorMessage;
			}
			updates.lastAttemptAt = now;
		}

		// Only update if something changed
		if (statusChanged || progressChanged || pathChanged) {
			await db.update(downloadQueue).set(updates).where(eq(downloadQueue.id, queueItem.id));

			// Emit update event
			const updatedItem = await this.getQueueItem(queueItem.id);
			if (updatedItem) {
				const transitionedToFailed =
					queueItem.status !== 'failed' && updatedItem.status === 'failed';
				if (transitionedToFailed) {
					await this.createFailedHistoryRecord(
						updatedItem,
						updatedItem.errorMessage ?? 'Download client reported an error'
					);
					this.emit('queue:failed', updatedItem);
					this.emitSSE('queue:failed', updatedItem);
					return;
				}

				this.emit('queue:updated', updatedItem);
				this.emitSSE('queue:updated', updatedItem);
			}
		}
	}

	/**
	 * Handle a download that's no longer in the client
	 */
	private async handleMissingDownload(
		queueItem: typeof downloadQueue.$inferSelect,
		client: DownloadClient,
		allDownloads: DownloadInfo[]
	): Promise<void> {
		// If it was importing or already imported, don't change anything
		if (queueItem.status === 'importing' || queueItem.status === 'imported') {
			return;
		}
		if (isImportedQueueStatus(queueItem.status)) {
			return;
		}

		// Grace period before considering a not-found item truly missing.
		// Torrent magnets can transiently disappear while metadata is fetched/parsing completes.
		let gracePeriodMs = MISSING_GRACE_PERIOD_MS;
		const isTorrent = queueItem.protocol === 'torrent';
		if (isTorrent) {
			gracePeriodMs = TORRENT_MISSING_GRACE_PERIOD_MS;
			const awaitingMetadata =
				!!queueItem.magnetUrl && !queueItem.startedAt && !queueItem.completedAt;
			if (awaitingMetadata) {
				gracePeriodMs = TORRENT_MAGNET_METADATA_GRACE_PERIOD_MS;
			}
		}

		const addedAt = queueItem.addedAt ? new Date(queueItem.addedAt).getTime() : 0;
		const timeSinceAdd = Date.now() - addedAt;
		const transientStatuses = new Set<QueueStatus>(['queued', 'downloading', 'stalled', 'paused']);
		const currentStatus = queueItem.status as QueueStatus;

		if (timeSinceAdd < gracePeriodMs && transientStatuses.has(currentStatus)) {
			logger.debug(
				{
					title: queueItem.title,
					status: currentStatus,
					protocol: queueItem.protocol,
					hasMagnet: !!queueItem.magnetUrl,
					timeSinceAdd,
					gracePeriod: gracePeriodMs
				},
				'Download not found but within grace period, skipping'
			);
			return;
		}

		// If it was completed/seeding and is now gone, it may be:
		// 1. Transitioning from SABnzbd queue to history (need grace period)
		// 2. Actually removed from client
		if (queueItem.status === 'completed' || queueItem.status === 'seeding') {
			// Give a grace period for completed items (SABnzbd queue->history transition time)
			const completedAt = queueItem.completedAt
				? new Date(queueItem.completedAt).getTime()
				: Date.now();
			const timeSinceComplete = Date.now() - completedAt;

			if (timeSinceComplete < COMPLETED_GRACE_PERIOD_MS) {
				logger.debug(
					{
						title: queueItem.title,
						timeSinceComplete,
						gracePeriod: COMPLETED_GRACE_PERIOD_MS
					},
					'Completed download recently, waiting for client sync'
				);
				return;
			}

			logger.info(
				{
					title: queueItem.title,
					clientName: client.name
				},
				'Download removed from client after completion'
			);

			// Mark as removed - the import service should have already imported it
			await db
				.update(downloadQueue)
				.set({ status: 'removed' })
				.where(eq(downloadQueue.id, queueItem.id));

			const item = rowToQueueItem({ ...queueItem, status: 'removed' });
			this.emit('queue:removed', item.id);
			this.emitSSE('queue:removed', { id: item.id });
			return;
		}

		// Usenet clients can briefly drop queue visibility around completion/moves.
		// If the output path already exists, treat it as ready-for-import instead of failed.
		if (queueItem.protocol === 'usenet' && queueItem.outputPath) {
			try {
				await stat(queueItem.outputPath);

				logger.info(
					{
						title: queueItem.title,
						clientName: client.name,
						outputPath: queueItem.outputPath
					},
					'Usenet download missing from client but output path exists, queueing import'
				);

				const now = new Date().toISOString();
				await db
					.update(downloadQueue)
					.set({
						status: 'completed',
						completedAt: queueItem.completedAt ?? now,
						errorMessage: null
					})
					.where(eq(downloadQueue.id, queueItem.id));

				const updatedItem = await this.getQueueItem(queueItem.id);
				if (updatedItem) {
					this.emit('queue:completed', updatedItem);
					this.emitSSE('queue:completed', updatedItem);

					const importService = await getImportService();
					importService.requestImport(updatedItem.id).catch((err) => {
						logger.error(
							{
								queueId: updatedItem.id,
								title: updatedItem.title,
								error: err instanceof Error ? err.message : String(err)
							},
							'Failed to request import for missing usenet download'
						);
					});
				}

				return;
			} catch (error) {
				// Path doesn't exist yet, continue with regular missing-download handling.
				logger.debug(
					{
						title: queueItem.title,
						outputPath: queueItem.outputPath,
						error: error instanceof Error ? error.message : String(error)
					},
					'Missing usenet output path is not ready yet'
				);
			}
		}

		// Failed items are retained for user visibility and action.
		if (queueItem.status === 'failed') {
			return;
		}

		// Log what downloads ARE available (for debugging)
		logger.warn(
			{
				title: queueItem.title,
				clientName: client.name,
				previousStatus: queueItem.status,
				downloadId: queueItem.downloadId,
				infoHash: queueItem.infoHash,
				magnetUrl: queueItem.magnetUrl?.substring(0, 60),
				availableHashes: allDownloads.slice(0, 5).map((d) => d.hash)
			},
			'Download disappeared from client unexpectedly'
		);

		await db
			.update(downloadQueue)
			.set({
				status: 'failed',
				errorMessage: 'Download removed from client unexpectedly'
			})
			.where(eq(downloadQueue.id, queueItem.id));

		const updatedItem = await this.getQueueItem(queueItem.id);
		if (updatedItem) {
			await this.createFailedHistoryRecord(
				updatedItem,
				updatedItem.errorMessage ?? 'Download removed from client unexpectedly'
			);
			this.emit('queue:failed', updatedItem);
			this.emitSSE('queue:failed', updatedItem);
		}
	}

	/**
	 * Get a queue item by ID
	 */
	async getQueueItem(id: string): Promise<QueueItem | null> {
		const [row] = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).limit(1);
		return row ? rowToQueueItem(row) : null;
	}

	/**
	 * Get all queue items (non-terminal)
	 */
	async getQueue(): Promise<QueueItem[]> {
		const rows = await db
			.select()
			.from(downloadQueue)
			.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

		return rows.map(rowToQueueItem);
	}

	/**
	 * Get queue statistics
	 */
	async getStats(): Promise<QueueStats> {
		const rows = await db
			.select()
			.from(downloadQueue)
			.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

		const stats: QueueStats = {
			totalCount: rows.length,
			queuedCount: 0,
			downloadingCount: 0,
			stalledCount: 0,
			seedingCount: 0,
			pausedCount: 0,
			completedCount: 0,
			postprocessingCount: 0,
			importingCount: 0,
			failedCount: 0,
			totalSizeBytes: 0,
			totalDownloadSpeed: 0,
			totalUploadSpeed: 0
		};

		for (const row of rows) {
			stats.totalSizeBytes += row.size || 0;
			stats.totalDownloadSpeed += row.downloadSpeed || 0;
			stats.totalUploadSpeed += row.uploadSpeed || 0;

			switch (row.status) {
				case 'queued':
					stats.queuedCount++;
					break;
				case 'downloading':
					stats.downloadingCount++;
					break;
				case 'stalled':
					stats.stalledCount++;
					break;
				case 'seeding':
					stats.seedingCount++;
					break;
				case 'paused':
					stats.pausedCount++;
					break;
				case 'completed':
					stats.completedCount++;
					break;
				case 'postprocessing':
					stats.postprocessingCount++;
					break;
				case 'importing':
					stats.importingCount++;
					break;
				case 'failed':
					stats.failedCount++;
					break;
			}
		}

		return stats;
	}

	/**
	 * Add a new item to the queue (called by grab endpoint)
	 */
	async addToQueue(params: {
		downloadClientId: string;
		downloadId: string;
		infoHash?: string;
		title: string;
		indexerId?: string;
		indexerName?: string;
		downloadUrl?: string;
		magnetUrl?: string;
		protocol?: string;
		movieId?: string;
		seriesId?: string;
		episodeIds?: string[];
		seasonNumber?: number;
		quality?: QueueItem['quality'];
		size?: number;
		releaseGroup?: string;
		isAutomatic?: boolean;
		isUpgrade?: boolean;
	}): Promise<QueueItem> {
		// Check if download already in queue (prevent duplicates)
		// Only consider active downloads as duplicates - allow re-downloading removed/failed/imported items
		const existing = await db
			.select()
			.from(downloadQueue)
			.where(
				and(
					eq(downloadQueue.downloadClientId, params.downloadClientId),
					eq(downloadQueue.downloadId, params.downloadId),
					notInArray(downloadQueue.status, ['removed', 'failed', ...POST_IMPORT_STATUSES])
				)
			)
			.limit(1);

		if (existing.length > 0) {
			// Return existing queue item instead of creating duplicate
			logger.info(
				{
					downloadId: params.downloadId,
					existingId: existing[0].id,
					status: existing[0].status
				},
				'Download already in queue, returning existing item'
			);
			return rowToQueueItem(existing[0]);
		}

		// Automatic grabs are suppressed for a short window when the same remote item
		// was recently removed locally while the client was unavailable.
		if (params.isAutomatic) {
			const suppressed = await isQueueItemSuppressed({
				downloadClientId: params.downloadClientId,
				protocol: params.protocol,
				downloadId: params.downloadId,
				infoHash: params.infoHash
			});
			if (suppressed) {
				throw new Error('Download temporarily suppressed after local removal');
			}
		}

		// Create new queue item
		const id = randomUUID();
		const now = new Date().toISOString();

		await db.insert(downloadQueue).values({
			id,
			downloadClientId: params.downloadClientId,
			downloadId: params.downloadId,
			infoHash: params.infoHash,
			title: params.title,
			indexerId: params.indexerId,
			indexerName: params.indexerName,
			downloadUrl: params.downloadUrl,
			magnetUrl: params.magnetUrl,
			protocol: params.protocol || 'torrent',
			movieId: params.movieId,
			seriesId: params.seriesId,
			episodeIds: params.episodeIds,
			seasonNumber: params.seasonNumber,
			status: 'queued',
			quality: params.quality,
			size: params.size,
			releaseGroup: params.releaseGroup,
			addedAt: now,
			isAutomatic: params.isAutomatic || false,
			isUpgrade: params.isUpgrade || false
		});

		const item = await this.getQueueItem(id);
		if (!item) {
			throw new Error('Failed to create queue item');
		}

		this.emit('queue:added', item);
		this.emitSSE('queue:added', item);

		// Force poll to pick up the new download
		setTimeout(() => this.forcePoll(), 1000);

		return item;
	}

	/**
	 * Remove an item from the queue and optionally from the client
	 */
	async removeFromQueue(
		id: string,
		options: {
			removeFromClient?: boolean;
			deleteFiles?: boolean;
		} = {}
	): Promise<void> {
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.limit(1);

		if (!queueItem) {
			throw new Error('Queue item not found');
		}

		// Remove from download client if requested (best-effort — always cleans up queue)
		if (options.removeFromClient) {
			const manager = getDownloadClientManager();
			const instance = await manager.getClientInstance(queueItem.downloadClientId);

			if (instance) {
				try {
					const clientDownloadId = this.resolveClientDownloadId(queueItem, 'remove');
					await instance.removeDownload(clientDownloadId, options.deleteFiles);
				} catch (error) {
					logger.warn(
						{
							title: queueItem.title,
							error: error instanceof Error ? error.message : String(error)
						},
						'Failed to remove download from client, proceeding with queue cleanup'
					);
				}
			} else {
				logger.warn(
					{
						title: queueItem.title,
						downloadClientId: queueItem.downloadClientId
					},
					'Download client not available, removing from queue only'
				);
			}
		}

		// Update status to removed
		await db.update(downloadQueue).set({ status: 'removed' }).where(eq(downloadQueue.id, id));

		this.emit('queue:removed', id);
		this.emitSSE('queue:removed', { id });
	}

	/**
	 * Pause a download
	 */
	async pauseDownload(id: string): Promise<void> {
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.limit(1);

		if (!queueItem) {
			throw new Error('Queue item not found');
		}

		const manager = getDownloadClientManager();
		const instance = await manager.getClientInstance(queueItem.downloadClientId);

		if (!instance) {
			throw new Error('Download client not available');
		}

		const clientDownloadId = this.resolveClientDownloadId(queueItem, 'pause');
		await instance.pauseDownload(clientDownloadId);

		// Update local status
		await db.update(downloadQueue).set({ status: 'paused' }).where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:updated', updatedItem);
			this.emitSSE('queue:updated', updatedItem);
		}
	}

	/**
	 * Resume a download
	 */
	async resumeDownload(id: string): Promise<void> {
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.limit(1);

		if (!queueItem) {
			throw new Error('Queue item not found');
		}

		const manager = getDownloadClientManager();
		const instance = await manager.getClientInstance(queueItem.downloadClientId);

		if (!instance) {
			throw new Error('Download client not available');
		}

		const clientDownloadId = this.resolveClientDownloadId(queueItem, 'resume');
		await instance.resumeDownload(clientDownloadId);

		// Update local status
		await db.update(downloadQueue).set({ status: 'downloading' }).where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:updated', updatedItem);
			this.emitSSE('queue:updated', updatedItem);
		}
	}

	/**
	 * Resolve the identifier that should be sent to a download client command.
	 * Torrents prefer infoHash; usenet clients prefer downloadId.
	 */
	private resolveClientDownloadId(
		queueItem: typeof downloadQueue.$inferSelect,
		action: 'pause' | 'resume' | 'remove'
	): string {
		const isTorrent = queueItem.protocol === 'torrent';
		const identifier = isTorrent
			? queueItem.infoHash || queueItem.downloadId
			: queueItem.downloadId || queueItem.infoHash;

		if (!identifier) {
			throw new Error(`Queue item is missing a download identifier for ${action}`);
		}

		return identifier;
	}

	/**
	 * Mark a queue item as importing (for ImportService to call)
	 * Uses atomic check to prevent race conditions - only succeeds if item
	 * is not already importing/imported.
	 *
	 * @returns 'success' if marked as importing, 'already_importing' if another
	 *          process got there first, 'max_attempts' if limit exceeded
	 */
	async markImporting(
		id: string
	): Promise<'success' | 'already_importing' | 'already_imported' | 'max_attempts' | 'not_found'> {
		const now = new Date().toISOString();

		// Get current state
		const current = await db
			.select({
				status: downloadQueue.status,
				importAttempts: downloadQueue.importAttempts,
				title: downloadQueue.title
			})
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.get();

		if (!current) {
			return 'not_found';
		}

		// Already in terminal state
		if (current.status === 'importing') {
			return 'already_importing';
		}
		if (isImportedQueueStatus(current.status)) {
			return 'already_imported';
		}

		const newAttempts = (current.importAttempts ?? 0) + 1;

		// Enforce MAX_IMPORT_ATTEMPTS limit
		if (newAttempts > MAX_IMPORT_ATTEMPTS) {
			logger.error(
				{
					queueItemId: id,
					title: current.title,
					attempts: newAttempts,
					maxAttempts: MAX_IMPORT_ATTEMPTS
				},
				'Max import attempts exceeded, marking as failed'
			);
			await this.markFailed(id, `Import failed after ${newAttempts} attempts`);
			return 'max_attempts';
		}

		// Atomic update: only update if status is NOT already 'importing' or 'imported'
		// This prevents race conditions where two callers both pass the check above
		const result = await db
			.update(downloadQueue)
			.set({
				status: 'importing',
				importAttempts: newAttempts,
				lastAttemptAt: now
			})
			.where(
				and(
					eq(downloadQueue.id, id),
					not(eq(downloadQueue.status, 'importing')),
					notInArray(downloadQueue.status, [...POST_IMPORT_STATUSES])
				)
			);

		// Check if the update actually changed anything
		// SQLite returns changes count in result
		if (result.changes === 0) {
			// Another process already marked it as importing
			logger.debug({ id }, 'markImporting: race condition detected, another process won');
			return 'already_importing';
		}

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:updated', updatedItem);
			this.emitSSE('queue:updated', updatedItem);
		}
		return 'success';
	}

	/**
	 * Mark a queue item as imported.
	 *
	 * For torrents: Sets status to 'seeding-imported' to indicate file is imported
	 * but torrent is still seeding. removeCompletedDownloads() will set to 'imported'
	 * and delete when seeding requirements are met.
	 *
	 * For usenet: Sets status to 'imported' directly (no seeding needed).
	 */
	async markImported(
		id: string,
		importedPath: string,
		protocol?: 'torrent' | 'usenet'
	): Promise<void> {
		const now = new Date().toISOString();

		// For torrents, use 'seeding-imported' to show it's imported but still seeding
		// For usenet, use 'imported' directly (no seeding)
		const status = protocol === 'torrent' ? 'seeding-imported' : 'imported';

		await db
			.update(downloadQueue)
			.set({
				status,
				importedPath,
				importedAt: now
			})
			.where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:imported', updatedItem);
			this.emitSSE('queue:imported', updatedItem);
		}

		logger.info(
			{
				id,
				importedPath,
				status,
				protocol
			},
			'Marked queue item as imported'
		);
	}

	/**
	 * Mark a queue item as failed
	 */
	async markFailed(id: string, errorMessage: string): Promise<void> {
		await db
			.update(downloadQueue)
			.set({
				status: 'failed',
				errorMessage,
				lastAttemptAt: new Date().toISOString()
			})
			.where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			await this.createFailedHistoryRecord(updatedItem, errorMessage);
			this.emit('queue:failed', updatedItem);
			this.emitSSE('queue:failed', updatedItem);
		}
	}

	/**
	 * Persist failed queue items to download history so they remain visible in Activity
	 * even if the queue item is later auto-marked removed.
	 */
	private async createFailedHistoryRecord(
		queueItem: QueueItem,
		errorMessage: string
	): Promise<void> {
		try {
			// Prevent duplicate failed history records for the same queue attempt.
			const [existing] = await db
				.select({ id: downloadHistory.id })
				.from(downloadHistory)
				.where(
					and(
						eq(downloadHistory.status, 'failed'),
						eq(downloadHistory.title, queueItem.title),
						eq(downloadHistory.grabbedAt, queueItem.addedAt)
					)
				)
				.limit(1);

			if (existing) {
				return;
			}

			const [client] = await db
				.select({ name: downloadClients.name })
				.from(downloadClients)
				.where(eq(downloadClients.id, queueItem.downloadClientId))
				.limit(1);

			let downloadTimeSeconds: number | undefined;
			if (queueItem.startedAt && queueItem.completedAt) {
				const startTime = new Date(queueItem.startedAt).getTime();
				const endTime = new Date(queueItem.completedAt).getTime();
				downloadTimeSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
			}

			await db.insert(downloadHistory).values({
				downloadClientId: queueItem.downloadClientId,
				downloadClientName: client?.name,
				downloadId: queueItem.downloadId,
				title: queueItem.title,
				indexerId: queueItem.indexerId,
				indexerName: queueItem.indexerName,
				protocol: queueItem.protocol,
				movieId: queueItem.movieId,
				seriesId: queueItem.seriesId,
				episodeIds: queueItem.episodeIds ?? undefined,
				seasonNumber: queueItem.seasonNumber,
				status: 'failed',
				statusReason: errorMessage,
				size: queueItem.size ?? undefined,
				downloadTimeSeconds,
				finalRatio: String(queueItem.ratio ?? 0),
				quality: queueItem.quality,
				releaseGroup: queueItem.releaseGroup,
				grabbedAt: queueItem.addedAt,
				completedAt: queueItem.completedAt ?? undefined,
				importedAt: undefined
			});
		} catch (error) {
			logger.warn(
				{
					queueItemId: queueItem.id,
					title: queueItem.title,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to create failed download history record'
			);
		}
	}
}

// Singleton getter - preferred way to access the service
export function getDownloadMonitor(): DownloadMonitorService {
	return DownloadMonitorService.getInstance();
}

// Reset singleton (for testing)
export async function resetDownloadMonitor(): Promise<void> {
	await DownloadMonitorService.resetInstance();
}

// Backward-compatible export (prefer getDownloadMonitor())
export const downloadMonitor = DownloadMonitorService.getInstance();
