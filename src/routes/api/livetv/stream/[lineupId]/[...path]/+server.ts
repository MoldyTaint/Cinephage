/**
 * Live TV Segment Proxy
 *
 * Proxies HLS segments and sub-playlists for Live TV streams.
 * Handles URL rewriting for nested playlists and passes through segment data.
 *
 * KEY FEATURE: Automatic stream URL refresh when tokens expire.
 * Based on Stalkerhek pattern - validates and refreshes URLs on each request.
 *
 * GET /api/livetv/stream/:lineupId/:path?url=<encoded_url>
 */

import type { RequestHandler } from './$types';
import { getBaseUrlAsync } from '$lib/server/streaming/url';
import { resolveAndValidateUrl, fetchWithTimeout } from '$lib/server/http/ssrf-protection';
import {
	getStreamUrlCache,
	HLS_STREAM_TIMEOUT_MS
} from '$lib/server/livetv/streaming/StreamUrlCache.js';
import { rewriteHlsPlaylistUrls } from '$lib/server/streaming/utils/hls-rewrite.js';
import { STB_USER_AGENT } from '$lib/server/livetv/stalker/StalkerPortalClient.js';
import { logger } from '$lib/logging';

// Streaming constants
const LIVETV_SEGMENT_FETCH_TIMEOUT_MS = 15000; // Fail faster for quicker retry/failover
const LIVETV_SEGMENT_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const LIVETV_SEGMENT_CACHE_MAX_AGE = 60; // Segments are immutable once created
const LIVETV_MAX_RETRIES = 3;
const LIVETV_RETRY_BASE_DELAY_MS = 1000;

/**
 * Fetch with retry logic for transient errors
 * Includes automatic URL refresh on authentication failures (403)
 */
async function fetchWithRetry(
	url: string,
	options: RequestInit,
	lineupId: string,
	maxRetries: number = LIVETV_MAX_RETRIES,
	allowUrlRefresh: boolean = true
): Promise<Response> {
	let lastError: Error | null = null;
	const urlCache = getStreamUrlCache();

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetchWithTimeout(url, options, LIVETV_SEGMENT_FETCH_TIMEOUT_MS);

			// Handle 403 Forbidden - likely expired token
			if (response.status === 403 && allowUrlRefresh && attempt < maxRetries) {
				logger.warn('[LiveTV Segment] Got 403, refreshing stream URL', {
					lineupId,
					attempt: attempt + 1
				});

				// Refresh the URL and retry
				const refreshed = await urlCache.refreshStream(lineupId);
				url = refreshed.url;

				// Update headers with new provider headers if available
				if (refreshed.providerHeaders) {
					options.headers = getStreamHeaders(refreshed.providerHeaders);
				}

				// Retry immediately with new URL
				continue;
			}

			// Only retry on 5xx server errors
			if (response.status >= 500 && attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, LIVETV_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on abort (timeout)
			if (lastError.name === 'AbortError') {
				throw new Error(`Segment fetch timeout`, { cause: error });
			}

			if (attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, LIVETV_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
			}
		}
	}

	throw lastError ?? new Error('Segment fetch failed');
}

/**
 * Get headers for upstream requests, merging provider-specific headers if available
 * Provider headers take priority over defaults (e.g., cookies for Stalker portals)
 */
function getStreamHeaders(providerHeaders?: Record<string, string>): HeadersInit {
	return {
		'User-Agent': STB_USER_AGENT,
		Accept: '*/*',
		'Accept-Encoding': 'identity',
		Connection: 'keep-alive',
		...providerHeaders
	};
}

/**
 * Allowed header names that can be passed through from provider headers.
 * This prevents injection of security-sensitive headers like Host, Authorization, etc.
 */
const ALLOWED_PROVIDER_HEADERS = new Set([
	'cookie',
	'user-agent',
	'referer',
	'accept',
	'accept-language',
	'accept-encoding',
	'x-forwarded-for',
	'x-real-ip'
]);

/**
 * Decode provider headers from base64-encoded query parameter.
 * Returns undefined if not present or invalid.
 * Filters to only allowed header names to prevent header injection.
 */
function decodeProviderHeaders(encoded: string | null): Record<string, string> | undefined {
	if (!encoded) return undefined;
	try {
		const json = atob(encoded);
		const headers = JSON.parse(json);
		if (typeof headers === 'object' && headers !== null && !Array.isArray(headers)) {
			// Filter to allowed headers only
			const filtered: Record<string, string> = {};
			for (const [key, value] of Object.entries(headers)) {
				if (
					ALLOWED_PROVIDER_HEADERS.has(key.toLowerCase()) &&
					typeof value === 'string' &&
					!value.includes('\r') &&
					!value.includes('\n')
				) {
					filtered[key] = value;
				}
			}
			return Object.keys(filtered).length > 0 ? filtered : undefined;
		}
	} catch {
		// Invalid base64 or JSON - ignore silently
	}
	return undefined;
}

