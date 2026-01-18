/**
 * Provider-Specific Throttle Duration Map
 *
 * Defines how long to throttle providers based on error type.
 * Based on Bazarr's provider_throttle_map() in get_providers.py
 *
 * Enhanced with:
 * - 5-in-120s rule: Only throttle after 5 failures in 120 seconds
 * - File persistence: Survive server restarts
 * - Provider analytics tracking
 */

import type { ThrottleableErrorType } from '../errors/ProviderErrors';
import type { ProviderImplementation } from '../types';
import { logger } from '$lib/logging';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Configuration for a throttle duration
 */
export interface ThrottleConfig {
	/** Duration in milliseconds */
	duration: number;
	/** Human-readable description */
	description: string;
}

/**
 * Map of error types to throttle configurations
 */
export type ThrottleMap = {
	[K in ThrottleableErrorType]?: ThrottleConfig;
};

/**
 * Failure tracking for 5-in-120s rule
 */
interface FailureRecord {
	timestamps: number[];
	errorType: ThrottleableErrorType | 'UnknownError';
}

/**
 * Throttle state for a provider
 */
interface ThrottleState {
	throttledUntil: number; // Unix timestamp
	errorType: ThrottleableErrorType | 'UnknownError';
	description: string;
}

/**
 * Provider analytics
 */
export interface ProviderAnalytics {
	successCount: number;
	failureCount: number;
	totalResponseTimeMs: number;
	requestCount: number;
	lastRequestAt?: number;
	lastErrorAt?: number;
	lastErrorType?: string;
}

/**
 * Persisted throttle data
 */
interface PersistedThrottleData {
	throttleStates: Record<string, ThrottleState>;
	analytics: Record<string, ProviderAnalytics>;
	version: number;
}

// Time helper constants
const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

/** Threshold: 5 failures */
const FAILURE_THRESHOLD = 5;

/** Window: 120 seconds */
const FAILURE_WINDOW_MS = 120 * SECONDS;

/** Persistence file path */
const THROTTLE_DATA_FILE = join(process.cwd(), 'data', 'throttle-state.json');

/** Current persistence version */
const PERSISTENCE_VERSION = 1;

/**
 * Default throttle durations for all providers
 */
export const DEFAULT_THROTTLE_MAP: ThrottleMap = {
	TooManyRequests: { duration: 1 * HOURS, description: '1 hour' },
	DownloadLimitExceeded: { duration: 3 * HOURS, description: '3 hours' },
	ServiceUnavailable: { duration: 20 * MINUTES, description: '20 minutes' },
	APIThrottled: { duration: 10 * MINUTES, description: '10 minutes' },
	ParseResponseError: { duration: 6 * HOURS, description: '6 hours' },
	IPAddressBlocked: { duration: 24 * HOURS, description: '24 hours' },
	AuthenticationError: { duration: 12 * HOURS, description: '12 hours' },
	ConfigurationError: { duration: 12 * HOURS, description: '12 hours' },
	SearchLimitReached: { duration: 3 * HOURS, description: '3 hours' },
	TimeoutError: { duration: 1 * HOURS, description: '1 hour' },
	ConnectionError: { duration: 1 * HOURS, description: '1 hour' }
};

/**
 * Provider-specific throttle overrides
 */
export const PROVIDER_THROTTLE_OVERRIDES: Partial<
	Record<ProviderImplementation, Partial<ThrottleMap>>
> = {
	opensubtitles: {
		TooManyRequests: { duration: 1 * MINUTES, description: '1 minute' },
		DownloadLimitExceeded: { duration: 6 * HOURS, description: '6 hours' },
		APIThrottled: { duration: 15 * SECONDS, description: '15 seconds' }
	},

	addic7ed: {
		DownloadLimitExceeded: { duration: 3 * HOURS, description: '3 hours' },
		TooManyRequests: { duration: 5 * MINUTES, description: '5 minutes' },
		IPAddressBlocked: { duration: 1 * HOURS, description: '1 hour' }
	},

	subdl: {
		TooManyRequests: { duration: 5 * MINUTES, description: '5 minutes' },
		DownloadLimitExceeded: { duration: 24 * HOURS, description: '24 hours' } // Daily reset
	},

	yifysubtitles: {
		ServiceUnavailable: { duration: 5 * MINUTES, description: '5 minutes' }
	},

	gestdown: {
		ServiceUnavailable: { duration: 1 * MINUTES, description: '1 minute' } // Uses 423 locked status
	},

	subf2m: {
		ServiceUnavailable: { duration: 5 * MINUTES, description: '5 minutes' },
		APIThrottled: { duration: 1 * HOURS, description: '1 hour' }
	}
};

/**
 * Default throttle config for unknown error types
 */
const UNKNOWN_ERROR_CONFIG: ThrottleConfig = {
	duration: 10 * MINUTES,
	description: '10 minutes'
};

/**
 * Get throttle configuration for a specific error and provider
 */
