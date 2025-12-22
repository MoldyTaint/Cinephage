/**
 * Types for Hoster Infrastructure
 *
 * Hosters are services that resolve embed URLs to actual stream URLs.
 * When streaming providers return embed URLs (e.g., https://megaup.live/e/abc),
 * hosters extract the actual HLS/MP4 stream from those embeds.
 */

import type { EncDecClient } from '../enc-dec';

// ============================================================================
// Hoster Identifiers
// ============================================================================

/**
 * Known hoster identifiers
 */
export type HosterId = 'megaup' | 'rapidshare';

// ============================================================================
// Hoster Configuration
// ============================================================================

/**
 * Configuration for a hoster
 */
export interface HosterConfig {
	/** Unique identifier */
	id: HosterId;

	/** Human-readable name */
	name: string;

	/** Domains this hoster handles */
	domains: string[];

	/** Embed path pattern (e.g., "/e/") */
	embedPathPattern: string;

	/** Media path pattern (e.g., "/media/") */
	mediaPathPattern: string;

	/** Request timeout in milliseconds */
	timeout: number;
}

// ============================================================================
// Hoster Result Types
// ============================================================================

/**
 * Extracted subtitle track
 */
export interface HosterSubtitle {
	/** Subtitle file URL */
	url: string;
	/** Language label (e.g., "English", "Spanish") */
	label: string;
	/** Language code (e.g., "en", "es") */
	language?: string;
	/** Whether this is the default subtitle */
	isDefault?: boolean;
}

/**
 * Extracted stream source
 */
export interface HosterStreamSource {
	/** Direct stream URL */
	url: string;
	/** Quality label (e.g., "1080p", "720p", "Auto") */
	quality: string;
	/** Stream type */
	type: 'hls' | 'm3u8' | 'mp4';
}

/**
 * Internal result from doResolve() - includes both sources and subtitles
 */
export interface HosterExtraction {
	/** Extracted stream sources */
	sources: HosterStreamSource[];
	/** Extracted subtitles (optional) */
	subtitles?: HosterSubtitle[];
}

/**
 * Result from hoster extraction
 */
export interface HosterResult {
	/** Whether extraction succeeded */
	success: boolean;

	/** Extracted stream sources */
	sources: HosterStreamSource[];

	/** Extracted subtitles */
	subtitles?: HosterSubtitle[];

	/** Error message if extraction failed */
	error?: string;

	/** Duration of extraction in milliseconds */
	durationMs: number;

	/** Hoster that processed the request */
	hoster: HosterId;
}

// ============================================================================
// Hoster Interface
// ============================================================================

/**
 * Interface that all hosters must implement
 */
export interface IHoster {
	/** Hoster configuration */
	readonly config: HosterConfig;

	/**
	 * Check if this hoster can handle the given URL
	 * @param url - Embed URL to check
	 * @returns true if this hoster can resolve the URL
	 */
	canHandle(url: string): boolean;

	/**
	 * Resolve an embed URL to actual stream sources
	 * @param embedUrl - The embed URL to resolve
	 * @returns Extraction result with stream sources
	 */
	resolve(embedUrl: string): Promise<HosterResult>;
}

// ============================================================================
// Base Hoster Class
// ============================================================================

/**
 * Abstract base class for hosters
 * Provides common functionality and utilities
 */
export abstract class BaseHoster implements IHoster {
	abstract readonly config: HosterConfig;

	protected readonly encDec: EncDecClient;
	protected readonly userAgent: string;

	constructor(encDecClient: EncDecClient) {
		this.encDec = encDecClient;
		this.userAgent =
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
	}

	/**
	 * Check if this hoster can handle the given URL
	 */
	canHandle(url: string): boolean {
		try {
			const parsed = new URL(url);
			const domain = parsed.hostname.replace(/^www\./, '');
			return this.config.domains.includes(domain);
		} catch {
			return false;
		}
	}

	/**
	 * Resolve an embed URL to actual stream sources
	 */
	async resolve(embedUrl: string): Promise<HosterResult> {
		const startTime = Date.now();

		try {
			const extraction = await this.doResolve(embedUrl);
			return {
				success: extraction.sources.length > 0,
				sources: extraction.sources,
				subtitles: extraction.subtitles,
				durationMs: Date.now() - startTime,
				hoster: this.config.id
			};
		} catch (error) {
			return {
				success: false,
				sources: [],
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startTime,
				hoster: this.config.id
			};
		}
	}

	/**
	 * Actual resolution logic - must be implemented by subclass
	 * Returns both stream sources and optional subtitle tracks
	 */
	protected abstract doResolve(embedUrl: string): Promise<HosterExtraction>;

	/**
	 * Convert embed URL to media URL
	 * Transforms /e/{id} to /media/{id}
	 */
	protected toMediaUrl(embedUrl: string): string {
		return embedUrl.replace(this.config.embedPathPattern, this.config.mediaPathPattern);
	}

	/**
	 * Fetch JSON with timeout
	 */
	protected async fetchJson<T>(url: string): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'User-Agent': this.userAgent,
					Connection: 'keep-alive'
				},
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return (await response.json()) as T;
		} finally {
			clearTimeout(timeoutId);
		}
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
	 * Extract quality from URL or string
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
		return 'Auto';
	}
}
