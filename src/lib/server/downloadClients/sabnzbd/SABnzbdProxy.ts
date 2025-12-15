/**
 * SABnzbdProxy - Handles all HTTP communication with SABnzbd API.
 * Follows the pattern from Prowlarr's SabnzbdProxy.cs.
 */

import { logger } from '$lib/logging';
import type {
	SabnzbdSettings,
	SabnzbdAddResponse,
	SabnzbdConfig,
	SabnzbdConfigResponse,
	SabnzbdQueue,
	SabnzbdHistory,
	SabnzbdVersionResponse,
	SabnzbdFullStatus,
	SabnzbdFullStatusResponse,
	SabnzbdErrorResponse
} from './types';

/**
 * Error thrown when SABnzbd API returns an error.
 */
export class SabnzbdApiError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number
	) {
		super(message);
		this.name = 'SabnzbdApiError';
	}
}

/**
 * Proxy class for SABnzbd API communication.
 */
export class SABnzbdProxy {
	private settings: SabnzbdSettings;

	constructor(settings: SabnzbdSettings) {
		this.settings = settings;
	}

	/**
	 * Build the base URL for SABnzbd API.
	 */
	getBaseUrl(relativePath: string = ''): string {
		const protocol = this.settings.useSsl ? 'https' : 'http';
		const urlBase = this.settings.urlBase?.replace(/^\/|\/$/g, '') || '';
		const base = `${protocol}://${this.settings.host}:${this.settings.port}`;

		if (urlBase) {
			return `${base}/${urlBase}/${relativePath}`.replace(/\/+$/, '');
		}
		return `${base}/${relativePath}`.replace(/\/+$/, '');
	}

	/**
	 * Get SABnzbd version for testing connectivity.
	 */
	async getVersion(): Promise<string> {
		const response = await this.executeRequest<SabnzbdVersionResponse>('version');
		return response.version || 'Unknown';
	}

	/**
	 * Get SABnzbd configuration (categories, paths, etc.).
	 */
	async getConfig(): Promise<SabnzbdConfig> {
		const response = await this.executeRequest<SabnzbdConfigResponse>('get_config');
		return response.config;
	}

	/**
	 * Get SABnzbd full status (paused state, speeds, paths).
	 */
	async getFullStatus(): Promise<SabnzbdFullStatus> {
		const params = new URLSearchParams();
		params.set('skip_dashboard', '1');
		const response = await this.executeRequest<SabnzbdFullStatusResponse>('fullstatus', params);
		return response.status;
	}

	/**
	 * Get the download queue.
	 */
	async getQueue(start: number = 0, limit: number = 100): Promise<SabnzbdQueue> {
		const params = new URLSearchParams();
		params.set('start', start.toString());
		params.set('limit', limit.toString());

		const response = await this.executeRequest<{ queue: SabnzbdQueue }>('queue', params);
		return response.queue;
	}

	/**
	 * Get download history.
	 */
	async getHistory(
		start: number = 0,
		limit: number = 100,
		category?: string
	): Promise<SabnzbdHistory> {
		const params = new URLSearchParams();
		params.set('start', start.toString());
		params.set('limit', limit.toString());
		if (category) {
			params.set('category', category);
		}

		const response = await this.executeRequest<{ history: SabnzbdHistory }>('history', params);
		return response.history;
	}

	/**
	 * Add NZB by uploading file content.
	 */
	async downloadNzb(
		nzbData: Buffer,
		filename: string,
		category: string,
		priority: number
	): Promise<SabnzbdAddResponse> {
		const params = new URLSearchParams();
		params.set('cat', category);
		params.set('priority', priority.toString());
		params.set('nzbname', filename);

		const response = await this.executeMultipartRequest(
			'addfile',
			params,
			{
				name: 'name',
				filename,
				data: nzbData,
				contentType: 'application/x-nzb'
			},
			{
				nzbname: filename
			}
		);

		return this.parseAddResponse(response);
	}

