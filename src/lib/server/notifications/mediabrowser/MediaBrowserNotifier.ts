/**
 * MediaBrowserNotifier - Background service for notifying Jellyfin, Emby, and Plex servers.
 *
 * Features:
 * - Batching: Waits before sending updates to deduplicate rapid changes
 * - Deduplication: Same path updated multiple times = single notification
 * - Non-blocking: Implements BackgroundService interface
 */

import { EventEmitter } from 'events';
import { logger } from '$lib/logging';
import type { ServiceStatus, BackgroundService } from '$lib/server/services/background-service';
import { getMediaBrowserManager } from './MediaBrowserManager';
import { MediaBrowserClient } from './MediaBrowserClient';
import type { LibraryUpdateType, PendingUpdate, LibraryUpdatePayload } from './types';

// Batching configuration
const BATCH_DELAY_MS = 5000; // Wait 5 seconds before sending
const MAX_BATCH_SIZE = 50; // Maximum updates per batch

class MediaBrowserNotifier extends EventEmitter implements BackgroundService {
	readonly name = 'MediaBrowserNotifier';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	// Pending updates queue (path -> update info)
	private pendingUpdates: Map<string, PendingUpdate> = new Map();
	private batchTimer: NodeJS.Timeout | null = null;
	private isProcessing = false;

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	/**
	 * Start the notifier service (non-blocking)
	 */
	start(): void {
		if (this._status !== 'pending') {
			return;
		}

		this._status = 'starting';

		setImmediate(() => {
			try {
				this._status = 'ready';
				logger.info('[MediaBrowserNotifier] Service started');
			} catch (error) {
				this._error = error instanceof Error ? error : new Error(String(error));
				this._status = 'error';
				logger.error('[MediaBrowserNotifier] Failed to start', {
					error: this._error.message
				});
			}
		});
	}

	/**
	 * Stop the notifier service
	 */
	async stop(): Promise<void> {
		// Process any remaining updates before stopping
		if (this.pendingUpdates.size > 0) {
			await this.processBatch();
		}

		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}