export function getThrottleConfig(
	errorType: ThrottleableErrorType | 'UnknownError',
	providerImplementation: ProviderImplementation
): ThrottleConfig {
	// Check provider-specific override first
	const providerOverrides = PROVIDER_THROTTLE_OVERRIDES[providerImplementation];
	if (providerOverrides && errorType !== 'UnknownError' && providerOverrides[errorType]) {
		return providerOverrides[errorType]!;
	}

	// Fall back to default
	if (errorType !== 'UnknownError' && DEFAULT_THROTTLE_MAP[errorType]) {
		return DEFAULT_THROTTLE_MAP[errorType]!;
	}

	// Unknown error type - use conservative default
	return UNKNOWN_ERROR_CONFIG;
}

/**
 * Calculate time until midnight in a specific timezone
 * Used for providers with daily reset patterns
 */
export function getTimeUntilMidnight(timezone: string = 'UTC'): number {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hour12: false
	});

	const parts = formatter.formatToParts(now);
	const hours = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
	const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
	const seconds = parseInt(parts.find((p) => p.type === 'second')?.value || '0');

	const msUntilMidnight =
		(24 - hours - 1) * 60 * 60 * 1000 + (60 - minutes - 1) * 60 * 1000 + (60 - seconds) * 1000;

	return msUntilMidnight;
}

/**
 * Special reset time calculators for specific providers
 * Returns milliseconds until the reset time
 */
export const PROVIDER_RESET_CALCULATORS: Partial<Record<ProviderImplementation, () => number>> = {
	// SubDL has daily limits that reset at midnight UTC
	subdl: () => getTimeUntilMidnight('UTC')
};

/**
 * Check if a provider has a special reset calculator
 */
export function hasResetCalculator(implementation: ProviderImplementation): boolean {
	return implementation in PROVIDER_RESET_CALCULATORS;
}

/**
 * Get the reset time for a provider, if applicable
 */
export function getProviderResetTime(implementation: ProviderImplementation): Date | null {
	const calculator = PROVIDER_RESET_CALCULATORS[implementation];
	if (calculator) {
		return new Date(Date.now() + calculator());
	}
	return null;
}

// ============================================================================
// THROTTLE MANAGER (NEW)
// ============================================================================

/**
 * Throttle Manager - Manages provider throttling with 5-in-120s rule
 *
 * Based on Bazarr's throttle tracking with enhancements:
 * - Only throttle after 5 failures in 120 seconds
 * - Persist state to file for restart survival
 * - Track analytics per provider
 */
export class ThrottleManager {
	private failureRecords: Map<string, FailureRecord> = new Map();
	private throttleStates: Map<string, ThrottleState> = new Map();
	private analytics: Map<string, ProviderAnalytics> = new Map();
	private persistenceEnabled: boolean;

	constructor(enablePersistence = true) {
		this.persistenceEnabled = enablePersistence;
		this.loadPersistedData();
	}

	/**
	 * Record a failure for a provider
	 *
	 * Only throttles if 5+ failures occur within 120 seconds
	 */
	recordFailure(
		providerName: string,
		implementation: ProviderImplementation,
		errorType: ThrottleableErrorType | 'UnknownError'
	): { shouldThrottle: boolean; throttleUntil?: Date; description?: string } {
		const now = Date.now();

		// Get or create failure record
		let record = this.failureRecords.get(providerName);
		if (!record) {
			record = { timestamps: [], errorType };
			this.failureRecords.set(providerName, record);
		}

		// Add current failure
		record.timestamps.push(now);
		record.errorType = errorType;

		// Clean old failures (outside window)
		record.timestamps = record.timestamps.filter((t) => now - t < FAILURE_WINDOW_MS);

		// Update analytics
		this.updateAnalytics(providerName, { failure: true, errorType });

		// Check if threshold reached
		if (record.timestamps.length >= FAILURE_THRESHOLD) {
			// Throttle the provider
			const config = getThrottleConfig(errorType, implementation);
			const throttleUntil = now + config.duration;

			this.throttleStates.set(providerName, {
				throttledUntil: throttleUntil,
				errorType,
				description: config.description
			});

			// Clear failure record
			this.failureRecords.delete(providerName);

			// Persist state
			this.persistData();

			logger.warn(
				`Provider ${providerName} throttled for ${config.description} after ${FAILURE_THRESHOLD} failures`
			);

			return {
				shouldThrottle: true,
				throttleUntil: new Date(throttleUntil),
				description: config.description
			};
		}

		return { shouldThrottle: false };
	}

	/**
	 * Record immediate throttle (skip 5-in-120s rule)
	 *
	 * Use for explicit rate limit responses (429, etc.)
	 */
	recordImmediateThrottle(
		providerName: string,
		implementation: ProviderImplementation,
		errorType: ThrottleableErrorType
	): { throttleUntil: Date; description: string } {
		const now = Date.now();
		const config = getThrottleConfig(errorType, implementation);
		const throttleUntil = now + config.duration;

		this.throttleStates.set(providerName, {
			throttledUntil: throttleUntil,
			errorType,
			description: config.description
		});

		// Clear failure record
		this.failureRecords.delete(providerName);

		// Update analytics
		this.updateAnalytics(providerName, { failure: true, errorType });

		// Persist state
		this.persistData();

		logger.warn(`Provider ${providerName} immediately throttled for ${config.description}`);

		return {
			throttleUntil: new Date(throttleUntil),
			description: config.description
		};
	}

