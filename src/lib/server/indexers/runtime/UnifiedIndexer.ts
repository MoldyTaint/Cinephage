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
	IndexerDownloadResult,
	DownloadTorrentOptions
} from '../types';
import type { YamlDefinition } from '../schema/yamlDefinition';
import { resolveCategoryId } from '../schema/yamlDefinition';
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
	/** Live capabilities fetched from Newznab indexer's /api?t=caps endpoint */
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
	private readonly _protocolSettings?: ProtocolSettings;
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

	/** Public getter for protocol-specific settings */
	get protocolSettings(): ProtocolSettings | undefined {
		return this._protocolSettings;
	}

	constructor(config: UnifiedIndexerConfig) {
		const { record, settings, protocolSettings, definition, rateLimit, liveCapabilities } = config;

		this.record = record;
		this.settings = settings;
		this._protocolSettings = protocolSettings;
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

		// Configure RequestBuilder with live capabilities (for Newznab)
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

			// Also override this.capabilities search modes with live caps
			// so that indexerSupportsSearchIds() uses the same source of truth
			// as RequestBuilder.filterBySupportedParams()
			this.overrideCapabilitiesWithLiveCaps(liveCapabilities);
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
		this.templateEngine.setConfigWithDefaults(settings, definition.settings ?? []);

		this.log = createChildLogger({ indexer: this.name, indexerId: this.id });

		// Create unified HTTP client
		// Use config alternateUrls (from database), fall back to definition links
		this.http = createIndexerHttp({
			indexerId: this.id,
			indexerName: this.name,
			baseUrl: this.baseUrl,
			alternateUrls: record.alternateUrls?.length
				? record.alternateUrls
				: definition.links.slice(1),
			userAgent: 'Cinephage/1.0',
			rateLimit: rateLimit ?? { requests: 30, periodMs: 60_000 },
			encoding: definition.encoding
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
					const numId = resolveCategoryId(mapping.cat);
					categories.set(numId, mapping.desc ?? mapping.cat);
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
	 * Override capabilities search modes with live Newznab caps.
	 * This ensures indexerSupportsSearchIds() uses the same source of truth
	 * as RequestBuilder.filterBySupportedParams(), preventing mismatches
	 * where YAML declares support for params the live indexer doesn't have.
	 */
	private overrideCapabilitiesWithLiveCaps(liveCaps: NewznabCapabilities): void {
		const toSearchParams = (params: string[]): SearchParam[] => {
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
				title: 'title',
				rid: 'q' // RageID not supported, map to q
			};
			return params.map((p) => mapping[p.toLowerCase()] ?? 'q');
		};

		const caps = liveCaps.searching;

		if (caps.search.available && this.capabilities.search) {
			this.capabilities.search.supportedParams = toSearchParams(caps.search.supportedParams);
		}
		if (caps.tvSearch.available && this.capabilities.tvSearch) {
			this.capabilities.tvSearch.supportedParams = toSearchParams(caps.tvSearch.supportedParams);
		}
		if (caps.movieSearch.available && this.capabilities.movieSearch) {
			this.capabilities.movieSearch.supportedParams = toSearchParams(
				caps.movieSearch.supportedParams
			);
		}
		if (caps.audioSearch.available && this.capabilities.musicSearch) {
			this.capabilities.musicSearch.supportedParams = toSearchParams(
				caps.audioSearch.supportedParams
			);
		}
		if (caps.bookSearch.available && this.capabilities.bookSearch) {
			this.capabilities.bookSearch.supportedParams = toSearchParams(
				caps.bookSearch.supportedParams
			);
		}
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
		let successfulRequests = 0;
		const requestErrors: string[] = [];

		for (const request of requests) {
			this.log.debug('Executing search request', { url: request.url, method: request.method });
			try {
				const results = await this.executeSearchRequest(request);
				allResults.push(...results);
				successfulRequests += 1;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.log.warn('Search request failed', { url: request.url, error: message });
				requestErrors.push(this.normalizeTestRequestError(message));
			}
		}

		// If all requests failed, surface the error so orchestrator can mark
		// indexer health as failed instead of treating this as a successful empty result.
		if (successfulRequests === 0 && requestErrors.length > 0) {
			const uniqueErrors = [...new Set(requestErrors.filter(Boolean))];
			throw new Error(uniqueErrors.slice(0, 2).join('; ') || 'All search requests failed');
		}

		const duration = Date.now() - startTime;
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

		this.log.info('Executing search request', {
			url: request.url,
			method: request.method,
			indexer: this.name
		});

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

		this.log.info('Search response received', {
			status: response.status,
			url: response.url,
			bodyLength: response.body.length,
			bodyPreview: response.body.substring(0, 500),
			indexer: this.name
		});

		this.http.parseAndStoreCookies(response.headers);

		const mockResponse = new Response(response.body, {
			status: response.status,
			headers: response.headers
		});

		const apiError = this.detectProviderError(response.body);
		if (apiError) {
			throw new Error(apiError);
		}

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

			const retryApiError = this.detectProviderError(retryResponse.body);
			if (retryApiError) {
				throw new Error(retryApiError);
			}

			return this.parseResponse(retryResponse.body, request.searchPath);
		}

		// Refresh cookie expiration after successful request to keep session alive
		if (Object.keys(this.cookies).length > 0) {
			const context = {
				indexerId: this.id,
				baseUrl: this.requestBuilder.getBaseUrl(),
				settings: this.settings,
				encoding: this.definition.encoding
			};
			await this.authManager.refreshCookieExpiration(context);
		}

		return this.parseResponse(response.body, request.searchPath);
	}

	/**
	 * Detect provider-specific API errors represented in successful HTTP responses.
	 * Example: Newznab returns <error code="100" description="..." /> with HTTP 200.
	 */
	private detectProviderError(content: string): string | null {
		// Newznab-compatible providers commonly return structured API errors in XML.
		if (this.definition.id === 'newznab') {
			const errorMatch = content.match(/<error\b([^>]*)\/?>/i);
			if (!errorMatch) return null;

			const attrs = errorMatch[1] ?? '';
			const codeMatch = attrs.match(/\bcode=(['"]?)([^'" >]+)\1/i);
			const descQuotedMatch = attrs.match(/\bdescription=(['"])(.*?)\1/i);
			const descBareMatch = attrs.match(/\bdescription=([^'" >]+)/i);

			const code = codeMatch?.[2] ?? 'unknown';
			const description = descQuotedMatch?.[2] ?? descBareMatch?.[1] ?? 'Unknown API error';
			return `Indexer API error ${code}: ${description}`;
		}

		return null;
	}

	/**
	 * Parse a response into release results
	 */
	private parseResponse(content: string, searchPath: unknown): ReleaseResult[] {
		this.log.info('Parsing search response', {
			indexer: this.name,
			contentLength: content.length,
			contentPreview: content.substring(0, 200)
		});

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

		this.log.info('Parse complete', {
			indexer: this.name,
			releasesFound: parseResult.releases.length,
			errors: parseResult.errors?.length ?? 0
		});

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
			settings: this.settings,
			encoding: this.definition.encoding
		};

		const hasStoredCookies = await this.authManager.loadCookies(context);
		if (hasStoredCookies) {
			this.cookies = this.authManager.getCookies();
			this.isLoggedIn = true;
			this.log.info('Loaded stored cookies', {
				indexer: this.name,
				cookieCount: Object.keys(this.cookies).length,
				cookieNames: Object.keys(this.cookies)
			});
			return;
		}

		this.log.info('Performing login', { indexer: this.name });
		const loginResult = await this.authManager.login(context);

		if (!loginResult.success) {
			this.log.error('Login failed', { indexer: this.name, error: loginResult.error });
			throw new Error(`Login failed: ${loginResult.error}`);
		}

		this.cookies = loginResult.cookies;
		this.isLoggedIn = true;

		this.log.info('Login successful', {
			indexer: this.name,
			cookieCount: Object.keys(this.cookies).length,
			cookieNames: Object.keys(this.cookies)
		});

		await this.authManager.saveCookies(context);
		this.log.debug('Cookies saved', { indexer: this.name });
	}

	/**
	 * Test connectivity to the indexer
	 */
	async test(): Promise<void> {
		this.log.debug('Testing indexer connectivity');

		try {
			if (this.isInternalStreamingIndexer()) {
				// For internal streaming indexers, validate URL settings format.
				// They don't perform remote indexer I/O, so configuration validation is the test.
				await this.validateInternalStreamingSettings();
				this.log.info('Internal streaming indexer test successful');
				return;
			}

			const testCriteria: SearchCriteria = {
				searchType: 'basic',
				query: 'test',
				limit: 1
			};

			// Ensure test will actually perform at least one HTTP request.
			// Otherwise test could return a false positive.
			const requests = this.requestBuilder.buildSearchRequests(testCriteria);
			if (requests.length === 0) {
				throw new Error('No test request could be generated for this indexer definition');
			}

			await this.ensureLoggedIn();
			let successfulRequests = 0;
			let resultCount = 0;
			const requestErrors: string[] = [];

			for (const request of requests) {
				try {
					const results = await this.executeSearchRequest(request);
					successfulRequests += 1;
					resultCount += results.length;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					requestErrors.push(this.normalizeTestRequestError(message));
				}
			}

			if (successfulRequests === 0) {
				const uniqueErrors = [...new Set(requestErrors.filter(Boolean))];
				const summary =
					uniqueErrors.length > 0
						? uniqueErrors.slice(0, 2).join('; ')
						: 'All test requests failed';
				throw new Error(summary);
			}

			this.log.info('Indexer test successful', {
				requestCount: successfulRequests,
				resultCount
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Indexer test failed', { error: message });
			throw error instanceof Error ? error : new Error(message);
		}
	}

	/**
	 * Validate settings used by the internal streaming indexer.
	 * Ensures malformed External Host values fail the connection test.
	 */
	private async validateInternalStreamingSettings(): Promise<void> {
		const rawExternalHost = this.settings.externalHost;
		if (typeof rawExternalHost !== 'string') {
			return;
		}

		const externalHost = rawExternalHost.trim();
		if (!externalHost) {
			return;
		}

		const useHttpsValue = this.settings.useHttps;
		const useHttps =
			useHttpsValue === true || (typeof useHttpsValue === 'string' && useHttpsValue === 'true');
		const defaultProtocol = useHttps ? 'https' : 'http';
		const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(externalHost);
		const candidate = hasProtocol ? externalHost : `${defaultProtocol}://${externalHost}`;

		let parsed: URL;
		try {
			parsed = new URL(candidate);
		} catch {
			throw new Error(
				'Invalid External Host format. Use hostname[:port] (example: 192.168.1.100:3000).'
			);
		}

		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new Error('Invalid External Host protocol. Only http and https are supported.');
		}

		if (!parsed.hostname) {
			throw new Error('Invalid External Host. Hostname is required.');
		}

		if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
			throw new Error('Invalid External Host. Do not include a path, query, or fragment.');
		}

		await this.probeInternalStreamingHost(parsed);
	}

	/**
	 * Probe external host reachability for internal streaming indexer config.
	 * Any HTTP response counts as reachable; network/TLS/DNS failures do not.
	 */
	private async probeInternalStreamingHost(baseUrl: URL): Promise<void> {
		const probeUrl = new URL('/api/health', baseUrl);
		const timeoutMs = 5000;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			await fetch(probeUrl.toString(), {
				method: 'GET',
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					Accept: 'application/json, text/plain, */*',
					'User-Agent': 'Cinephage/1.0'
				}
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`External Host is unreachable (${baseUrl.host}). Check host, port, and protocol. (${message})`,
				{ cause: error }
			);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Normalize low-level request errors into concise test-level messages.
	 * Avoids leaking full request URLs/query params in user-facing errors.
	 */
	private normalizeTestRequestError(message: string): string {
		const normalized = message.trim();
		const lower = normalized.toLowerCase();

		if (lower.includes('indexer api error')) {
			const apiErrorMatch = normalized.match(/Indexer API error[^;]+/i);
			return apiErrorMatch?.[0]?.trim() ?? 'Indexer API error';
		}

		if (
			lower.includes('wrong api key') ||
			lower.includes('invalid api key') ||
			lower.includes('missing api key')
		) {
			return 'Authentication failed: invalid API key';
		}

		if (
			lower.includes('fetch failed') ||
			lower.includes('all urls failed') ||
			lower.includes('econnrefused') ||
			lower.includes('enotfound') ||
			lower.includes('eai_again') ||
			lower.includes('etimedout') ||
			lower.includes('timeout') ||
			lower.includes('timed out') ||
			lower.includes('unable to reach')
		) {
			return 'Unable to reach indexer server';
		}

		if (lower.includes('cloudflare')) {
			return 'Cloudflare protection blocked the request';
		}

		if (
			lower.includes('login failed') ||
			lower.includes('authentication') ||
			lower.includes('unauthorized') ||
			lower.includes('forbidden')
		) {
			return 'Authentication failed';
		}

		return normalized;
	}

	/**
	 * Reconstruct a download URL that was redacted for security.
	 * This restores the API key from indexer settings when the URL contains [REDACTED].
	 * Handles both plain [REDACTED] and URL-encoded %5BREDACTED%5D.
	 *
	 * @param redactedUrl - The URL that may contain [REDACTED] placeholders
	 * @returns The reconstructed URL with proper API key, or the original if not redacted
	 */
	reconstructDownloadUrl(redactedUrl: string): string {
		// Check for both plain [REDACTED] and URL-encoded %5BREDACTED%5D
		const hasRedacted =
			redactedUrl && (redactedUrl.includes('[REDACTED]') || redactedUrl.includes('%5BREDACTED%5D'));

		if (!hasRedacted) {
			return redactedUrl;
		}

		const apikey = this.settings.apikey;
		if (!apikey || typeof apikey !== 'string') {
			this.log.warn('Cannot reconstruct URL: no API key in settings');
			return redactedUrl;
		}

		// For newznab-style indexers, the URL format is:
		// {baseUrl}/api?t=get&id={guid}&apikey={apikey}
		// Extract the ID and reconstruct
		const idMatch = redactedUrl.match(/[?&]id=([^&]+)/);
		if (idMatch) {
			const baseUrl = this.requestBuilder.getBaseUrl();
			const reconstructed = `${baseUrl}/api?t=get&id=${idMatch[1]}&apikey=${apikey}`;
			this.log.debug('Reconstructed redacted download URL', {
				original: redactedUrl.substring(0, 50) + '...',
				hasApiKey: true
			});
			return reconstructed;
		}

		// Fallback: try to replace [REDACTED] or %5BREDACTED%5D with actual apikey
		const reconstructed = redactedUrl
			.replace(/\[REDACTED\]/g, apikey)
			.replace(/%5BREDACTED%5D/gi, apikey);
		this.log.debug('Replaced [REDACTED] in URL with API key');
		return reconstructed;
	}

	/**
	 * Download a torrent/NZB file from the indexer
	 */
	async downloadTorrent(
		url: string,
		options?: DownloadTorrentOptions
	): Promise<IndexerDownloadResult> {
		const startTime = Date.now();

		this.log.debug('Downloading content', { url: url.substring(0, 100) });

		try {
			await this.ensureLoggedIn();
			await this.checkRateLimit();

			if (url.startsWith('magnet:')) {
				const { extractInfoHashFromMagnet } =
					await import('$lib/server/downloadClients/utils/torrentParser');
				const infoHash = await extractInfoHashFromMagnet(url);
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

			// Check if URL needs resolution (e.g., HTML page with selectors to extract magnet/torrent URL)
			// This handles indexers like Torrent Downloads that return a details page URL instead of
			// a direct torrent/magnet link. The DownloadHandler will fetch the page and extract the
			// actual download URL using CSS selectors defined in the indexer YAML definition.
			const needsRes = this.downloadHandler.needsResolution();
			this.log.debug('Checking if download needs resolution', {
				needsResolution: needsRes,
				hasDownloadBlock: !!this.definition.download,
				hasSelectors: !!this.definition.download?.selectors?.length,
				selectorsCount: this.definition.download?.selectors?.length ?? 0
			});
			if (needsRes) {
				const context = {
					baseUrl: this.requestBuilder.getBaseUrl(),
					cookies: this.cookies,
					settings: this.settings,
					encoding: this.definition.encoding,
					releaseDetailsUrl: options?.releaseDetailsUrl ?? url,
					releaseGuid: options?.releaseGuid,
					releaseTitle: options?.releaseTitle
				};

				this.log.debug('Calling resolveDownload', {
					url: url.substring(0, 80),
					baseUrl: context.baseUrl,
					hasSettings: Object.keys(context.settings).length > 0,
					settingsKeys: Object.keys(context.settings)
				});

				const resolution = await this.downloadHandler.resolveDownload(url, context);

				this.log.debug('Resolution result', {
					success: resolution.success,
					hasMagnetUrl: !!resolution.magnetUrl,
					hasRequestUrl: !!resolution.request?.url,
					error: resolution.error
				});

				if (resolution.success) {
					// If resolution returned a magnet URL, use it directly
					if (resolution.magnetUrl) {
						this.log.debug('Resolved download URL to magnet', {
							original: url.substring(0, 50),
							magnetHash: resolution.magnetUrl.substring(0, 60)
						});
						const { extractInfoHashFromMagnet } =
							await import('$lib/server/downloadClients/utils/torrentParser');
						const infoHash = await extractInfoHashFromMagnet(resolution.magnetUrl);
						return {
							success: true,
							magnetUrl: resolution.magnetUrl,
							infoHash,
							responseTimeMs: Date.now() - startTime
						};
					}

					// If resolution already has cached torrent data (from testTorrentLink validation),
					// use it directly — avoids a redundant second fetch that would fail with
					// one-time download tokens (e.g., nCore's &key= parameter)
					if (resolution.torrentData) {
						this.log.debug('Using cached torrent data from resolution', {
							dataSize: resolution.torrentData.length
						});

						if (this.protocol === 'usenet') {
							return {
								success: true,
								data: resolution.torrentData,
								responseTimeMs: Date.now() - startTime
							};
						}

						const { parseTorrentFile } =
							await import('$lib/server/downloadClients/utils/torrentParser');
						const parseResult = await parseTorrentFile(resolution.torrentData);

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

						return {
							success: true,
							data: resolution.torrentData,
							infoHash: parseResult.infoHash,
							responseTimeMs: Date.now() - startTime
						};
					}

					// If resolution returned a different URL, use that for fetching
					if (resolution.request?.url && resolution.request.url !== url) {
						this.log.debug('Resolved download URL', {
							original: url.substring(0, 50),
							resolved: resolution.request.url.substring(0, 50)
						});
						url = resolution.request.url;

						// Check if the resolved URL is a magnet link
						if (url.startsWith('magnet:')) {
							const { extractInfoHashFromMagnet } =
								await import('$lib/server/downloadClients/utils/torrentParser');
							const infoHash = await extractInfoHashFromMagnet(url);
							return {
								success: true,
								magnetUrl: url,
								infoHash,
								responseTimeMs: Date.now() - startTime
							};
						}
					}
				} else {
					this.log.warn('Download URL resolution failed, trying direct fetch', {
						error: resolution.error
					});
					// Continue with original URL as fallback
				}
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
						const infoHash = await extractInfoHashFromMagnet(location);
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
				return {
					success: true,
					data,
					responseTimeMs: Date.now() - startTime
				};
			}

			// For torrent, parse the file
			const { parseTorrentFile } = await import('$lib/server/downloadClients/utils/torrentParser');
			const parseResult = await parseTorrentFile(data);

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

			return {
				success: true,
				data,
				infoHash: parseResult.infoHash,
				responseTimeMs: Date.now() - startTime
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Download failed', { error: message });
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
