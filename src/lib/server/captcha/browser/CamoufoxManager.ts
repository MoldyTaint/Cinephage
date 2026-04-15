/**
 * Camoufox Browser Manager
 *
 * Manages on-demand Camoufox browser lifecycle for challenge solving.
 * Camoufox is a Firefox-based anti-detect browser that handles fingerprinting
 * at the C++ level, making it highly effective against Cloudflare and similar protections.
 */

import { Camoufox, type LaunchOptions } from 'camoufox-js';
import type { Browser, BrowserContext, Page, Cookie } from 'playwright-core';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'indexers' as const });
import type { ProxyConfig } from '../types';

/**
 * Managed browser instance
 */
export interface ManagedBrowser {
	/** Internal tracking ID */
	id: string;
	browser: Browser;
	context: BrowserContext;
	page: Page;
	createdAt: Date;
	/** Whether this browser has been closed (prevents double-close) */
	isClosed: boolean;
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
			// Use "virtual" headless mode which spawns an internal Xvfb display
			const browser = await Camoufox({
				headless: 'virtual' as unknown as boolean,
				geoip: false
			} as LaunchOptions);
			await browser.close();
			this.isAvailable = true;
			this.availabilityError = undefined;
			logger.info('[CamoufoxManager] Camoufox is available');
		} catch (error) {
			this.isAvailable = false;
			this.availabilityError = error instanceof Error ? error.message : String(error);
			logger.warn(
				{
					error: this.availabilityError
				},
				'[CamoufoxManager] Camoufox is not available'
			);
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
		// Wait for availability check to complete before checking isAvailable
		await this.waitForAvailabilityCheck();

		if (!this.isAvailable) {
			throw new Error(`Camoufox not available: ${this.availabilityError || 'unknown error'}`);
		}

		const id = crypto.randomUUID();
		const startTime = Date.now();

		try {
			// Build Camoufox options
			// Use "virtual" headless mode which spawns an internal Xvfb display
			// This properly satisfies Firefox's display requirements in Docker
			const camoufoxOptions: LaunchOptions = {
				headless: options.headless ? ('virtual' as unknown as boolean) : false,
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
				id,
				browser,
				context,
				page,
				createdAt: new Date(),
				isClosed: false
			};

			this.activeBrowsers.set(id, managed);

			// Handle browser disconnect (crash, external kill, etc.)
			// This prevents stale entries in activeBrowsers map
			browser.on('disconnected', () => {
				if (!managed.isClosed) {
					managed.isClosed = true;
					this.activeBrowsers.delete(id);
					logger.debug({ id }, '[CamoufoxManager] Browser disconnected externally');
				}
			});

			logger.debug(
				{
					id,
					headless: options.headless,
					timeMs: Date.now() - startTime
				},
				'[CamoufoxManager] Created browser'
			);

			return managed;
		} catch (error) {
			logger.error(
				{
					error: error instanceof Error ? error.message : String(error)
				},
				'[CamoufoxManager] Failed to create browser'
			);
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
		// Prevent double-close
		if (managed.isClosed) {
			return;
		}
		managed.isClosed = true;

		try {
			// Remove from active list using the stored ID (O(1) instead of O(n))
			this.activeBrowsers.delete(managed.id);

			// Close browser (this closes all contexts and pages)
			// Note: camoufox-js has an upstream bug where syncAttachVD wraps close()
			// but doesn't return the Promise, so close() may return undefined.
			// We must check if the result is thenable before calling .catch()
			const closeResult = managed.browser.close();
			if (closeResult && typeof closeResult.then === 'function') {
				await closeResult.catch(() => {});
			}

			logger.debug({ id: managed.id }, '[CamoufoxManager] Closed browser');
		} catch (error) {
			logger.warn(
				{
					id: managed.id,
					error: error instanceof Error ? error.message : String(error)
				},
				'[CamoufoxManager] Error closing browser'
			);
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
				// Skip already-closed browsers
				if (managed.isClosed) {
					return;
				}
				managed.isClosed = true;

				try {
					// Handle upstream camoufox-js bug where close() may return undefined
					const closeResult = managed.browser.close();
					if (closeResult && typeof closeResult.then === 'function') {
						await closeResult.catch(() => {});
					}
				} catch {
					// Ignore errors during cleanup
				}
			})
		);

		logger.info({ count: browsers.length }, '[CamoufoxManager] Closed all browsers');
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
