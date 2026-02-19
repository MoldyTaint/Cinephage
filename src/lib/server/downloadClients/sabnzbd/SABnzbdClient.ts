/**
 * SABnzbdClient - Implements IDownloadClient for SABnzbd Usenet downloader.
 * Handles adding NZBs, monitoring downloads, and managing the download queue.
 */

import { logger } from '$lib/logging';
import type {
	IDownloadClient,
	DownloadClientConfig,
	AddDownloadOptions,
	DownloadInfo,
	NntpServerConfig
} from '../core/interfaces';
import type { ConnectionTestResult } from '$lib/types/downloadClient';
import { SABnzbdProxy, SabnzbdApiError } from './SABnzbdProxy';
import type {
	SabnzbdSettings,
	SabnzbdQueueItem,
	SabnzbdHistoryItem,
	SabnzbdDownloadStatus,
	SabnzbdConfig as SabnzbdConfigResponse
} from './types';
import { mapPriorityToSabnzbd } from './types';

/** Config cache TTL in milliseconds (1 minute) */
const CONFIG_CACHE_TTL = 60_000;

/** User-Agent for NZB fetches - looks more legitimate than generic string */
const NZB_FETCH_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Extended config for SABnzbd that includes API key.
 */
export interface SABnzbdConfig extends DownloadClientConfig {
	apiKey?: string | null;
	urlBase?: string;
	normalizeCategoryDir?: boolean;
}

/**
 * Cached SABnzbd config with timestamp.
 */
interface ConfigCache {
	data: SabnzbdConfigResponse;
	fetchedAt: number;
}

/**
 * SABnzbd download client implementation.
 */
export class SABnzbdClient implements IDownloadClient {
	readonly implementation = 'sabnzbd';

	private proxy: SABnzbdProxy;
	private config: SABnzbdConfig;
	private configCache: ConfigCache | null = null;

	constructor(config: SABnzbdConfig) {
		this.config = config;
		this.proxy = new SABnzbdProxy(this.buildSettings());
	}

	/**
	 * Get SABnzbd config with caching to reduce API calls.
	 */
	private async getCachedConfig(): Promise<SabnzbdConfigResponse> {
		const now = Date.now();

		// Return cached config if still valid
		if (this.configCache && now - this.configCache.fetchedAt < CONFIG_CACHE_TTL) {
			return this.configCache.data;
		}

		// Fetch fresh config
		const config = await this.proxy.getConfig();
		this.configCache = { data: config, fetchedAt: now };
		return config;
	}

	/**
	 * Clear the config cache (e.g., after settings change).
	 */
	clearConfigCache(): void {
		this.configCache = null;
	}

	/**
	 * Reset the proxy's incremental polling state.
	 * Call this when you want to force a full refresh.
	 */
	resetPollingState(): void {
		this.proxy.resetPollingState();
	}

	/**
	 * Detect the type of error based on the response content.
	 * Helps diagnose why an NZB fetch failed.
	 */
	private detectNzbErrorType(contentType: string, preview: string): string {
		const lowerPreview = preview.toLowerCase();
		const lowerContentType = contentType.toLowerCase();

		// Cloudflare challenge
		if (
			lowerPreview.includes('cf-') ||
			lowerPreview.includes('cloudflare') ||
			lowerPreview.includes('checking your browser')
		) {
			return 'Cloudflare challenge page - indexer may require browser authentication';
		}

		// Rate limiting
		if (
			lowerPreview.includes('rate limit') ||
			lowerPreview.includes('too many requests') ||
			lowerPreview.includes('429')
		) {
			return 'Rate limited by indexer - try again later';
		}

		// Generic HTML error page
		if (lowerPreview.includes('<!doctype') || lowerPreview.includes('<html')) {
			// Check for common error messages
			if (lowerPreview.includes('not found') || lowerPreview.includes('404')) {
				return 'NZB not found on indexer (404)';
			}
			if (lowerPreview.includes('unauthorized') || lowerPreview.includes('401')) {
				return 'Authentication failed - check API key';
			}
			if (lowerPreview.includes('forbidden') || lowerPreview.includes('403')) {
				return 'Access forbidden - check API key permissions';
			}
			return 'HTML error page returned instead of NZB';
		}

		// JSON error response
		if (lowerContentType.includes('json') || lowerPreview.startsWith('{')) {
			try {
				const parsed = JSON.parse(preview);
				if (parsed.error) {
					return `API error: ${parsed.error}`;
				}
			} catch {
				// Not valid JSON, continue
			}
			return 'JSON response instead of NZB - check indexer API response';
		}

		// Wrong content type
		if (!lowerContentType.includes('nzb') && !lowerContentType.includes('xml')) {
			return `Unexpected content-type: ${contentType}`;
		}

		return 'Response content does not appear to be valid NZB XML';
	}

