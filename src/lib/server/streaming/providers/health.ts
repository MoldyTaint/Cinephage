/**
 * Provider Health Monitoring System
 *
 * Tracks provider performance metrics including success rates, latency,
 * and failure patterns. Used to dynamically prioritize providers.
 */

import { logger } from '$lib/logging';
import type { StreamingProviderId } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Types
// ============================================================================

/**
 * Health metrics for a single provider
 */
export interface ProviderHealth {
	/** Provider identifier */
	providerId: StreamingProviderId;

	/** Total successful extractions */
	successCount: number;

	/** Total failed extractions */
	failureCount: number;

	/** Timestamp of last successful extraction */
	lastSuccess?: Date;

	/** Timestamp of last failed extraction */
	lastFailure?: Date;

	/** Rolling average latency in milliseconds (last 10 requests) */
	averageLatencyMs: number;

	/** Success rate (0-1) */
	successRate: number;

	/** Recent latency samples (last 10) */
	latencySamples: number[];
}

/**
 * Extraction result for health tracking
 */
export interface ExtractionMetrics {
	providerId: StreamingProviderId;
	success: boolean;
	durationMs: number;
	timestamp: Date;
}

// ============================================================================
// Health Tracker
// ============================================================================

/** Maximum number of latency samples to keep */
const MAX_LATENCY_SAMPLES = 10;

/** Minimum requests before success rate is considered reliable */
const MIN_REQUESTS_FOR_RATE = 5;

/**
 * Provider Health Tracker
 * Maintains real-time health metrics for all providers
 */
class ProviderHealthTracker {
	private healthData = new Map<StreamingProviderId, ProviderHealth>();

	/**
	 * Initialize health data for a provider
	 */
	private initializeProvider(providerId: StreamingProviderId): ProviderHealth {
		const health: ProviderHealth = {
			providerId,
			successCount: 0,
			failureCount: 0,
			averageLatencyMs: 0,
			successRate: 0.5, // Start neutral
			latencySamples: []
		};
		this.healthData.set(providerId, health);
		return health;
	}

	/**
	 * Get health data for a provider
	 */
	getHealth(providerId: StreamingProviderId): ProviderHealth {
		return this.healthData.get(providerId) ?? this.initializeProvider(providerId);
	}

	/**
	 * Record an extraction result
	 */
	record(metrics: ExtractionMetrics): void {
		const health = this.getHealth(metrics.providerId);

		// Update counts
		if (metrics.success) {
			health.successCount++;
			health.lastSuccess = metrics.timestamp;
		} else {
			health.failureCount++;
			health.lastFailure = metrics.timestamp;
		}

		// Update latency samples (only for successful requests)
		if (metrics.success) {
			health.latencySamples.push(metrics.durationMs);
			if (health.latencySamples.length > MAX_LATENCY_SAMPLES) {
				health.latencySamples.shift();
			}

			// Calculate rolling average
			if (health.latencySamples.length > 0) {
				health.averageLatencyMs =
					health.latencySamples.reduce((a, b) => a + b, 0) / health.latencySamples.length;
			}
		}

		// Calculate success rate
		const totalRequests = health.successCount + health.failureCount;
		if (totalRequests >= MIN_REQUESTS_FOR_RATE) {
			health.successRate = health.successCount / totalRequests;
		}

		logger.debug('Provider health updated', {
			provider: metrics.providerId,
			success: metrics.success,
			durationMs: metrics.durationMs,
			successRate: health.successRate.toFixed(2),
			avgLatencyMs: health.averageLatencyMs.toFixed(0),
			...streamLog
		});
	}

	/**
	 * Record a successful extraction
	 */
	recordSuccess(providerId: StreamingProviderId, durationMs: number): void {
		this.record({
			providerId,
			success: true,
			durationMs,
			timestamp: new Date()
		});
	}

	/**
	 * Record a failed extraction
	 */
	recordFailure(providerId: StreamingProviderId, durationMs: number): void {
		this.record({
			providerId,
			success: false,
			durationMs,
			timestamp: new Date()
		});
	}

	/**
	 * Get all provider health data
	 */
	getAllHealth(): ProviderHealth[] {
		return Array.from(this.healthData.values());
	}

	/**
	 * Get providers sorted by success rate (descending)
	 */
	getProvidersBySuccessRate(): StreamingProviderId[] {
		const providers = Array.from(this.healthData.entries());

		return providers
			.sort((a, b) => {
				// Primary: success rate (higher is better)
				const rateDiff = b[1].successRate - a[1].successRate;
				if (Math.abs(rateDiff) > 0.1) return rateDiff;

				// Secondary: average latency (lower is better)
				return a[1].averageLatencyMs - b[1].averageLatencyMs;
			})
			.map(([id]) => id);
	}

	/**
	 * Get a combined score for provider prioritization
	 * Higher score = better provider
	 */
	getProviderScore(providerId: StreamingProviderId): number {
		const health = this.getHealth(providerId);
		const totalRequests = health.successCount + health.failureCount;

		// If not enough data, return neutral score
		if (totalRequests < MIN_REQUESTS_FOR_RATE) {
			return 50;
		}

		// Score based on success rate (0-50 points)
		// Rebalanced from 70 to give more weight to latency for streaming
		const successScore = health.successRate * 50;

		// Score based on latency (0-50 points, lower latency = higher score)
		// Assume 3000ms is very slow, fast providers should rank higher
		const latencyScore = Math.max(0, 50 - (health.averageLatencyMs / 3000) * 50);

		return successScore + latencyScore;
	}

	/**
	 * Reset health data for a provider
	 */
	reset(providerId: StreamingProviderId): void {
		this.healthData.delete(providerId);
		logger.debug('Provider health reset', { provider: providerId, ...streamLog });
	}

	/**
	 * Reset all health data
	 */
	resetAll(): void {
		this.healthData.clear();
		logger.debug('All provider health reset', streamLog);
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let trackerInstance: ProviderHealthTracker | null = null;

/**
 * Get the singleton health tracker instance
 */
export function getHealthTracker(): ProviderHealthTracker {
	if (!trackerInstance) {
		trackerInstance = new ProviderHealthTracker();
	}
	return trackerInstance;
}

/**
 * Convenience: Record a successful extraction
 */
export function recordProviderSuccess(providerId: StreamingProviderId, durationMs: number): void {
	getHealthTracker().recordSuccess(providerId, durationMs);
}

/**
 * Convenience: Record a failed extraction
 */
export function recordProviderFailure(providerId: StreamingProviderId, durationMs: number): void {
	getHealthTracker().recordFailure(providerId, durationMs);
}

/**
 * Convenience: Get provider health
 */
export function getProviderHealth(providerId: StreamingProviderId): ProviderHealth {
	return getHealthTracker().getHealth(providerId);
}

/**
 * Convenience: Get all provider health
 */
export function getAllProviderHealth(): ProviderHealth[] {
	return getHealthTracker().getAllHealth();
}
