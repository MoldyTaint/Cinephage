/**
 * Subtitle Provider Error Types
 *
 * Typed exceptions for exception-specific throttling.
 * Based on Bazarr's subliminal_patch/exceptions.py
 */

/**
 * Base class for all provider errors
 */
export class ProviderError extends Error {
	constructor(
		message: string,
		public readonly provider: string
	) {
		super(message);
		this.name = 'ProviderError';
	}
}

/**
 * Rate limit exceeded (HTTP 429)
 * Typically short-lived, retry after a brief wait
 */
export class TooManyRequests extends ProviderError {
	readonly retryAfter?: number; // seconds

	constructor(provider: string, retryAfter?: number) {
		super('Too many requests', provider);
		this.name = 'TooManyRequests';
		this.retryAfter = retryAfter;
	}
}

/**
 * Daily/hourly download limit exceeded
 * May need to wait until reset time (often midnight)
 */
export class DownloadLimitExceeded extends ProviderError {
	readonly remaining?: number;
	readonly resetTime?: Date;

	constructor(provider: string, remaining?: number, resetTime?: Date) {
		super('Download limit exceeded', provider);
		this.name = 'DownloadLimitExceeded';
		this.remaining = remaining;
		this.resetTime = resetTime;
	}
}

/**
 * Service temporarily unavailable (HTTP 503)
 */
export class ServiceUnavailable extends ProviderError {
	constructor(provider: string) {
		super('Service unavailable', provider);
		this.name = 'ServiceUnavailable';
	}
}

/**
 * API throttled by provider
 */
export class APIThrottled extends ProviderError {
	constructor(provider: string) {
		super('API throttled', provider);
		this.name = 'APIThrottled';
	}
}

/**
 * Failed to parse API response
 */
export class ParseResponseError extends ProviderError {
	constructor(provider: string, details?: string) {
		super(`Failed to parse response${details ? `: ${details}` : ''}`, provider);
		this.name = 'ParseResponseError';
	}
}

/**
 * IP address blocked by provider
 */
export class IPAddressBlocked extends ProviderError {
	constructor(provider: string) {
		super('IP address blocked', provider);
		this.name = 'IPAddressBlocked';
	}
}

/**
 * Authentication failed (invalid credentials)
 */
export class AuthenticationError extends ProviderError {
	constructor(provider: string, details?: string) {
		super(`Authentication failed${details ? `: ${details}` : ''}`, provider);
		this.name = 'AuthenticationError';
	}
}

/**
 * Provider configuration error (missing API key, etc.)
 */
export class ConfigurationError extends ProviderError {
	constructor(provider: string, message: string) {
		super(`Configuration error: ${message}`, provider);
		this.name = 'ConfigurationError';
	}
}

/**
 * Search limit reached (separate from download limit)
 */
export class SearchLimitReached extends ProviderError {
	constructor(provider: string) {
		super('Search limit reached', provider);
		this.name = 'SearchLimitReached';
	}
}

/**
 * Request timeout
 */
export class TimeoutError extends ProviderError {
	constructor(provider: string, timeoutMs?: number) {
		super(`Request timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`, provider);
		this.name = 'TimeoutError';
	}
}

/**
 * Connection error (network issues)
 */
export class ConnectionError extends ProviderError {
	constructor(provider: string, details?: string) {
		super(`Connection error${details ? `: ${details}` : ''}`, provider);
		this.name = 'ConnectionError';
	}
}

/**
 * Union type for all throttle-able exceptions
 */
export type ThrottleableError =
	| TooManyRequests
	| DownloadLimitExceeded
	| ServiceUnavailable
	| APIThrottled
	| ParseResponseError
	| IPAddressBlocked
	| AuthenticationError
	| ConfigurationError
	| SearchLimitReached
	| TimeoutError
	| ConnectionError;

/**
 * Error type names for throttle map lookup
 */
export type ThrottleableErrorType =
	| 'TooManyRequests'
	| 'DownloadLimitExceeded'
	| 'ServiceUnavailable'
	| 'APIThrottled'
	| 'ParseResponseError'
	| 'IPAddressBlocked'
	| 'AuthenticationError'
	| 'ConfigurationError'
	| 'SearchLimitReached'
	| 'TimeoutError'
	| 'ConnectionError';

/**
 * List of throttleable error type names
 */
const THROTTLEABLE_ERROR_NAMES = [
	'TooManyRequests',
	'DownloadLimitExceeded',
	'ServiceUnavailable',
	'APIThrottled',
	'ParseResponseError',
	'IPAddressBlocked',
	'AuthenticationError',
	'ConfigurationError',
	'SearchLimitReached',
	'TimeoutError',
	'ConnectionError'
] as const;

/**
 * Type guard for throttleable errors
 * Uses both instanceof check and name-based check as fallback
 * (instanceof can fail in some bundling scenarios)
 */
export function isThrottleableError(error: unknown): error is ThrottleableError {
	if (error instanceof ProviderError) {
		return THROTTLEABLE_ERROR_NAMES.includes(error.name as (typeof THROTTLEABLE_ERROR_NAMES)[number]);
	}
	// Fallback: check if it's an Error with a throttleable name
	// This handles cases where instanceof fails due to bundling issues
	if (error instanceof Error && 'provider' in error) {
		return THROTTLEABLE_ERROR_NAMES.includes(error.name as (typeof THROTTLEABLE_ERROR_NAMES)[number]);
	}
	return false;
}

/**
 * Get error type name from error instance
 */
export function getErrorType(error: Error): ThrottleableErrorType | 'UnknownError' {
	if (isThrottleableError(error)) {
		return error.name as ThrottleableErrorType;
	}
	return 'UnknownError';
}
