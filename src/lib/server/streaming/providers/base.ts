/**
 * Base Provider
 *
 * Abstract base class for all streaming providers.
 * Implements common functionality and defines the template
 * for provider implementations.
 */

import { logger } from '$lib/logging';
import { type EncDecClient, getEncDecClient } from '../enc-dec';
import { resolveEmbed, canResolveEmbed } from '../hosters';
import type {
	IStreamProvider,
	ProviderConfig,
	ProviderResult,
	SearchParams,
	StreamResult
} from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
	Connection: 'keep-alive'
};

// ============================================================================
// Base Provider Class
// ============================================================================

/**
 * Abstract base class for streaming providers
 *
 * Subclasses must implement:
 * - config: Provider configuration
 * - doExtract: The actual extraction logic
 */
export abstract class BaseProvider implements IStreamProvider {
	/**
	 * Provider configuration - must be overridden by subclass
	 */
	abstract readonly config: ProviderConfig;

	/**
	 * EncDec API client instance
	 */
	protected readonly encDec: EncDecClient;

	constructor(encDecClient?: EncDecClient) {
		this.encDec = encDecClient ?? getEncDecClient();
	}

	// --------------------------------------------------------------------------
	// Public Interface
	// --------------------------------------------------------------------------

	/**
	 * Extract streams for the given content
	 *
	 * This is the template method that handles common logic:
	 * - Validates content type support
	 * - Wraps extraction in try-catch
	 * - Logs success/failure
	 * - Measures duration
	 */
	async extract(params: SearchParams): Promise<ProviderResult> {
		const startTime = Date.now();

		// Check if this provider can handle the content
		if (!this.canHandle(params)) {
			return {
				success: false,
				streams: [],
				provider: this.config.id,
				error: `Provider ${this.config.name} does not support ${params.type} content`,
				durationMs: Date.now() - startTime
			};
		}

		try {
			logger.debug('Starting extraction', {
				provider: this.config.id,
				tmdbId: params.tmdbId,
				type: params.type,
				...streamLog
			});

			const streams = await this.doExtract(params);

			const durationMs = Date.now() - startTime;

			if (streams.length > 0) {
				logger.debug('Extraction successful', {
					provider: this.config.id,
					streamCount: streams.length,
					durationMs,
					...streamLog
				});
			} else {
				logger.debug('Extraction returned no streams', {
					provider: this.config.id,
					durationMs,
					...streamLog
				});
			}

			return {
				success: streams.length > 0,
				streams,
				provider: this.config.id,
				durationMs
			};
		} catch (error) {
			const durationMs = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			logger.error('Extraction failed', {
				provider: this.config.id,
				error: errorMessage,
				durationMs,
				...streamLog
			});

			return {
				success: false,
				streams: [],
				provider: this.config.id,
				error: errorMessage,
				durationMs
			};
		}
	}

	/**
	 * Check if this provider can handle the given content type
	 */
	canHandle(params: SearchParams): boolean {
		if (params.type === 'movie') {
			return this.config.supportsMovies;
		}
		if (params.type === 'tv') {
			return this.config.supportsTv || this.config.supportsAnime || this.config.supportsAsianDrama;
		}
		return false;
	}

	// --------------------------------------------------------------------------
	// Protected Methods (for subclasses)
	// --------------------------------------------------------------------------

	/**
	 * Actual extraction logic - must be implemented by subclass
	 *
	 * @param params Search parameters
	 * @returns Array of extracted streams
	 * @throws Error if extraction fails
	 */
	protected abstract doExtract(params: SearchParams): Promise<StreamResult[]>;