	/**
	 * Validate that a storage path is a valid subfolder, not just the base directory.
	 * This prevents importing from the base download folder which would scan all files.
	 */
	private isValidStoragePath(storage: string | undefined, completeDir: string): boolean {
		if (!storage || storage.length === 0) return false;

		// Normalize paths (remove trailing slashes)
		const normalizedStorage = storage.replace(/\/+$/, '');
		const normalizedBase = completeDir.replace(/\/+$/, '');

		// Must be longer than base (contains subfolder)
		if (normalizedStorage.length <= normalizedBase.length) return false;

		// Must start with base path + path separator
		// This prevents sibling paths like /downloads_backup matching /downloads
		if (!normalizedStorage.startsWith(normalizedBase + '/')) return false;

		return true;
	}

	/**
	 * Resolve the output path for a history item.
	 * Falls back to constructing from base + category + name if storage is invalid.
	 */
	private async resolveOutputPath(
		item: SabnzbdHistoryItem,
		sabConfig: SabnzbdConfigResponse
	): Promise<string> {
		const baseDir = sabConfig.misc.complete_dir;

		// Use storage if it's valid (not just the base directory)
		if (this.isValidStoragePath(item.storage, baseDir)) {
			return item.storage;
		}

		// Try the alternative path field
		if (item.path && this.isValidStoragePath(item.path, baseDir)) {
			return item.path;
		}

		// Fallback: construct from base + category dir + name
		// Validate item.name before constructing path
		if (!item.name || item.name.trim().length === 0) {
			logger.warn('[SABnzbd] Cannot construct path: item name is empty', {
				nzo_id: item.nzo_id,
				storage: item.storage,
				baseDir
			});
			return baseDir;
		}

		const category = sabConfig.categories.find(
			(c) => c.name.toLowerCase() === item.category?.toLowerCase()
		);
		let outputDir = baseDir;

		if (category?.dir) {
			// Category may have relative or absolute path
			if (category.dir.startsWith('/')) {
				outputDir = category.dir;
			} else if (this.config.normalizeCategoryDir) {
				const normalizedBase = baseDir.replace(/\/+$/, '');
				const baseName = normalizedBase.split('/').pop();
				let relativeDir = category.dir.replace(/^\/+/, '');

				if (baseName && relativeDir.startsWith(`${baseName}/`)) {
					relativeDir = relativeDir.slice(baseName.length + 1);
				}

				outputDir = relativeDir ? `${normalizedBase}/${relativeDir}` : normalizedBase;
			} else {
				outputDir = `${baseDir.replace(/\/+$/, '')}/${category.dir}`;
			}
		}

		const constructedPath = `${outputDir.replace(/\/+$/, '')}/${item.name}`;
		logger.debug('[SABnzbd] Constructed output path from name', {
			nzo_id: item.nzo_id,
			originalStorage: item.storage,
			constructedPath,
			category: item.category
		});

		return constructedPath;
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
				port: this.config.port,
				urlBase: this.config.urlBase ?? ''
			});

			// Get version to test connectivity
			const version = await this.proxy.getVersion();

			// Get config for additional details
			const sabConfig = await this.proxy.getConfig();
			const categories = sabConfig.categories.map((c) => c.name);

			// Get full status for disk space info
			const fullStatus = await this.proxy.getFullStatus();

			// Get warnings
			const sabWarnings = await this.proxy.getWarnings();
			const warnings = sabWarnings.map((w) => `[${w.type}] ${w.text}`);

			logger.info('[SABnzbd] Connection test successful', {
				version,
				diskSpace1: fullStatus.diskspace1,
				diskSpace2: fullStatus.diskspace2,
				warningCount: warnings.length
			});

			return {
				success: true,
				warnings: warnings.length > 0 ? warnings : undefined,
				details: {
					version,
					savePath: sabConfig.misc.complete_dir,
					categories,
					diskSpace1: fullStatus.diskspace1,
					diskSpace2: fullStatus.diskspace2,
					diskSpaceTotal1: fullStatus.diskspacetotal1,
					diskSpaceTotal2: fullStatus.diskspacetotal2
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
	 * Check for existing download with matching title (for duplicate detection).
	 * SABnzbd generates new nzo_ids each time, so we deduplicate by title.
	 * Only checks active/recent downloads - not the entire history.
	 */
	private async findDuplicateByTitle(
		title: string,
		category?: string
	): Promise<DownloadInfo | null> {
		try {
			// Get current downloads (queue + recent history)
			const downloads = await this.getDownloads(category);

			// Normalize title for comparison (remove extension, normalize whitespace)
			const normalizedTitle = title
				.replace(/\.nzb$/i, '')
				.replace(/[._-]/g, ' ')
				.toLowerCase()
				.trim();

			for (const download of downloads) {
				// Skip failed/error downloads (allow retry)
				if (download.status === 'error') continue;

				// Skip completed downloads that have been removed/imported
				// (they're in history but no longer active)
				if (download.status === 'completed' && download.canBeRemoved) continue;

				// Normalize existing download name
				const existingName = download.name
					.replace(/\.nzb$/i, '')
					.replace(/[._-]/g, ' ')
					.toLowerCase()
					.trim();

				// Check for match (exact or very similar)
				if (existingName === normalizedTitle) {
					return download;
				}

				// Also check if one is a substring of the other (handles slight title variations)
				if (existingName.includes(normalizedTitle) || normalizedTitle.includes(existingName)) {
					// Only match if they're very similar (>80% length match)
					const lengthRatio =
						Math.min(existingName.length, normalizedTitle.length) /
						Math.max(existingName.length, normalizedTitle.length);
					if (lengthRatio > 0.8) {
						return download;
					}
				}
			}

			return null;
		} catch (error) {
			// Don't block on duplicate check failure - log and continue
			logger.warn('[SABnzbd] Failed to check for duplicates', {
				title,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
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
			// Check for duplicates before adding (SABnzbd generates new IDs, so we check by title)
			if (options.title) {
				const existingDownload = await this.findDuplicateByTitle(options.title, options.category);
				if (existingDownload) {
					logger.warn('[SABnzbd] Duplicate download detected', {
						title: options.title,
						existingId: existingDownload.id,
						existingStatus: existingDownload.status
					});
					const error = new Error(
						`Duplicate download: "${options.title}" already exists in SABnzbd`
					);
					(error as Error & { existingDownload: DownloadInfo }).existingDownload = existingDownload;
					(error as Error & { isDuplicate: boolean }).isDuplicate = true;
					throw error;
				}
			}
			let response;

			// Check for NZB file content
			const nzbContent = options.nzbFile || options.torrentFile;
			const safeTitle =
				options.title && options.title.trim().length > 0
					? options.title
					: `SABnzbd_Grab_${Date.now()}`;
			const filename = `${safeTitle}.nzb`;

			if (nzbContent) {
				// Already have NZB content - upload directly
				response = await this.proxy.downloadNzb(nzbContent, filename, options.category, priority);
			} else if (options.downloadUrl) {
				// Fetch NZB content ourselves instead of sending URL to SABnzbd
				// This avoids issues where SABnzbd gets blocked by Cloudflare/indexers
				const sanitizedUrl = options.downloadUrl.replace(/apikey=[^&]+/, 'apikey=***');
				logger.info('[SABnzbd] Fetching NZB from URL', { url: sanitizedUrl });

				let nzbResponse: Response;
				try {
					nzbResponse = await fetch(options.downloadUrl, {
						headers: {
							'User-Agent': NZB_FETCH_USER_AGENT,
							Accept: 'application/x-nzb, application/xml, */*'
						}
					});
				} catch (fetchError) {
					const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
					logger.error('[SABnzbd] Network error fetching NZB', {
						url: sanitizedUrl,
						error: message
					});
					throw new Error(`Network error fetching NZB: ${message}`, { cause: fetchError });
				}

				if (!nzbResponse.ok) {
					logger.error('[SABnzbd] HTTP error fetching NZB', {
						url: sanitizedUrl,
						status: nzbResponse.status,
						statusText: nzbResponse.statusText
					});
					throw new Error(
						`Failed to fetch NZB: HTTP ${nzbResponse.status} ${nzbResponse.statusText}`
					);
				}

				// Get response content
				const contentType = nzbResponse.headers.get('content-type') || 'unknown';
				const nzbData = Buffer.from(await nzbResponse.arrayBuffer());

				// Check if it looks like an NZB (starts with XML declaration or nzb tag)
				// Use more of the content for better error detection
				const nzbStart = nzbData.toString('utf8', 0, 500);
				if (!nzbStart.includes('<?xml') && !nzbStart.includes('<nzb')) {
					// Use error type detection for helpful message
					const errorType = this.detectNzbErrorType(contentType, nzbStart);
					const preview = nzbStart.substring(0, 100).replace(/\s+/g, ' ').trim();

					logger.error('[SABnzbd] Response is not a valid NZB', undefined, {
						url: sanitizedUrl,
						contentType,
						errorType,
						preview,
						responseSize: nzbData.length
					});

					throw new Error(`Invalid NZB response: ${errorType}`);
				}

				logger.info('[SABnzbd] NZB fetched successfully, uploading to SABnzbd', {
					size: nzbData.length,
					contentType
				});

				// Upload as file
				response = await this.proxy.downloadNzb(nzbData, filename, options.category, priority);
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
			logger.error('[SABnzbd] Failed to add download', {
				title: options.title,
				category: options.category,
				hasUrl: !!options.downloadUrl,
				hasFile: !!(options.nzbFile || options.torrentFile),
				error: message
			});
			throw error;
		}
	}

	/**
	 * Get all downloads from both queue and history.
	 * Uses a Map to deduplicate by nzo_id, prioritizing history items
	 * since they have valid storage paths (queue items have empty paths).
	 *
	 * Note: History items include all post-processing statuses (Extracting, Moving, etc.)
	 * not just Completed items. This ensures we track items throughout their lifecycle.
	 */
	async getDownloads(category?: string): Promise<DownloadInfo[]> {
		try {
			// Fetch config once for storage path validation (uses cache)
			const sabConfig = await this.getCachedConfig();

			// Use a Map to deduplicate by nzo_id
			// History items take precedence because they have valid storage paths
			const downloadMap = new Map<string, DownloadInfo>();

			// Get history items FIRST (they have valid paths and take priority)
			// Pass category as 3rd param, no nzoIds filter (4th param), no incremental (5th param)
			const history = await this.proxy.getHistory(0, 100, category);
			if (!history) {
				logger.debug('[SABnzbd] History unchanged (incremental poll)');
			} else {
				logger.debug(`[SABnzbd] Fetched ${history.slots.length} history items`);
				for (const item of history.slots) {
					logger.debug(`[SABnzbd] History item`, {
						nzo_id: item.nzo_id,
						name: item.name,
						category: item.category,
						status: item.status,
						storage: item.storage
					});
					const mappedItem = await this.mapHistoryItemAsync(item, sabConfig);
					downloadMap.set(item.nzo_id, mappedItem);
				}
			}

			// Get queue items - only add if not already in map (history takes priority)
			const queue = await this.proxy.getQueue(0, 1000);
			logger.debug(`[SABnzbd] Fetched ${queue.slots.length} queue items`, {
				categoryFilter: category
			});
			for (const item of queue.slots) {
				// Skip if already have this item from history (history has valid paths)
				if (downloadMap.has(item.nzo_id)) {
					logger.debug(`[SABnzbd] Skipping queue item - already in history`, {
						nzo_id: item.nzo_id,
						queueStatus: item.status
					});
					continue;
				}

				logger.debug(`[SABnzbd] Queue item`, {
					nzo_id: item.nzo_id,
					filename: item.filename,
					cat: item.cat,
					status: item.status
				});
				if (!category || item.cat === category) {
					downloadMap.set(item.nzo_id, this.mapQueueItem(item));
				}
			}

			return Array.from(downloadMap.values());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[SABnzbd] Failed to get downloads', { error: message });
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

			// Check history (needs async mapping for storage validation)
			const historyItem = await this.proxy.getHistoryItem(id);
			if (historyItem) {
				const sabConfig = await this.getCachedConfig();
				return this.mapHistoryItemAsync(historyItem, sabConfig);
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
	 * Retry a failed download from history.
	 * Returns the new nzo_id if SABnzbd creates a new queue entry.
	 */
	async retryDownload(id: string): Promise<string | undefined> {
		try {
			const newId = await this.proxy.retry(id);
			logger.info('[SABnzbd] Download retry initiated', { id, newId });
			return newId;
		} catch (error) {
			logger.error('[SABnzbd] Failed to retry download', { id, error });
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
	 * Get the base download path from SABnzbd config.
	 * Used for path mapping when SABnzbd runs on a different machine.
	 */
	async getBasePath(): Promise<string | undefined> {
		try {
			const config = await this.getCachedConfig();
			return config.misc.complete_dir;
		} catch (error) {
			logger.warn('[SABnzbd] Failed to get base path', { error });
			return undefined;
		}
	}

	/**
	 * Get available categories.
	 * Uses lightweight get_cats endpoint instead of full config fetch.
	 */
	async getCategories(): Promise<string[]> {
		try {
			return await this.proxy.getCategories();
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
	 * Get NNTP server configurations from SABnzbd.
	 * Note: SABnzbd masks passwords in the API response.
	 * Users must enter passwords manually in Cinephage settings.
	 */
	async getNntpServers(): Promise<NntpServerConfig[]> {
		try {
			const config = await this.proxy.getConfig();
			const servers: NntpServerConfig[] = [];

			if (config.servers) {
				for (let i = 0; i < config.servers.length; i++) {
					const server = config.servers[i];

					// Skip if no host configured
					if (!server.host) continue;

					servers.push({
						name: server.name || `Server ${i + 1}`,
						host: server.host,
						port: server.port || 563,
						useSsl: server.ssl ?? true,
						// SABnzbd masks passwords - user must enter manually
						username: undefined,
						password: undefined,
						maxConnections: server.connections || 8,
						// Use array index as priority (first server = highest priority)
						priority: i,
						enabled: server.enable ?? true
					});
				}
			}

			logger.info('[SABnzbd] Fetched NNTP servers', {
				count: servers.length,
				note: 'Passwords masked by SABnzbd API - user must enter manually'
			});
			return servers;
		} catch (error) {
			logger.error('[SABnzbd] Failed to fetch NNTP servers', {
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			return [];
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
			progress: item.percentage / 100, // Normalize to 0-1 (SABnzbd returns 0-100)
			status: this.mapStatus(item.status, item.percentage),
			size: this.parseMbToBytes(item.mb),
			downloadSpeed: this.parseSpeedToBytes(item.speed),
			uploadSpeed: 0, // Usenet doesn't upload
			eta: this.parseTimeToSeconds(item.timeleft),
			savePath: '', // Not available in queue
			contentPath: '', // Not available until complete
			category: item.cat,
			// Usenet downloads can always be moved (no seeding)
			canMoveFiles: true,
			// Can be removed when no longer in queue (still downloading = not removable)
			canBeRemoved: false,
			removed: false
		};
	}

	/**
	 * Estimate progress for history items based on post-processing status.
	 * Download is 100%, post-processing stages should show meaningful progress.
	 * Returns normalized 0-1 range.
	 */
	private estimateHistoryProgress(status: SabnzbdDownloadStatus, isCompleted: boolean): number {
		if (isCompleted) return 1;

		// Post-processing stages happen after download is 100%
		// Estimate progress through the pipeline (normalized to 0-1)
		switch (status) {
			case 'Completed':
				return 1;
			case 'Verifying':
			case 'QuickCheck':
			case 'Checking':
				return 0.85; // Download done, verifying
			case 'Repairing':
				return 0.88; // Repairing pars
			case 'Extracting':
				return 0.92; // Extracting archives
			case 'Moving':
				return 0.97; // Almost done
			case 'Running':
				return 0.95; // Running post-scripts
			case 'Failed':
			case 'Deleted':
				return 0;
			default:
				return 0.8; // Generic post-processing
		}
	}

	/**
	 * Map SABnzbd history item to DownloadInfo with storage path validation.
	 * Only marks as completed if both status is 'Completed' AND storage path is valid.
	 * This prevents premature imports when the path is still the base directory.
	 */
	private async mapHistoryItemAsync(
		item: SabnzbdHistoryItem,
		sabConfig: SabnzbdConfigResponse
	): Promise<DownloadInfo> {
		const baseDir = sabConfig.misc.complete_dir;
		const hasValidStorage = this.isValidStoragePath(item.storage, baseDir);
		const outputPath = await this.resolveOutputPath(item, sabConfig);

		if (this.config.normalizeCategoryDir) {
			logger.debug('[SABnzbd] Resolved output path (normalized)', {
				nzo_id: item.nzo_id,
				storage: item.storage,
				path: item.path,
				category: item.category,
				baseDir,
				outputPath
			});
		}

		// Only truly completed if status is 'Completed' AND storage path is valid
		// This prevents premature imports when storage is just the base directory
		const isCompleted = item.status === 'Completed' && hasValidStorage;

		if (item.status === 'Completed' && !hasValidStorage) {
			logger.warn('[SABnzbd] Item marked Completed but storage path is invalid', {
				nzo_id: item.nzo_id,
				name: item.name,
				storage: item.storage,
				baseDir,
				resolvedPath: outputPath
			});
		}

		return {
			id: item.nzo_id,
			name: item.name,
			hash: item.nzo_id,
			progress: this.estimateHistoryProgress(item.status, isCompleted),
			// If SABnzbd says 'Completed' but storage path is invalid, mark as 'postprocessing'
			// This indicates download is done but files aren't ready yet (extraction, moving, etc.)
			status: isCompleted
				? 'completed'
				: item.status === 'Completed'
					? 'postprocessing'
					: this.mapStatus(item.status, 0),
			size: item.bytes,
			downloadSpeed: 0,
			uploadSpeed: 0,
			savePath: outputPath,
			contentPath: outputPath,
			category: item.category,
			completedOn: item.completed ? new Date(item.completed * 1000) : undefined,
			// Usenet downloads can always be moved (no seeding)
			canMoveFiles: true,
			// Usenet can be removed once completed
			canBeRemoved: isCompleted,
			removed: false,
			errorMessage: item.fail_message || undefined
		};
	}

	/**
	 * Map SABnzbd status to DownloadInfo status.
	 */
	private mapStatus(sabStatus: SabnzbdDownloadStatus, _percentage: number): DownloadInfo['status'] {
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

			// Post-processing stages - always treat as downloading until truly complete
			// SABnzbd moves items to history with 'Completed' status only after post-processing finishes
			case 'Checking':
			case 'QuickCheck':
			case 'Verifying':
			case 'Repairing':
			case 'Extracting':
			case 'Moving':
			case 'Running':
				return 'downloading';

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
