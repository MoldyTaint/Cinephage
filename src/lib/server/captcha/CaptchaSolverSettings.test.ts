/**
 * CaptchaSolverSettings Tests
 *
 * Tests for the database-backed configuration service.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { initTestDb, closeTestDb, getTestDb } from '../../../test/db-helper';

// Initialize test database FIRST
initTestDb();

// Mock the database module
vi.mock('$lib/server/db', async () => {
	const { getTestDb } = await import('../../../test/db-helper');
	return {
		get db() {
			return getTestDb().db;
		},
		get sqlite() {
			return getTestDb().sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
});

// Import after mocking
const { CaptchaSolverSettingsService, captchaSolverSettingsService } =
	await import('./CaptchaSolverSettings');
const { DEFAULT_CONFIG } = await import('./types');
const { captchaSolverSettings } = await import('$lib/server/db/schema');

describe('CaptchaSolverSettingsService', () => {
	beforeEach(() => {
		// Clear all settings before each test
		const { db } = getTestDb();
		db.delete(captchaSolverSettings).run();
		// Invalidate cache
		captchaSolverSettingsService.invalidateCache();
	});

	afterAll(() => {
		closeTestDb();
	});

	describe('Singleton pattern', () => {
		it('should return the same instance', () => {
			const instance1 = CaptchaSolverSettingsService.getInstance();
			const instance2 = CaptchaSolverSettingsService.getInstance();

			expect(instance1).toBe(instance2);
		});

		it('should return same instance via exported singleton', () => {
			const instance = CaptchaSolverSettingsService.getInstance();
			expect(captchaSolverSettingsService).toBe(instance);
		});
	});

	describe('getConfig', () => {
		it('should return default config when no settings exist', () => {
			const config = captchaSolverSettingsService.getConfig();

			expect(config.enabled).toBe(DEFAULT_CONFIG.enabled);
			expect(config.timeoutSeconds).toBe(DEFAULT_CONFIG.timeoutSeconds);
			expect(config.cacheTtlSeconds).toBe(DEFAULT_CONFIG.cacheTtlSeconds);
			expect(config.headless).toBe(DEFAULT_CONFIG.headless);
			expect(config.proxy).toBeUndefined();
		});

		it('should parse boolean settings correctly', () => {
			const { db } = getTestDb();
			db.insert(captchaSolverSettings).values({ key: 'enabled', value: 'false' }).run();
			db.insert(captchaSolverSettings).values({ key: 'headless', value: 'false' }).run();
			captchaSolverSettingsService.invalidateCache();

			const config = captchaSolverSettingsService.getConfig();

			expect(config.enabled).toBe(false);
			expect(config.headless).toBe(false);
		});

		it('should parse numeric settings correctly', () => {
			const { db } = getTestDb();
			db.insert(captchaSolverSettings).values({ key: 'timeout_seconds', value: '120' }).run();
			db.insert(captchaSolverSettings).values({ key: 'cache_ttl_seconds', value: '7200' }).run();
			captchaSolverSettingsService.invalidateCache();

			const config = captchaSolverSettingsService.getConfig();

			expect(config.timeoutSeconds).toBe(120);
			expect(config.cacheTtlSeconds).toBe(7200);
		});

		it('should build proxy config from separate fields', () => {
			const { db } = getTestDb();
			db.insert(captchaSolverSettings)
				.values({ key: 'proxy_url', value: 'http://proxy.example.com:8080' })
				.run();
			db.insert(captchaSolverSettings).values({ key: 'proxy_username', value: 'user' }).run();
			db.insert(captchaSolverSettings).values({ key: 'proxy_password', value: 'pass' }).run();
			captchaSolverSettingsService.invalidateCache();

			const config = captchaSolverSettingsService.getConfig();

			expect(config.proxy).toBeDefined();
			expect(config.proxy?.url).toBe('http://proxy.example.com:8080');
			expect(config.proxy?.username).toBe('user');
			expect(config.proxy?.password).toBe('pass');
		});

		it('should NOT create proxy config for empty proxy_url', () => {
			const { db } = getTestDb();
			db.insert(captchaSolverSettings).values({ key: 'proxy_url', value: '' }).run();
			db.insert(captchaSolverSettings).values({ key: 'proxy_username', value: 'user' }).run();
			captchaSolverSettingsService.invalidateCache();

			const config = captchaSolverSettingsService.getConfig();

			expect(config.proxy).toBeUndefined();
		});

		it('should return cached config on subsequent calls', () => {
			// First call loads from DB
			const config1 = captchaSolverSettingsService.getConfig();

			// Insert new data (won't be seen because of cache)
			const { db } = getTestDb();
			db.insert(captchaSolverSettings).values({ key: 'enabled', value: 'false' }).run();

			// Second call should return cached value
			const config2 = captchaSolverSettingsService.getConfig();

			expect(config1.enabled).toBe(config2.enabled);
			expect(config2.enabled).toBe(true); // Still cached default
		});
	});

	describe('updateConfig', () => {
		it('should update boolean settings', () => {
			const result = captchaSolverSettingsService.updateConfig({ enabled: false });

			expect(result.enabled).toBe(false);

			// Verify persisted
			captchaSolverSettingsService.invalidateCache();
			const config = captchaSolverSettingsService.getConfig();
			expect(config.enabled).toBe(false);
		});

		it('should update numeric settings', () => {
			const result = captchaSolverSettingsService.updateConfig({
				timeoutSeconds: 90,
				cacheTtlSeconds: 1800
			});

			expect(result.timeoutSeconds).toBe(90);
			expect(result.cacheTtlSeconds).toBe(1800);
		});

		it('should handle partial updates', () => {
			// Set initial values
			captchaSolverSettingsService.updateConfig({
				enabled: true,
				timeoutSeconds: 60
			});

			// Update only one field
			const result = captchaSolverSettingsService.updateConfig({ timeoutSeconds: 120 });

			expect(result.enabled).toBe(true); // Unchanged
			expect(result.timeoutSeconds).toBe(120); // Updated
		});

		it('should update proxy via proxyUrl field', () => {
			const result = captchaSolverSettingsService.updateConfig({
				proxyUrl: 'http://proxy.example.com:8080',
				proxyUsername: 'user',
				proxyPassword: 'pass'
			});

			expect(result.proxy?.url).toBe('http://proxy.example.com:8080');
			expect(result.proxy?.username).toBe('user');
			expect(result.proxy?.password).toBe('pass');
		});

		it('should update proxy via proxy object', () => {
			const result = captchaSolverSettingsService.updateConfig({
				proxy: {
					url: 'http://proxy2.example.com:3128',
					username: 'admin'
				}
			});

			expect(result.proxy?.url).toBe('http://proxy2.example.com:3128');
			expect(result.proxy?.username).toBe('admin');
		});

		it('should clear proxy when set to undefined', () => {
			// First set a proxy
			captchaSolverSettingsService.updateConfig({
				proxy: { url: 'http://proxy.example.com:8080' }
			});

			// Then clear it
			const result = captchaSolverSettingsService.updateConfig({
				proxy: undefined
			});

			// Proxy should be cleared
			expect(result.proxy).toBeUndefined();
		});

		it('should invalidate cache after update', () => {
			captchaSolverSettingsService.updateConfig({ enabled: false });

			// Should return updated value (cache was invalidated)
			const config = captchaSolverSettingsService.getConfig();
			expect(config.enabled).toBe(false);
		});
	});

	describe('resetToDefaults', () => {
		it('should clear all settings and return defaults', () => {
			// Set some values
			captchaSolverSettingsService.updateConfig({
				enabled: false,
				timeoutSeconds: 120,
				proxyUrl: 'http://proxy.example.com:8080'
			});

			// Reset
			const result = captchaSolverSettingsService.resetToDefaults();

			expect(result.enabled).toBe(DEFAULT_CONFIG.enabled);
			expect(result.timeoutSeconds).toBe(DEFAULT_CONFIG.timeoutSeconds);
			expect(result.proxy).toBeUndefined();
		});

		it('should persist the reset', () => {
			captchaSolverSettingsService.updateConfig({ enabled: false });
			captchaSolverSettingsService.resetToDefaults();

			// Verify DB is cleared
			const { db } = getTestDb();
			const settings = db.select().from(captchaSolverSettings).all();
			expect(settings.length).toBe(0);
		});
	});

	describe('isEnabled', () => {
		it('should return true by default', () => {
			expect(captchaSolverSettingsService.isEnabled()).toBe(true);
		});

		it('should return false when disabled', () => {
			captchaSolverSettingsService.updateConfig({ enabled: false });
			expect(captchaSolverSettingsService.isEnabled()).toBe(false);
		});
	});

	describe('invalidateCache', () => {
		it('should force reload from database', () => {
			// Get config (caches it)
			captchaSolverSettingsService.getConfig();

			// Insert directly to DB
			const { db } = getTestDb();
			db.insert(captchaSolverSettings).values({ key: 'enabled', value: 'false' }).run();

			// Invalidate and reload
			captchaSolverSettingsService.invalidateCache();
			const config = captchaSolverSettingsService.getConfig();

			expect(config.enabled).toBe(false);
		});
	});
});
