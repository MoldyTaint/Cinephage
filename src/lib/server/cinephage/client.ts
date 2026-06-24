import { createIndexerHttp } from '$lib/server/indexers/http';
import { getCinephageBackendConfig, type CinephageBackendConfig } from './config.js';

export interface CinephageRequestOptions {
	method?: 'GET' | 'POST';
	query?: Record<string, string | number | string[] | undefined>;
	body?: string | URLSearchParams;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	accept?: string;
}

export interface CinephageRawResponse {
	status: number;
	body: string;
	url: string;
}

const http = createIndexerHttp({
	indexerId: 'cinephage-api',
	indexerName: 'Cinephage API',
	baseUrl: 'https://api.cinephage.net',
	rateLimit: { requests: 60, periodMs: 60_000 },
	defaultTimeout: 30_000,
	retry: { maxRetries: 2, initialDelayMs: 500 }
});

function buildUrl(baseUrl: string, path: string, query?: CinephageRequestOptions['query']): string {
	const normalizedBase = baseUrl.replace(/\/$/, '');
	const url = new URL(`${normalizedBase}${path}`);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined) {
				continue;
			}
			if (Array.isArray(value)) {
				for (const entry of value) {
					url.searchParams.append(key, entry);
				}
			} else {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url.toString();
}

export async function cinephageRequestWithConfig(
	config: CinephageBackendConfig,
	path: string,
	options: CinephageRequestOptions = {}
): Promise<CinephageRawResponse> {
	const headers: Record<string, string> = {
		Accept: options.accept ?? 'application/json',
		...options.headers
	};

	if (config.version && config.commit) {
		headers['X-Cinephage-Version'] = config.version;
		headers['X-Cinephage-Commit'] = config.commit;
	}

	const url = buildUrl(config.baseUrl, path, options.query);

	const response =
		options.method === 'POST'
			? await http.post(url, options.body ?? '', { headers, signal: options.signal })
			: await http.get(url, { headers, signal: options.signal });

	return { status: response.status, body: response.body, url: response.url };
}

export async function cinephageRequest(
	path: string,
	options: CinephageRequestOptions = {}
): Promise<CinephageRawResponse> {
	const config = await getCinephageBackendConfig();
	return cinephageRequestWithConfig(config, path, options);
}

export async function cinephageHealth(): Promise<boolean> {
	const config = await getCinephageBackendConfig();
	try {
		await cinephageRequestWithConfig(config, '/api/v1/health');
		return true;
	} catch {
		return false;
	}
}
