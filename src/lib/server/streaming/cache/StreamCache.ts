/**
 * Multi-Level Stream Cache
 *
 * Provides tiered caching for stream extraction with:
 * - Stream URL cache (successful extractions)
 * - Validation cache (stream validation results)
 * - Negative cache (failed extractions - prevents hammering)
 */

import { logger } from '$lib/logging';
import type { StreamValidation, ExtractionResult } from '../types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration
// ============================================================================

/** Default TTL for successful stream extractions (15 minutes) */
const STREAM_CACHE_TTL_MS = 15 * 60 * 1000;

/** Default TTL for validation results (5 minutes) */
const VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;

/** Default TTL for negative cache (2 minutes) */
const NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1000;

// ============================================================================
// Failure Type TTLs
// ============================================================================

/** Types of extraction failures with different retry strategies */
export type FailureType =
	| 'provider_offline'    // Provider unavailable - retry in 5 min
	| 'content_not_found'   // Content doesn't exist - retry in 24 hours
	| 'timeout'             // Network timeout - retry quickly (30 sec)
	| 'validation_failed'   // HLS validation failed - retry in 2 min
	| 'rate_limited'        // Rate limited - retry in 5 min
	| 'unknown';            // Unknown failure - default 2 min

/** TTLs for each failure type (in ms) */
const FAILURE_TYPE_TTLS: Record<FailureType, number> = {
	'provider_offline': 5 * 60 * 1000,        // 5 minutes
	'content_not_found': 24 * 60 * 60 * 1000, // 24 hours
	'timeout': 30 * 1000,                      // 30 seconds
	'validation_failed': 2 * 60 * 1000,        // 2 minutes
	'rate_limited': 5 * 60 * 1000,             // 5 minutes
	'unknown': 2 * 60 * 1000                   // 2 minutes (default)
};

/**
 * Get the TTL for a specific failure type
 */
export function getFailureTtl(failureType: FailureType): number {
	return FAILURE_TYPE_TTLS[failureType] ?? NEGATIVE_CACHE_TTL_MS;
}

/** Max entries per cache level */
const STREAM_CACHE_MAX_SIZE = 500;
const VALIDATION_CACHE_MAX_SIZE = 200;
const NEGATIVE_CACHE_MAX_SIZE = 100;

// ============================================================================
// Cache Entry Types
// ============================================================================

interface CacheEntry<T> {
	value: T;
	expires: number;
	createdAt: number;
}

interface StreamCacheEntry {
	result: ExtractionResult;
	provider?: string;
}

interface ValidationCacheEntry {
	validation: StreamValidation;
	url: string;
}

interface NegativeCacheEntry {
	reason: string;
	failedAt: number;
	failureType?: FailureType;
	provider?: string;
}

// ============================================================================
// Cache Statistics
// ============================================================================

export interface CacheStats {
	streamCache: {
		size: number;
		maxSize: number;
		hits: number;
		misses: number;
		hitRate: number;
	};
	validationCache: {
		size: number;
		maxSize: number;
		hits: number;
		misses: number;
		hitRate: number;
	};
	negativeCache: {
		size: number;
		maxSize: number;
		hits: number;
		misses: number;
		hitRate: number;
	};
}

// ============================================================================
// Multi-Level Cache Class
// ============================================================================

/**
 * Multi-level cache for stream extraction results
 */
export class MultiLevelStreamCache {
	// Cache storage
	private streamCache = new Map<string, CacheEntry<StreamCacheEntry>>();
	private validationCache = new Map<string, CacheEntry<ValidationCacheEntry>>();
	private negativeCache = new Map<string, CacheEntry<NegativeCacheEntry>>();

	// Configuration
	private streamTtl: number;
	private validationTtl: number;
	private negativeTtl: number;
	private streamMaxSize: number;
	private validationMaxSize: number;
	private negativeMaxSize: number;

	// Statistics
	private streamHits = 0;
	private streamMisses = 0;
	private validationHits = 0;
	private validationMisses = 0;
	private negativeHits = 0;
	private negativeMisses = 0;

	// Cleanup timer
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor(config?: {
		streamTtlMs?: number;
		validationTtlMs?: number;
		negativeTtlMs?: number;
		streamMaxSize?: number;
		validationMaxSize?: number;
		negativeMaxSize?: number;
	}) {
		this.streamTtl = config?.streamTtlMs ?? STREAM_CACHE_TTL_MS;
		this.validationTtl = config?.validationTtlMs ?? VALIDATION_CACHE_TTL_MS;
		this.negativeTtl = config?.negativeTtlMs ?? NEGATIVE_CACHE_TTL_MS;
		this.streamMaxSize = config?.streamMaxSize ?? STREAM_CACHE_MAX_SIZE;
		this.validationMaxSize = config?.validationMaxSize ?? VALIDATION_CACHE_MAX_SIZE;
		this.negativeMaxSize = config?.negativeMaxSize ?? NEGATIVE_CACHE_MAX_SIZE;

		// Start cleanup interval
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
	}

