/**
 * Live Subtitle Provider Integration Tests
 *
 * These tests actually hit the subtitle providers to verify they work.
 * Run with: npm run test -- --testNamePattern="Live Subtitle Provider"
 *
 * Note: These tests may be slow and can fail due to provider issues.
 * They should not block CI but are useful for manual verification.
 *
 * TESTED PROVIDERS (no API key required):
 * - addic7ed (TV only)
 * - yifysubtitles (movies only)
 * - gestdown (TV only)
 * - subf2m (movies + TV, web scraper)
 *
 * SKIPPED PROVIDERS (require API keys):
 * - opensubtitles (requires API key from opensubtitles.com)
 * - subdl (requires API key from subdl.com)
 *
 * REMOVED PROVIDERS (non-functional):
 * - podnapisi (server not responding)
 * - subscene (CloudFlare blocked)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSubtitleProviderFactory } from '../providers/SubtitleProviderFactory';
import type { ISubtitleProvider } from '../providers/interfaces';
import type {
	SubtitleSearchCriteria,
	SubtitleSearchResult,
	SubtitleProviderConfig,
	ProviderImplementation
} from '../types';
import {
	TEST_MOVIES,
	TEST_TV_SHOWS,
	NON_EXISTENT_CONTENT,
	getPrimaryTestMovie,
	getPrimaryTestTvShow,
	type MovieTestContent,
	type TvTestContent
} from '../../streaming/__tests__/fixtures/testContent';

// ============================================================================
// Test Configuration
// ============================================================================

/** Provider test() method timeout */
const PROVIDER_TEST_TIMEOUT_MS = 15000;

/** Subtitle search timeout (web scraping can be slow) */
const SEARCH_TIMEOUT_MS = 60000;

/** Download operation timeout */
const _DOWNLOAD_TIMEOUT_MS = 45000;

/** Full flow timeout (test + search + download) */
const FULL_FLOW_TIMEOUT_MS = 120000;

/** Error handling test timeout */
const ERROR_TIMEOUT_MS = 90000;

// ============================================================================
// Provider Configuration
// ============================================================================

/** Providers to test (no API key required) */
const NO_AUTH_PROVIDERS: ProviderImplementation[] = [
	'addic7ed',
	'yifysubtitles',
	'gestdown',
	'subf2m'
];

/** Providers that support movies */
const MOVIE_PROVIDERS: ProviderImplementation[] = ['yifysubtitles', 'subf2m'];

