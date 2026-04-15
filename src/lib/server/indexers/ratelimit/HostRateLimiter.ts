/**
 * Host-based rate limiting.
 *
 * Tracks rate limits per hostname to prevent multiple indexers
 * on the same domain from exceeding host limits.
 *
 * Example: If 3 indexers all use mirrors of the same site,
 * requests to all of them count against a shared host limit.
 */

import { RateLimiter } from './RateLimiter';
import { type RateLimitConfig } from './types';
import { createChildLogger } from '$lib/logging';

const log = createChildLogger({ module: 'HostRateLimiter' });

/** Default host rate limit - more conservative than per-indexer */
const DEFAULT_HOST_RATE_LIMIT: RateLimitConfig = {
	requests: 30, // 30 requests per minute per host
	periodMs: 60_000,
	burst: 5
};

/**
 * Extract hostname from URL.
 */
function extractHost(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		// Fallback for invalid URLs
		return url.toLowerCase();
	}
}

/**
 * Get base domain from hostname (e.g., "api.example.com" -> "example.com")
 * This groups subdomains together.
 */
function getBaseDomain(hostname: string): string {
	const parts = hostname.split('.');

	// Handle special cases like .co.uk, .com.au, etc.
	const multiPartTLDs = ['co.uk', 'com.au', 'co.nz', 'org.uk', 'net.au'];

	if (parts.length >= 3) {
		const lastTwo = parts.slice(-2).join('.');
		if (multiPartTLDs.includes(lastTwo)) {
			// e.g., "www.example.co.uk" -> "example.co.uk"
			return parts.slice(-3).join('.');
		}
	}

	// Standard case: "api.example.com" -> "example.com"
	if (parts.length >= 2) {
		return parts.slice(-2).join('.');
	}

	return hostname;
}

/**
 * Host-based rate limiter that tracks requests per domain.
 */
export class HostRateLimiter {
	private hostLimiters: Map<string, RateLimiter> = new Map();
	private hostConfigs: Map<string, RateLimitConfig> = new Map();
	private groupByBaseDomain: boolean;

	constructor(
		options: {
			defaultConfig?: RateLimitConfig;
			groupByBaseDomain?: boolean;
		} = {}
	) {
		this.groupByBaseDomain = options.groupByBaseDomain ?? true;
	}

	/**
	 * Configure rate limit for a specific host.
	 */
	setHostConfig(hostname: string, config: RateLimitConfig): void {
		const key = this.getHostKey(hostname);
		this.hostConfigs.set(key, config);

		// Update existing limiter if present
		const limiter = this.hostLimiters.get(key);
		if (limiter) {
			limiter.updateConfig(config);
		}
	}

	/**
	 * Get rate limiter for a URL.
	 */
	getLimiterForUrl(url: string): RateLimiter {
		const host = extractHost(url);
		return this.getLimiterForHost(host);
	}

	/**
	 * Get rate limiter for a hostname.
	 */
	getLimiterForHost(hostname: string): RateLimiter {
		const key = this.getHostKey(hostname);

		let limiter = this.hostLimiters.get(key);
		if (!limiter) {
			const config = this.hostConfigs.get(key) ?? DEFAULT_HOST_RATE_LIMIT;
			limiter = new RateLimiter(config);
			this.hostLimiters.set(key, limiter);
		}

		return limiter;
	}

	/**
	 * Check if a request to a URL can proceed.
	 */
	canProceed(url: string): boolean {
		return this.getLimiterForUrl(url).canProceed();
	}

	/**
	 * Get wait time for a URL (ms).
	 */
	getWaitTime(url: string): number {
		return this.getLimiterForUrl(url).getWaitTime();
	}

	/**
	 * Record a request to a URL.
	 */
	recordRequest(url: string): void {
		this.getLimiterForUrl(url).recordRequest();
	}

	/**
	 * Check and wait if necessary before proceeding.
	 * Returns the time waited in ms.
	 */
	async waitIfNeeded(url: string): Promise<number> {
		const limiter = this.getLimiterForUrl(url);
		const waitTime = limiter.getWaitTime();

		if (waitTime > 0) {
			const host = extractHost(url);
			log.debug(
				{
					host,
					waitTimeMs: waitTime,
					currentCount: limiter.getCurrentCount()
				},
				'Host rate limited, waiting'
			);
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}

		limiter.recordRequest();
		return waitTime;
	}

