/**
 * Unified HTTP Service for Indexers
 *
 * Single HTTP layer with:
 * - Automatic retry with exponential backoff
 * - Rate limiting (per-indexer and per-host)
 * - Cloudflare challenge solving (transparent, automatic)
 * - Cookie management
 * - Request/response logging
 *
 * This replaces the inconsistent mix of raw fetch() calls
 * throughout the codebase with a single, reliable HTTP layer.
 */

import { createChildLogger } from '$lib/logging';
import { isCloudflareProtected, CloudflareProtectedError } from './CloudflareDetection';
import {
	RetryPolicy,
	isRetryableStatusCode,
	isRetryableNetworkError,
	parseRetryAfter,
	type RetryConfig
} from './RetryPolicy';
import { getRateLimitRegistry, getHostRateLimiter } from '../ratelimit';
import type { RateLimitConfig } from '../ratelimit/types';
import { getCaptchaSolver } from '$lib/server/captcha';
import { CloudflareBypassError } from '$lib/errors';

/** HTTP request options */
export interface HttpRequestOptions {
	/** HTTP method (default: GET) */
	method?: 'GET' | 'POST';
	/** Request headers */
	headers?: Record<string, string>;
	/** Request body (for POST) */
	body?: string | URLSearchParams;
	/** Follow redirects (default: true) */
	followRedirects?: boolean;
	/** Request timeout in ms (default: 30000) */
	timeout?: number;
	/** Skip rate limiting for this request */
	skipRateLimiting?: boolean;
}

/** Internal request options with defaults applied */
interface ResolvedHttpOptions {
	method: 'GET' | 'POST';
	headers: Record<string, string>;
	body?: string | URLSearchParams;
	followRedirects: boolean;
	timeout: number;
}

/** HTTP response */
export interface HttpResponse {
	/** Response body as text */
	body: string;
	/** HTTP status code */
	status: number;
	/** Response headers */
	headers: Headers;
	/** Final URL after redirects */
	url: string;
}

/** Indexer HTTP client configuration */
export interface IndexerHttpConfig {
	/** Indexer ID for logging/tracking */
	indexerId: string;
	/** Indexer name for logging */
	indexerName: string;
	/** Base URL */
	baseUrl: string;
	/** Alternate/fallback URLs */
	alternateUrls?: string[];
	/** Default User-Agent */
	userAgent?: string;
	/** Rate limit configuration */
	rateLimit?: RateLimitConfig;
	/** Retry configuration */
	retry?: RetryConfig;
	/** Default request timeout in ms */
	defaultTimeout?: number;
}

/** Cookie jar per indexer */
const cookieJars = new Map<string, Map<string, string>>();

/**
 * Unified HTTP client for indexer requests.
 *
 * Features:
 * - Automatic Cloudflare solving (transparent to caller)
 * - Rate limiting with per-host tracking
 * - Retry with exponential backoff
 * - Cookie persistence per indexer
 * - Failover to alternate URLs
 */
export class IndexerHttp {
	private readonly config: Required<IndexerHttpConfig>;
	private readonly retryPolicy: RetryPolicy;
	private readonly log: ReturnType<typeof createChildLogger>;
	private readonly allUrls: string[];

	constructor(config: IndexerHttpConfig) {
		this.config = {
			indexerId: config.indexerId,
			indexerName: config.indexerName,
			baseUrl: config.baseUrl.replace(/\/$/, ''),
			alternateUrls: config.alternateUrls?.map((u) => u.replace(/\/$/, '')) ?? [],
			userAgent: config.userAgent ?? 'Cinephage/1.0',
			rateLimit: config.rateLimit ?? { requests: 30, periodMs: 60_000 },
			retry: config.retry ?? { maxRetries: 2, initialDelayMs: 1000 },
			defaultTimeout: config.defaultTimeout ?? 30000
		};

		this.log = createChildLogger({
			module: 'IndexerHttp',
			indexer: config.indexerName,
			indexerId: config.indexerId
		});

		this.retryPolicy = new RetryPolicy(this.config.retry);

		// Build URL list for failover
		this.allUrls = [this.config.baseUrl, ...this.config.alternateUrls];

		// Initialize cookie jar for this indexer
		if (!cookieJars.has(config.indexerId)) {
			cookieJars.set(config.indexerId, new Map());
		}
	}

	/**
	 * Make a GET request.
	 */
	async get(
		url: string,
		options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
	): Promise<HttpResponse> {
		return this.request(url, { ...options, method: 'GET' });
	}

	/**
	 * Make a POST request.
	 */
	async post(
		url: string,
		body: string | URLSearchParams,
		options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
	): Promise<HttpResponse> {
		return this.request(url, { ...options, method: 'POST', body });
	}

	/**
	 * Make an HTTP request with full options.
	 */
	async request(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
		const {
			method = 'GET',
			headers = {},
			body,
			followRedirects = true,
			timeout = this.config.defaultTimeout,
			skipRateLimiting = false
		} = options;

		// Apply rate limiting
		if (!skipRateLimiting) {
			await this.waitForRateLimit(url);
		}

		// Try request with failover
		return this.requestWithFailover(url, {
			method,
			headers,
			body,
			followRedirects,
			timeout
		});
	}

