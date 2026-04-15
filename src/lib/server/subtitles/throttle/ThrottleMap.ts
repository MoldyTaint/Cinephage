/**
 * Provider-Specific Throttle Duration Map
 *
 * Defines how long to throttle providers based on error type.
 * Based on Bazarr's provider_throttle_map() in get_providers.py
 *
 * Used by SubtitleProviderManager for DB-backed provider throttling.
 */

import type { ThrottleableErrorType } from '../errors/ProviderErrors';
import type { ProviderImplementation } from '../types';

// Time helper constants
const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

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