/**
 * Encode provider headers as a base64 string for embedding in URLs.
 * Returns undefined if no headers to encode.
 */
function encodeProviderHeaders(headers?: Record<string, string>): string | undefined {
	if (!headers || Object.keys(headers).length === 0) return undefined;
	return btoa(JSON.stringify(headers));
}

/**
 * Build a LiveTV segment proxy URL builder for the shared HLS rewriter.
 */
function makeLiveTvProxyUrlBuilder(
	baseUrl: string,
	lineupId: string,
	encodedHeaders?: string
): (absoluteUrl: string, isSegment: boolean) => string {
	return (absoluteUrl: string, isSegment: boolean): string => {
		const extension = isSegment ? 'ts' : 'm3u8';
		let proxyUrl = `${baseUrl}/api/livetv/stream/${lineupId}/segment.${extension}?url=${encodeURIComponent(absoluteUrl)}`;
		if (encodedHeaders) {
			proxyUrl += `&h=${encodeURIComponent(encodedHeaders)}`;
		}
		return proxyUrl;
	};
}

/**
 * Validate and potentially refresh stream URL before use
 * Based on Stalkerhek pattern - checks URL age and refreshes if stale
 */
async function validateAndRefreshUrl(
	lineupId: string,
	originalUrl: string,
	providerHeaders?: Record<string, string>
): Promise<{ url: string; headers: Record<string, string> }> {
	const urlCache = getStreamUrlCache();
	const cached = urlCache.getCached(lineupId);

	// Check if we have a cached entry and if the URL matches
	if (cached && cached.url === originalUrl) {
		// Check if still valid
		if (urlCache.isValid(cached)) {
			logger.debug('[LiveTV Segment] Using valid cached URL', {
				lineupId,
				age: Date.now() - cached.createdAt
			});
			return { url: originalUrl, headers: providerHeaders || {} };
		}

		// URL is stale - refresh it
		logger.info('[LiveTV Segment] Stream URL expired, refreshing', {
			lineupId,
			age: Date.now() - cached.createdAt,
			maxAge: cached.type === 'hls' ? HLS_STREAM_TIMEOUT_MS : 5000
		});

		const refreshed = await urlCache.refreshStream(lineupId);
		return {
			url: refreshed.url,
			headers: refreshed.providerHeaders || {}
		};
	}

	// No cached entry or URL doesn't match cache - just use provided URL
	return { url: originalUrl, headers: providerHeaders || {} };
}