	// --------------------------------------------------------------------------
	// Stream Cache Operations
	// --------------------------------------------------------------------------

	/**
	 * Get cached extraction result
	 */
	getStream(key: string): ExtractionResult | null {
		const entry = this.streamCache.get(key);
		if (!entry) {
			this.streamMisses++;
			return null;
		}

		if (Date.now() > entry.expires) {
			this.streamCache.delete(key);
			this.streamMisses++;
			return null;
		}

		this.streamHits++;
		// Move to end (LRU)
		this.streamCache.delete(key);
		this.streamCache.set(key, entry);

		return entry.value.result;
	}

	/**
	 * Cache an extraction result
	 */
	setStream(key: string, result: ExtractionResult, provider?: string, ttlMs?: number): void {
		this.evictIfNeeded(this.streamCache, this.streamMaxSize);

		this.streamCache.set(key, {
			value: { result, provider },
			expires: Date.now() + (ttlMs ?? this.streamTtl),
			createdAt: Date.now()
		});

		logger.debug('Cached stream extraction', {
			key,
			sourceCount: result.sources.length,
			provider,
			...streamLog
		});
	}

	// --------------------------------------------------------------------------
	// Validation Cache Operations
	// --------------------------------------------------------------------------

	/**
	 * Get cached validation result
	 */
	getValidation(url: string): StreamValidation | null {
		const key = this.validationKey(url);
		const entry = this.validationCache.get(key);

		if (!entry) {
			this.validationMisses++;
			return null;
		}

		if (Date.now() > entry.expires) {
			this.validationCache.delete(key);
			this.validationMisses++;
			return null;
		}

		this.validationHits++;
		return entry.value.validation;
	}

	/**
	 * Cache a validation result
	 */
	setValidation(url: string, validation: StreamValidation, ttlMs?: number): void {
		const key = this.validationKey(url);
		this.evictIfNeeded(this.validationCache, this.validationMaxSize);

		this.validationCache.set(key, {
			value: { validation, url },
			expires: Date.now() + (ttlMs ?? this.validationTtl),
			createdAt: Date.now()
		});
	}

	// --------------------------------------------------------------------------
	// Negative Cache Operations
	// --------------------------------------------------------------------------

	/**
	 * Check if there's a negative cache entry (recent failure)
	 */
	hasNegative(key: string): boolean {
		const entry = this.negativeCache.get(key);
		if (!entry) {
			this.negativeMisses++;
			return false;
		}

		if (Date.now() > entry.expires) {
			this.negativeCache.delete(key);
			this.negativeMisses++;
			return false;
		}

		this.negativeHits++;
		return true;
	}

	/**
	 * Get the reason for a negative cache entry
	 */
	getNegativeReason(key: string): string | null {
		const entry = this.negativeCache.get(key);
		if (!entry || Date.now() > entry.expires) {
			return null;
		}
		return entry.value.reason;
	}

	/**
	 * Add a negative cache entry
	 */
	setNegative(key: string, reason: string, provider?: string, ttlMs?: number): void {
		this.evictIfNeeded(this.negativeCache, this.negativeMaxSize);

		this.negativeCache.set(key, {
			value: { reason, failedAt: Date.now(), provider },
			expires: Date.now() + (ttlMs ?? this.negativeTtl),
			createdAt: Date.now()
		});

		logger.debug('Added negative cache entry', {
			key,
			reason,
			provider,
			ttlMs: ttlMs ?? this.negativeTtl,
			...streamLog
		});
	}

	/**
	 * Add a negative cache entry with automatic TTL based on failure type
	 * This is the preferred method for setting negative cache entries
	 */
	setNegativeWithType(
		key: string,
		reason: string,
		failureType: FailureType,
		provider?: string
	): void {
		const ttlMs = getFailureTtl(failureType);
		this.evictIfNeeded(this.negativeCache, this.negativeMaxSize);

		this.negativeCache.set(key, {
			value: { reason, failedAt: Date.now(), failureType, provider },
			expires: Date.now() + ttlMs,
			createdAt: Date.now()
		});

		logger.debug('Added negative cache entry with failure type', {
			key,
			reason,
			failureType,
			provider,
			ttlMs,
			...streamLog
		});
	}

