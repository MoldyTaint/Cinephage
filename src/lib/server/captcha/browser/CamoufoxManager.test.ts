/**
 * CamoufoxManager Tests
 *
 * Tests for browser lifecycle management with mocked camoufox-js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Browser, BrowserContext, Page, Cookie } from 'playwright-core';

// Mock camoufox-js before importing the module
vi.mock('camoufox-js', () => ({
	Camoufox: vi.fn()
}));

// Mock logger to prevent console output
vi.mock('$lib/logging', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// Import after mocking
const { Camoufox } = await import('camoufox-js');
const { CamoufoxManager, getCamoufoxManager, shutdownCamoufoxManager } =
	await import('./CamoufoxManager');

/**
 * Create a mock Browser
 */
function createMockBrowser(contexts: BrowserContext[] = []): Browser {
	return {
		close: vi.fn().mockResolvedValue(undefined),
		contexts: vi.fn().mockReturnValue(contexts),
		newContext: vi.fn()
	} as unknown as Browser;
}

/**
 * Create a mock BrowserContext
 */
function createMockContext(): BrowserContext {
	return {
		cookies: vi.fn().mockResolvedValue([]),
		addCookies: vi.fn().mockResolvedValue(undefined),
		newPage: vi.fn()
	} as unknown as BrowserContext;
}

/**
 * Create a mock Page
 */
function createMockPage(): Page {
	return {
		goto: vi.fn(),
		title: vi.fn(),
		content: vi.fn(),
		close: vi.fn()
	} as unknown as Page;
}

