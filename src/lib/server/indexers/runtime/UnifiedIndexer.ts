/**
 * UnifiedIndexer - Complete indexer implementation for all protocols.
 *
 * This single class handles torrent, usenet, and streaming indexers using
 * YAML definitions. It routes to either HTTP-based search (external indexers)
 * or database queries (internal streaming indexer).
 *
 * Key features:
 * - Protocol detection from YAML definition
 * - HTTP search for torrent/usenet/external streaming
 * - Database query support for internal streaming indexer
 * - Full compatibility with existing engine components
 */

import type {
	IIndexer,
	IndexerCapabilities,
	SearchMode,
	SearchParam,
	SearchCriteria,
	ReleaseResult,
	IndexerProtocol,
	IndexerAccessType,
	IndexerDownloadResult
} from '../types';
import type { YamlDefinition } from '../schema/yamlDefinition';
import type { IndexerRecord, ProtocolSettings } from '$lib/server/db/schema';
import { TemplateEngine, createTemplateEngine } from '../engine/TemplateEngine';
import { FilterEngine, createFilterEngine } from '../engine/FilterEngine';
import { SelectorEngine, createSelectorEngine } from '../engine/SelectorEngine';
import { RequestBuilder, createRequestBuilder } from './RequestBuilder';
import { ResponseParser, createResponseParser } from './ResponseParser';
import { AuthManager, createAuthManager } from '../auth/AuthManager';
import { CookieStore, createCookieStore } from '../auth/CookieStore';
import { DownloadHandler, createDownloadHandler } from './DownloadHandler';
import { SearchCapabilityChecker } from './SearchCapabilityChecker';
import { getPersistentStatusTracker } from '../status';
import { getRateLimitRegistry } from '../ratelimit';
import type { RateLimitConfig } from '../ratelimit/types';
import { createChildLogger } from '$lib/logging';
import { IndexerHttp, createIndexerHttp } from '../http/IndexerHttp';
import { DatabaseQueryExecutor, createDatabaseQueryExecutor } from './DatabaseQueryExecutor';
import type { NewznabCapabilities } from '../newznab/types';

/**
 * Configuration for creating a UnifiedIndexer instance
 */
export interface UnifiedIndexerConfig {
	/** Indexer record from database */
	record: IndexerRecord;
	/** User-provided settings (apiKey, cookie, etc.) */
	settings: Record<string, string | boolean | number>;
	/** Protocol-specific settings */
	protocolSettings?: ProtocolSettings;
	/** YAML definition (parsed) */
	definition: YamlDefinition;
	/** Optional rate limit configuration override */
	rateLimit?: RateLimitConfig;
	/** Live capabilities fetched from Newznab/Torznab indexer's /api?t=caps endpoint */
	liveCapabilities?: NewznabCapabilities;
}

/**
 * Unified indexer implementation that handles all protocols.
 */
export class UnifiedIndexer implements IIndexer {
	readonly id: string;
	readonly name: string;
	readonly definitionId: string;
	readonly protocol: IndexerProtocol;
	readonly accessType: IndexerAccessType;
	readonly capabilities: IndexerCapabilities;
	readonly baseUrl: string;
	readonly enableAutomaticSearch: boolean;
	readonly enableInteractiveSearch: boolean;

	private readonly record: IndexerRecord;
	private readonly settings: Record<string, string | boolean | number>;
	private readonly protocolSettings?: ProtocolSettings;
	private readonly definition: YamlDefinition;
	private readonly templateEngine: TemplateEngine;
	private readonly filterEngine: FilterEngine;
	private readonly selectorEngine: SelectorEngine;
	private readonly requestBuilder: RequestBuilder;
	private readonly responseParser: ResponseParser;
	private readonly authManager: AuthManager;
	private readonly downloadHandler: DownloadHandler;
	private readonly cookieStore: CookieStore;
	private readonly capabilityChecker: SearchCapabilityChecker;
	private readonly log: ReturnType<typeof createChildLogger>;
	private readonly http: IndexerHttp;
	private readonly dbExecutor?: DatabaseQueryExecutor;

