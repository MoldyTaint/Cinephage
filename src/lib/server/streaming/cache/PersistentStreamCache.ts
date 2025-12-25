/**
 * Persistent Stream Cache
 *
 * Wraps the in-memory LRU cache with database persistence for popular entries.
 * Features:
 * - Tracks hit counts for cache entries
 * - Periodically persists popular entries to SQLite
 * - Warms in-memory cache from database on startup
 * - Cleans up expired entries from both memory and database
 */

import { db } from '$lib/server/db';
import { streamExtractionCache } from '$lib/server/db/schema';
import { desc, lt } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { LRUCache } from '../cache';
import { STREAM_CACHE_TTL_MS, STREAM_CACHE_MAX_SIZE } from '../constants';

const streamLog = { logCategory: 'streams' as const };

/** Minimum hit count before an entry is persisted to database */
const PERSIST_HIT_THRESHOLD = 2;

/** Number of top entries to load from database on startup */
const WARM_CACHE_LIMIT = 100;

/** Interval for persisting popular entries to database (5 minutes) */
const PERSIST_INTERVAL_MS = 5 * 60 * 1000;

/** Interval for cleaning up expired database entries (1 hour) */
const DB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface HitTracker {
	count: number;
	lastAccess: number;
}

/**
 * Persistent stream cache that combines in-memory LRU with database backing
 */
export class PersistentStreamCache {
	private memoryCache: LRUCache<string>;
	private hitCounts = new Map<string, HitTracker>();
	private persistInterval: NodeJS.Timeout | null = null;
	private cleanupInterval: NodeJS.Timeout | null = null;
	private isWarmed = false;

	constructor() {
		this.memoryCache = new LRUCache<string>(STREAM_CACHE_MAX_SIZE, STREAM_CACHE_TTL_MS);

		// Start periodic persistence
		this.persistInterval = setInterval(() => {
			this.persistPopularEntries();
		}, PERSIST_INTERVAL_MS);

		// Start periodic cleanup
		this.cleanupInterval = setInterval(() => {
			this.cleanupExpiredFromDb();
		}, DB_CLEANUP_INTERVAL_MS);
	}

	/**
	 * Warm the cache from database (call on startup)
	 */
	async warmCache(): Promise<void> {
		if (this.isWarmed) return;

		try {
			const now = new Date().toISOString();
			// Get top entries by hit count (filter expired ones in JS since expiresAt is text)
			const entries = await db
				.select()
				.from(streamExtractionCache)
				.orderBy(desc(streamExtractionCache.hitCount))
				.limit(WARM_CACHE_LIMIT * 2); // Fetch extra to account for expired entries

			// Filter to only non-expired entries
			const validEntries = entries.filter((e) => new Date(e.expiresAt) > new Date());

			let loaded = 0;
			for (const entry of validEntries) {
				if (entry.extractionResult) {
					const remainingTtl = new Date(entry.expiresAt).getTime() - Date.now();
					if (remainingTtl > 0) {
						this.memoryCache.set(entry.id, JSON.stringify(entry.extractionResult), remainingTtl);
						this.hitCounts.set(entry.id, {
							count: entry.hitCount ?? 0,
							lastAccess: Date.now()
						});
						loaded++;
					}
				}
			}

			this.isWarmed = true;
			logger.info('Stream cache warmed from database', {
				loaded,
				total: entries.length,
				...streamLog
			});
		} catch (error) {
			logger.error('Failed to warm stream cache from database', {
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			});
		}
	}

	/**
	 * Get a cached value
	 */
	get(key: string): string | undefined {
		const value = this.memoryCache.get(key);

		if (value !== undefined) {
			// Track hit
			const tracker = this.hitCounts.get(key) ?? { count: 0, lastAccess: 0 };
			tracker.count++;
			tracker.lastAccess = Date.now();
			this.hitCounts.set(key, tracker);
		}

		return value;
	}

	/**
	 * Set a cached value
	 */
	set(key: string, value: string, ttlMs?: number): void {
		this.memoryCache.set(key, value, ttlMs);

		// Initialize hit counter
		if (!this.hitCounts.has(key)) {
			this.hitCounts.set(key, { count: 1, lastAccess: Date.now() });
		}
	}

	/**
	 * Check if a key exists and is not expired
	 */
	has(key: string): boolean {
		return this.memoryCache.has(key);
	}

	/**
	 * Delete a cache entry
	 */
	delete(key: string): boolean {
		this.hitCounts.delete(key);
		return this.memoryCache.delete(key);
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.hitCounts.clear();
		this.memoryCache.clear();
	}

	/**
	 * Get the current cache size
	 */
	get size(): number {
		return this.memoryCache.size;
	}

