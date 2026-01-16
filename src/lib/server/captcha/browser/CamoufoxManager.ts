/**
 * Camoufox Browser Manager
 *
 * Manages on-demand Camoufox browser lifecycle for challenge solving.
 * Camoufox is a Firefox-based anti-detect browser that handles fingerprinting
 * at the C++ level, making it highly effective against Cloudflare and similar protections.
 */

import { Camoufox } from 'camoufox-js';
import type { Browser, BrowserContext, Page, Cookie } from 'playwright-core';
import { logger } from '$lib/logging';
import type { ProxyConfig } from '../types';

/**
 * Managed browser instance
 */
export interface ManagedBrowser {
	browser: Browser;
	context: BrowserContext;
	page: Page;
	createdAt: Date;
}

/**
 * Camoufox Browser Manager for anti-detect browsing
 */
export class CamoufoxManager {
	private activeBrowsers: Map<string, ManagedBrowser> = new Map();
	private isAvailable = false;
	private availabilityError: string | undefined;
	private availabilityChecked = false;
	private availabilityPromise: Promise<void> | null = null;

	constructor() {
		// Start async availability check
		this.availabilityPromise = this.checkAvailability();
	}

	/**
	 * Check if Camoufox is available
	 */
	private async checkAvailability(): Promise<void> {
		try {
			// Try to launch a quick browser to verify availability
			const browser = await Camoufox({
				headless: true,
				geoip: false // Skip geoip for quick test
			});
			await browser.close();
			this.isAvailable = true;
			this.availabilityError = undefined;
			logger.info('[CamoufoxManager] Camoufox is available');
		} catch (error) {
			this.isAvailable = false;
			this.availabilityError = error instanceof Error ? error.message : String(error);
			logger.warn('[CamoufoxManager] Camoufox is not available', {
				error: this.availabilityError
			});
		} finally {
			this.availabilityChecked = true;
		}
	}

	/**
	 * Wait for availability check to complete
	 */
	async waitForAvailabilityCheck(): Promise<void> {
		if (this.availabilityPromise) {
			await this.availabilityPromise;
		}
	}

	/**
	 * Check if browser is available for use
	 */
	browserAvailable(): boolean {
		return this.isAvailable;
	}

	/**
	 * Check if availability has been determined yet
	 */
	availabilityDetermined(): boolean {
		return this.availabilityChecked;
	}

	/**
	 * Get availability error message
	 */
	getAvailabilityError(): string | undefined {
		return this.availabilityError;
	}

	/**
	 * Create a new Camoufox browser for solving
	 */
	async createBrowser(options: {
		headless: boolean;
		proxy?: ProxyConfig;
	}): Promise<ManagedBrowser> {
		if (!this.isAvailable) {
			throw new Error(`Camoufox not available: ${this.availabilityError || 'unknown error'}`);
		}

		const id = crypto.randomUUID();
		const startTime = Date.now();

		try {
			// Build Camoufox options
			const camoufoxOptions: Parameters<typeof Camoufox>[0] = {
				headless: options.headless,
				geoip: true, // Auto-detect IP and set matching locale/timezone
				humanize: true // Human-like mouse movements
			};

			// Add proxy if provided
			if (options.proxy) {
				camoufoxOptions.proxy = {
					server: options.proxy.url,
					username: options.proxy.username,
					password: options.proxy.password
				};
			}

			// Launch Camoufox
			const browser = (await Camoufox(camoufoxOptions)) as Browser;

			// Get the default context (Camoufox creates one)
			const contexts = browser.contexts();
			const context = contexts[0] || (await browser.newContext());

			// Create page
			const page = await context.newPage();

			const managed: ManagedBrowser = {
				browser,
				context,
				page,
				createdAt: new Date()
			};

			this.activeBrowsers.set(id, managed);

			logger.debug('[CamoufoxManager] Created browser', {
				id,
				headless: options.headless,
				timeMs: Date.now() - startTime
			});

			return managed;
		} catch (error) {
			logger.error('[CamoufoxManager] Failed to create browser', {
				error: error instanceof Error ? error.message : String(error)
			});
			throw error;
		}
	}

	/**
	 * Create a browser for a specific domain
	 */
	async createBrowserForDomain(
		_domain: string,
		options: { headless: boolean; proxy?: ProxyConfig }
	): Promise<ManagedBrowser> {
		return this.createBrowser(options);
	}

	/**
	 * Close a managed browser
	 */
	async closeBrowser(managed: ManagedBrowser): Promise<void> {
		try {
			// Find and remove from active list
			for (const [id, browser] of this.activeBrowsers) {
				if (browser === managed) {
					this.activeBrowsers.delete(id);
					break;
				}
			}

			// Close browser (this closes all contexts and pages)
			await managed.browser.close().catch(() => {});

			logger.debug('[CamoufoxManager] Closed browser');
		} catch (error) {
			logger.warn('[CamoufoxManager] Error closing browser', {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Close all active browsers
	 */
	async closeAll(): Promise<void> {
		const browsers = Array.from(this.activeBrowsers.values());
		this.activeBrowsers.clear();

		await Promise.all(
			browsers.map(async (managed) => {
				try {
					await managed.browser.close().catch(() => {});
				} catch {
					// Ignore errors during cleanup
				}
			})
		);

		logger.info('[CamoufoxManager] Closed all browsers', { count: browsers.length });
	}

	/**
	 * Get count of active browsers
	 */
	getActiveBrowserCount(): number {
		return this.activeBrowsers.size;
	}

	/**
	 * Extract cookies from context
	 */
	async extractCookies(context: BrowserContext, urls?: string[]): Promise<Cookie[]> {
		return context.cookies(urls);
	}

	/**
	 * Add cookies to context
	 */
	async addCookies(context: BrowserContext, cookies: Cookie[]): Promise<void> {
		await context.addCookies(cookies);
	}
}

// Singleton instance
let camoufoxManagerInstance: CamoufoxManager | null = null;

/**
 * Get the Camoufox manager instance
 */
export function getCamoufoxManager(): CamoufoxManager {
	if (!camoufoxManagerInstance) {
		camoufoxManagerInstance = new CamoufoxManager();
	}
	return camoufoxManagerInstance;
}

/**
 * Shutdown the Camoufox manager
 */
export async function shutdownCamoufoxManager(): Promise<void> {
	if (camoufoxManagerInstance) {
		await camoufoxManagerInstance.closeAll();
		camoufoxManagerInstance = null;
	}
}