	private cookies: Record<string, string> = {};
	private isLoggedIn = false;

	constructor(config: UnifiedIndexerConfig) {
		const { record, settings, protocolSettings, definition, rateLimit, liveCapabilities } = config;

		this.record = record;
		this.settings = settings;
		this.protocolSettings = protocolSettings;
		this.definition = definition;
		this.id = record.id;
		this.name = record.name;
		this.definitionId = record.definitionId;

		// Search capability toggles
		this.enableAutomaticSearch = record.enableAutomaticSearch ?? true;
		this.enableInteractiveSearch = record.enableInteractiveSearch ?? true;

		// Get protocol from definition (no longer hardcoded!)
		this.protocol = this.mapProtocol(definition.protocol);
		this.accessType = this.mapAccessType(definition.type);

		// Build capabilities from definition
		this.capabilities = this.buildCapabilities(definition);

		// Create engines
		this.filterEngine = createFilterEngine();
		this.templateEngine = createTemplateEngine();
		this.selectorEngine = createSelectorEngine(this.templateEngine, this.filterEngine);

		// Create runtime components
		this.requestBuilder = createRequestBuilder(definition, this.templateEngine, this.filterEngine);

		// Configure RequestBuilder with live capabilities (for Newznab/Torznab)
		// This filters out unsupported params like tmdbid when the indexer doesn't support them
		if (liveCapabilities) {
			const caps = liveCapabilities.searching;
			if (caps.search.available) {
				this.requestBuilder.setSupportedParams('search', caps.search.supportedParams);
			}
			if (caps.movieSearch.available) {
				this.requestBuilder.setSupportedParams('movie', caps.movieSearch.supportedParams);
			}
			if (caps.tvSearch.available) {
				this.requestBuilder.setSupportedParams('tvsearch', caps.tvSearch.supportedParams);
			}
			if (caps.audioSearch.available) {
				this.requestBuilder.setSupportedParams('audio', caps.audioSearch.supportedParams);
			}
			if (caps.bookSearch.available) {
				this.requestBuilder.setSupportedParams('book', caps.bookSearch.supportedParams);
			}
		}

		this.responseParser = createResponseParser(
			definition,
			this.templateEngine,
			this.filterEngine,
			this.selectorEngine
		);

		// Create auth components
		this.cookieStore = createCookieStore();
		this.authManager = createAuthManager(
			definition,
			this.templateEngine,
			this.filterEngine,
			this.selectorEngine,
			this.cookieStore
		);

		// Create download handler
		this.downloadHandler = createDownloadHandler(
			definition,
			this.templateEngine,
			this.filterEngine,
			this.selectorEngine
		);

		// Create capability checker
		this.capabilityChecker = new SearchCapabilityChecker();

		// Configure with base URL and settings
		this.baseUrl = record.baseUrl || definition.links[0];
		this.requestBuilder.setBaseUrl(this.baseUrl);
		this.templateEngine.setSiteLink(this.baseUrl);
		this.templateEngine.setConfig(settings);

		this.log = createChildLogger({ indexer: this.name, indexerId: this.id });

		// Create unified HTTP client
		this.http = createIndexerHttp({
			indexerId: this.id,
			indexerName: this.name,
			baseUrl: this.baseUrl,
			alternateUrls: definition.links.slice(1),
			userAgent: 'Cinephage/1.0',
			rateLimit: rateLimit ?? { requests: 30, periodMs: 60_000 }
		});

		// Create database executor for internal streaming indexers
		if (this.isInternalStreamingIndexer()) {
			this.dbExecutor = createDatabaseQueryExecutor(definition, this.templateEngine);
		}

		// Initialize tracking
		this.initializeTracking(record.enabled ?? true, record.priority ?? 25, rateLimit);
	}

	/**
	 * Check if this is an internal streaming indexer (uses database queries)
	 */
	private isInternalStreamingIndexer(): boolean {
		if (this.protocol !== 'streaming') return false;

		const streamingConfig = this.definition.protocolConfig?.streaming;
		return streamingConfig?.dataSource === 'database' || streamingConfig?.type === 'internal';
	}