	/**
	 * Add NZB by URL.
	 */
	async downloadNzbByUrl(
		url: string,
		category: string,
		priority: number,
		nzbName?: string
	): Promise<SabnzbdAddResponse> {
		const params = new URLSearchParams();
		params.set('name', url);
		params.set('cat', category);
		params.set('priority', priority.toString());
		if (nzbName) {
			params.set('nzbname', nzbName);
		}

		const response = await this.executeRequest<SabnzbdAddResponse | SabnzbdErrorResponse>(
			'addurl',
			params,
			'POST'
		);

		return this.parseAddResponse(response);
	}

	/**
	 * Remove item from queue or history.
	 * @param source 'queue' or 'history'
	 */
	async removeFrom(source: 'queue' | 'history', id: string, deleteData: boolean): Promise<void> {
		const params = new URLSearchParams();
		params.set('name', 'delete');
		params.set('value', id);
		params.set('del_files', deleteData ? '1' : '0');

		await this.executeRequest<unknown>(source, params);
	}

	/**
	 * Pause a specific download.
	 */
	async pause(id: string): Promise<void> {
		const params = new URLSearchParams();
		params.set('name', 'pause');
		params.set('value', id);

		await this.executeRequest<unknown>('queue', params);
	}

	/**
	 * Resume a specific download.
	 */
	async resume(id: string): Promise<void> {
		const params = new URLSearchParams();
		params.set('name', 'resume');
		params.set('value', id);

		await this.executeRequest<unknown>('queue', params);
	}

	/**
	 * Retry a failed download from history.
	 */
	async retry(id: string): Promise<string | undefined> {
		const params = new URLSearchParams();
		params.set('value', id);

		const response = await this.executeRequest<{ status: boolean; nzo_id?: string }>(
			'retry',
			params
		);
		return response.nzo_id;
	}

	/**
	 * Get a single queue item by ID.
	 */
	async getQueueItem(id: string): Promise<SabnzbdQueue['slots'][0] | undefined> {
		const queue = await this.getQueue(0, 1000);
		return queue.slots.find((item) => item.nzo_id === id);
	}

	/**
	 * Get a single history item by ID.
	 */
	async getHistoryItem(id: string): Promise<SabnzbdHistory['slots'][0] | undefined> {
		// Check history - SABnzbd doesn't have a direct lookup, so we search
		const history = await this.getHistory(0, 100);
		return history.slots.find((item) => item.nzo_id === id);
	}

	/**
	 * Build authentication parameters.
	 */
	private getAuthParams(): URLSearchParams {
		const params = new URLSearchParams();

		if (this.settings.apiKey) {
			params.set('apikey', this.settings.apiKey);
		} else if (this.settings.username && this.settings.password) {
			params.set('ma_username', this.settings.username);
			params.set('ma_password', this.settings.password);
		}

		params.set('output', 'json');
		return params;
	}

