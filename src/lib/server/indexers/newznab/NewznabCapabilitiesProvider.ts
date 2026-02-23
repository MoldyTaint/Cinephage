/**
 * NewznabCapabilitiesProvider - Fetches and caches Newznab indexer capabilities.
 * Queries the ?t=caps endpoint to discover supported search modes and categories.
 */

import * as cheerio from 'cheerio';
import { logger } from '$lib/logging';
import type {
	NewznabCapabilities,
	NewznabCategory,
	NewznabSearchMode,
	CachedCapabilities
} from './types';

/**
 * Error thrown when capabilities fetch fails.
 */
export class CapabilitiesFetchError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number
	) {
		super(message);
		this.name = 'CapabilitiesFetchError';
	}
}

/**
 * Default capabilities for when fetch fails or capabilities are unavailable.
 */
export const DEFAULT_CAPABILITIES: NewznabCapabilities = {
	server: {},
	limits: {
		default: 100,
		max: 100
	},
	searching: {
		search: { available: true, supportedParams: ['q'] },
		tvSearch: { available: true, supportedParams: ['q', 'tvdbid', 'season', 'ep'] },
		movieSearch: { available: true, supportedParams: ['q', 'imdbid'] },
		audioSearch: { available: false, supportedParams: [] },
		bookSearch: { available: false, supportedParams: [] }
	},
	categories: [
		{ id: '2000', name: 'Movies' },
		{ id: '2040', name: 'Movies/HD' },
		{ id: '2045', name: 'Movies/UHD' },
		{ id: '5000', name: 'TV' },
		{ id: '5040', name: 'TV/HD' },
		{ id: '5045', name: 'TV/UHD' }
	]
};

/**
 * Provider for fetching and caching Newznab indexer capabilities.
 */
export class NewznabCapabilitiesProvider {
	/** Cache TTL: 7 days in milliseconds */
	private static readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

	/** In-memory cache: baseUrl -> cached capabilities */
	private cache: Map<string, CachedCapabilities> = new Map();

	/**
	 * Get capabilities for a Newznab indexer.
	 * Returns cached capabilities if available and not expired.
	 */
	async getCapabilities(baseUrl: string, apiKey?: string): Promise<NewznabCapabilities> {
		const cacheKey = this.getCacheKey(baseUrl, apiKey);

		// Check cache
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() < cached.expiresAt) {
			logger.debug('[Newznab] Using cached capabilities', { baseUrl });
			return cached.capabilities;
		}