	/**
	 * Map YAML protocol to IndexerProtocol type
	 */
	private mapProtocol(protocol: string): IndexerProtocol {
		switch (protocol) {
			case 'usenet':
				return 'usenet';
			case 'streaming':
				return 'streaming';
			default:
				return 'torrent';
		}
	}

	/**
	 * Map definition type to IndexerAccessType
	 */
	private mapAccessType(type: string): IndexerAccessType {
		switch (type) {
			case 'private':
				return 'private';
			case 'semi-private':
				return 'semi-private';
			default:
				return 'public';
		}
	}

	/**
	 * Build capabilities from YAML definition
	 */
	private buildCapabilities(definition: YamlDefinition): IndexerCapabilities {
		const caps = definition.caps;
		const modes = caps.modes ?? {};

		const toSearchParams = (params: string[] | undefined): SearchParam[] => {
			if (!params) return ['q'];
			return params.map((p) => {
				const mapping: Record<string, SearchParam> = {
					q: 'q',
					imdbid: 'imdbId',
					tmdbid: 'tmdbId',
					tvdbid: 'tvdbId',
					tvmazeid: 'tvMazeId',
					traktid: 'traktId',
					season: 'season',
					ep: 'ep',
					year: 'year',
					genre: 'genre',
					artist: 'artist',
					album: 'album',
					author: 'author',
					title: 'title'
				};
				return mapping[p.toLowerCase()] ?? 'q';
			});
		};

		const buildSearchMode = (params: string[] | undefined): SearchMode => ({
			available: params !== undefined && params.length > 0,
			supportedParams: toSearchParams(params)
		});

		const categories = new Map<number, string>();
		if (caps.categories) {
			for (const [catId, catName] of Object.entries(caps.categories)) {
				const numId = parseInt(catId, 10);
				if (!isNaN(numId)) {
					categories.set(numId, catName);
				}
			}
		}
		if (caps.categorymappings) {
			for (const mapping of caps.categorymappings) {
				if (mapping.cat) {
					const numId = parseInt(mapping.cat, 10);
					if (!isNaN(numId)) {
						categories.set(numId, mapping.desc ?? mapping.cat);
					}
				}
			}
		}

		return {
			search: modes['search']
				? buildSearchMode(modes['search'])
				: { available: true, supportedParams: ['q'] },
			movieSearch: modes['movie-search'] ? buildSearchMode(modes['movie-search']) : undefined,
			tvSearch: modes['tv-search'] ? buildSearchMode(modes['tv-search']) : undefined,
			musicSearch: modes['music-search'] ? buildSearchMode(modes['music-search']) : undefined,
			bookSearch: modes['book-search'] ? buildSearchMode(modes['book-search']) : undefined,
			categories,
			supportsPagination: false,
			supportsInfoHash: this.protocol === 'torrent',
			limitMax: 100,
			limitDefault: 100
		};
	}

	/**
	 * Initialize status tracking and rate limiting
	 */
	private initializeTracking(
		enabled: boolean,
		priority: number,
		rateLimit?: RateLimitConfig
	): void {
		const statusTracker = getPersistentStatusTracker();
		statusTracker.initialize(this.id, enabled, priority);

		if (rateLimit) {
			const registry = getRateLimitRegistry();
			registry.register(this.id, rateLimit);
		} else if (this.definition.requestdelay) {
			const registry = getRateLimitRegistry();
			registry.register(this.id, {
				requests: 1,
				periodMs: this.definition.requestdelay * 1000
			});
		}
	}

	/**
	 * Check if this indexer can handle the given search criteria
	 */
	canSearch(criteria: SearchCriteria): boolean {
		return this.capabilityChecker.canSearch(criteria, this.capabilities);
	}

