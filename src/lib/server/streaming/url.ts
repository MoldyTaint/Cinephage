/**
 * URL Utilities
 *
 * Provides consistent base URL resolution for .strm files and proxy URLs.
 * This ensures URLs work correctly when accessed from external devices.
 */

import { getStreamingIndexerSettings } from './settings';
import { logger } from '$lib/logging';

// Cache the database baseUrl to avoid repeated DB queries on every request
let cachedBaseUrl: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

const streamLog = { logCategory: 'streams' as const };

/**
 * Check if a URL is a localhost/loopback address that won't work for external clients.
 */
function isLocalhostUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();
		return (
			host === 'localhost' ||
			host === '127.0.0.1' ||
			host === '::1' ||
			host === '[::1]' ||
			host.startsWith('127.')
		);
	} catch {
		return false;
	}
}

/**
 * Get the base URL for generating stream URLs (synchronous version).
 * Uses cached database value, falls back to request-based resolution.
 *
 * Priority:
 * 1. Cached database baseUrl (from Cinephage Stream indexer settings)
 * 2. X-Forwarded headers (for reverse proxy setups like nginx/traefik)
 * 3. Request URL (fallback to request origin)
 *
 * @param request - The incoming request object
 * @returns The base URL to use for generating stream/proxy URLs
 */
export function getBaseUrl(request: Request): string {
	// 1. Check cached database value
	if (cachedBaseUrl && Date.now() < cacheExpiry) {
		return cachedBaseUrl;
	}

	// 2. Check for reverse proxy headers
	const forwardedHost = request.headers.get('x-forwarded-host');
	const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';

	if (forwardedHost) {
		return `${forwardedProto}://${forwardedHost}`;
	}

	// 3. Fallback to request URL origin
	const url = new URL(request.url);
	return `${url.protocol}//${url.host}`;
}

/**
 * Get the base URL for generating stream URLs (async version).
 * Fetches from database and updates cache.
 *
 * Priority:
 * 1. Database baseUrl (from Cinephage Stream indexer settings)
 * 2. X-Forwarded headers (for reverse proxy setups like nginx/traefik)
 * 3. Request URL (fallback to request origin)
 *
 * Note: Localhost URLs will work for local testing but not for external clients.
 * Users should configure an external URL in the Cinephage Stream indexer settings
 * for streaming to work from external devices.
 *
 * @param request - The incoming request object
 * @returns The base URL to use for generating stream/proxy URLs
 */
export async function getBaseUrlAsync(request: Request): Promise<string> {
	// 1. Check database settings (and update cache)
	const settings = await getStreamingIndexerSettings();
	if (settings?.baseUrl) {
		const baseUrl = settings.baseUrl.replace(/\/$/, '');

		// Warn about localhost but allow it (useful for local testing)
		if (isLocalhostUrl(baseUrl)) {
			logger.warn(
				'Streaming base URL is set to localhost - this will not work for external clients',
				{
					configuredUrl: baseUrl,
					hint: 'Configure External Host in Settings -> Integrations -> Indexers -> Cinephage Stream',
					...streamLog
				}
			);
		}

		cachedBaseUrl = baseUrl;
		cacheExpiry = Date.now() + CACHE_TTL_MS;
		return baseUrl;
	}

	// 2. Check for reverse proxy headers
	const forwardedHost = request.headers.get('x-forwarded-host');
	const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';

	if (forwardedHost) {
		const proxyUrl = `${forwardedProto}://${forwardedHost}`;
		return proxyUrl;
	}

	// 3. Fallback to request URL origin
	const url = new URL(request.url);
	const fallbackUrl = `${url.protocol}//${url.host}`;

	if (isLocalhostUrl(fallbackUrl)) {
		logger.warn('Using localhost URL for streaming - configure External Host for external access', {
			requestUrl: request.url,
			hint: 'Settings -> Integrations -> Indexers -> Cinephage Stream',
			...streamLog
		});
	}

	return fallbackUrl;
}

/**
 * Refresh the cached base URL from database.
 * Call this on startup or when settings change.
 */
export async function refreshBaseUrlCache(): Promise<void> {
	const settings = await getStreamingIndexerSettings();
	if (settings?.baseUrl) {
		cachedBaseUrl = settings.baseUrl.replace(/\/$/, '');
		cacheExpiry = Date.now() + CACHE_TTL_MS;
	}
}
