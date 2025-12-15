/**
 * SABnzbdClient - Implements IDownloadClient for SABnzbd Usenet downloader.
 * Handles adding NZBs, monitoring downloads, and managing the download queue.
 */

import { logger } from '$lib/logging';
import type {
	IDownloadClient,
	DownloadClientConfig,
	AddDownloadOptions,
	DownloadInfo
} from '../core/interfaces';
import type { ConnectionTestResult } from '$lib/types/downloadClient';
import { SABnzbdProxy, SabnzbdApiError } from './SABnzbdProxy';
import type {
	SabnzbdSettings,
	SabnzbdQueueItem,
	SabnzbdHistoryItem,
	SabnzbdDownloadStatus
} from './types';
import { mapPriorityToSabnzbd } from './types';

/**
 * Extended config for SABnzbd that includes API key.
 */
export interface SABnzbdConfig extends DownloadClientConfig {
	apiKey?: string | null;
	urlBase?: string;
}

/**
 * SABnzbd download client implementation.
 */
export class SABnzbdClient implements IDownloadClient {
	readonly implementation = 'sabnzbd';

	private proxy: SABnzbdProxy;
	private config: SABnzbdConfig;

	constructor(config: SABnzbdConfig) {
		this.config = config;
		this.proxy = new SABnzbdProxy(this.buildSettings());
	}

	/**
	 * Build SABnzbd settings from config.
	 */
	private buildSettings(): SabnzbdSettings {
		return {
			host: this.config.host,
			port: this.config.port,
			useSsl: this.config.useSsl,
			apiKey: this.config.apiKey || '',
			urlBase: this.config.urlBase,
			username: this.config.username || undefined,
			password: this.config.password || undefined
		};
	}