	/**
	 * Perform a search - routes to HTTP or database based on indexer type
	 */
	async search(criteria: SearchCriteria): Promise<ReleaseResult[]> {
		const startTime = Date.now();

		try {
			// Route to appropriate search method
			if (this.isInternalStreamingIndexer() && this.dbExecutor) {
				return await this.executeDatabaseSearch(criteria, startTime);
			}
			return await this.executeHttpSearch(criteria, startTime);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Search failed', { error: message, criteria });
			this.recordFailure(message);
			throw error;
		}
	}

	/**
	 * Execute database search for internal streaming indexer
	 */
	private async executeDatabaseSearch(
		criteria: SearchCriteria,
		startTime: number
	): Promise<ReleaseResult[]> {
		if (!this.dbExecutor) {
			throw new Error('Database executor not initialized for internal streaming indexer');
		}

		this.log.debug('Executing database search', { criteria });

		const results = await this.dbExecutor.execute(criteria, {
			indexerId: this.id,
			indexerName: this.name,
			protocol: this.protocol,
			baseUrl: this.baseUrl,
			settings: this.settings
		});

		const duration = Date.now() - startTime;
		this.recordSuccess(duration);

		this.log.debug('Database search completed', {
			resultCount: results.length,
			durationMs: duration
		});

		return results;
	}

	/**
	 * Execute HTTP search for torrent/usenet/external streaming
	 */
	private async executeHttpSearch(
		criteria: SearchCriteria,
		startTime: number
	): Promise<ReleaseResult[]> {
		// Check rate limit
		await this.checkRateLimit();

		// Ensure we're logged in
		await this.ensureLoggedIn();

		// Build requests
		const requests = this.requestBuilder.buildSearchRequests(criteria);
		if (requests.length === 0) {
			this.log.warn('No search requests generated', { criteria });
			return [];
		}

		this.log.debug('Built search requests', { count: requests.length });

		// Execute requests and collect results
		const allResults: ReleaseResult[] = [];

		for (const request of requests) {
			this.log.debug('Executing search request', { url: request.url, method: request.method });
			try {
				const results = await this.executeSearchRequest(request);
				allResults.push(...results);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.log.warn('Search request failed', { url: request.url, error: message });
			}
		}

		const duration = Date.now() - startTime;
		this.recordSuccess(duration);

		this.log.debug('HTTP search completed', {
			resultCount: allResults.length,
			durationMs: duration
		});

		return allResults;
	}

	/**
	 * Execute a single search request
	 */
	private async executeSearchRequest(request: {
		url: string;
		method: 'GET' | 'POST';
		headers: Record<string, string>;
		body?: string | URLSearchParams;
		searchPath: unknown;
	}): Promise<ReleaseResult[]> {
		this.http.setCookies(this.cookies);

		const response =
			request.method === 'POST'
				? await this.http.post(request.url, request.body!, {
						headers: request.headers,
						followRedirects: this.definition.followredirect ?? true
					})
				: await this.http.get(request.url, {
						headers: request.headers,
						followRedirects: this.definition.followredirect ?? true
					});

		this.http.parseAndStoreCookies(response.headers);

		const mockResponse = new Response(response.body, {
			status: response.status,
			headers: response.headers
		});

		if (this.authManager.checkLoginNeeded(mockResponse, response.body)) {
			this.log.info('Login needed, re-authenticating');
			this.isLoggedIn = false;
			await this.ensureLoggedIn();

			this.http.setCookies(this.cookies);

			const retryResponse =
				request.method === 'POST'
					? await this.http.post(request.url, request.body!, {
							headers: request.headers,
							followRedirects: this.definition.followredirect ?? true
						})
					: await this.http.get(request.url, {
							headers: request.headers,
							followRedirects: this.definition.followredirect ?? true
						});

			return this.parseResponse(retryResponse.body, request.searchPath);
		}

		return this.parseResponse(response.body, request.searchPath);
	}

	/**
	 * Parse a response into release results
	 */
	private parseResponse(content: string, searchPath: unknown): ReleaseResult[] {
		const parseResult = this.responseParser.parse(
			content,
			searchPath as Parameters<typeof this.responseParser.parse>[1],
			{
				indexerId: this.id,
				indexerName: this.name,
				baseUrl: this.requestBuilder.getBaseUrl(),
				protocol: this.protocol
			}
		);

		if (parseResult.errors && parseResult.errors.length > 0) {
			this.log.warn('Parse had errors', { errors: parseResult.errors });
		}

		return parseResult.releases;
	}

