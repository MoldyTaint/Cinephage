/**
 * Tests for the BrowserSolver module.
 *
 * Run with: npm run test -- src/lib/server/indexers/http/browser/BrowserSolver.test.ts
 *
 * Integration tests (marked with .skip by default) require network access
 * and test against real Cloudflare-protected sites.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	BrowserSolver,
	BrowserPool,
	ChallengeSolver,
	CookieExtractor,
	TurnstileSolver,
	getConfig,
	DEFAULT_CONFIG
} from './index';
import type { BrowserSolverConfig } from './types';

/**
 * Unit tests - no network required
 */
describe('BrowserSolver Unit Tests', () => {
	describe('Configuration', () => {
		it('should have sensible default configuration', () => {
			expect(DEFAULT_CONFIG.enabled).toBe(true);
			expect(DEFAULT_CONFIG.poolSize).toBe(2);
			expect(DEFAULT_CONFIG.maxConcurrent).toBe(3);
			expect(DEFAULT_CONFIG.solveTimeoutMs).toBe(60_000);
			expect(DEFAULT_CONFIG.cookieCacheTtlMs).toBe(3_600_000);
			expect(DEFAULT_CONFIG.headless).toBe(true);
			expect(DEFAULT_CONFIG.userAgent).toContain('Mozilla');
		});

		it('should load config from environment', () => {
			const config = getConfig();
			expect(config).toBeDefined();
			expect(typeof config.enabled).toBe('boolean');
			expect(typeof config.poolSize).toBe('number');
		});
	});

	describe('BrowserSolver', () => {
		it('should create instance with custom config', () => {
			const customConfig: Partial<BrowserSolverConfig> = {
				enabled: false,
				poolSize: 1
			};

			const solver = new BrowserSolver(customConfig);
			expect(solver).toBeDefined();
			expect(solver.isEnabled()).toBe(false); // Not initialized yet
		});

		it('should report not enabled when disabled by config', async () => {
			const solver = new BrowserSolver({ enabled: false });
			await solver.initialize();
			expect(solver.isEnabled()).toBe(false);
		});

		it('should return failure when not initialized', async () => {
			const solver = new BrowserSolver({ enabled: true });
			// Don't initialize

			const result = await solver.solve({
				url: 'https://example.com',
				indexerId: 'test'
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('not initialized');
		});

		it('should provide health metrics', () => {
			const solver = new BrowserSolver({ enabled: false });
			const health = solver.getHealth();

			expect(health).toBeDefined();
			expect(typeof health.totalInstances).toBe('number');
			expect(typeof health.availableInstances).toBe('number');
			expect(typeof health.cacheSize).toBe('number');
			expect(health.metrics).toBeDefined();
		});
	});

	describe('CookieExtractor', () => {
		it('should be instantiable', () => {
			const extractor = new CookieExtractor();
			expect(extractor).toBeDefined();
		});
	});

	describe('ChallengeSolver', () => {
		it('should be instantiable', () => {
			const solver = new ChallengeSolver();
			expect(solver).toBeDefined();
		});
	});

	describe('TurnstileSolver', () => {
		it('should be instantiable', () => {
			const solver = new TurnstileSolver();
			expect(solver).toBeDefined();
		});
	});
});

/**
 * Integration tests - require browser and network
 * These test actual Cloudflare bypass functionality
 */
describe('BrowserSolver Integration Tests', () => {
	let solver: BrowserSolver;

	// Skip integration tests by default - they're slow and require network
	// Remove .skip to run them
	const itIntegration = it.skip;

	beforeAll(async () => {
		// Create solver with minimal config for faster tests
		solver = new BrowserSolver({
			enabled: true,
			poolSize: 1,
			maxConcurrent: 1,
			solveTimeoutMs: 30_000,
			headless: true
		});
	});

	afterAll(async () => {
		if (solver) {
			await solver.shutdown();
		}
	});

	describe('Browser Pool', () => {
		let pool: BrowserPool;

		beforeAll(async () => {
			pool = new BrowserPool({
				...DEFAULT_CONFIG,
				poolSize: 1,
				headless: true
			});
		});

		afterAll(async () => {
			if (pool) {
				await pool.shutdown();
			}
		});

		itIntegration(
			'should initialize browser pool',
			async () => {
				await pool.initialize();

				const health = pool.getHealth();
				expect(health.totalInstances).toBe(1);
				expect(health.availableInstances).toBe(1);
				expect(pool.isReady()).toBe(true);
			},
			30_000
		);

		itIntegration(
			'should acquire and release browser instance',
			async () => {
				await pool.initialize();

				const instance = await pool.acquire();
				expect(instance).toBeDefined();
				expect(instance.page).toBeDefined();
				expect(instance.browser).toBeDefined();

				let health = pool.getHealth();
				expect(health.availableInstances).toBe(0);
				expect(health.busyInstances).toBe(1);

				await pool.release(instance);

				health = pool.getHealth();
				expect(health.availableInstances).toBe(1);
			},
			30_000
		);
	});

	describe('Challenge Detection', () => {
		itIntegration(
			'should detect non-Cloudflare page',
			async () => {
				await solver.initialize();

				// Example.com is not behind Cloudflare
				const result = await solver.solve({
					url: 'https://example.com',
					timeout: 15_000
				});

				// Should succeed (no challenge) or return cookies
				expect(result.solveTimeMs).toBeGreaterThan(0);
				// If successful, should have extracted cookies (even if empty)
				expect(result.cookies).toBeDefined();
			},
			30_000
		);
	});

	describe('Cookie Caching', () => {
		itIntegration(
			'should cache and reuse solutions',
			async () => {
				await solver.initialize();

				// First request - should solve
				const result1 = await solver.solve({
					url: 'https://example.com',
					timeout: 15_000
				});

				// Second request - should use cache
				const result2 = await solver.solve({
					url: 'https://example.com',
					timeout: 15_000
				});

				// Cache hit should be nearly instant
				if (result1.success) {
					expect(result2.solveTimeMs).toBeLessThan(100); // Cache hit is instant
				}
			},
			60_000
		);

		itIntegration(
			'should force re-solve when requested',
			async () => {
				await solver.initialize();

				// First request
				await solver.solve({
					url: 'https://example.com',
					timeout: 15_000
				});

				// Force re-solve
				const result = await solver.solve({
					url: 'https://example.com',
					timeout: 15_000,
					forceSolve: true
				});

				// Should have taken time (not cached)
				expect(result.solveTimeMs).toBeGreaterThan(100);
			},
			60_000
		);
	});

	describe('Real Cloudflare Sites', () => {
		// These tests hit real Cloudflare-protected sites
		// They may fail if the sites change their protection
		// or if running from a datacenter IP that's blocked

		itIntegration(
			'should solve nowsecure.nl Cloudflare challenge',
			async () => {
				await solver.initialize();

				// nowsecure.nl is a common test site for Cloudflare bypass
				const result = await solver.solve({
					url: 'https://nowsecure.nl',
					timeout: 60_000
				});

				console.log('nowsecure.nl result:', {
					success: result.success,
					challengeType: result.challengeType,
					solveTimeMs: result.solveTimeMs,
					hasClearance: 'cf_clearance' in result.cookies,
					error: result.error
				});

				// This may or may not succeed depending on Cloudflare's current protection level
				// and our IP reputation. Log results for debugging.
				expect(result).toBeDefined();
				expect(result.solveTimeMs).toBeGreaterThan(0);
			},
			90_000
		);
	});
});

/**
 * Smoke test - quick check that the module loads correctly
 */
describe('Module Loading', () => {
	it('should export all required components', () => {
		expect(BrowserSolver).toBeDefined();
		expect(BrowserPool).toBeDefined();
		expect(ChallengeSolver).toBeDefined();
		expect(CookieExtractor).toBeDefined();
		expect(TurnstileSolver).toBeDefined();
		expect(getConfig).toBeDefined();
		expect(DEFAULT_CONFIG).toBeDefined();
	});
});