		// Fetch fresh capabilities
		try {
			const capabilities = await this.fetchCapabilities(baseUrl, apiKey);

			// Cache the result
			this.cache.set(cacheKey, {
				capabilities,
				expiresAt: Date.now() + NewznabCapabilitiesProvider.CACHE_TTL
			});

			logger.info('[Newznab] Capabilities fetched and cached', {
				baseUrl,
				categoryCount: capabilities.categories.length,
				movieSearch: capabilities.searching.movieSearch.available,
				tvSearch: capabilities.searching.tvSearch.available
			});

			return capabilities;
		} catch (error) {
			logger.warn('[Newznab] Failed to fetch capabilities, using defaults', {
				baseUrl,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			// Return default capabilities on failure
			return DEFAULT_CAPABILITIES;
		}
	}

	/**
	 * Strictly validate a Newznab/Torznab capabilities endpoint.
	 * Unlike getCapabilities(), this throws on errors instead of returning defaults.
	 */
	async validateCapabilitiesEndpoint(
		baseUrl: string,
		apiKey?: string
	): Promise<NewznabCapabilities> {
		return this.fetchCapabilities(baseUrl, apiKey?.trim());
	}

	/**
	 * Clear cached capabilities for an indexer.
	 */
	clearCache(baseUrl: string, apiKey?: string): void {
		const cacheKey = this.getCacheKey(baseUrl, apiKey);
		this.cache.delete(cacheKey);
		logger.debug('[Newznab] Cache cleared', { baseUrl });
	}

	/**
	 * Clear all cached capabilities.
	 */
	clearAllCache(): void {
		this.cache.clear();
		logger.debug('[Newznab] All cache cleared');
	}

	/**
	 * Fetch capabilities from the indexer.
	 */
	private async fetchCapabilities(baseUrl: string, apiKey?: string): Promise<NewznabCapabilities> {
		// Build URL
		const url = new URL(baseUrl);
		const normalizedPath = url.pathname.replace(/\/+$/, '');
		const lowerPath = normalizedPath.toLowerCase();
		// Torznab-style endpoints can be full paths ending in /torznab.
		// For plain indexer host URLs, append /api to match Newznab conventions.
		const isTorznabEndpoint =
			lowerPath.endsWith('/torznab') || lowerPath.includes('/results/torznab');
		if (!isTorznabEndpoint && !lowerPath.endsWith('/api')) {
			url.pathname = normalizedPath ? `${normalizedPath}/api` : '/api';
		}
		url.searchParams.set('t', 'caps');
		const normalizedApiKey = apiKey?.trim();
		if (normalizedApiKey) {
			url.searchParams.set('apikey', normalizedApiKey);
		}

		logger.debug('[Newznab] Fetching capabilities', {
			url: url.toString().replace(/apikey=[^&]+/, 'apikey=***')
		});

		const response = await fetch(url.toString(), {
			headers: {
				Accept: 'application/xml, text/xml, */*'
			}
		});

		if (!response.ok) {
			throw new CapabilitiesFetchError(
				`Failed to fetch capabilities: ${response.status} ${response.statusText}`,
				response.status
			);
		}

		const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
		if (contentType.includes('text/html')) {
			throw new CapabilitiesFetchError(
				'Indexer returned HTML instead of XML from the caps endpoint'
			);
		}

		const xml = await response.text();
		if (!xml.trim()) {
			throw new CapabilitiesFetchError('Indexer returned an empty caps response');
		}
		return this.parseCapabilities(xml);
	}

	/**
	 * Parse capabilities XML response.
	 */
	private parseCapabilities(xml: string): NewznabCapabilities {
		const $ = cheerio.load(xml, { xmlMode: true });

		if ($('caps').length === 0) {
			throw new CapabilitiesFetchError(
				'Invalid capabilities response: missing <caps> root element'
			);
		}

		// Check for error response
		const errorEl = $('error');
		if (errorEl.length > 0) {
			const code = errorEl.attr('code') || 'unknown';
			const desc = errorEl.attr('description') || 'Unknown error';
			throw new CapabilitiesFetchError(`Indexer error ${code}: ${desc}`);
		}

		// Parse server info
		const serverEl = $('server');
		const server = {
			version: serverEl.attr('version'),
			title: serverEl.attr('title'),
			email: serverEl.attr('email'),
			url: serverEl.attr('url')
		};

		// Parse limits
		const limitsEl = $('limits');
		const limits = {
			default: parseInt(limitsEl.attr('default') || '100', 10),
			max: parseInt(limitsEl.attr('max') || '100', 10)
		};

		// Parse searching capabilities
		const searching = {
			search: this.parseSearchMode($, 'search'),
			tvSearch: this.parseSearchMode($, 'tv-search'),
			movieSearch: this.parseSearchMode($, 'movie-search'),
			audioSearch: this.parseSearchMode($, 'audio-search'),
			bookSearch: this.parseSearchMode($, 'book-search')
		};

		// Parse categories
		const categories = this.parseCategories($);

		return {
			server,
			limits,
			searching,
			categories,
			rawXml: xml
		};
	}

	/**
	 * Parse a search mode element.
	 */
	private parseSearchMode($: cheerio.CheerioAPI, element: string): NewznabSearchMode {
		const el = $(`searching > ${element}`);
		if (!el.length || el.attr('available') !== 'yes') {
			return { available: false, supportedParams: [] };
		}

		const paramsAttr = el.attr('supportedParams') || el.attr('supportedparams');
		const supportedParams = paramsAttr
			? paramsAttr.split(',').map((p) => p.trim().toLowerCase())
			: ['q'];

		return { available: true, supportedParams };
	}

	/**
	 * Parse categories from capabilities.
	 */
	private parseCategories($: cheerio.CheerioAPI): NewznabCategory[] {
		const categories: NewznabCategory[] = [];

		$('categories > category').each((_, catEl) => {
			const cat = $(catEl);
			const category: NewznabCategory = {
				id: cat.attr('id') || '',
				name: cat.attr('name') || ''
			};

			// Parse subcategories
			const subCats: NewznabCategory[] = [];
			cat.find('> subcat').each((_, subEl) => {
				const sub = $(subEl);
				subCats.push({
					id: sub.attr('id') || '',
					name: sub.attr('name') || ''
				});
			});

			if (subCats.length > 0) {
				category.subCategories = subCats;
			}

			if (category.id) {
				categories.push(category);
			}
		});

		return categories;
	}

	/**
	 * Generate cache key from URL and API key.
	 */
	private getCacheKey(baseUrl: string, apiKey?: string): string {
		// Normalize URL
		const url = new URL(baseUrl);
		const normalized = `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
		// Include API key hash for uniqueness (different keys might have different access)
		return apiKey ? `${normalized}:${this.hashApiKey(apiKey)}` : normalized;
	}

	/**
	 * Simple hash for API key (for cache key uniqueness, not security).
	 */
	private hashApiKey(apiKey: string): string {
		let hash = 0;
		for (let i = 0; i < apiKey.length; i++) {
			const char = apiKey.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash.toString(16);
	}
}

/** Singleton instance */
let instance: NewznabCapabilitiesProvider | null = null;

/**
 * Get the singleton NewznabCapabilitiesProvider instance.
 */
export function getNewznabCapabilitiesProvider(): NewznabCapabilitiesProvider {
	if (!instance) {
		instance = new NewznabCapabilitiesProvider();
	}
	return instance;
}