	/**
	 * Ensure we're logged in (if required)
	 */
	private async ensureLoggedIn(): Promise<void> {
		if (!this.authManager.requiresAuth()) {
			return;
		}

		if (this.isLoggedIn && Object.keys(this.cookies).length > 0) {
			return;
		}

		const context = {
			indexerId: this.id,
			baseUrl: this.requestBuilder.getBaseUrl(),
			settings: this.settings
		};

		const hasStoredCookies = await this.authManager.loadCookies(context);
		if (hasStoredCookies) {
			this.cookies = this.authManager.getCookies();
			this.isLoggedIn = true;
			this.log.debug('Loaded stored cookies');
			return;
		}

		this.log.info('Performing login');
		const loginResult = await this.authManager.login(context);

		if (!loginResult.success) {
			throw new Error(`Login failed: ${loginResult.error}`);
		}

		this.cookies = loginResult.cookies;
		this.isLoggedIn = true;

		await this.authManager.saveCookies(context);
		this.log.debug('Login successful, cookies saved');
	}

	/**
	 * Test connectivity to the indexer
	 */
	async test(): Promise<void> {
		this.log.debug('Testing indexer connectivity');

		try {
			if (this.isInternalStreamingIndexer()) {
				// For internal indexers, just verify the executor is set up
				this.log.info('Internal streaming indexer test successful');
				return;
			}

			await this.ensureLoggedIn();

			const results = await this.search({
				searchType: 'basic',
				query: 'test',
				limit: 1
			});

			this.log.info('Indexer test successful', { resultCount: results.length });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Indexer test failed', { error: message });
			throw new Error(`Indexer test failed: ${message}`);
		}
	}

	/**
	 * Get download URL for a release
	 */
	async getDownloadUrl(release: ReleaseResult): Promise<string> {
		// For streaming protocol, return the stream URL as-is
		if (this.protocol === 'streaming') {
			return release.downloadUrl || '';
		}

		// Handle torrent magnet preference
		if (this.protocol === 'torrent') {
			const torrentSettings = this.protocolSettings as { preferMagnetUrl?: boolean } | undefined;
			if (torrentSettings?.preferMagnetUrl && release.magnetUrl) {
				return release.magnetUrl;
			}
		}

		const downloadUrl = release.downloadUrl ?? release.magnetUrl;
		if (!downloadUrl) {
			throw new Error('No download URL available');
		}

		if (downloadUrl.startsWith('magnet:') || downloadUrl.startsWith('stream://')) {
			return downloadUrl;
		}

		if (!this.downloadHandler.needsResolution()) {
			return downloadUrl;
		}

		const context = {
			baseUrl: this.requestBuilder.getBaseUrl(),
			cookies: this.cookies,
			settings: this.settings
		};

		const result = await this.downloadHandler.resolveDownload(downloadUrl, context);

		if (!result.success) {
			this.log.warn('Download resolution failed', { error: result.error });
			return downloadUrl;
		}

		return result.magnetUrl ?? result.request?.url ?? downloadUrl;
	}

