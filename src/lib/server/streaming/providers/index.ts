/**
 * Provider Orchestrator
 *
 * Manages streaming providers with:
 * - Request deduplication
 * - Result caching
 * - Circuit breaker pattern
 * - Provider fallback
 */

import { logger } from '$lib/logging';
import { getEncDecClient } from '../enc-dec';
import type { ExtractionResult, StreamSource } from '../types';
import { getHealthTracker, getAllProviderHealth, type ProviderHealth } from './health';
import { sortStreamsByLanguage } from './language-utils';
// BaseProvider re-exported at bottom of file
import type {
	CircuitBreakerState,
	ExtractOptions,
	IStreamProvider,
	ProviderResult,
	StreamingProviderId,
	StreamResult
} from './types';

// Import all providers (will be added as they're implemented)
import { VideasyProvider } from './videasy';
import { VidlinkProvider } from './vidlink';
import { XPrimeProvider } from './xprime';
import { SmashyProvider } from './smashy';
import { HexaProvider } from './hexa';
import { YFlixProvider } from './yflix';
import { MappleProvider } from './mapple';
import { OneTouchTVProvider } from './onetouchtv';
import { AnimeKaiProvider } from './animekai';
import { KissKHProvider } from './kisskh';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration
// ============================================================================

/** Maximum consecutive failures before circuit opens */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Time in ms before circuit breaker enters half-open state */
const CIRCUIT_BREAKER_HALF_OPEN_MS = 30000;

/** Time in ms before circuit breaker fully resets */
const CIRCUIT_BREAKER_RESET_MS = 60000;

/** TTL for result cache entries */
const RESULT_CACHE_TTL_MS = 30000;

/** Number of providers to try in parallel mode */
const PARALLEL_PROVIDER_COUNT = 3;

/** Default provider priority order */
const DEFAULT_PROVIDER_ORDER: StreamingProviderId[] = [
	'vidlink',
	'videasy',
	'xprime',
	'smashy',
	'hexa',
	'yflix',
	'mapple',
	'onetouchtv',
	'animekai',
	'kisskh'
];

// ============================================================================
// State Management
// ============================================================================

/** Map of provider ID to provider instance */
const providers = new Map<StreamingProviderId, IStreamProvider>();

/** Map of pending extraction requests for deduplication */
const pendingRequests = new Map<string, Promise<ExtractionResult>>();

/** Cache for recent extraction results */
interface CachedResult {
	result: ExtractionResult;
	expiry: number;
}
const resultCache = new Map<string, CachedResult>();

/** Timers for circuit breaker reset */
const resetTimers = new Map<StreamingProviderId, NodeJS.Timeout>();

// ============================================================================
// Provider Registration
// ============================================================================

/**
 * Initialize all providers
 */
function initializeProviders(): void {
	if (providers.size > 0) return;

	const encDecClient = getEncDecClient();

	// Register all providers
	const providerInstances: IStreamProvider[] = [
		new VideasyProvider(encDecClient),
		new VidlinkProvider(encDecClient),
		new XPrimeProvider(encDecClient),
		new SmashyProvider(encDecClient),
		new HexaProvider(encDecClient),
		new YFlixProvider(encDecClient),
		new MappleProvider(encDecClient),
		new OneTouchTVProvider(encDecClient),
		new AnimeKaiProvider(encDecClient),
		new KissKHProvider(encDecClient)
	];

	for (const provider of providerInstances) {
		providers.set(provider.config.id, provider);
	}

	logger.info('Streaming providers initialized', {
		count: providers.size,
		providers: Array.from(providers.keys()),
		...streamLog
	});
}

/**
 * Get a provider by ID
 */
function getProvider(id: StreamingProviderId): IStreamProvider | undefined {
	initializeProviders();
	return providers.get(id);
}

/**
 * Get all registered providers
 */
