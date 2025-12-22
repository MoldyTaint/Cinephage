/**
 * Streaming Types - Unified Type Exports
 *
 * This module consolidates all streaming-related types for easy importing.
 * Import from here instead of individual files.
 */

// ============================================================================
// Stream Types
// ============================================================================

export type {
	StreamType,
	StreamStatus,
	StreamSource,
	StreamResult,
	StreamValidation,
	PlaylistValidationResult,
	SegmentValidation,
	ValidationOptions,
	ValidatedStreamSource,
	ValidatedStreamResult
} from './stream';

// ============================================================================
// Provider Types
// ============================================================================

export type {
	StreamingProviderId,
	MediaType,
	ContentCategory,
	ProviderCapabilities,
	RetryConfig,
	TimeoutConfig,
	ProviderConfig,
	ServerConfig,
	SearchParams,
	ProviderResult,
	IStreamProvider
} from './provider';

// ============================================================================
// Extraction Types
// ============================================================================

export type {
	ExtractOptions,
	ExtractionResult,
	ValidatedExtractionResult,
	ExtractorOptions,
	CircuitBreakerState,
	ExtendedCircuitState,
	CircuitBreakerConfig,
	ProviderHealth,
	HealthCheckResult,
	ProviderStatus
} from './extraction';

// ============================================================================
// Error Types
// ============================================================================

export {
	StreamErrorCode,
	StreamError,
	ProviderUnavailableError,
	ProviderTimeoutError,
	ProviderRateLimitedError,
	StreamValidationError,
	PlaylistParseError,
	EncDecApiError,
	ContentNotFoundError,
	ContentIdLookupError,
	ProxyError,
	CircuitBreakerOpenError,
	isStreamError,
	isRecoverableError,
	wrapError
} from './error';

export type { EncDecOperation } from './error';