export const GET: RequestHandler = async ({ params, url, request }) => {
	const { lineupId, path } = params;

	// Get segment URL from query parameter
	const segmentUrl = url.searchParams.get('url');
	if (!segmentUrl) {
		return new Response(JSON.stringify({ error: 'Missing segment URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Note: url.searchParams.get() already returns decoded value
	// Do NOT call decodeURIComponent again - it would double-decode and corrupt URLs
	let decodedUrl = segmentUrl;

	// Decode provider-specific headers from query param (forwarded from main proxy)
	const encodedHeaders = url.searchParams.get('h');
	let providerHeaders = decodeProviderHeaders(encodedHeaders);

	// Validate and refresh URL if needed (Stalkerhek pattern)
	try {
		const validated = await validateAndRefreshUrl(lineupId, decodedUrl, providerHeaders);
		decodedUrl = validated.url;
		providerHeaders = validated.headers;
	} catch (error) {
		logger.error('[LiveTV Segment] Failed to validate/refresh stream URL', error, { lineupId });
		return new Response(JSON.stringify({ error: 'Failed to refresh stream URL' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// SSRF protection (with DNS resolution)
	const safetyCheck = await resolveAndValidateUrl(decodedUrl);
	if (!safetyCheck.safe) {
		logger.warn('[LiveTV Segment] Blocked unsafe URL', {
			lineupId,
			reason: safetyCheck.reason
		});
		return new Response(JSON.stringify({ error: 'URL blocked', reason: safetyCheck.reason }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		// Follow redirects manually to validate each redirect target for SSRF
		let currentUrl = decodedUrl;
		let redirectCount = 0;
		const MAX_SEGMENT_REDIRECTS = 5;
		const visitedUrls = new Set<string>();
		let response: Response;

		while (true) {
			if (visitedUrls.has(currentUrl)) {
				logger.warn('[LiveTV Segment] Redirect loop detected', { lineupId, url: currentUrl });
				return new Response(JSON.stringify({ error: 'Redirect loop detected' }), {
					status: 508,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			visitedUrls.add(currentUrl);

			if (redirectCount >= MAX_SEGMENT_REDIRECTS) {
				logger.warn('[LiveTV Segment] Max redirects exceeded', { lineupId });
				return new Response(JSON.stringify({ error: 'Too many redirects' }), {
					status: 508,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			response = await fetchWithRetry(
				currentUrl,
				{
					headers: getStreamHeaders(providerHeaders),
					redirect: 'manual'
				},
				lineupId
			);

			// Handle redirects with SSRF validation
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (location) {
					const redirectUrl = new URL(location, currentUrl).toString();
					const redirectSafetyCheck = await resolveAndValidateUrl(redirectUrl);
					if (!redirectSafetyCheck.safe) {
						logger.warn('[LiveTV Segment] Blocked unsafe redirect', {
							lineupId,
							url: redirectUrl,
							reason: redirectSafetyCheck.reason
						});
						return new Response(
							JSON.stringify({
								error: 'Redirect target not allowed',
								reason: redirectSafetyCheck.reason
							}),
							{ status: 403, headers: { 'Content-Type': 'application/json' } }
						);
					}
					currentUrl = redirectUrl;
					redirectCount++;
					continue;
				}
			}

			// Not a redirect, break out of loop
			break;
		}

		if (!response.ok) {
			return new Response(JSON.stringify({ error: `Segment fetch failed: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Check content length before reading
		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			const size = parseInt(contentLength, 10);
			if (size > LIVETV_SEGMENT_MAX_SIZE) {
				logger.warn('[LiveTV Segment] Segment too large', {
					lineupId,
					size,
					maxSize: LIVETV_SEGMENT_MAX_SIZE
				});
				return new Response(JSON.stringify({ error: 'Segment too large' }), {
					status: 413,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		const contentType = response.headers.get('content-type') || '';

		// Check if this is a nested playlist that needs rewriting
		const isPlaylist =
			contentType.includes('mpegurl') ||
			contentType.includes('m3u8') ||
			path?.endsWith('.m3u8') ||
			decodedUrl.toLowerCase().includes('.m3u8');

		if (isPlaylist) {
			const playlist = await response.text();

			if (playlist.includes('#EXTM3U')) {
				const baseUrl = await getBaseUrlAsync(request);
				// Pass through provider headers so nested sub-playlists/segments also get them
				const rewritten = rewriteHlsPlaylistUrls(
					playlist,
					decodedUrl,
					makeLiveTvProxyUrlBuilder(baseUrl, lineupId, encodeProviderHeaders(providerHeaders))
				);

				return new Response(rewritten, {
					status: 200,
					headers: {
						'Content-Type': 'application/vnd.apple.mpegurl',
						'Accept-Ranges': 'none',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
						'Access-Control-Allow-Headers': 'Range, Content-Type',
						'Cache-Control': 'no-cache',
						'X-Content-Type-Options': 'nosniff'
					}
				});
			}
		}

		// Read segment data
		const arrayBuffer = await response.arrayBuffer();

		// Detect actual content type from bytes if needed
		const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
		let actualContentType = contentType;

		if (!actualContentType || actualContentType === 'application/octet-stream') {
			// MPEG-TS sync byte
			if (firstBytes[0] === 0x47) {
				actualContentType = 'video/mp2t';
			}
			// fMP4 box header
			else if (firstBytes[0] === 0x00 && firstBytes[1] === 0x00 && firstBytes[2] === 0x00) {
				actualContentType = 'video/mp4';
			}
			// AAC ADTS header
			else if (firstBytes[0] === 0xff && (firstBytes[1] & 0xf0) === 0xf0) {
				actualContentType = 'audio/aac';
			}
		}

		return new Response(arrayBuffer, {
			status: 200,
			headers: {
				'Content-Type': actualContentType || 'video/mp2t',
				'Content-Length': arrayBuffer.byteLength.toString(),
				'Accept-Ranges': 'none',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
				'Access-Control-Allow-Headers': 'Range, Content-Type',
				'Cache-Control': `public, max-age=${LIVETV_SEGMENT_CACHE_MAX_AGE}`,
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		logger.error('[LiveTV Segment] Segment proxy failed', error, {
			lineupId,
			url: decodedUrl.substring(0, 100)
		});
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : 'Segment proxy error' }),
			{
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

export const HEAD: RequestHandler = async ({ params, url }) => {
	const segmentUrl = url.searchParams.get('url');

	if (!segmentUrl) {
		return new Response(null, { status: 400 });
	}

	// Determine content type from URL pattern
	const isPlaylist = segmentUrl.toLowerCase().includes('.m3u8') || params.path?.endsWith('.m3u8');
	const contentType = isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t';

	return new Response(null, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Accept-Ranges': 'none',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type',
			'Cache-Control': isPlaylist ? 'no-cache' : `public, max-age=${LIVETV_SEGMENT_CACHE_MAX_AGE}`,
			'X-Content-Type-Options': 'nosniff'
		}
	});
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