	/**
	 * Get summary of all host rate limiters.
	 */
	getSummary(): Array<{
		host: string;
		currentCount: number;
		remaining: number;
		isLimited: boolean;
		config: RateLimitConfig;
	}> {
		return Array.from(this.hostLimiters.entries()).map(([host, limiter]) => ({
			host,
			currentCount: limiter.getCurrentCount(),
			remaining: limiter.getRemainingRequests(),
			isLimited: limiter.isRateLimited(),
			config: limiter.getConfig()
		}));
	}

	/**
	 * Reset limiter for a specific host.
	 */
	resetHost(hostname: string): void {
		const key = this.getHostKey(hostname);
		const limiter = this.hostLimiters.get(key);
		if (limiter) {
			limiter.reset();
		}
	}

	/**
	 * Reset all host limiters.
	 */
	resetAll(): void {
		for (const limiter of this.hostLimiters.values()) {
			limiter.reset();
		}
	}

	/**
	 * Clear all host limiters.
	 */
	clear(): void {
		this.hostLimiters.clear();
		this.hostConfigs.clear();
	}

	/**
	 * Combined rate limit check for both indexer and host.
	 * Returns whether the request can proceed and how long to wait if not.
	 */
	checkRateLimits(
		indexerId: string,
		url: string,
		indexerLimiter: RateLimiter
	): { canProceed: boolean; waitTimeMs: number; reason: string } {
		const hostLimiter = this.getLimiterForUrl(url);

		const indexerCanProceed = indexerLimiter.canProceed();
		const hostCanProceed = hostLimiter.canProceed();

		if (indexerCanProceed && hostCanProceed) {
			return { canProceed: true, waitTimeMs: 0, reason: 'none' };
		}

		const indexerWait = indexerLimiter.getWaitTime();
		const hostWait = hostLimiter.getWaitTime();

		// Return the longer wait time
		if (indexerWait >= hostWait) {
			return {
				canProceed: false,
				waitTimeMs: indexerWait,
				reason: `indexer ${indexerId}`
			};
		} else {
			const host = extractHost(url);
			return {
				canProceed: false,
				waitTimeMs: hostWait,
				reason: `host ${host}`
			};
		}
	}

	private getHostKey(hostname: string): string {
		const host = hostname.toLowerCase();
		return this.groupByBaseDomain ? getBaseDomain(host) : host;
	}
}

/** Singleton instance */
let hostRateLimiterInstance: HostRateLimiter | null = null;

/**
 * Get the singleton host rate limiter.
 */
export function getHostRateLimiter(): HostRateLimiter {
	if (!hostRateLimiterInstance) {
		hostRateLimiterInstance = new HostRateLimiter();
	}
	return hostRateLimiterInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetHostRateLimiter(): void {
	hostRateLimiterInstance = null;
}

/**
 * Combined rate limit check for both indexer and host.
 *
 * Use this when making requests to ensure both limits are respected.
 */
export async function checkRateLimits(
	indexerId: string,
	url: string,
	indexerLimiter: RateLimiter
): Promise<{ waitedMs: number; limitedBy: 'none' | 'indexer' | 'host' | 'both' }> {
	const hostLimiter = getHostRateLimiter();

	const indexerWait = indexerLimiter.getWaitTime();
	const hostWait = hostLimiter.getWaitTime(url);

	// Determine what's limiting us
	let limitedBy: 'none' | 'indexer' | 'host' | 'both' = 'none';
	if (indexerWait > 0 && hostWait > 0) {
		limitedBy = 'both';
	} else if (indexerWait > 0) {
		limitedBy = 'indexer';
	} else if (hostWait > 0) {
		limitedBy = 'host';
	}

	// Wait for the longer of the two
	const totalWait = Math.max(indexerWait, hostWait);

	if (totalWait > 0) {
		log.debug(
			{
				indexerId,
				url: extractHost(url),
				indexerWaitMs: indexerWait,
				hostWaitMs: hostWait,
				totalWaitMs: totalWait,
				limitedBy
			},
			'Rate limited'
		);
		await new Promise((resolve) => setTimeout(resolve, totalWait));
	}

	// Record requests on both limiters
	indexerLimiter.recordRequest();
	hostLimiter.recordRequest(url);

	return { waitedMs: totalWait, limitedBy };
}
