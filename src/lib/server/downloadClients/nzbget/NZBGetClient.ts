import { logger } from '$lib/logging';
import type {
	IDownloadClient,
	DownloadClientConfig,
	AddDownloadOptions,
	DownloadInfo,
	ConnectionTestResult
} from '$lib/server/downloadClients/core/interfaces';
import type { JsonRpcResponse, NzbgetGroup, NzbgetHistory, NzbgetStatus } from './types';

export class NZBGetClient implements IDownloadClient {
	readonly implementation = 'nzbget';
	private config: DownloadClientConfig;

	constructor(config: DownloadClientConfig) {
		this.config = config;
		logger.debug('[NZBGet] Initialized with config', {
			host: config.host,
			port: config.port,
			useSsl: config.useSsl,
			hasAuth: !!(config.username && config.password)
		});
	}

	private get baseUrl(): string {
		const protocol = this.config.useSsl ? 'https' : 'http';
		// Sanitize host to ensure no protocol or credentials sneak in
		let host = this.config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
		// Remove content before @ if present (credentials)
		if (host.includes('@')) {
			host = host.split('@').pop() || host;
		}

		const url = `${protocol}://${host}:${this.config.port}/jsonrpc`;
		logger.debug(`[NZBGet] Constructed Base URL: ${url}`);
		return url;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async request<T>(method: string, params: any[] = []): Promise<T> {
		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			if (this.config.username && this.config.password) {
				const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
					'base64'
				);
				headers['Authorization'] = `Basic ${auth}`;
			}

			logger.debug(`[NZBGet] Sending request to ${this.baseUrl} method: ${method}`);

			const response = await fetch(this.baseUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					method,
					params
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as JsonRpcResponse<T>;

			if (data.error) {
				throw new Error(`NZBGet Error: ${data.error.name} - ${data.error.message}`);
			}

			return data.result;
		} catch (error) {
			logger.error(`[NZBGet] Request failed: ${method}`, {
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			throw error;
		}
	}

	async test(): Promise<ConnectionTestResult> {
		try {
			const _status = await this.request<NzbgetStatus>('status');
			const version = await this.request<string>('version');

			// Try to get MainDir from config
			let savePath = '';
			try {
				const configMap = await this.request<Record<string, string>>('config');
				savePath = configMap['MainDir'] || '';
			} catch {
				// Ignore config fetch error, not critical
			}

			return {
				success: true,
				details: {
					version,
					savePath
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async addDownload(options: AddDownloadOptions): Promise<string> {
		const name = options.title || 'download.nzb';
		const category = options.category || '';
		const priority = this.mapPriority(options.priority);
		const paused = options.paused ?? false;
		const dupeKey = options.infoHash || '';
		const dupeScore = 0;
		const dupeMode = 'SCORE';
		const pparams = [{ Name: 'x-category', Value: category }];

		logger.info('[NZBGet] Adding download', {
			name,
			category,
			priority,
			hasNzbFile: !!options.nzbFile,
			hasUrl: !!options.downloadUrl
		});

		let nzbId: number;

		if (options.nzbFile) {
			const content = options.nzbFile.toString('base64');
			nzbId = await this.request<number>('append', [
				name,
				content,
				category,
				priority,
				false, // addToTop
				paused,
				dupeKey,
				dupeScore,
				dupeMode,
				pparams
			]);
		} else if (options.downloadUrl) {
			nzbId = await this.request<number>('appendurl', [
				name,
				options.downloadUrl,
				category,
				priority,
				false, // addToTop
				paused,
				dupeKey,
				dupeScore,
				dupeMode,
				pparams
			]);
		} else {
			throw new Error('Must provide either NZB file or download URL');
		}

		if (nzbId > 0) {
			logger.info('[NZBGet] Download added successfully', { nzbId });
			return nzbId.toString();
		} else {
			throw new Error('NZBGet failed to add download');
		}
	}

	async getDownloads(category?: string): Promise<DownloadInfo[]> {
		const [groups, history] = await Promise.all([
			this.request<NzbgetGroup[]>('listgroups', [0, 1000]), // 0 = unlimited, but limit to sane number
			this.request<NzbgetHistory[]>('history', [false, 0, 100]) // false = exclude hidden
		]);

		const results: DownloadInfo[] = [];

		logger.debug(`[NZBGet] Fetched ${groups.length} groups and ${history.length} history items`, {
			categoryFilter: category
		});

		// Map active downloads (groups)
		for (const task of groups) {
			// Type assertion hack because nzbget types are loose and response varies by version
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const item = task as any;

			logger.debug(`[NZBGet] Group item`, {
				NZBID: item.NZBID,
				NZBName: item.NZBName,
				Category: item.Category
			});

			if (category && item.Category && item.Category.toLowerCase() !== category.toLowerCase())
				continue;

			results.push({
				id: item.NZBID.toString(),
				name: item.NZBName,
				hash: item.NZBID.toString(),
				progress:
					((item.DownloadedSizeHi * 4294967296 + item.DownloadedSizeLo) /
						(item.FileSizeHi * 4294967296 + item.FileSizeLo || 1)) *
					100,
				status: this.mapStatus(item.Status),
				size: item.FileSizeHi * 4294967296 + item.FileSizeLo,
				downloadSpeed: 0, // Rate is global in 'status', not per-torrent easily
				uploadSpeed: 0,
				eta: 0, // Needs calculation or separate call
				category: item.Category,
				savePath: item.DestDir,
				contentPath: item.DestDir
			});
		}

		// Map history
		for (const item of history) {
			logger.debug(`[NZBGet] History item`, {
				ID: item.ID,
				Name: item.Name,
				Category: item.Category
			});

			if (category && item.Category && item.Category.toLowerCase() !== category.toLowerCase())
				continue;

			results.push({
				id: item.ID.toString(),
				name: item.Name,
				hash: item.ID.toString(),
				progress: item.Status === 'SUCCESS' ? 100 : 0,
				status: item.Status === 'SUCCESS' ? 'completed' : 'error',
				size: item.FileSizeHi * 4294967296 + item.FileSizeLo,
				downloadSpeed: 0,
				uploadSpeed: 0,
				category: item.Category,
				savePath: item.DestDir,
				contentPath: item.DestDir,
				completedOn: new Date((item.UnixTimeHi * 4294967296 + item.UnixTimeLo) * 1000),
				canBeRemoved: item.Status === 'SUCCESS'
			});
		}

		return results;
	}

	async getDownload(id: string): Promise<DownloadInfo | null> {
		// NZBGet doesn't have a direct "get one" for groups, so we scan
		const downloads = await this.getDownloads();
		return downloads.find((d) => d.id === id) || null;
	}

	async removeDownload(id: string, _deleteFiles: boolean = false): Promise<void> {
		// Remove from history
		const historySuccess = await this.request<boolean>('editqueue', [
			'HistoryDelete',
			0,
			'',
			[parseInt(id)]
		]);

		if (!historySuccess) {
			// Try removing from group (active)
			await this.request<boolean>('editqueue', ['GroupDelete', 0, '', [parseInt(id)]]);
		}
	}

	async pauseDownload(id: string): Promise<void> {
		await this.request<boolean>('editqueue', ['GroupPause', 0, '', [parseInt(id)]]);
	}

	async resumeDownload(id: string): Promise<void> {
		await this.request<boolean>('editqueue', ['GroupResume', 0, '', [parseInt(id)]]);
	}

	async getDefaultSavePath(): Promise<string> {
		try {
			const configMap = await this.request<Record<string, string>>('config');
			return configMap['MainDir'] || '';
		} catch {
			return '';
		}
	}

	async getCategories(): Promise<string[]> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const _configMap = await this.request<any[]>('config');
			// Categories are defined as Category1.Name, Category2.Name etc
			const _categories: string[] = [];
			// This is complex to parse from the flat config list, simple fallback for now:
			return [];
		} catch {
			return [];
		}
	}

	async ensureCategory(_name: string, _savePath?: string): Promise<void> {
		// NZBGet config is complex to update via API, strict implementation skipped for MVP
		return;
	}

	private mapPriority(priority?: 'normal' | 'high' | 'force'): number {
		switch (priority) {
			case 'force':
				return 100; // Force
			case 'high':
				return 50; // High
			case 'normal':
			default:
				return 0; // Normal
		}
	}

	private mapStatus(status: string): DownloadInfo['status'] {
		switch (status) {
			case 'DOWNLOADING':
				return 'downloading';
			case 'PAUSED':
				return 'paused';
			case 'QUEUED':
				return 'queued';
			case 'SUCCESS':
				return 'completed';
			case 'FAILURE':
			case 'DELETED':
				return 'error';
			default:
				return 'downloading';
		}
	}
}