function getAllProviders(): IStreamProvider[] {
	initializeProviders();
	return Array.from(providers.values());
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a cache key for deduplication
 */
function getCacheKey(options: ExtractOptions): string {
	const { tmdbId, type, season, episode, provider } = options;
	const parts = [tmdbId, type];

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

// ============================================================================
// Circuit Breaker (with Half-Open State)
// ============================================================================

/**
 * Extended circuit breaker state with half-open support
 */
interface ExtendedCircuitState extends CircuitBreakerState {
	/** Whether the circuit is in half-open state (allowing test requests) */
	isHalfOpen?: boolean;
	/** Timestamp when circuit entered half-open state */
	halfOpenAt?: number;
}

const extendedCircuitBreakers = new Map<StreamingProviderId, ExtendedCircuitState>();

/**
 * Get circuit breaker state for a provider
 */
function getCircuitState(providerId: StreamingProviderId): ExtendedCircuitState {
	return extendedCircuitBreakers.get(providerId) ?? { failures: 0, isOpen: false };
}

/**
 * Check if provider's circuit breaker is open (fully blocking)
 */
function isCircuitOpen(providerId: StreamingProviderId): boolean {
	const state = getCircuitState(providerId);
	if (!state.isOpen) return false;

	const now = Date.now();

	// Check if circuit should enter half-open state
	if (!state.isHalfOpen && state.resetAt) {
		const halfOpenTime = state.resetAt - (CIRCUIT_BREAKER_RESET_MS - CIRCUIT_BREAKER_HALF_OPEN_MS);
		if (now >= halfOpenTime) {
			// Transition to half-open
			extendedCircuitBreakers.set(providerId, {
				...state,
				isHalfOpen: true,
				halfOpenAt: now
			});
			logger.debug('Circuit breaker half-open', { provider: providerId, ...streamLog });
			return false; // Allow test request
		}
	}

	// Check if circuit should fully reset
	if (state.resetAt && now >= state.resetAt) {
		extendedCircuitBreakers.set(providerId, { failures: 0, isOpen: false });
		logger.debug('Circuit breaker fully reset', { provider: providerId, ...streamLog });
		return false;
	}

	// If half-open, allow one request through
	if (state.isHalfOpen) {
		return false;
	}

	return state.isOpen;
}

/**
 * Check if provider is in half-open state
 */
function isCircuitHalfOpen(providerId: StreamingProviderId): boolean {
	const state = getCircuitState(providerId);
	return state.isHalfOpen ?? false;
}

/**
 * Record a successful extraction for a provider
 */
function recordSuccess(providerId: StreamingProviderId, durationMs?: number): void {
	const wasHalfOpen = isCircuitHalfOpen(providerId);

	extendedCircuitBreakers.set(providerId, { failures: 0, isOpen: false });

	if (wasHalfOpen) {
		logger.info('Circuit breaker closed after successful half-open test', {
			provider: providerId,
			...streamLog
		});
	}

	const timer = resetTimers.get(providerId);
	if (timer) {
		clearTimeout(timer);
		resetTimers.delete(providerId);
	}

	// Record in health tracker
	if (durationMs !== undefined) {
		getHealthTracker().recordSuccess(providerId, durationMs);
	}
}

/**
 * Record a failed extraction for a provider
 */
function recordFailure(providerId: StreamingProviderId, durationMs?: number): void {
	const state = getCircuitState(providerId);

	// If in half-open state and failure, reopen circuit
	if (state.isHalfOpen) {
		const resetAt = Date.now() + CIRCUIT_BREAKER_RESET_MS;
		extendedCircuitBreakers.set(providerId, {
			failures: state.failures,
			isOpen: true,
			resetAt
		});
		logger.warn('Circuit breaker reopened after half-open failure', {
			provider: providerId,
			...streamLog
		});
		return;
	}

	const failures = state.failures + 1;
	const isOpen = failures >= MAX_CONSECUTIVE_FAILURES;
	const resetAt = isOpen ? Date.now() + CIRCUIT_BREAKER_RESET_MS : undefined;

	extendedCircuitBreakers.set(providerId, { failures, isOpen, resetAt });

	if (isOpen) {
		logger.warn('Circuit breaker opened', {
			provider: providerId,
			failures,
			halfOpenMs: CIRCUIT_BREAKER_HALF_OPEN_MS,
			resetMs: CIRCUIT_BREAKER_RESET_MS,
			...streamLog
		});
	}

	// Schedule reset
	const existingTimer = resetTimers.get(providerId);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	const timer = setTimeout(() => {
		extendedCircuitBreakers.set(providerId, { failures: 0, isOpen: false });
		resetTimers.delete(providerId);
		logger.debug('Circuit breaker fully reset', { provider: providerId, ...streamLog });
	}, CIRCUIT_BREAKER_RESET_MS);

	resetTimers.set(providerId, timer);

	// Record in health tracker
	if (durationMs !== undefined) {
		getHealthTracker().recordFailure(providerId, durationMs);
	}
}

// ============================================================================
// Result Conversion
// ============================================================================

/**
 * Convert StreamResult to StreamSource (backward compatibility)
 */
function toStreamSource(result: StreamResult, providerId: StreamingProviderId): StreamSource {
	return {
		quality: result.quality,
		title: result.title,
		url: result.url,
		type: result.streamType === 'mp4' ? 'hls' : result.streamType, // Normalize to hls/m3u8
		referer: result.referer,
		requiresSegmentProxy: true, // Always proxy for safety
		status: 'working',
		server: result.server,
		language: result.language,
		headers: result.headers,
		provider: providerId
	};
}

/**
 * Convert ProviderResult to ExtractionResult (backward compatibility)
 * Optionally sorts sources by language preference
 */
function toExtractionResult(
	result: ProviderResult,
	preferredLanguages?: string[]
): ExtractionResult {
	let sources = result.streams.map((s) => toStreamSource(s, result.provider));

	// Log order before sorting
	logger.debug('Sources before language sort', {
		order: sources.map((s) => ({ server: s.server, lang: s.language, title: s.title })),
		...streamLog
	});

	// Sort sources by language preference if provided
	if (preferredLanguages?.length) {
		sources = sortStreamsByLanguage(sources, preferredLanguages);
	}

	// Log order after sorting
	logger.debug('Sources after language sort', {
		order: sources.map((s) => ({ server: s.server, lang: s.language })),
		...streamLog
	});

	return {
		success: result.success,
		sources,
		error: result.error,
		provider: result.provider
	};
}

// ============================================================================
// Extraction Logic
// ============================================================================

/**
 * Get enabled providers in priority order, optionally sorted by health
 */
async function getEnabledProviders(sortByHealth = false): Promise<StreamingProviderId[]> {
	const enabled = DEFAULT_PROVIDER_ORDER.filter((id) => {
		const provider = getProvider(id);
		return provider?.config.enabledByDefault ?? false;
	});

	if (!sortByHealth) {
		return enabled;
	}

	// Sort by health score (higher score = better)
	const healthTracker = getHealthTracker();
	return enabled.sort((a, b) => {
		const scoreA = healthTracker.getProviderScore(a);
		const scoreB = healthTracker.getProviderScore(b);
		return scoreB - scoreA;
	});
}

/**
 * Get providers that can handle the given options
 */
function getCompatibleProviders(
	providerIds: StreamingProviderId[],
	options: ExtractOptions
): {
	compatible: StreamingProviderId[];
	skipped: StreamingProviderId[];
	unsupported: StreamingProviderId[];
} {
	const compatible: StreamingProviderId[] = [];
	const skipped: StreamingProviderId[] = [];
	const unsupported: StreamingProviderId[] = [];

	for (const providerId of providerIds) {
		const provider = getProvider(providerId);
		if (!provider) continue;

		if (!provider.canHandle(options)) {
			unsupported.push(providerId);
			continue;
		}

		if (isCircuitOpen(providerId)) {
			skipped.push(providerId);
			continue;
		}

		compatible.push(providerId);
	}

	return { compatible, skipped, unsupported };
}

/**
 * Extract from a single provider with duration tracking
 */
async function extractFromProvider(
	providerId: StreamingProviderId,
	options: ExtractOptions
): Promise<{ result: ProviderResult; durationMs: number }> {
	const provider = getProvider(providerId);
	if (!provider) {
		return {
			result: {
				success: false,
				streams: [],
				provider: providerId,
				error: 'Provider not found'
			},
			durationMs: 0
		};
	}

	const startTime = Date.now();
	const result = await provider.extract(options);
	const durationMs = Date.now() - startTime;

	return { result, durationMs };
}

/**
 * Internal extraction logic with provider fallback (sequential mode)
 */
async function doSequentialExtraction(
	options: ExtractOptions,
	enabledProviders: StreamingProviderId[]
): Promise<ExtractionResult> {
	const { compatible, skipped, unsupported } = getCompatibleProviders(enabledProviders, options);
	const errors: string[] = [];

	for (const providerId of compatible) {
		logger.debug('Trying provider', { provider: providerId, ...streamLog });

		const { result, durationMs } = await extractFromProvider(providerId, options);

		if (result.success && result.streams.length > 0) {
			logger.debug('Provider succeeded', {
				provider: providerId,
				streamCount: result.streams.length,
				durationMs,
				...streamLog
			});
			recordSuccess(providerId, durationMs);
			return toExtractionResult(result, options.preferredLanguages);
		}

		recordFailure(providerId, durationMs);
		if (result.error) {
			errors.push(`${providerId}: ${result.error}`);
		}

		logger.debug('Provider failed, trying next', {
			provider: providerId,
			error: result.error,
			durationMs,
			...streamLog
		});
	}

	// Build comprehensive error message
	const errorDetails = errors.length > 0 ? errors.join('; ') : 'No providers available';
	const skippedNote = skipped.length > 0 ? ` (circuit-broken: ${skipped.join(', ')})` : '';
	const unsupportedNote = unsupported.length > 0 ? ` (unsupported: ${unsupported.join(', ')})` : '';

	return {
		success: false,
		sources: [],
		error: `All providers failed: ${errorDetails}${skippedNote}${unsupportedNote}`
	};
}

/**
 * Internal extraction logic with parallel mode
 * Tries top N providers simultaneously, returns first success
 */
async function doParallelExtraction(
	options: ExtractOptions,
	enabledProviders: StreamingProviderId[]
): Promise<ExtractionResult> {
	const { compatible, skipped, unsupported } = getCompatibleProviders(enabledProviders, options);

	if (compatible.length === 0) {
		const skippedNote = skipped.length > 0 ? ` (circuit-broken: ${skipped.join(', ')})` : '';
		const unsupportedNote =
			unsupported.length > 0 ? ` (unsupported: ${unsupported.join(', ')})` : '';
		return {
			success: false,
			sources: [],
			error: `No compatible providers available${skippedNote}${unsupportedNote}`
		};
	}

	// Take top N providers for parallel execution
	const parallelProviders = compatible.slice(0, PARALLEL_PROVIDER_COUNT);
	logger.debug('Starting parallel extraction', {
		providers: parallelProviders,
		...streamLog
	});

	// Create abort controllers for cancellation
	const controllers = new Map<StreamingProviderId, AbortController>();

	// Start all extractions in parallel
	const promises = parallelProviders.map(async (providerId) => {
		const controller = new AbortController();
		controllers.set(providerId, controller);
		const startTime = Date.now();

		try {
			const { result, durationMs } = await extractFromProvider(providerId, options);

			if (result.success && result.streams.length > 0) {
				recordSuccess(providerId, durationMs);
				return { providerId, result, durationMs, success: true as const };
			}

			recordFailure(providerId, durationMs);
			return { providerId, result, durationMs, success: false as const };
		} catch (error) {
			const durationMs = Date.now() - startTime;
			recordFailure(providerId, durationMs);
			return {
				providerId,
				result: {
					success: false,
					streams: [],
					provider: providerId,
					error: error instanceof Error ? error.message : String(error)
				},
				durationMs,
				success: false as const
			};
		}
	});

	// Wait for all providers to complete and collect ALL successful streams
	const results = await Promise.all(promises);
	const successfulResults = results.filter((r) => r.success);
	const failedResults = results.filter((r) => !r.success);

	if (successfulResults.length > 0) {
		// Merge all successful streams from all providers
		const allStreams: StreamResult[] = [];
		const providerIds: StreamingProviderId[] = [];

		for (const result of successfulResults) {
			providerIds.push(result.providerId);
			for (const stream of result.result.streams) {
				allStreams.push({
					...stream,
					provider: result.providerId
				});
			}
		}

		logger.debug('Parallel extraction succeeded', {
			providers: providerIds,
			streamCount: allStreams.length,
			...streamLog
		});

		// Create merged result
		const mergedResult: ProviderResult = {
			success: true,
			streams: allStreams,
			provider: providerIds[0] // Primary provider for logging
		};

		return toExtractionResult(mergedResult, options.preferredLanguages);
	}

	// All parallel providers failed - collect errors
	const errors = failedResults
		.filter((r) => r.result.error)
		.map((r) => `${r.providerId}: ${r.result.error}`);

	logger.debug('All parallel providers failed', {
		providers: parallelProviders,
		...streamLog
	});

	// Fall back to remaining providers sequentially
	const remainingProviders = compatible.slice(PARALLEL_PROVIDER_COUNT);
	if (remainingProviders.length > 0) {
		logger.debug('Falling back to sequential extraction', {
			providers: remainingProviders,
			...streamLog
		});
		return doSequentialExtraction(options, remainingProviders);
	}

	const skippedNote = skipped.length > 0 ? ` (circuit-broken: ${skipped.join(', ')})` : '';
	const unsupportedNote = unsupported.length > 0 ? ` (unsupported: ${unsupported.join(', ')})` : '';

	return {
		success: false,
		sources: [],
		error: `All providers failed: ${errors.join('; ')}${skippedNote}${unsupportedNote}`
	};
}

/**
 * Internal extraction logic dispatcher
 */
async function doExtraction(options: ExtractOptions): Promise<ExtractionResult> {
	initializeProviders();

	const enabledProviders = await getEnabledProviders(true); // Sort by health

	if (enabledProviders.length === 0) {
		return {
			success: false,
			sources: [],
			error: 'No streaming providers enabled. Enable at least one provider in settings.'
		};
	}

	// If specific provider requested, use only that one
	if (options.provider) {
		const provider = getProvider(options.provider);
		if (!provider) {
			return {
				success: false,
				sources: [],
				error: `Unknown provider: ${options.provider}`
			};
		}

		if (!enabledProviders.includes(options.provider)) {
			return {
				success: false,
				sources: [],
				error: `Provider ${options.provider} is not enabled`
			};
		}

		const { result, durationMs } = await extractFromProvider(options.provider, options);
		if (result.success && result.streams.length > 0) {
			recordSuccess(options.provider, durationMs);
		} else {
			recordFailure(options.provider, durationMs);
		}

		return toExtractionResult(result, options.preferredLanguages);
	}

	// Use parallel extraction for faster results
	// Language preferences are handled by sorting results after extraction
	if (options.parallel !== false && enabledProviders.length >= 2) {
		return doParallelExtraction(options, enabledProviders);
	}

	// Fall back to sequential extraction
	return doSequentialExtraction(options, enabledProviders);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract streams for the given content
 *
 * Features:
 * - Request deduplication (concurrent requests for same content share result)
 * - Result caching (30 second TTL)
 * - Circuit breaker (opens after 3 failures, resets after 60s)
 * - Provider fallback (tries providers in priority order)
 */
export async function extractStreams(options: ExtractOptions): Promise<ExtractionResult> {
	const cacheKey = getCacheKey(options);

	// Check result cache first
	const cached = resultCache.get(cacheKey);
	if (cached && cached.expiry > Date.now()) {
		logger.debug('Returning cached extraction result', { cacheKey, ...streamLog });
		return cached.result;
	}

	// Check for pending request (deduplication)
	const pending = pendingRequests.get(cacheKey);
	if (pending) {
		logger.debug('Reusing pending extraction request', { cacheKey, ...streamLog });
		return pending;
	}

	// Create extraction promise
	const extractionPromise = doExtraction(options);

	// Store in pending requests
	pendingRequests.set(cacheKey, extractionPromise);

	try {
		const result = await extractionPromise;

		// Cache the result
		resultCache.set(cacheKey, {
			result,
			expiry: Date.now() + RESULT_CACHE_TTL_MS
		});

		return result;
	} finally {
		// Clean up pending request
		pendingRequests.delete(cacheKey);
	}
}

/**
 * Get list of all available providers
 */
export function getAvailableProviders(): IStreamProvider[] {
	return getAllProviders();
}

/**
 * Get provider by ID
 */
export function getProviderById(id: StreamingProviderId): IStreamProvider | undefined {
	return getProvider(id);
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches(): void {
	resultCache.clear();
	pendingRequests.clear();
	extendedCircuitBreakers.clear();
	for (const timer of resetTimers.values()) {
		clearTimeout(timer);
	}
	resetTimers.clear();
	getHealthTracker().resetAll();
}

/**
 * Get provider health metrics
 */
export function getProvidersHealth(): ProviderHealth[] {
	return getAllProviderHealth();
}

// ============================================================================
// Status & Monitoring Exports
// ============================================================================

/**
 * Provider status for monitoring
 */
export interface ProviderStatus {
	id: StreamingProviderId;
	name: string;
	enabled: boolean;
	circuitBreaker: {
		isOpen: boolean;
		isHalfOpen: boolean;
		failures: number;
		resetAt?: number;
	};
	health: ProviderHealth;
	score: number;
}

/**
 * Get circuit breaker states for all providers
 */
export function getCircuitBreakerStates(): Map<StreamingProviderId, ExtendedCircuitState> {
	initializeProviders();
	const states = new Map<StreamingProviderId, ExtendedCircuitState>();
	for (const providerId of DEFAULT_PROVIDER_ORDER) {
		states.set(providerId, getCircuitState(providerId));
	}
	return states;
}

/**
 * Manually reset a provider's circuit breaker
 */
export function resetCircuitBreaker(providerId: StreamingProviderId): boolean {
	const provider = getProvider(providerId);
	if (!provider) return false;

	extendedCircuitBreakers.set(providerId, { failures: 0, isOpen: false });
	const timer = resetTimers.get(providerId);
	if (timer) {
		clearTimeout(timer);
		resetTimers.delete(providerId);
	}

	logger.info('Circuit breaker manually reset', { provider: providerId, ...streamLog });
	return true;
}

/**
 * Get comprehensive status for all providers
 */
export function getAllProviderStatus(): ProviderStatus[] {
	initializeProviders();
	const healthTracker = getHealthTracker();

	return DEFAULT_PROVIDER_ORDER.map((id) => {
		const provider = getProvider(id);
		const circuitState = getCircuitState(id);
		const health = healthTracker.getHealth(id);
		const score = healthTracker.getProviderScore(id);

		return {
			id,
			name: provider?.config.name ?? id,
			enabled: provider?.config.enabledByDefault ?? false,
			circuitBreaker: {
				isOpen: circuitState.isOpen,
				isHalfOpen: circuitState.isHalfOpen ?? false,
				failures: circuitState.failures,
				resetAt: circuitState.resetAt
			},
			health,
			score
		};
	});
}

/**
 * Get list of provider IDs
 */
export function getProviderIds(): StreamingProviderId[] {
	return [...DEFAULT_PROVIDER_ORDER];
}

// Re-export types
export type { StreamingProviderId, ExtractOptions, ProviderResult, StreamResult } from './types';
export { BaseProvider } from './base';