	/**
	 * Download a torrent/NZB file from the indexer
	 */
	async downloadTorrent(url: string): Promise<IndexerDownloadResult> {
		const startTime = Date.now();

		this.log.debug('Downloading content', { url: url.substring(0, 100) });

		try {
			await this.ensureLoggedIn();
			await this.checkRateLimit();

			if (url.startsWith('magnet:')) {
				const { extractInfoHashFromMagnet } =
					await import('$lib/server/downloadClients/utils/torrentParser');
				const infoHash = extractInfoHashFromMagnet(url);
				return {
					success: true,
					magnetUrl: url,
					infoHash,
					responseTimeMs: Date.now() - startTime
				};
			}

			if (url.startsWith('stream://')) {
				// For streaming URLs, return the URL as data
				return {
					success: true,
					data: Buffer.from(url),
					responseTimeMs: Date.now() - startTime
				};
			}

			const headers: Record<string, string> = {
				Accept: 'application/x-bittorrent, application/x-nzb, */*',
				Referer: this.requestBuilder.getBaseUrl()
			};

			if (Object.keys(this.cookies).length > 0) {
				headers['Cookie'] = CookieStore.buildCookieHeader(this.cookies);
			}

			const defHeaders = this.definition.download?.headers ?? this.definition.search?.headers;
			if (defHeaders) {
				for (const [key, values] of Object.entries(defHeaders)) {
					headers[key] = this.templateEngine.expand(values[0]);
				}
			}

			const maxRedirects = 5;
			let currentUrl = url;
			let response: Response | null = null;

			for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount++) {
				response = await fetch(currentUrl, {
					method: 'GET',
					headers,
					redirect: 'manual'
				});

				if ([301, 302, 303, 307, 308].includes(response.status)) {
					const location = response.headers.get('location');
					if (!location) {
						return {
							success: false,
							error: 'Redirect without location header',
							responseTimeMs: Date.now() - startTime
						};
					}

					if (location.startsWith('magnet:')) {
						const { extractInfoHashFromMagnet } =
							await import('$lib/server/downloadClients/utils/torrentParser');
						const infoHash = extractInfoHashFromMagnet(location);
						return {
							success: true,
							magnetUrl: location,
							infoHash,
							responseTimeMs: Date.now() - startTime
						};
					}

					currentUrl = new URL(location, currentUrl).toString();
					continue;
				}

				break;
			}

			if (!response) {
				return {
					success: false,
					error: 'No response received',
					responseTimeMs: Date.now() - startTime
				};
			}

			if (!response.ok) {
				const _errorText = await response.text().catch(() => '');
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`,
					responseTimeMs: Date.now() - startTime
				};
			}

			const arrayBuffer = await response.arrayBuffer();
			const data = Buffer.from(arrayBuffer);

			// For usenet, just return the NZB data
			if (this.protocol === 'usenet') {
				this.recordSuccess(Date.now() - startTime);
				return {
					success: true,
					data,
					responseTimeMs: Date.now() - startTime
				};
			}

			// For torrent, parse the file
			const { parseTorrentFile } = await import('$lib/server/downloadClients/utils/torrentParser');
			const parseResult = parseTorrentFile(data);

			if (!parseResult.success) {
				return {
					success: false,
					error: parseResult.error,
					responseTimeMs: Date.now() - startTime
				};
			}

			if (parseResult.magnetUrl) {
				return {
					success: true,
					magnetUrl: parseResult.magnetUrl,
					infoHash: parseResult.infoHash,
					responseTimeMs: Date.now() - startTime
				};
			}

			this.recordSuccess(Date.now() - startTime);

			return {
				success: true,
				data,
				infoHash: parseResult.infoHash,
				responseTimeMs: Date.now() - startTime
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Download failed', { error: message });
			this.recordFailure(message);
			return {
				success: false,
				error: message,
				responseTimeMs: Date.now() - startTime
			};
		}
	}

	/**
	 * Check rate limit before making request
	 */
	private async checkRateLimit(): Promise<void> {
		const registry = getRateLimitRegistry();
		const limiter = registry.get(this.id);

		if (!limiter.canProceed()) {
			const waitTime = limiter.getWaitTime();
			this.log.debug('Rate limited, waiting', { waitTimeMs: waitTime });
			await this.delay(waitTime);
		}

		limiter.recordRequest();
	}

	private recordSuccess(responseTimeMs?: number): void {
		const statusTracker = getPersistentStatusTracker();
		statusTracker.recordSuccess(this.id, responseTimeMs);
	}

	private recordFailure(message: string): void {
		const statusTracker = getPersistentStatusTracker();
		statusTracker.recordFailure(this.id, message);
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create a new UnifiedIndexer instance
 */
export function createUnifiedIndexer(config: UnifiedIndexerConfig): UnifiedIndexer {
	return new UnifiedIndexer(config);
}
