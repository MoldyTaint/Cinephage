/**
 * Simple LRU Cache implementation with proper typing
 */

import {
	STREAM_CACHE_TTL_MS,
	STREAM_CACHE_MAX_SIZE,
	TMDB_CACHE_TTL_MS,
	TMDB_CACHE_MAX_SIZE
} from './constants';
import { logger } from '$lib/logging';

const streamLog = { logDomain: 'streams' as const };

interface CacheEntry<T> {
	value: T;
	expires: number;
}

export class LRUCache<T> {
	private cache = new Map<string, CacheEntry<T>>();
	private readonly maxSize: number;
	private readonly ttlMs: number;
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor(maxSize: number, ttlMs: number) {
		this.maxSize = maxSize;
		this.ttlMs = ttlMs;

		// Start periodic cleanup every 5 minutes
		this.cleanupInterval = setInterval(
			() => {
				this.cleanupExpired();
			},
			5 * 60 * 1000
		);
	}

	/**
	 * Remove all expired entries from the cache.
	 * Called periodically to prevent memory leaks from expired entries.
	 */
	private cleanupExpired(): void {
		const now = Date.now();
		let cleaned = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (now > entry.expires) {
				this.cache.delete(key);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logger.debug({ cleaned, ...streamLog }, 'Cache cleanup completed');
		}
	}

	/**
	 * Stop the periodic cleanup interval.
	 * Call this when shutting down to prevent memory leaks.
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;

		if (Date.now() > entry.expires) {
			this.cache.delete(key);
			return undefined;
		}

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value;
	}

	set(key: string, value: T, ttlMs?: number): void {
		// Remove oldest entries if at capacity
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) this.cache.delete(firstKey);
		}

		this.cache.set(key, {
			value,
			expires: Date.now() + (ttlMs ?? this.ttlMs)
		});
	}

	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}
}

/**
 * Cached stream URL with metadata
 */
export interface CachedStreamUrl {
	url: string;
	provider?: string;
	extractedAt: number;
}

/**
 * Cached TMDB external IDs
 */
export interface CachedTmdbIds {
	imdbId?: string;
	tvdbId?: number;
	fetchedAt: number;
}

// Global caches for streaming with proper types
export const streamCache = new LRUCache<string>(STREAM_CACHE_MAX_SIZE, STREAM_CACHE_TTL_MS);
export const tmdbCache = new LRUCache<CachedTmdbIds>(TMDB_CACHE_MAX_SIZE, TMDB_CACHE_TTL_MS);

// Re-export multi-level cache for advanced caching scenarios
export * from './cache/index';