	/**
	 * Persist popular entries to database
	 */
	private async persistPopularEntries(): Promise<void> {
		try {
			const now = new Date().toISOString();
			let persisted = 0;

			for (const [key, tracker] of this.hitCounts.entries()) {
				if (tracker.count >= PERSIST_HIT_THRESHOLD) {
					const value = this.memoryCache.get(key);
					if (value) {
						const parsed = this.parseKey(key);
						if (parsed) {
							const expiresAt = new Date(
								Date.now() + STREAM_CACHE_TTL_MS
							).toISOString();

							await db
								.insert(streamExtractionCache)
								.values({
									id: key,
									tmdbId: parsed.tmdbId,
									mediaType: parsed.mediaType,
									seasonNumber: parsed.seasonNumber,
									episodeNumber: parsed.episodeNumber,
									extractionResult: JSON.parse(value),
									provider: parsed.provider,
									cachedAt: now,
									expiresAt,
									hitCount: tracker.count,
									lastAccessAt: new Date(tracker.lastAccess).toISOString()
								})
								.onConflictDoUpdate({
									target: streamExtractionCache.id,
									set: {
										extractionResult: JSON.parse(value),
										expiresAt,
										hitCount: tracker.count,
										lastAccessAt: new Date(tracker.lastAccess).toISOString()
									}
								});

							persisted++;
						}
					}
				}
			}

			if (persisted > 0) {
				logger.debug('Persisted popular cache entries to database', {
					persisted,
					...streamLog
				});
			}
		} catch (error) {
			logger.error('Failed to persist cache entries', {
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			});
		}
	}

	/**
	 * Parse a cache key to extract metadata
	 */
	private parseKey(key: string): {
		tmdbId: number;
		mediaType: 'movie' | 'tv';
		seasonNumber?: number;
		episodeNumber?: number;
		provider?: string;
	} | null {
		// Keys follow format: stream:movie:123:best or stream:tv:456:1:2:best
		const parts = key.split(':');
		if (parts.length < 4 || parts[0] !== 'stream') {
			return null;
		}

		const mediaType = parts[1] as 'movie' | 'tv';
		const tmdbId = parseInt(parts[2], 10);

		if (isNaN(tmdbId) || (mediaType !== 'movie' && mediaType !== 'tv')) {
			return null;
		}

		if (mediaType === 'movie') {
			return { tmdbId, mediaType };
		}

		// TV: stream:tv:tmdbId:season:episode:...
		const seasonNumber = parts.length > 3 ? parseInt(parts[3], 10) : undefined;
		const episodeNumber = parts.length > 4 ? parseInt(parts[4], 10) : undefined;

		return {
			tmdbId,
			mediaType,
			seasonNumber: isNaN(seasonNumber as number) ? undefined : seasonNumber,
			episodeNumber: isNaN(episodeNumber as number) ? undefined : episodeNumber
		};
	}

	/**
	 * Clean up expired entries from database
	 */
	private async cleanupExpiredFromDb(): Promise<void> {
		try {
			const now = new Date().toISOString();
			const result = await db
				.delete(streamExtractionCache)
				.where(lt(streamExtractionCache.expiresAt, now));

			// Note: Drizzle returns different types based on driver
			// For better-sqlite3, result is the info object
			const deleted = typeof result === 'object' && 'changes' in result
				? (result as { changes: number }).changes
				: 0;

			if (deleted > 0) {
				logger.debug('Cleaned up expired cache entries from database', {
					deleted,
					...streamLog
				});
			}
		} catch (error) {
			logger.error('Failed to clean up expired cache entries', {
				error: error instanceof Error ? error.message : String(error),
				...streamLog
			});
		}
	}

	/**
	 * Destroy the cache and clean up resources
	 */
	destroy(): void {
		if (this.persistInterval) {
			clearInterval(this.persistInterval);
			this.persistInterval = null;
		}
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.memoryCache.destroy();
		this.hitCounts.clear();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		memorySize: number;
		trackedEntries: number;
		isWarmed: boolean;
	} {
		return {
			memorySize: this.memoryCache.size,
			trackedEntries: this.hitCounts.size,
			isWarmed: this.isWarmed
		};
	}
}

// Singleton instance
let persistentCacheInstance: PersistentStreamCache | null = null;

/**
 * Get the global persistent stream cache instance
 */
export function getPersistentStreamCache(): PersistentStreamCache {
	if (!persistentCacheInstance) {
		persistentCacheInstance = new PersistentStreamCache();
	}
	return persistentCacheInstance;
}

/**
 * Initialize and warm the persistent cache (call on startup)
 */
export async function initPersistentStreamCache(): Promise<void> {
	const cache = getPersistentStreamCache();
	await cache.warmCache();
}