	/**
	 * Execute request with failover to alternate URLs.
	 */
	private async requestWithFailover(
		url: string,
		options: ResolvedHttpOptions
	): Promise<HttpResponse> {
		const errors: string[] = [];

		// Try primary URL first
		try {
			return await this.executeSingleRequest(url, options);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${url}: ${message}`);
			this.log.debug('Primary URL failed', { url, error: message });
		}

		// Try alternate URLs
		for (const altBaseUrl of this.config.alternateUrls) {
			const altUrl = this.replaceBaseUrl(url, this.config.baseUrl, altBaseUrl);

			try {
				this.log.debug('Trying alternate URL', { altUrl });
				await this.delay(500); // Small delay before failover

				const response = await this.executeSingleRequest(altUrl, options);
				this.log.info('Alternate URL succeeded', { altUrl });
				return response;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				errors.push(`${altUrl}: ${message}`);
				this.log.debug('Alternate URL failed', { altUrl, error: message });
			}
		}

		throw new Error(`All URLs failed: ${errors.join('; ')}`);
	}

	/**
	 * Execute a single request with retry logic.
	 */
	private async executeSingleRequest(
		url: string,
		options: ResolvedHttpOptions
	): Promise<HttpResponse> {
		// Build request headers
		const requestHeaders = this.buildRequestHeaders(url, options.headers);

		// Try with retry policy
		const { result } = await this.retryPolicy.execute(
			async () => this.doFetch(url, options, requestHeaders),
			(error) => this.shouldRetry(error)
		);
		return result;
	}

	/**
	 * Perform the actual fetch.
	 */
	private async doFetch(
		url: string,
		options: ResolvedHttpOptions,
		headers: Record<string, string>,
		skipCaptchaSolver = false
	): Promise<HttpResponse> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), options.timeout);

		try {
			const response = await fetch(url, {
				method: options.method,
				headers,
				body: options.body?.toString(),
				redirect: options.followRedirects ? 'follow' : 'manual',
				signal: controller.signal
			});

			const body = await response.text();

			// Check for Cloudflare challenge
			if (isCloudflareProtected(response.status, response.headers, body)) {
				const host = new URL(url).hostname;

				// Try browser fetch if available (bypasses TLS fingerprinting)
				if (!skipCaptchaSolver) {
					const captchaSolver = getCaptchaSolver();

					if (captchaSolver.isAvailable()) {
						this.log.info('Cloudflare detected, fetching through browser', { url, host });

						// Fetch directly through the browser - this bypasses JA3/TLS fingerprinting
						// that prevents Node.js fetch from working even with valid cookies
						const fetchResult = await captchaSolver.fetch({
							url,
							method: options.method,
							body: options.body?.toString(),
							timeout: Math.max(options.timeout / 1000, 60)
						});

						if (fetchResult.success) {
							this.log.info('Browser fetch succeeded', {
								host,
								status: fetchResult.status,
								bodyLength: fetchResult.body.length,
								timeMs: fetchResult.timeMs
							});

							// Return the browser-fetched response
							return {
								body: fetchResult.body,
								status: fetchResult.status,
								headers: new Headers(), // Browser doesn't expose response headers easily
								url: fetchResult.url
							};
						}

						// Browser fetch failed
						this.log.warn('Browser fetch failed', {
							host,
							error: fetchResult.error
						});

						throw new CloudflareBypassError(
							host,
							fetchResult.error ?? 'Browser fetch failed',
							'cloudflare'
						);
					}
				}

				// Captcha solver not available or already tried, throw original error
				throw new CloudflareProtectedError(host, response.status);
			}

			// Check for HTTP errors
			if (!response.ok) {
				throw new HttpError(response.status, response.statusText, response.headers);
			}

			// Record successful request for rate limiting
			this.recordRequest(url);

			return {
				body,
				status: response.status,
				headers: response.headers,
				url: response.url
			};
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Build request headers including cookies and User-Agent.
	 */
	private buildRequestHeaders(
		url: string,
		additionalHeaders: Record<string, string>
	): Record<string, string> {
		const headers: Record<string, string> = {};

		headers['User-Agent'] = this.config.userAgent;

		// Build cookie header from indexer cookies
		const cookies: string[] = [];
		const cookieJar = this.getCookieJar();
		for (const [name, value] of cookieJar) {
			cookies.push(`${name}=${value}`);
		}

		if (cookies.length > 0) {
			headers['Cookie'] = cookies.join('; ');
		}

		// Add additional headers
		for (const [key, value] of Object.entries(additionalHeaders)) {
			const lowerKey = key.toLowerCase();
			if (lowerKey === 'cookie') {
				// Merge with existing cookies
				headers['Cookie'] = headers['Cookie'] ? `${headers['Cookie']}; ${value}` : value;
			} else {
				headers[key] = value;
			}
		}

		return headers;
	}

	/**
	 * Wait for rate limit if needed.
	 */
	private async waitForRateLimit(url: string): Promise<void> {
		// Check indexer-level rate limit
		const indexerLimiter = getRateLimitRegistry().get(this.config.indexerId);
		const indexerWait = indexerLimiter.getWaitTime();
		if (indexerWait > 0) {
			this.log.debug('Rate limited by indexer', { waitMs: indexerWait });
			await this.delay(indexerWait);
		}

		// Check host-level rate limit
		const host = new URL(url).hostname;
		const hostLimiter = getHostRateLimiter().getLimiterForHost(host);
		const hostWait = hostLimiter.getWaitTime();
		if (hostWait > 0) {
			this.log.debug('Rate limited by host', { host, waitMs: hostWait });
			await this.delay(hostWait);
		}
	}

	/**
	 * Record a successful request for rate limiting.
	 */
	private recordRequest(url: string): void {
		getRateLimitRegistry().get(this.config.indexerId).recordRequest();
		getHostRateLimiter().recordRequest(url);
	}

	/**
	 * Determine if an error should be retried.
	 */
	private shouldRetry(error: unknown): {
		shouldRetry: boolean;
		suggestedDelayMs?: number;
		reason: string;
	} {
		// Retry Cloudflare errors with a delay - sometimes the challenge clears on retry
		// (especially for API endpoints that return JSON)
		if (error instanceof CloudflareProtectedError) {
			return {
				shouldRetry: true,
				suggestedDelayMs: 3000,
				reason: 'Cloudflare protection (will retry)'
			};
		}

		// Don't retry CloudflareBypassError - captcha solver already tried
		if (error instanceof CloudflareBypassError) {
			return {
				shouldRetry: false,
				reason: 'Cloudflare bypass already attempted'
			};
		}

		// Retry on network errors
		if (isRetryableNetworkError(error)) {
			return { shouldRetry: true, reason: 'Network error' };
		}

		// Retry on certain HTTP errors
		if (error instanceof HttpError) {
			if (isRetryableStatusCode(error.status)) {
				return {
					shouldRetry: true,
					suggestedDelayMs: parseRetryAfter(error.headers),
					reason: `HTTP ${error.status}`
				};
			}
		}

		return { shouldRetry: false, reason: 'Non-retryable error' };
	}

	/**
	 * Get the cookie jar for this indexer.
	 */
	private getCookieJar(): Map<string, string> {
		return cookieJars.get(this.config.indexerId)!;
	}

	/**
	 * Set a cookie in the indexer's cookie jar.
	 */
	setCookie(name: string, value: string): void {
		this.getCookieJar().set(name, value);
	}

	/**
	 * Set multiple cookies.
	 */
	setCookies(cookies: Record<string, string>): void {
		const jar = this.getCookieJar();
		for (const [name, value] of Object.entries(cookies)) {
			jar.set(name, value);
		}
	}

	/**
	 * Get a cookie from the jar.
	 */
	getCookie(name: string): string | undefined {
		return this.getCookieJar().get(name);
	}

	/**
	 * Get all cookies as a header string.
	 */
	getCookieHeader(): string {
		const jar = this.getCookieJar();
		return Array.from(jar.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join('; ');
	}

	/**
	 * Clear all cookies for this indexer.
	 */
	clearCookies(): void {
		this.getCookieJar().clear();
	}

	/**
	 * Remove this indexer's cookie jar from the global map.
	 * Call this when an indexer is deleted to prevent memory leaks.
	 */
	destroy(): void {
		cookieJars.delete(this.config.indexerId);
	}

	/**
	 * Parse Set-Cookie headers and store cookies.
	 */
	parseAndStoreCookies(headers: Headers): void {
		const setCookies = headers.getSetCookie?.() ?? [];
		for (const setCookie of setCookies) {
			const match = setCookie.match(/^([^=]+)=([^;]*)/);
			if (match) {
				this.setCookie(match[1], match[2]);
			}
		}
	}

	/**
	 * Replace base URL for failover.
	 */
	private replaceBaseUrl(url: string, oldBase: string, newBase: string): string {
		return url.replace(oldBase, newBase);
	}

	/**
	 * Utility delay.
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Error thrown for HTTP failures.
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly headers: Headers
	) {
		super(`HTTP ${status}: ${statusText}`);
		this.name = 'HttpError';
	}
}

/**
 * Factory to create IndexerHttp instances.
 */
export function createIndexerHttp(config: IndexerHttpConfig): IndexerHttp {
	return new IndexerHttp(config);
}

/**
 * Remove a cookie jar for a deleted indexer.
 * Call this when an indexer is permanently removed.
 */
export function cleanupIndexerCookies(indexerId: string): void {
	cookieJars.delete(indexerId);
}

/**
 * Get count of active cookie jars (for debugging/monitoring).
 */
export function getCookieJarCount(): number {
	return cookieJars.size;
}