	/**
	 * Execute a standard API request.
	 */
	private async executeRequest<T>(
		mode: string,
		additionalParams?: URLSearchParams,
		method: 'GET' | 'POST' = 'GET'
	): Promise<T> {
		const url = new URL(this.getBaseUrl('api'));

		// Add mode and auth params
		url.searchParams.set('mode', mode);
		const authParams = this.getAuthParams();
		authParams.forEach((value, key) => url.searchParams.set(key, value));

		// Add additional params
		if (additionalParams) {
			additionalParams.forEach((value, key) => url.searchParams.set(key, value));
		}

		logger.debug('[SABnzbd] API request', {
			mode,
			url: url.toString().replace(/apikey=[^&]+/, 'apikey=***')
		});

		try {
			const response = await fetch(url.toString(), {
				method,
				headers: {
					Accept: 'application/json'
				}
			});

			if (!response.ok) {
				throw new SabnzbdApiError(
					`SABnzbd API returned ${response.status}: ${response.statusText}`,
					response.status
				);
			}

			const text = await response.text();
			this.checkForError(text);

			return JSON.parse(text) as T;
		} catch (error) {
			if (error instanceof SabnzbdApiError) {
				throw error;
			}
			throw new SabnzbdApiError(
				`Failed to connect to SABnzbd: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Execute a multipart form request (for file uploads).
	 */
	private async executeMultipartRequest(
		mode: string,
		additionalParams: URLSearchParams,
		file: { name: string; filename: string; data: Buffer; contentType: string },
		fields?: Record<string, string>
	): Promise<unknown> {
		const url = new URL(this.getBaseUrl('api'));

		// Add mode and auth params to URL
		url.searchParams.set('mode', mode);
		const authParams = this.getAuthParams();
		authParams.forEach((value, key) => url.searchParams.set(key, value));
		additionalParams.forEach((value, key) => url.searchParams.set(key, value));

		logger.debug('[SABnzbd] Multipart request', { mode, filename: file.filename });

		// Build multipart form data
		const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
		const parts: Buffer[] = [];

		// Add file part
		parts.push(
			Buffer.from(
				`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
				`Content-Type: ${file.contentType}\r\n\r\n`
			)
		);
		parts.push(file.data);
		parts.push(Buffer.from('\r\n'));

		// Add additional fields if provided
		if (fields) {
			for (const [key, value] of Object.entries(fields)) {
				parts.push(
					Buffer.from(
						`--${boundary}\r\n` + `Content-Disposition: form-data; name="${key}"\r\n\r\n` + `${value}\r\n`
					)
				);
			}
		}

		// End boundary
		parts.push(Buffer.from(`--${boundary}--\r\n`));

		const body = Buffer.concat(parts);

		try {
			const response = await fetch(url.toString(), {
				method: 'POST',
				headers: {
					'Content-Type': `multipart/form-data; boundary=${boundary}`,
					Accept: 'application/json'
				},
				body
			});

			if (!response.ok) {
				throw new SabnzbdApiError(
					`SABnzbd API returned ${response.status}: ${response.statusText}`,
					response.status
				);
			}

			const text = await response.text();
			this.checkForError(text);

			return JSON.parse(text);
		} catch (error) {
			if (error instanceof SabnzbdApiError) {
				throw error;
			}
			throw new SabnzbdApiError(
				`Failed to upload to SABnzbd: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Check response for SABnzbd error format.
	 */
	private checkForError(responseText: string): void {
		// Handle plain text error responses
		if (responseText.toLowerCase().startsWith('error')) {
			throw new SabnzbdApiError(responseText.replace(/^error:\s*/i, ''));
		}

		// Try to parse as JSON error
		try {
			const parsed = JSON.parse(responseText) as SabnzbdErrorResponse;
			if (parsed.status === false || parsed.status === 'false') {
				throw new SabnzbdApiError(parsed.error || 'Unknown SABnzbd error');
			}
		} catch (e) {
			// If JSON parsing fails but it's not an error response, that's fine
			if (e instanceof SabnzbdApiError) {
				throw e;
			}
		}
	}

	/**
	 * Parse add response handling various formats.
	 */
	private parseAddResponse(response: unknown): SabnzbdAddResponse {
		const resp = response as SabnzbdAddResponse | SabnzbdErrorResponse;

		if ('nzo_ids' in resp && resp.nzo_ids) {
			return {
				status: true,
				nzo_ids: resp.nzo_ids
			};
		}

		if ('status' in resp) {
			const status = resp.status === true || resp.status === 'true';
			if (!status && 'error' in resp) {
				throw new SabnzbdApiError(resp.error || 'Failed to add NZB');
			}
			return {
				status,
				nzo_ids: []
			};
		}

		// Assume success if no explicit status
		return {
			status: true,
			nzo_ids: []
		};
	}
}