	/**
	 * Test connection to SABnzbd.
	 */
	async test(): Promise<ConnectionTestResult> {
		try {
			logger.debug('[SABnzbd] Testing connection', {
				host: this.config.host,
				port: this.config.port
			});

			// Get version to test connectivity
			const version = await this.proxy.getVersion();

			// Get config for additional details
			const sabConfig = await this.proxy.getConfig();
			const categories = sabConfig.categories.map((c) => c.name);

			logger.info('[SABnzbd] Connection test successful', { version });

			return {
				success: true,
				details: {
					version,
					savePath: sabConfig.misc.complete_dir,
					categories
				}
			};
		} catch (error) {
			const message =
				error instanceof SabnzbdApiError
					? error.message
					: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`;

			logger.error('[SABnzbd] Connection test failed', { error: message });

			return {
				success: false,
				error: message
			};
		}
	}

	/**
	 * Add a download to SABnzbd.
	 * Returns the NZB ID (nzo_id).
	 */
	async addDownload(options: AddDownloadOptions): Promise<string> {
		const priority = mapPriorityToSabnzbd(options.priority);

		logger.info('[SABnzbd] Adding download', {
			title: options.title,
			category: options.category,
			priority,
			hasNzbFile: !!(options.nzbFile || options.torrentFile),
			hasUrl: !!options.downloadUrl,
			optionsKeys: Object.keys(options)
		});

		try {
			let response;

			// Check for NZB file content
			const nzbContent = options.nzbFile || options.torrentFile;
			if (nzbContent) {
				const safeTitle = options.title && options.title.trim().length > 0 ? options.title : `SABnzbd_Grab_${Date.now()}`;
				const filename = `${safeTitle}.nzb`;
				response = await this.proxy.downloadNzb(nzbContent, filename, options.category, priority);
			} else if (options.downloadUrl) {
				const safeTitle = options.title && options.title.trim().length > 0 ? options.title : `SABnzbd_Grab_${Date.now()}`;
				const filename = `${safeTitle}.nzb`;
				response = await this.proxy.downloadNzbByUrl(
					options.downloadUrl,
					options.category,
					priority,
					filename
				);
			} else {
				throw new Error('Must provide either NZB file content or download URL');
			}

			if (!response.status || !response.nzo_ids?.length) {
				throw new Error('SABnzbd did not return an NZB ID');
			}

			const nzoId = response.nzo_ids[0];
			logger.info('[SABnzbd] Download added successfully', { nzoId });

			// Pause if requested
			if (options.paused) {
				await this.proxy.pause(nzoId);
			}

			return nzoId;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[SABnzbd] Failed to add download', { error: message });
			throw error;
		}
	}

	/**
	 * Get all downloads from both queue and history.
	 */
	async getDownloads(category?: string): Promise<DownloadInfo[]> {
		const downloads: DownloadInfo[] = [];

		try {
			// Get queue items
			const queue = await this.proxy.getQueue(0, 1000);
			logger.debug(`[SABnzbd] Fetched ${queue.slots.length} queue items`, { categoryFilter: category });
			for (const item of queue.slots) {
				logger.debug(`[SABnzbd] Queue item`, {
					nzo_id: item.nzo_id,
					filename: item.filename,
					cat: item.cat,
					status: item.status
				});
				if (!category || item.cat === category) {
					downloads.push(this.mapQueueItem(item));
				}
			}

			// Get recent history items (completed downloads)
			const history = await this.proxy.getHistory(0, 100, category);
			logger.debug(`[SABnzbd] Fetched ${history.slots.length} history items`);
			for (const item of history.slots) {
				logger.debug(`[SABnzbd] History item`, {
					nzo_id: item.nzo_id,
					name: item.name,
					category: item.category,
					status: item.status
				});
				// Only include completed items
				if (item.status === 'Completed') {
					downloads.push(this.mapHistoryItem(item));
				}
			}

			return downloads;
		} catch (error) {
			logger.error('[SABnzbd] Failed to get downloads', { error });
			throw error;
		}
	}

	/**
	 * Get a specific download by ID.
	 */
	async getDownload(id: string): Promise<DownloadInfo | null> {
		try {
			// Check queue first
			const queueItem = await this.proxy.getQueueItem(id);
			if (queueItem) {
				return this.mapQueueItem(queueItem);
			}

			// Check history
			const historyItem = await this.proxy.getHistoryItem(id);
			if (historyItem) {
				return this.mapHistoryItem(historyItem);
			}

			return null;
		} catch (error) {
			logger.error('[SABnzbd] Failed to get download', { id, error });
			throw error;
		}
	}

	/**
	 * Remove a download from queue or history.
	 */
	async removeDownload(id: string, deleteFiles: boolean = false): Promise<void> {
		try {
			// Try removing from queue first
			const queueItem = await this.proxy.getQueueItem(id);
			if (queueItem) {
				await this.proxy.removeFrom('queue', id, deleteFiles);
				logger.info('[SABnzbd] Removed from queue', { id });
				return;
			}

			// Try removing from history
			await this.proxy.removeFrom('history', id, deleteFiles);
			logger.info('[SABnzbd] Removed from history', { id });
		} catch (error) {
			logger.error('[SABnzbd] Failed to remove download', { id, error });
			throw error;
		}
	}

	/**
	 * Pause a download.
	 */
	async pauseDownload(id: string): Promise<void> {
		try {
			await this.proxy.pause(id);
			logger.info('[SABnzbd] Download paused', { id });
		} catch (error) {
			logger.error('[SABnzbd] Failed to pause download', { id, error });
			throw error;
		}
	}

	/**
	 * Resume a download.
	 */
	async resumeDownload(id: string): Promise<void> {
		try {
			await this.proxy.resume(id);
			logger.info('[SABnzbd] Download resumed', { id });
		} catch (error) {
			logger.error('[SABnzbd] Failed to resume download', { id, error });
			throw error;
		}
	}

	/**
	 * Get the default save path from SABnzbd config.
	 */
	async getDefaultSavePath(): Promise<string> {
		try {
			const config = await this.proxy.getConfig();
			return config.misc.complete_dir;
		} catch (error) {
			logger.error('[SABnzbd] Failed to get default save path', { error });
			throw error;
		}
	}

	/**
	 * Get available categories.
	 */
	async getCategories(): Promise<string[]> {
		try {
			const config = await this.proxy.getConfig();
			return config.categories.map((c) => c.name);
		} catch (error) {
			logger.error('[SABnzbd] Failed to get categories', { error });
			throw error;
		}
	}

	/**
	 * Ensure a category exists.
	 * Note: SABnzbd doesn't support creating categories via API,
	 * so this just verifies it exists.
	 */
	async ensureCategory(name: string, _savePath?: string): Promise<void> {
		try {
			const config = await this.proxy.getConfig();
			const exists = config.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());

			if (!exists) {
				logger.warn('[SABnzbd] Category does not exist and cannot be created via API', {
					category: name
				});
			}
		} catch (error) {
			logger.error('[SABnzbd] Failed to check category', { name, error });
			throw error;
		}
	}

	/**
	 * Map SABnzbd queue item to DownloadInfo.
	 */
	private mapQueueItem(item: SabnzbdQueueItem): DownloadInfo {
		return {
			id: item.nzo_id,
			name: item.filename,
			hash: item.nzo_id, // SABnzbd uses nzo_id instead of hash
			progress: item.percentage,
			status: this.mapStatus(item.status, item.percentage),
			size: this.parseMbToBytes(item.mb),
			downloadSpeed: this.parseSpeedToBytes(item.speed),
			uploadSpeed: 0, // Usenet doesn't upload
			eta: this.parseTimeToSeconds(item.timeleft),
			savePath: '', // Not available in queue
			contentPath: '', // Not available until complete
			category: item.cat
		};
	}

	/**
	 * Map SABnzbd history item to DownloadInfo.
	 */
	private mapHistoryItem(item: SabnzbdHistoryItem): DownloadInfo {
		return {
			id: item.nzo_id,
			name: item.name,
			hash: item.nzo_id,
			progress: item.status === 'Completed' ? 100 : 0,
			status: this.mapStatus(item.status, item.status === 'Completed' ? 100 : 0),
			size: item.bytes,
			downloadSpeed: 0,
			uploadSpeed: 0,
			savePath: item.storage,
			contentPath: item.storage,
			category: item.category,
			completedOn: item.completed ? new Date(item.completed * 1000) : undefined,
			canBeRemoved: item.status === 'Completed'
		};
	}

	/**
	 * Map SABnzbd status to DownloadInfo status.
	 */
	private mapStatus(sabStatus: SabnzbdDownloadStatus, percentage: number): DownloadInfo['status'] {
		switch (sabStatus) {
			case 'Downloading':
			case 'Grabbing':
			case 'Fetching':
				return 'downloading';

			case 'Paused':
				return 'paused';

			case 'Queued':
			case 'Propagating':
				return 'queued';

			case 'Completed':
				return 'completed';

			case 'Failed':
			case 'Deleted':
				return 'error';

			// Post-processing stages - treat as downloading if not 100%
			case 'Checking':
			case 'QuickCheck':
			case 'Verifying':
			case 'Repairing':
			case 'Extracting':
			case 'Moving':
			case 'Running':
				return percentage >= 100 ? 'completed' : 'downloading';

			default:
				return 'queued';
		}
	}

	/**
	 * Parse MB string to bytes.
	 */
	private parseMbToBytes(mb: string | undefined): number {
		if (!mb) return 0;
		const parsed = parseFloat(mb);
		return isNaN(parsed) ? 0 : Math.round(parsed * 1024 * 1024);
	}

	/**
	 * Parse speed string (KB/s) to bytes/s.
	 */
	private parseSpeedToBytes(speed: string | undefined): number {
		if (!speed) return 0;
		// SABnzbd returns speed as string like "1.5 M" or "500 K"
		const match = speed.match(/([\d.]+)\s*([KMG])?/i);
		if (!match) return 0;

		const value = parseFloat(match[1]);
		const unit = (match[2] || 'K').toUpperCase();

		switch (unit) {
			case 'G':
				return Math.round(value * 1024 * 1024 * 1024);
			case 'M':
				return Math.round(value * 1024 * 1024);
			case 'K':
			default:
				return Math.round(value * 1024);
		}
	}

	/**
	 * Parse time string (HH:MM:SS) to seconds.
	 */
	private parseTimeToSeconds(time: string | undefined): number | undefined {
		if (!time) return undefined;

		const parts = time.split(':').map(Number);
		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		}
		return undefined;
	}
}
