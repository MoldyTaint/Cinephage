import { createIndexerHttp } from '$lib/server/indexers/http';
import type { IndexerHttp } from '$lib/server/indexers/http';
import { logger } from '$lib/logging';
import type { CinephageSettingsService } from '../settings/CinephageSettingsService.js';
import { getCinephageSettingsService } from '../settings/CinephageSettingsService.js';
import { getServerIdentity, type CinephageServerIdentity } from './version.js';

/**
 * CinephageCore — the single owner of the api.cinephage.net connection.
 *
 * Responsibilities:
 *   - Hold the shared IndexerHttp instance (rate-limited, retrying)
 *   - Resolve the running server's identity (version + commit) for headers
 *   - Expose request() that auto-injects base URL + X-Cinephage-* headers
 *
 * This is the canonical replacement for the four duplicated API clients that
 * existed before (CinephageApiService, CinephageBackendClient, the IPTV
 * provider's inline fetcher, the cinephage-iptv/countries route's inline
 * fetcher). All api.cinephage.net traffic in the codebase should route
 * through this object.
 */
export class CinephageCore {
	private readonly http: IndexerHttp;
	private readonly settings: CinephageSettingsService;

	constructor(settings: CinephageSettingsService = getCinephageSettingsService()) {
		this.settings = settings;
		// Synthetic indexerId for rate-limit keying — this client is shared
		// across all modules and doesn't correspond to a real indexer row.
		this.http = createIndexerHttp({
			indexerId: 'cinephage-api',
			indexerName: 'Cinephage API',
			baseUrl: 'https://api.cinephage.net',
			rateLimit: { requests: 60, periodMs: 60_000 },
			defaultTimeout: 30_000,
			retry: { maxRetries: 2, initialDelayMs: 500 }
		});
	}

	/** The shared HTTP client. Modules use this directly for non-trivial requests. */
	getHttpClient(): IndexerHttp {
		return this.http;
	}

	/** Subsystem enabled state from settings. */
	async isEnabled(): Promise<boolean> {
		const config = await this.settings.getConfig();
		return config.enabled;
	}

	/** Configured base URL (defaults to https://api.cinephage.net). */
	async getBaseUrl(): Promise<string> {
		const config = await this.settings.getConfig();
		return config.baseUrl;
	}

	/**
	 * Resolved server identity (version + commit). Applies override fields
	 * from settings, then falls back to APP_VERSION / APP_COMMIT env vars.
	 */
	async getIdentity(): Promise<CinephageServerIdentity> {
		const config = await this.settings.getConfig();
		return getServerIdentity({
			versionOverride: config.versionOverride,
			commitOverride: config.commitOverride
		});
	}

	/**
	 * Build the X-Cinephage-* auth headers. Empty object when identity is
	 * not fully resolvable (e.g. APP_COMMIT missing in a dev checkout).
	 */
	async getAuthHeaders(): Promise<Record<string, string>> {
		const identity = await this.getIdentity();
		if (!identity.isConfigured || !identity.commit) {
			logger.debug(
				{ version: identity.version, commit: identity.commit },
				'CinephageCore identity not fully configured — omitting auth headers'
			);
			return {};
		}
		return {
			'X-Cinephage-Version': identity.version,
			'X-Cinephage-Commit': identity.commit
		};
	}

	/**
	 * Issue a GET request to a path under the configured base URL with the
	 * X-Cinephage-* auth headers automatically injected. Callers pass a path
	 * like '/api/v1/iptv/countries'; the base URL prefix is added here.
	 *
	 * For requests that need custom auth, query params, or non-GET methods,
	 * call getHttpClient() directly and assemble headers via getAuthHeaders().
	 */
	async get(path: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) {
		const baseUrl = await this.getBaseUrl();
		const authHeaders = await this.getAuthHeaders();
		const url = new URL(path, baseUrl + (baseUrl.endsWith('/') ? '' : '/')).toString();
		return this.http.get(url, {
			headers: { Accept: 'application/json', ...authHeaders, ...(init?.headers ?? {}) },
			signal: init?.signal
		});
	}
}

// Singleton management (matches codebase convention)
let _instance: CinephageCore | null = null;

export function getCinephageCore(): CinephageCore {
	if (!_instance) {
		_instance = new CinephageCore();
	}
	return _instance;
}

export function resetCinephageCore(): void {
	_instance = null;
}