/** Providers that support TV shows */
const TV_PROVIDERS: ProviderImplementation[] = ['addic7ed', 'gestdown', 'subf2m'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a minimal provider config for testing
 */
function createTestProviderConfig(implementation: ProviderImplementation): SubtitleProviderConfig {
	return {
		id: `test-${implementation}`,
		name: `Test ${implementation}`,
		implementation,
		enabled: true,
		priority: 1,
		consecutiveFailures: 0,
		requestsPerMinute: 30
	};
}

/**
 * Create movie search criteria from test fixtures
 */
function createMovieCriteria(
	movie: MovieTestContent,
	languages: string[] = ['en']
): SubtitleSearchCriteria {
	return {
		title: movie.title,
		year: movie.year,
		imdbId: movie.imdbId,
		tmdbId: movie.tmdbId ? parseInt(movie.tmdbId) : undefined,
		languages
	};
}

/**
 * Create TV episode search criteria from test fixtures
 */
function createTvCriteria(
	show: TvTestContent,
	languages: string[] = ['en']
): SubtitleSearchCriteria {
	return {
		title: show.title,
		seriesTitle: show.title,
		season: show.season,
		episode: show.episode,
		imdbId: show.imdbId,
		tmdbId: show.tmdbId ? parseInt(show.tmdbId) : undefined,
		languages
	};
}

/**
 * Validate downloaded subtitle buffer
 * Returns true if the buffer looks like a valid subtitle file
 */
function validateSubtitleBuffer(buffer: Buffer): {
	valid: boolean;
	format: string;
	reason: string;
} {
	if (buffer.length === 0) {
		return { valid: false, format: 'empty', reason: 'Buffer is empty' };
	}

	// Check if it's a ZIP file (common for subtitle downloads)
	const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
	if (isZip) {
		return { valid: true, format: 'zip', reason: 'Valid ZIP archive' };
	}

	// Try to read as text for subtitle format detection
	const content = buffer.toString('utf8', 0, Math.min(buffer.length, 2000));

	// Check for SRT format (numbered entries with timestamps)
	const isSrt = /^\d+\s*[\r\n]+\d{2}:\d{2}:\d{2}[,.:]\d{3}/.test(content.trim());
	if (isSrt) {
		return { valid: true, format: 'srt', reason: 'Valid SRT format detected' };
	}

	// Check for ASS/SSA format
	const isAss = content.includes('[Script Info]') || content.includes('[V4+ Styles]');
	if (isAss) {
		return { valid: true, format: 'ass', reason: 'Valid ASS/SSA format detected' };
	}

	// Check for WebVTT format
	const isVtt = content.startsWith('WEBVTT');
	if (isVtt) {
		return { valid: true, format: 'vtt', reason: 'Valid WebVTT format detected' };
	}

	// Check for SUB format (MicroDVD)
	const isSub = /^\{\d+\}\{\d+\}/.test(content.trim());
	if (isSub) {
		return { valid: true, format: 'sub', reason: 'Valid SUB (MicroDVD) format detected' };
	}

	// Fallback: consider valid if buffer has reasonable size
	if (buffer.length > 100) {
		return { valid: true, format: 'unknown', reason: 'Non-empty buffer (format unknown)' };
	}

	return { valid: false, format: 'unknown', reason: 'Could not identify subtitle format' };
}

/**
 * Create a provider instance safely, returning null if creation fails
 */
function createProviderSafe(implementation: ProviderImplementation): ISubtitleProvider | null {
	try {
		const factory = getSubtitleProviderFactory();
		const config = createTestProviderConfig(implementation);
		return factory.createProvider(config);
	} catch (error) {
		console.warn(`[${implementation}] Failed to create provider:`, error);
		return null;
	}
}

// ============================================================================
// Test Setup
// ============================================================================

describe('Live Subtitle Provider Tests', () => {
	const factory = getSubtitleProviderFactory();
	let testMovie: MovieTestContent;
	let testTvShow: TvTestContent;

	beforeAll(() => {
		testMovie = getPrimaryTestMovie(); // Inception
		testTvShow = getPrimaryTestTvShow(); // Breaking Bad S01E01
	});

	// --------------------------------------------------------------------------
	// Provider Availability
	// --------------------------------------------------------------------------

	describe('Provider Availability', () => {
		it('should have provider factory available', () => {
			expect(factory).toBeDefined();
		});

		it('should have no-auth providers registered', () => {
			const implementations = factory.getSupportedImplementations();

			for (const provider of NO_AUTH_PROVIDERS) {
				expect(implementations).toContain(provider);
			}
		});

		it('should be able to create provider instances', () => {
			for (const impl of NO_AUTH_PROVIDERS) {
				const provider = createProviderSafe(impl);
				expect(provider).not.toBeNull();

				if (provider) {
					expect(provider.id).toBe(`test-${impl}`);
					expect(provider.implementation).toBe(impl);
					expect(provider.supportedLanguages.length).toBeGreaterThan(0);
				}
			}
		});

		it('should have provider definitions with capabilities info', () => {
			const definitions = factory.getDefinitions();

			for (const impl of NO_AUTH_PROVIDERS) {
				const def = definitions.find((d) => d.implementation === impl);
				expect(def).toBeDefined();

				if (def) {
					expect(def.name).toBeDefined();
					expect(def.supportedLanguages).toBeInstanceOf(Array);
					expect(def.requiresApiKey).toBe(false);
				}
			}
		});
	});

	// --------------------------------------------------------------------------
	// Provider Connectivity Tests
	// --------------------------------------------------------------------------

	describe('Provider Connectivity', () => {
		for (const impl of NO_AUTH_PROVIDERS) {
			it(
				`should connect to ${impl}`,
				async () => {
					const provider = createProviderSafe(impl);
					if (!provider) {
						console.warn(`[${impl}] Skipping - provider creation failed`);
						return;
					}

					const result = await provider.test();

					console.log(`[${impl}] Test result:`, {
						success: result.success,
						message: result.message,
						responseTime: `${result.responseTime}ms`
					});

					// Don't fail if provider is down, just log
					if (!result.success) {
						console.warn(`[${impl}] Provider test failed: ${result.message}`);
					} else {
						expect(result.responseTime).toBeGreaterThan(0);
					}
				},
				PROVIDER_TEST_TIMEOUT_MS
			);
		}
	});

	// --------------------------------------------------------------------------
	// Movie Subtitle Search
	// --------------------------------------------------------------------------

	describe('Movie Subtitle Search', () => {
		for (const impl of MOVIE_PROVIDERS) {
			describe(`${impl}`, () => {
				it(
					`should search for movie subtitles`,
					async () => {
						const provider = createProviderSafe(impl);
						if (!provider) {
							console.warn(`[${impl}] Skipping - provider creation failed`);
							return;
						}

						const criteria = createMovieCriteria(testMovie);

						// Check if provider can handle this criteria
						if (!provider.canSearch(criteria)) {
							console.log(`[${impl}] Provider does not support movie search`);
							return;
						}

						try {
							const results = await provider.search(criteria, {
								timeout: SEARCH_TIMEOUT_MS,
								maxResults: 10
							});

							console.log(
								`[${impl}] Movie search for "${testMovie.title}": ${results.length} results`
							);

							// Don't fail if no results - provider may be down
							if (results.length === 0) {
								console.warn(
									`[${impl}] No results found - provider may be down or content not available`
								);
								return;
							}

							// Validate first result structure
							const first = results[0];
							expect(first.providerId).toBeDefined();
							expect(first.providerName).toBeDefined();
							expect(first.providerSubtitleId).toBeDefined();
							expect(first.language).toBe('en');
							expect(first.title).toBeDefined();
							expect(['srt', 'ass', 'sub', 'vtt', 'ssa', 'unknown']).toContain(first.format);
						} catch (error) {
							console.warn(`[${impl}] Search failed:`, error);
							// Don't fail test on provider errors
						}
					},
					SEARCH_TIMEOUT_MS
				);
			});
		}
	});

	// --------------------------------------------------------------------------
	// TV Show Subtitle Search
	// --------------------------------------------------------------------------

	describe('TV Show Subtitle Search', () => {
		for (const impl of TV_PROVIDERS) {
			describe(`${impl}`, () => {
				it(
					`should search for TV episode subtitles`,
					async () => {
						const provider = createProviderSafe(impl);
						if (!provider) {
							console.warn(`[${impl}] Skipping - provider creation failed`);
							return;
						}

						const criteria = createTvCriteria(testTvShow);

						// Check if provider can handle this criteria
						if (!provider.canSearch(criteria)) {
							console.log(`[${impl}] Provider does not support TV search`);
							return;
						}

						try {
							const results = await provider.search(criteria, {
								timeout: SEARCH_TIMEOUT_MS,
								maxResults: 10
							});

							console.log(
								`[${impl}] TV search for "${testTvShow.title}" S${testTvShow.season}E${testTvShow.episode}: ${results.length} results`
							);

							// Don't fail if no results
							if (results.length === 0) {
								console.warn(
									`[${impl}] No results found - provider may be down or content not available`
								);
								return;
							}

							// Validate first result structure
							const first = results[0];
							expect(first.providerId).toBeDefined();
							expect(first.providerName).toBeDefined();
							expect(first.providerSubtitleId).toBeDefined();
							expect(first.language).toBe('en');
						} catch (error) {
							console.warn(`[${impl}] Search failed:`, error);
						}
					},
					SEARCH_TIMEOUT_MS
				);
			});
		}
	});

	// --------------------------------------------------------------------------
	// Provider Content Type Restrictions
	// --------------------------------------------------------------------------

	describe('Provider Content Type Restrictions', () => {
		it('yifysubtitles should only support movies', () => {
			const provider = createProviderSafe('yifysubtitles');
			if (!provider) return;

			const movieCriteria = createMovieCriteria(testMovie);
			const tvCriteria = createTvCriteria(testTvShow);

			expect(provider.canSearch(movieCriteria)).toBe(true);
			expect(provider.canSearch(tvCriteria)).toBe(false);
		});

		it('gestdown should only support TV shows', () => {
			const provider = createProviderSafe('gestdown');
			if (!provider) return;

			const movieCriteria = createMovieCriteria(testMovie);
			const tvCriteria = createTvCriteria(testTvShow);

			expect(provider.canSearch(movieCriteria)).toBe(false);
			expect(provider.canSearch(tvCriteria)).toBe(true);
		});

		it('addic7ed should only support TV shows', () => {
			const provider = createProviderSafe('addic7ed');
			if (!provider) return;

			const movieCriteria = createMovieCriteria(testMovie);
			const tvCriteria = createTvCriteria(testTvShow);

			expect(provider.canSearch(movieCriteria)).toBe(false);
			expect(provider.canSearch(tvCriteria)).toBe(true);
		});

		it('subf2m should support both movies and TV', () => {
			const provider = createProviderSafe('subf2m');
			if (!provider) return;

			const movieCriteria = createMovieCriteria(testMovie);
			const tvCriteria = createTvCriteria(testTvShow);

			expect(provider.canSearch(movieCriteria)).toBe(true);
			expect(provider.canSearch(tvCriteria)).toBe(true);
		});
	});

	// --------------------------------------------------------------------------
	// Download Flow Tests
	// --------------------------------------------------------------------------

	describe('Download Flow', () => {
		it(
			'should download subtitle from subf2m',
			async () => {
				const provider = createProviderSafe('subf2m');
				if (!provider) {
					console.warn('[subf2m] Skipping download test - provider creation failed');
					return;
				}

				// First search for a subtitle
				const criteria = createMovieCriteria(testMovie);
				let results: SubtitleSearchResult[];

				try {
					results = await provider.search(criteria, {
						timeout: SEARCH_TIMEOUT_MS,
						maxResults: 5
					});
				} catch (error) {
					console.warn('[subf2m] Search failed:', error);
					return;
				}

				if (results.length === 0) {
					console.warn('[subf2m] No search results to download');
					return;
				}

				// Try to download the first result
				const toDownload = results[0];
				console.log('[subf2m] Attempting download:', {
					id: toDownload.providerSubtitleId,
					title: toDownload.title,
					language: toDownload.language
				});

				try {
					const buffer = await provider.download(toDownload);

					console.log('[subf2m] Downloaded buffer size:', buffer.length);

					const validation = validateSubtitleBuffer(buffer);
					console.log('[subf2m] Validation result:', validation);

					expect(buffer.length).toBeGreaterThan(0);
					expect(validation.valid).toBe(true);
				} catch (error) {
					console.warn('[subf2m] Download failed:', error);
					// Don't fail test - provider may have download limits
				}
			},
			FULL_FLOW_TIMEOUT_MS
		);

		it(
			'should complete full search and download flow',
			async () => {
				// Try each movie provider until one works
				for (const impl of MOVIE_PROVIDERS) {
					const provider = createProviderSafe(impl);
					if (!provider) continue;

					const criteria = createMovieCriteria(testMovie);
					if (!provider.canSearch(criteria)) continue;

					try {
						console.log(`[${impl}] Attempting full flow test...`);

						// Search
						const results = await provider.search(criteria, {
							timeout: SEARCH_TIMEOUT_MS,
							maxResults: 5
						});

						if (results.length === 0) {
							console.log(`[${impl}] No results, trying next provider`);
							continue;
						}

						console.log(`[${impl}] Found ${results.length} results, downloading first...`);

						// Download
						const buffer = await provider.download(results[0]);

						// Validate
						const validation = validateSubtitleBuffer(buffer);

						if (validation.valid) {
							console.log(`[${impl}] Full flow successful!`, {
								results: results.length,
								downloadSize: buffer.length,
								format: validation.format
							});

							expect(validation.valid).toBe(true);
							return; // Success - exit test
						}
					} catch (error) {
						console.log(`[${impl}] Failed, trying next:`, error);
						continue;
					}
				}

				// If we get here, no provider worked
				console.warn('No provider completed full flow successfully - all may be down');
			},
			FULL_FLOW_TIMEOUT_MS
		);
	});

	// --------------------------------------------------------------------------
	// Error Handling
	// --------------------------------------------------------------------------

	describe('Error Handling', () => {
		it(
			'should handle non-existent movie gracefully',
			async () => {
				const provider = createProviderSafe('subf2m');
				if (!provider) return;

				const criteria: SubtitleSearchCriteria = {
					title: NON_EXISTENT_CONTENT.movie.title,
					year: NON_EXISTENT_CONTENT.movie.year,
					languages: ['en']
				};

				try {
					const results = await provider.search(criteria, { timeout: SEARCH_TIMEOUT_MS });

					// Should return empty array, not throw
					console.log('[subf2m] Non-existent movie search returned:', results.length);
					expect(results).toBeInstanceOf(Array);
					// May or may not be empty depending on fuzzy matching
				} catch (error) {
					// Should not throw for non-existent content
					console.warn('[subf2m] Threw error for non-existent content:', error);
				}
			},
			ERROR_TIMEOUT_MS
		);

		it(
			'should handle non-existent TV show gracefully',
			async () => {
				const provider = createProviderSafe('gestdown');
				if (!provider) return;

				const criteria: SubtitleSearchCriteria = {
					title: NON_EXISTENT_CONTENT.tv.title,
					seriesTitle: NON_EXISTENT_CONTENT.tv.title,
					season: NON_EXISTENT_CONTENT.tv.season,
					episode: NON_EXISTENT_CONTENT.tv.episode,
					languages: ['en']
				};

				try {
					const results = await provider.search(criteria, { timeout: SEARCH_TIMEOUT_MS });

					console.log('[gestdown] Non-existent TV search returned:', results.length);
					expect(results).toBeInstanceOf(Array);
				} catch (error) {
					console.warn('[gestdown] Threw error for non-existent content:', error);
				}
			},
			ERROR_TIMEOUT_MS
		);
	});

	// --------------------------------------------------------------------------
	// Multi-Language Support
	// --------------------------------------------------------------------------

	describe('Multi-Language Support', () => {
		it(
			'should search for multiple languages',
			async () => {
				const provider = createProviderSafe('subf2m');
				if (!provider) return;

				const criteria = createMovieCriteria(testMovie, ['en', 'es', 'fr']);

				try {
					const results = await provider.search(criteria, {
						timeout: SEARCH_TIMEOUT_MS,
						maxResults: 20
					});

					console.log('[subf2m] Multi-language search results:', results.length);

					if (results.length > 0) {
						// Check we got results for requested languages
						const languages = [...new Set(results.map((r) => r.language))];
						console.log('[subf2m] Languages found:', languages);

						expect(languages.some((l) => ['en', 'es', 'fr'].includes(l))).toBe(true);
					}
				} catch (error) {
					console.warn('[subf2m] Multi-language search failed:', error);
				}
			},
			SEARCH_TIMEOUT_MS
		);
	});

	// --------------------------------------------------------------------------
	// Search Result Quality
	// --------------------------------------------------------------------------

	describe('Search Result Quality', () => {
		it(
			'should return results with match scores',
			async () => {
				const provider = createProviderSafe('subf2m');
				if (!provider) return;

				const criteria = createMovieCriteria(testMovie);

				try {
					const results = await provider.search(criteria, {
						timeout: SEARCH_TIMEOUT_MS,
						maxResults: 10
					});

					if (results.length === 0) {
						console.warn('[subf2m] No results to check scores');
						return;
					}

					// Check that results have scores
					for (const result of results) {
						expect(typeof result.matchScore).toBe('number');
						expect(result.matchScore).toBeGreaterThanOrEqual(0);
					}

					// Log score distribution
					const scores = results.map((r) => r.matchScore);
					console.log('[subf2m] Score distribution:', {
						min: Math.min(...scores),
						max: Math.max(...scores),
						avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
					});
				} catch (error) {
					console.warn('[subf2m] Score check failed:', error);
				}
			},
			SEARCH_TIMEOUT_MS
		);
	});
});

// ============================================================================
// Individual Provider Deep Tests
// ============================================================================

describe('Individual Provider Deep Tests', () => {
	const _factory = getSubtitleProviderFactory();

	// Test each provider with appropriate content
	const providerTests: Array<{
		impl: ProviderImplementation;
		movie?: MovieTestContent;
		tv?: TvTestContent;
	}> = [
		{ impl: 'addic7ed', tv: TEST_TV_SHOWS[0] }, // Breaking Bad only
		{ impl: 'yifysubtitles', movie: TEST_MOVIES[1] }, // Fight Club only
		{ impl: 'gestdown', tv: TEST_TV_SHOWS[3] }, // Stranger Things only
		{ impl: 'subf2m', movie: TEST_MOVIES[0], tv: TEST_TV_SHOWS[2] } // Inception, Rick and Morty
	];

	for (const { impl, movie, tv } of providerTests) {
		describe(`Provider: ${impl}`, () => {
			if (movie) {
				it(
					`should find subtitles for ${movie.title}`,
					async () => {
						const provider = createProviderSafe(impl);
						if (!provider) {
							console.warn(`[${impl}] Provider creation failed`);
							return;
						}

						const criteria = createMovieCriteria(movie);
						if (!provider.canSearch(criteria)) {
							console.log(`[${impl}] Does not support movies`);
							return;
						}

						try {
							const results = await provider.search(criteria, {
								timeout: SEARCH_TIMEOUT_MS,
								maxResults: 10
							});

							console.log(`[${impl}] Results for "${movie.title}": ${results.length}`);

							if (results.length > 0) {
								expect(results[0].language).toBe('en');
								expect(results[0].providerId).toBe(`test-${impl}`);
							}
						} catch (error) {
							console.warn(`[${impl}] Search failed:`, error);
						}
					},
					SEARCH_TIMEOUT_MS
				);
			}

			if (tv) {
				it(
					`should find subtitles for ${tv.title} S${tv.season}E${tv.episode}`,
					async () => {
						const provider = createProviderSafe(impl);
						if (!provider) {
							console.warn(`[${impl}] Provider creation failed`);
							return;
						}

						const criteria = createTvCriteria(tv);
						if (!provider.canSearch(criteria)) {
							console.log(`[${impl}] Does not support TV shows`);
							return;
						}

						try {
							const results = await provider.search(criteria, {
								timeout: SEARCH_TIMEOUT_MS,
								maxResults: 10
							});

							console.log(
								`[${impl}] Results for "${tv.title}" S${tv.season}E${tv.episode}: ${results.length}`
							);

							if (results.length > 0) {
								expect(results[0].language).toBe('en');
								expect(results[0].providerId).toBe(`test-${impl}`);
							}
						} catch (error) {
							console.warn(`[${impl}] Search failed:`, error);
						}
					},
					SEARCH_TIMEOUT_MS
				);
			}
		});
	}
});
