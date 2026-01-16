/**
 * Application-specific error classes with context.
 * Use these to provide consistent, informative error responses.
 */

/**
 * Base application error with code, status, and context.
 */
export class AppError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly statusCode: number = 500,
		public readonly context?: Record<string, unknown>
	) {
		super(message);
		this.name = 'AppError';
	}

	/**
	 * Convert to a JSON-serializable object for API responses.
	 */
	toJSON() {
		return {
			error: this.message,
			code: this.code,
			...(this.context && { context: this.context })
		};
	}
}

/**
 * Validation error for invalid user input.
 */
export class ValidationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'VALIDATION_ERROR', 400, context);
		this.name = 'ValidationError';
	}
}

/**
 * Not found error for missing resources.
 */
export class NotFoundError extends AppError {
	constructor(resource: string, id?: string | number) {
		super(`${resource} not found`, 'NOT_FOUND', 404, { resource, id });
		this.name = 'NotFoundError';
	}
}

/**
 * External service error for failures from TMDB, indexers, etc.
 */
export class ExternalServiceError extends AppError {
	constructor(service: string, message: string, statusCode?: number) {
		super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', statusCode ?? 502, { service });
		this.name = 'ExternalServiceError';
	}
}

/**
 * Configuration error for missing or invalid configuration.
 */
export class ConfigurationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'CONFIGURATION_ERROR', 500, context);
		this.name = 'ConfigurationError';
	}
}

/**
 * Rate limit error when request limits are exceeded.
 */
export class RateLimitError extends AppError {
	constructor(retryAfter: number) {
		super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
		this.name = 'RateLimitError';
	}
}

/**
 * Invalid NZB error for malformed or empty NZB files.
 */
export class InvalidNzbError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'INVALID_NZB', 400, context);
		this.name = 'InvalidNzbError';
	}
}

/**
 * Error thrown when browser-based Cloudflare bypass fails.
 */
export class CloudflareBypassError extends AppError {
	constructor(
		public readonly host: string,
		public readonly reason: string,
		public readonly challengeType?: string
	) {
		super(`Cloudflare bypass failed for ${host}: ${reason}`, 'CLOUDFLARE_BYPASS_ERROR', 503, {
			host,
			reason,
			challengeType
		});
		this.name = 'CloudflareBypassError';
	}
}

/**
 * Type guard to check if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}

/**
 * Safely extract error message from unknown error.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	return 'Unknown error';
}