	/**
	 * Get failure type for a negative cache entry
	 */
	getNegativeFailureType(key: string): FailureType | null {
		const entry = this.negativeCache.get(key);
		if (!entry || Date.now() > entry.expires) {
			return null;
		}
		return entry.value.failureType ?? null;
	}

	/**
	 * Remove a negative cache entry
	 */
	clearNegative(key: string): boolean {
		return this.negativeCache.delete(key);
	}

	// --------------------------------------------------------------------------
	// Cache Key Helpers
	// --------------------------------------------------------------------------

	/**
	 * Generate cache key for stream extraction
	 */
	static streamKey(
		tmdbId: string,
		type: 'movie' | 'tv',
		season?: number,
		episode?: number,
		provider?: string
	): string {
		const parts = ['stream', tmdbId, type];
		if (type === 'tv' && season !== undefined) {
			parts.push(`s${season}`);
			if (episode !== undefined) {
				parts.push(`e${episode}`);
			}
		}
		if (provider) {
			parts.push(provider);
		}
		return parts.join(':');
	}

	/**
	 * Generate cache key for validation
	 */
	private validationKey(url: string): string {
		// Use a hash of the URL to keep keys manageable
		let hash = 0;
		for (let i = 0; i < url.length; i++) {
			const char = url.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return `val:${hash.toString(36)}`;
	}

	// --------------------------------------------------------------------------
	// Statistics
	// --------------------------------------------------------------------------

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const streamTotal = this.streamHits + this.streamMisses;
		const validationTotal = this.validationHits + this.validationMisses;
		const negativeTotal = this.negativeHits + this.negativeMisses;

		return {
			streamCache: {
				size: this.streamCache.size,
				maxSize: this.streamMaxSize,
				hits: this.streamHits,
				misses: this.streamMisses,
				hitRate: streamTotal > 0 ? this.streamHits / streamTotal : 0
			},
			validationCache: {
				size: this.validationCache.size,
				maxSize: this.validationMaxSize,
				hits: this.validationHits,
				misses: this.validationMisses,
				hitRate: validationTotal > 0 ? this.validationHits / validationTotal : 0
			},
			negativeCache: {
				size: this.negativeCache.size,
				maxSize: this.negativeMaxSize,
				hits: this.negativeHits,
				misses: this.negativeMisses,
				hitRate: negativeTotal > 0 ? this.negativeHits / negativeTotal : 0
			}
		};
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.streamHits = 0;
		this.streamMisses = 0;
		this.validationHits = 0;
		this.validationMisses = 0;
		this.negativeHits = 0;
		this.negativeMisses = 0;
	}

	// --------------------------------------------------------------------------
	// Maintenance
	// --------------------------------------------------------------------------

	/**
	 * Clear all caches
	 */
	clear(): void {
		this.streamCache.clear();
		this.validationCache.clear();
		this.negativeCache.clear();
		this.resetStats();
	}

	/**
	 * Clear only the negative cache
	 */
	clearNegativeCache(): void {
		this.negativeCache.clear();
	}

	/**
	 * Cleanup expired entries
	 */
	cleanup(): void {
		const now = Date.now();
		let cleaned = 0;

		for (const [key, entry] of this.streamCache) {
			if (now > entry.expires) {
				this.streamCache.delete(key);
				cleaned++;
			}
		}

		for (const [key, entry] of this.validationCache) {
			if (now > entry.expires) {
				this.validationCache.delete(key);
				cleaned++;
			}
		}

		for (const [key, entry] of this.negativeCache) {
			if (now > entry.expires) {
				this.negativeCache.delete(key);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logger.debug('Cache cleanup completed', { cleaned, ...streamLog });
		}
	}

	/**
	 * Destroy the cache (stop cleanup timer)
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.clear();
	}

	// --------------------------------------------------------------------------
	// Private Helpers
	// --------------------------------------------------------------------------

	private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>, maxSize: number): void {
		if (cache.size >= maxSize) {
			// Remove oldest entry
			const firstKey = cache.keys().next().value;
			if (firstKey) {
				cache.delete(firstKey);
			}
		}
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cacheInstance: MultiLevelStreamCache | null = null;

/**
 * Get the global multi-level cache instance
 */
export function getStreamCache(): MultiLevelStreamCache {
	if (!cacheInstance) {
		cacheInstance = new MultiLevelStreamCache();
	}
	return cacheInstance;
}

/**
 * Create a new multi-level cache with custom config
 */
export function createStreamCache(
	config?: ConstructorParameters<typeof MultiLevelStreamCache>[0]
): MultiLevelStreamCache {
	return new MultiLevelStreamCache(config);
}