		this._status = 'pending';
		logger.info('[MediaBrowserNotifier] Service stopped');
	}

	/**
	 * Queue an update for notification
	 *
	 * @param path - The file/folder path that changed
	 * @param updateType - The type of change (Created, Modified, Deleted)
	 */
	queueUpdate(path: string, updateType: LibraryUpdateType): void {
		if (this._status !== 'ready') {
			logger.debug('[MediaBrowserNotifier] Ignoring update - service not ready', {
				status: this._status,
				path
			});
			return;
		}

		// Normalize path
		const normalizedPath = path.replace(/\/+$/, '');

		// Check for existing update and determine priority
		// Priority order: Deleted > Modified > Created
		const existing = this.pendingUpdates.get(normalizedPath);

		if (existing) {
			// If existing is 'Deleted', keep it
			if (existing.updateType === 'Deleted') {
				return;
			}
			// If new is 'Deleted', upgrade
			if (updateType === 'Deleted') {
				existing.updateType = 'Deleted';
				existing.addedAt = Date.now();
				return;
			}
			// If existing is 'Modified', keep it (higher than Created)
			if (existing.updateType === 'Modified') {
				return;
			}
			// Otherwise, upgrade to the new type
			existing.updateType = updateType;
			existing.addedAt = Date.now();
		} else {
			// New entry
			this.pendingUpdates.set(normalizedPath, {
				path: normalizedPath,
				updateType,
				addedAt: Date.now()
			});
		}

		logger.debug('[MediaBrowserNotifier] Update queued', {
			path: normalizedPath,
			updateType,
			queueSize: this.pendingUpdates.size
		});

		// Start batch timer if not already running
		if (!this.batchTimer && !this.isProcessing) {
			this.batchTimer = setTimeout(() => {
				this.batchTimer = null;
				this.processBatch().catch((error) => {
					logger.error('[MediaBrowserNotifier] Batch processing failed', {
						error: error instanceof Error ? error.message : String(error)
					});
				});
			}, BATCH_DELAY_MS);
		}
	}

	/**
	 * Process queued updates and send to all enabled servers
	 */
	private async processBatch(): Promise<void> {
		if (this.isProcessing || this.pendingUpdates.size === 0) {
			return;
		}

		this.isProcessing = true;

		try {
			// Get updates to process (limit to MAX_BATCH_SIZE)
			const updates: PendingUpdate[] = [];
			const pathsToRemove: string[] = [];

			for (const [path, update] of this.pendingUpdates) {
				if (updates.length >= MAX_BATCH_SIZE) {
					break;
				}
				updates.push(update);
				pathsToRemove.push(path);
			}

			// Remove processed updates from queue
			for (const path of pathsToRemove) {
				this.pendingUpdates.delete(path);
			}

			logger.info('[MediaBrowserNotifier] Processing batch', {
				count: updates.length,
				remaining: this.pendingUpdates.size
			});

			// Send to all enabled servers
			await this.sendToServers(updates);

			// If there are more updates, schedule another batch
			if (this.pendingUpdates.size > 0 && !this.batchTimer) {
				this.batchTimer = setTimeout(() => {
					this.batchTimer = null;
					this.processBatch().catch((error) => {
						logger.error('[MediaBrowserNotifier] Batch processing failed', {
							error: error instanceof Error ? error.message : String(error)
						});
					});
				}, BATCH_DELAY_MS);
			}
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * Send updates to all enabled MediaBrowser servers
	 */
	private async sendToServers(updates: PendingUpdate[]): Promise<void> {
		const manager = getMediaBrowserManager();
		const enabledServers = await manager.getEnabledServers();

		if (enabledServers.length === 0) {
			logger.debug('[MediaBrowserNotifier] No enabled servers, skipping notification');
			return;
		}

		// Group updates by type for logging
		const byType = {
			Created: updates.filter((u) => u.updateType === 'Created').length,
			Modified: updates.filter((u) => u.updateType === 'Modified').length,
			Deleted: updates.filter((u) => u.updateType === 'Deleted').length
		};

		logger.info('[MediaBrowserNotifier] Sending updates to servers', {
			serverCount: enabledServers.length,
			updateCount: updates.length,
			byType
		});

		// Send to each enabled server
		await Promise.all(
			enabledServers.map(async (server) => {
				try {
					// Apply path mappings
					const mappedUpdates = updates.map((update) => ({
						Path: MediaBrowserClient.mapPath(update.path, server.pathMappings),
						UpdateType: update.updateType
					}));

					const payload: LibraryUpdatePayload = {
						Updates: mappedUpdates
					};

					// Get or create client
					const client = new MediaBrowserClient({
						host: server.host,
						apiKey: server.apiKey,
						serverType: server.serverType as 'jellyfin' | 'emby' | 'plex'
					});

					await client.notifyLibraryUpdate(payload);

					logger.debug('[MediaBrowserNotifier] Updates sent to server', {
						serverId: server.id,
						serverName: server.name,
						updateCount: mappedUpdates.length
					});
				} catch (error) {
					logger.error('[MediaBrowserNotifier] Failed to send updates to server', {
						serverId: server.id,
						serverName: server.name,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			})
		);
	}

	/**
	 * Get the current queue size (for monitoring)
	 */
	getQueueSize(): number {
		return this.pendingUpdates.size;
	}
}

// Singleton instance
let notifierInstance: MediaBrowserNotifier | null = null;

/**
 * Get the MediaBrowserNotifier singleton
 */
export function getMediaBrowserNotifier(): MediaBrowserNotifier {
	if (!notifierInstance) {
		notifierInstance = new MediaBrowserNotifier();
	}
	return notifierInstance;
}

export { MediaBrowserNotifier };