	/**
	 * Record a success for a provider
	 */
	recordSuccess(providerName: string, responseTimeMs: number): void {
		// Clear failure record on success
		this.failureRecords.delete(providerName);

		// Update analytics
		this.updateAnalytics(providerName, { success: true, responseTimeMs });
	}

	/**
	 * Check if a provider is currently throttled
	 */
	isThrottled(providerName: string): { throttled: boolean; until?: Date; errorType?: string } {
		const state = this.throttleStates.get(providerName);
		if (!state) {
			return { throttled: false };
		}

		const now = Date.now();
		if (now >= state.throttledUntil) {
			// Throttle expired
			this.throttleStates.delete(providerName);
			this.persistData();
			return { throttled: false };
		}

		return {
			throttled: true,
			until: new Date(state.throttledUntil),
			errorType: state.errorType
		};
	}

	/**
	 * Clear throttle for a provider
	 */
	clearThrottle(providerName: string): void {
		this.throttleStates.delete(providerName);
		this.failureRecords.delete(providerName);
		this.persistData();
	}

	/**
	 * Get analytics for a provider
	 */
	getAnalytics(providerName: string): ProviderAnalytics | undefined {
		return this.analytics.get(providerName);
	}

	/**
	 * Get all provider analytics
	 */
	getAllAnalytics(): Map<string, ProviderAnalytics> {
		return new Map(this.analytics);
	}

	/**
	 * Get average response time for a provider
	 */
	getAverageResponseTime(providerName: string): number | undefined {
		const analytics = this.analytics.get(providerName);
		if (!analytics || analytics.requestCount === 0) {
			return undefined;
		}
		return analytics.totalResponseTimeMs / analytics.requestCount;
	}

	/**
	 * Update analytics for a provider
	 */
	private updateAnalytics(
		providerName: string,
		update: { success?: boolean; failure?: boolean; responseTimeMs?: number; errorType?: string }
	): void {
		let analytics = this.analytics.get(providerName);
		if (!analytics) {
			analytics = {
				successCount: 0,
				failureCount: 0,
				totalResponseTimeMs: 0,
				requestCount: 0
			};
			this.analytics.set(providerName, analytics);
		}

		if (update.success) {
			analytics.successCount++;
			analytics.requestCount++;
			analytics.lastRequestAt = Date.now();
			if (update.responseTimeMs) {
				analytics.totalResponseTimeMs += update.responseTimeMs;
			}
		}

		if (update.failure) {
			analytics.failureCount++;
			analytics.requestCount++;
			analytics.lastErrorAt = Date.now();
			analytics.lastErrorType = update.errorType;
		}
	}

	/**
	 * Load persisted throttle data
	 */
	private loadPersistedData(): void {
		if (!this.persistenceEnabled) return;

		try {
			if (existsSync(THROTTLE_DATA_FILE)) {
				const data = readFileSync(THROTTLE_DATA_FILE, 'utf-8');
				const parsed: PersistedThrottleData = JSON.parse(data);

				if (parsed.version !== PERSISTENCE_VERSION) {
					logger.debug('Throttle data version mismatch, starting fresh');
					return;
				}

				// Restore throttle states (filter out expired)
				const now = Date.now();
				for (const [name, state] of Object.entries(parsed.throttleStates)) {
					if (state.throttledUntil > now) {
						this.throttleStates.set(name, state);
					}
				}

				// Restore analytics
				for (const [name, analytics] of Object.entries(parsed.analytics)) {
					this.analytics.set(name, analytics);
				}

				logger.debug(`Loaded throttle data: ${this.throttleStates.size} active throttles`);
			}
		} catch (error) {
			logger.warn('Failed to load throttle data', {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Persist throttle data to file
	 */
	private persistData(): void {
		if (!this.persistenceEnabled) return;

		try {
			const data: PersistedThrottleData = {
				throttleStates: Object.fromEntries(this.throttleStates),
				analytics: Object.fromEntries(this.analytics),
				version: PERSISTENCE_VERSION
			};

			writeFileSync(THROTTLE_DATA_FILE, JSON.stringify(data, null, 2));
		} catch (error) {
			logger.warn('Failed to persist throttle data', {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
}

/** Singleton throttle manager instance */
let throttleManagerInstance: ThrottleManager | null = null;

/**
 * Get the singleton throttle manager instance
 */
export function getThrottleManager(): ThrottleManager {
	if (!throttleManagerInstance) {
		throttleManagerInstance = new ThrottleManager();
	}
	return throttleManagerInstance;
}
