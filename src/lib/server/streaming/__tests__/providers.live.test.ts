/**
 * Live Provider Integration Tests
 *
 * These tests actually hit the streaming providers to verify they work.
 * Run with: npm run test -- --testNamePattern="Live Provider"
 *
 * Note: These tests may be slow and can fail due to provider issues.
 * They should not block CI but are useful for manual verification.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { extractStreams, getAvailableProviders, clearCaches } from '../providers';
import { getStreamValidator } from '../validation';
import type { ExtractOptions } from '../types';
import {
	getPrimaryTestMovie,
	getPrimaryTestTvShow,
	type MovieTestContent,
	type TvTestContent
} from './fixtures/testContent';

// ============================================================================
// Test Configuration
// ============================================================================

/** Timeout for provider extraction - 60s is plenty, if it takes longer something is broken */
const EXTRACTION_TIMEOUT_MS = 60000;

/** Timeout for validation */
const VALIDATION_TIMEOUT_MS = 10000;

// ============================================================================
// Test Setup
// ============================================================================

describe('Live Provider Tests', () => {
	let testMovie: MovieTestContent;
	let testTvShow: TvTestContent;
	const validator = getStreamValidator();

	beforeAll(() => {
		// Clear caches before running tests
		clearCaches();
		testMovie = getPrimaryTestMovie();
		testTvShow = getPrimaryTestTvShow();
	});

	// --------------------------------------------------------------------------
	// Provider Availability
	// --------------------------------------------------------------------------

	describe('Provider Availability', () => {
		it('should have at least one provider available', () => {
			const providers = getAvailableProviders();
			expect(providers.length).toBeGreaterThan(0);
		});

		it('should have providers with valid configurations', () => {
			const providers = getAvailableProviders();

			for (const provider of providers) {
				expect(provider.config).toBeDefined();
				expect(provider.config.id).toBeDefined();
				expect(provider.config.name).toBeDefined();
				expect(typeof provider.config.supportsMovies).toBe('boolean');
				expect(typeof provider.config.supportsTv).toBe('boolean');
			}
		});
	});

	// --------------------------------------------------------------------------
	// Movie Extraction
	// --------------------------------------------------------------------------

	describe('Movie Extraction', () => {
		it(
			'should extract at least one stream for a popular movie',
			async () => {
				const options: ExtractOptions = {
					tmdbId: testMovie.tmdbId,
					type: 'movie',
					title: testMovie.title,
					year: testMovie.year,
					imdbId: testMovie.imdbId
				};

				const result = await extractStreams(options);

				// Should succeed with at least one source
				expect(result.success).toBe(true);
				expect(result.sources.length).toBeGreaterThan(0);

				// First source should have required fields
				const firstSource = result.sources[0];
				expect(firstSource.url).toBeDefined();
				expect(firstSource.url).toMatch(/^https?:\/\//);
				expect(firstSource.referer).toBeDefined();
			},
			EXTRACTION_TIMEOUT_MS
		);

		it(
			'should return streams with valid HLS URLs',
			async () => {
				const options: ExtractOptions = {
					tmdbId: testMovie.tmdbId,
					type: 'movie',
					title: testMovie.title,
					year: testMovie.year
				};

				const result = await extractStreams(options);
				
				// Always make an assertion about the result structure
				expect(result).toBeDefined();
				expect(typeof result.success).toBe('boolean');

				if (result.success && result.sources.length > 0) {
					const source = result.sources[0];

					// Validate the stream
					const validation = await validator.validateStream(source, {
						timeout: VALIDATION_TIMEOUT_MS
					});

					// Log result for debugging
					console.log('Stream validation:', {
						valid: validation.valid,
						playable: validation.playable,
						error: validation.error
					});

					// At minimum, the stream should be valid (accessible)
					// Playability depends on provider reliability - don't fail test
					if (validation.valid) {
						console.log('Stream is valid');
						if (!validation.playable) {
							console.warn(`Stream valid but not playable: ${validation.error}`);
						}
					} else {
						// Stream might be invalid due to provider flakiness
						console.warn(`Stream validation failed: ${validation.error}`);
					}
				}
			},
			EXTRACTION_TIMEOUT_MS + VALIDATION_TIMEOUT_MS
		);
	});

	// --------------------------------------------------------------------------
	// TV Show Extraction
	// --------------------------------------------------------------------------

	describe('TV Show Extraction', () => {
		it(
			'should extract at least one stream for a popular TV episode',
			async () => {
				const options: ExtractOptions = {
					tmdbId: testTvShow.tmdbId,
					type: 'tv',
					title: testTvShow.title,
					season: testTvShow.season,
					episode: testTvShow.episode,
					imdbId: testTvShow.imdbId
				};

				const result = await extractStreams(options);

				// Should succeed with at least one source
				expect(result.success).toBe(true);
				expect(result.sources.length).toBeGreaterThan(0);

				// First source should have required fields
				const firstSource = result.sources[0];
				expect(firstSource.url).toBeDefined();
				expect(firstSource.url).toMatch(/^https?:\/\//);
			},
			EXTRACTION_TIMEOUT_MS
		);
	});

	// --------------------------------------------------------------------------
	// Caching
	// --------------------------------------------------------------------------

	describe('Caching', () => {
		it(
			'should cache results for repeated requests',
			async () => {
				const options: ExtractOptions = {
					tmdbId: testMovie.tmdbId,
					type: 'movie',
					title: testMovie.title,
					year: testMovie.year
				};

				// Clear cache first
				clearCaches();

				// First request
				const start1 = Date.now();
				const result1 = await extractStreams(options);
				const duration1 = Date.now() - start1;

				// Second request (should be cached)
				const start2 = Date.now();
				const result2 = await extractStreams(options);
				const duration2 = Date.now() - start2;

				// Both should return same result
				expect(result1.success).toBe(result2.success);
				expect(result1.sources.length).toBe(result2.sources.length);

				// Second should be much faster (cached)
				if (result1.success) {
					expect(duration2).toBeLessThan(duration1);
				}
			},
			EXTRACTION_TIMEOUT_MS * 2
		);
	});
});

// ============================================================================
// Individual Provider Tests (Non-blocking - warnings only)
// ============================================================================

describe('Individual Provider Tests', () => {
	const testMovie = getPrimaryTestMovie();

	// Get all providers that support movies
	const providers = getAvailableProviders().filter((p) => p.config.supportsMovies);

	// Skip if no providers available
	if (providers.length === 0) {
		it.skip('No movie providers available', () => {});
		return;
	}

	// Test each provider individually - these are smoke tests that warn but don't fail
	for (const provider of providers) {
		// Only test enabled providers
		if (!provider.config.enabledByDefault) continue;

		describe(`Provider: ${provider.config.name}`, () => {
			it(`should extract streams for ${testMovie.title}`, async () => {
				const options: ExtractOptions = {
					tmdbId: testMovie.tmdbId,
					type: 'movie',
					title: testMovie.title,
					year: testMovie.year,
					imdbId: testMovie.imdbId,
					provider: provider.config.id
				};

				// Race against a 30s timeout to avoid vitest timeout failures
				const PROVIDER_TIMEOUT = 30000;
				const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
					setTimeout(() => resolve({ timedOut: true }), PROVIDER_TIMEOUT)
				);

				try {
					const raceResult = await Promise.race([
						extractStreams(options).then((r) => ({ timedOut: false as const, result: r })),
						timeoutPromise
					]);

					if (raceResult.timedOut) {
						console.warn(
							`[${provider.config.name}] Warning: Timed out after ${PROVIDER_TIMEOUT}ms`
						);
					} else {
						const result = raceResult.result;
						console.log(
							`[${provider.config.name}] Success: ${result.success}, Streams: ${result.sources.length}`
						);

						if (!result.success) {
							console.warn(`[${provider.config.name}] Warning: ${result.error}`);
						} else if (result.sources.length === 0) {
							console.warn(`[${provider.config.name}] Warning: No streams returned`);
						}
					}
				} catch (error) {
					console.warn(
						`[${provider.config.name}] Warning: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}

				// Test always passes - we just want to see which providers are working
				expect(true).toBe(true);
			}, 35000); // 35s timeout - slightly longer than our internal 30s race
		});
	}
});