	/**
	 * Make a GET request with standard headers
	 */
	protected async fetchGet<T = unknown>(
		url: string,
		options: {
			headers?: Record<string, string>;
			timeout?: number;
			responseType?: 'json' | 'text';
		} = {}
	): Promise<T> {
		const { headers = {}, timeout = this.config.timeout, responseType = 'json' } = options;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					...DEFAULT_HEADERS,
					...headers
				},
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			if (responseType === 'text') {
				return (await response.text()) as T;
			}
			return (await response.json()) as T;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Make a POST request with standard headers
	 */
	protected async fetchPost<T = unknown>(
		url: string,
		body: unknown,
		options: {
			headers?: Record<string, string>;
			timeout?: number;
			responseType?: 'json' | 'text';
		} = {}
	): Promise<T> {
		const { headers = {}, timeout = this.config.timeout, responseType = 'json' } = options;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					...DEFAULT_HEADERS,
					'Content-Type': 'application/json',
					...headers
				},
				body: JSON.stringify(body),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			if (responseType === 'text') {
				return (await response.text()) as T;
			}
			return (await response.json()) as T;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Create a StreamResult with common defaults
	 */
	protected createStreamResult(
		url: string,
		options: {
			quality?: string;
			title?: string;
			server?: string;
			language?: string;
			streamType?: 'hls' | 'm3u8' | 'mp4';
			headers?: Record<string, string>;
			referer?: string;
		} = {}
	): StreamResult {
		return {
			url,
			quality: options.quality ?? 'Unknown',
			title: options.title ?? `${this.config.name} Stream`,
			streamType: options.streamType ?? 'hls',
			referer: options.referer ?? this.config.referer,
			server: options.server,
			language: options.language,
			headers: options.headers
		};
	}

	/**
	 * Check if a URL is a valid stream URL
	 */
	protected isValidStreamUrl(url: string | undefined | null): url is string {
		if (!url) return false;
		try {
			const parsed = new URL(url);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	}

	/**
	 * Extract quality from a URL or string (e.g., "1080p", "720p")
	 */
	protected extractQuality(text: string): string {
		const match = text.match(/(\d{3,4}p|4k|2k|hd|sd)/i);
		if (match) {
			const quality = match[1].toUpperCase();
			if (quality === '4K') return '2160p';
			if (quality === '2K') return '1440p';
			if (quality === 'HD') return '720p';
			if (quality === 'SD') return '480p';
			return quality.toLowerCase();
		}
		return 'Unknown';
	}

	/**
	 * URL-encode a string
	 */
	protected encodeParam(value: string): string {
		return encodeURIComponent(value);
	}

	// --------------------------------------------------------------------------
	// Embed Resolution (Hoster Integration)
	// --------------------------------------------------------------------------

	/**
	 * Check if a URL is an embed URL that can be resolved by a hoster
	 */
	protected isEmbedUrl(url: string): boolean {
		return canResolveEmbed(url);
	}

	/**
	 * Resolve an embed URL to actual stream sources using hosters
	 *
	 * Use this when a provider returns an embed URL instead of a direct stream.
	 * Hosters like Megaup and Rapidshare can extract the actual HLS stream.
	 *
	 * @param embedUrl - The embed URL to resolve
	 * @returns Stream results from the hoster, or empty array if resolution fails
	 */
	protected async resolveEmbedUrl(embedUrl: string): Promise<StreamResult[]> {
		logger.debug('Resolving embed URL via hoster', {
			provider: this.config.id,
			embedUrl,
			...streamLog
		});

		const result = await resolveEmbed(embedUrl);

		if (!result || !result.success || result.sources.length === 0) {
			logger.debug('Embed resolution failed or returned no sources', {
				provider: this.config.id,
				embedUrl,
				hoster: result?.hoster,
				error: result?.error,
				...streamLog
			});
			return [];
		}

		logger.debug('Embed resolution successful', {
			provider: this.config.id,
			hoster: result.hoster,
			sourceCount: result.sources.length,
			durationMs: result.durationMs,
			...streamLog
		});

		// Convert hoster sources to StreamResults
		return result.sources.map((source) =>
			this.createStreamResult(source.url, {
				quality: source.quality,
				title: `${this.config.name} Stream`,
				streamType: source.type === 'mp4' ? 'mp4' : 'hls'
			})
		);
	}

	/**
	 * Try to resolve a URL - if it's an embed URL, resolve it; otherwise return as-is
	 *
	 * @param url - URL that might be an embed or direct stream
	 * @returns Stream results - resolved from embed or created from direct URL
	 */
	protected async resolveOrCreateStream(url: string): Promise<StreamResult[]> {
		// Check if this is an embed URL that needs resolution
		if (this.isEmbedUrl(url)) {
			const resolved = await this.resolveEmbedUrl(url);
			if (resolved.length > 0) {
				return resolved;
			}
			// Fall through to create direct stream if resolution fails
			logger.debug('Embed resolution failed, treating as direct URL', {
				provider: this.config.id,
				url,
				...streamLog
			});
		}

		// Treat as direct stream URL
		if (this.isValidStreamUrl(url)) {
			return [
				this.createStreamResult(url, {
					quality: this.extractQuality(url),
					title: `${this.config.name} Stream`
				})
			];
		}

		return [];
	}
}
