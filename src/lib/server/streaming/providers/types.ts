/**
 * Provider Types
 *
 * Re-exports types from the unified types module for backward compatibility.
 * New code should import from '../types/' directly.
 */

// Re-export all provider-related types from unified module
export type {
	// Provider identifiers
	StreamingProviderId,
	MediaType,
	ContentCategory,

	// Provider configuration
	ProviderCapabilities,
	RetryConfig,
	TimeoutConfig,
	ProviderConfig,
	ServerConfig,

	// Search parameters
	SearchParams,

	// Results
	StreamResult,
	ProviderResult,

	// Provider interface
	IStreamProvider
} from '../types/provider';

// Re-export extraction types
export type {
	ExtractOptions,
	CircuitBreakerState,
	ExtendedCircuitState,
	CircuitBreakerConfig,
	ProviderHealth,
	ProviderStatus
} from '../types/extraction';