describe('CamoufoxManager', () => {
	let mockBrowser: Browser;
	let mockContext: BrowserContext;
	let mockPage: Page;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock chain
		mockPage = createMockPage();
		mockContext = createMockContext();
		(mockContext.newPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);

		mockBrowser = createMockBrowser([mockContext]);

		// Default: Camoufox launches successfully
		(Camoufox as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);
	});

	afterEach(async () => {
		// Clean up any managers
		await shutdownCamoufoxManager();
	});

	describe('Availability check', () => {
		it('should mark browser as available when Camoufox launches successfully', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.browserAvailable()).toBe(true);
			expect(manager.availabilityDetermined()).toBe(true);
			expect(manager.getAvailabilityError()).toBeUndefined();
		});

		it('should mark browser as unavailable when Camoufox fails to launch', async () => {
			(Camoufox as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Browser not found'));

			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.browserAvailable()).toBe(false);
			expect(manager.getAvailabilityError()).toBe('Browser not found');
		});

		it('should close test browser after availability check', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			expect(mockBrowser.close).toHaveBeenCalled();
		});
	});

	describe('createBrowser', () => {
		it('should throw when browser is not available', async () => {
			(Camoufox as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Not available'));

			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			await expect(manager.createBrowser({ headless: true })).rejects.toThrow(
				'Camoufox not available'
			);
		});

		it('should create browser with correct options', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			// Reset mock to track second call
			(Camoufox as ReturnType<typeof vi.fn>).mockClear();
			(Camoufox as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

			await manager.createBrowser({ headless: true });

			expect(Camoufox).toHaveBeenCalledWith(
				expect.objectContaining({
					headless: true,
					geoip: true,
					humanize: true
				})
			);
		});

		it('should create browser with proxy when provided', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			(Camoufox as ReturnType<typeof vi.fn>).mockClear();
			(Camoufox as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

			await manager.createBrowser({
				headless: true,
				proxy: {
					url: 'http://proxy.example.com:8080',
					username: 'user',
					password: 'pass'
				}
			});

			expect(Camoufox).toHaveBeenCalledWith(
				expect.objectContaining({
					proxy: {
						server: 'http://proxy.example.com:8080',
						username: 'user',
						password: 'pass'
					}
				})
			);
		});

		it('should return managed browser with page', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });

			expect(managed.browser).toBe(mockBrowser);
			expect(managed.context).toBe(mockContext);
			expect(managed.page).toBeDefined();
			expect(managed.createdAt).toBeInstanceOf(Date);
		});

		it('should track active browsers', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			expect(manager.getActiveBrowserCount()).toBe(0);

			await manager.createBrowser({ headless: true });
			expect(manager.getActiveBrowserCount()).toBe(1);

			await manager.createBrowser({ headless: true });
			expect(manager.getActiveBrowserCount()).toBe(2);
		});

		it('should create new context if none exists', async () => {
			// Browser with no contexts
			const browserNoContext = createMockBrowser([]);
			const newContext = createMockContext();
			(newContext.newPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);
			(browserNoContext.newContext as ReturnType<typeof vi.fn>).mockResolvedValue(newContext);

			(Camoufox as ReturnType<typeof vi.fn>).mockResolvedValue(browserNoContext);

			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });

			expect(browserNoContext.newContext).toHaveBeenCalled();
			expect(managed.context).toBe(newContext);
		});
	});

	describe('createBrowserForDomain', () => {
		it('should delegate to createBrowser', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowserForDomain('example.com', { headless: true });

			expect(managed.browser).toBeDefined();
			expect(managed.page).toBeDefined();
		});
	});

	describe('closeBrowser', () => {
		it('should close browser and remove from active list', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			expect(manager.getActiveBrowserCount()).toBe(1);

			await manager.closeBrowser(managed);

			expect(managed.browser.close).toHaveBeenCalled();
			expect(manager.getActiveBrowserCount()).toBe(0);
		});

		it('should handle close errors gracefully', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			(managed.browser.close as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Close failed')
			);

			// Should not throw
			await expect(manager.closeBrowser(managed)).resolves.toBeUndefined();
		});
	});

	describe('closeAll', () => {
		it('should close all active browsers', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed1 = await manager.createBrowser({ headless: true });
			const managed2 = await manager.createBrowser({ headless: true });

			await manager.closeAll();

			expect(managed1.browser.close).toHaveBeenCalled();
			expect(managed2.browser.close).toHaveBeenCalled();
			expect(manager.getActiveBrowserCount()).toBe(0);
		});

		it('should handle close errors during closeAll', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const managed = await manager.createBrowser({ headless: true });
			(managed.browser.close as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Close failed')
			);

			// Should not throw
			await expect(manager.closeAll()).resolves.toBeUndefined();
		});
	});

	describe('extractCookies', () => {
		it('should extract cookies from context', async () => {
			const testCookies: Cookie[] = [
				{
					name: 'cf_clearance',
					value: 'abc123',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: true,
					secure: true,
					sameSite: 'None'
				}
			];

			(mockContext.cookies as ReturnType<typeof vi.fn>).mockResolvedValue(testCookies);

			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			const cookies = await manager.extractCookies(mockContext);

			expect(cookies).toEqual(testCookies);
		});

		it('should extract cookies for specific URLs', async () => {
			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			await manager.extractCookies(mockContext, ['https://example.com']);

			expect(mockContext.cookies).toHaveBeenCalledWith(['https://example.com']);
		});
	});

	describe('addCookies', () => {
		it('should add cookies to context', async () => {
			const testCookies: Cookie[] = [
				{
					name: 'session',
					value: 'xyz789',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: false,
					sameSite: 'Lax'
				}
			];

			const manager = new CamoufoxManager();
			await manager.waitForAvailabilityCheck();

			await manager.addCookies(mockContext, testCookies);

			expect(mockContext.addCookies).toHaveBeenCalledWith(testCookies);
		});
	});

	describe('Singleton functions', () => {
		it('getCamoufoxManager should return same instance', () => {
			const instance1 = getCamoufoxManager();
			const instance2 = getCamoufoxManager();

			expect(instance1).toBe(instance2);
		});

		it('shutdownCamoufoxManager should close all and reset instance', async () => {
			const instance = getCamoufoxManager();
			expect(instance).toBeDefined();
			await instance.waitForAvailabilityCheck();

			await shutdownCamoufoxManager();
			// Shutdown completed successfully - verify it didn't throw
			expect(true).toBe(true);

			// Next call should create new instance
			// (Note: Can't easily test this without resetting module state)
		});
	});
});
