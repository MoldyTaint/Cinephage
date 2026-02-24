/**
 * HLS Stream Proxy
 *
 * Proxies HLS streams and their segments with proper referer headers.
 * This is essential for streams which require the referer header
 * on ALL requests (master.txt, playlists, and segments).
 *
 * Features:
 * - SSRF protection (blocks private IPs)
 * - Timeout handling (configurable, default 30s)
 * - Content size limits (configurable, default 50MB)
 * - Retry logic for transient 5xx errors
 * - Domain-based referer inference
 *
 * GET /api/streaming/proxy?url=<encoded_url>&referer=<encoded_referer>
 */

import type { RequestHandler } from './$types';
import { getBaseUrlAsync } from '$lib/server/streaming';
import { logger } from '$lib/logging';
import {
	PROXY_FETCH_TIMEOUT_MS,
	PROXY_SEGMENT_MAX_SIZE,
	PROXY_MAX_RETRIES,
	DEFAULT_PROXY_REFERER,
	PROXY_REFERER_MAP
} from '$lib/server/streaming/constants';
import { validatePlaylist, sanitizePlaylist, isHLSPlaylist } from '$lib/server/streaming/hls';
import {
	resolveAndValidateUrl,
	fetchWithTimeout,
	MAX_REDIRECTS
} from '$lib/server/http/ssrf-protection';
import { rewriteHlsPlaylistUrls } from '$lib/server/streaming/utils/hls-rewrite.js';

const streamLog = { logCategory: 'streams' as const };

/**
 * Read response body with a maximum size limit.
 * Throws if the response exceeds maxBytes (protects against responses
 * without Content-Length header).
 */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<ArrayBuffer> {
	if (!response.body) {
		return new ArrayBuffer(0);
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalSize = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalSize += value.byteLength;
		if (totalSize > maxBytes) {
			reader.cancel();
			throw new Error(`Response body exceeds ${maxBytes} bytes`);
		}
		chunks.push(value);
	}

	// Combine chunks into a single ArrayBuffer
	const result = new Uint8Array(totalSize);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result.buffer;
}

/**
 * Infer the appropriate referer based on stream URL domain
 */
function inferReferer(url: string): string {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		for (const [key, referer] of Object.entries(PROXY_REFERER_MAP)) {
			if (hostname.includes(key)) {
				return referer;
			}
		}
	} catch {
		// Ignore parse errors
	}
	return DEFAULT_PROXY_REFERER;
}

/**
 * Fetch with retry logic for transient 5xx errors
 */
async function fetchWithRetry(
	url: string,
	options: RequestInit,
	maxRetries: number = PROXY_MAX_RETRIES
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetchWithTimeout(url, options);

			// Only retry on 5xx server errors
			if (response.status >= 500 && attempt < maxRetries) {
				logger.debug('Proxy retrying after 5xx', {
					url: url.substring(0, 100),
					status: response.status,
					attempt: attempt + 1,
					...streamLog
				});
				await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on abort (timeout) - those are intentional
			if (lastError.name === 'AbortError') {
				throw new Error(`Proxy timeout after ${PROXY_FETCH_TIMEOUT_MS}ms`, { cause: error });
			}

			if (attempt < maxRetries) {
				logger.debug('Proxy retrying after error', {
					url: url.substring(0, 100),
					error: lastError.message,
					attempt: attempt + 1,
					...streamLog
				});
				await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
			}
		}
	}

	throw lastError ?? new Error('Fetch failed after retries');
}

export const GET: RequestHandler = async ({ url, request }) => {
	const targetUrl = url.searchParams.get('url');
	const baseUrl = await getBaseUrlAsync(request);

	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Note: url.searchParams.get() already returns decoded value
	// Do NOT call decodeURIComponent again - it would double-decode and corrupt URLs
	const decodedUrl = targetUrl;

	// Use provided referer, or infer from stream URL domain
	const referer = url.searchParams.get('referer') || inferReferer(decodedUrl);

	try {
		// SSRF protection: validate URL is safe before proxying (includes DNS resolution)
		const safetyCheck = await resolveAndValidateUrl(decodedUrl);
		if (!safetyCheck.safe) {
			logger.warn('Blocked unsafe URL', {
				url: decodedUrl,
				reason: safetyCheck.reason,
				logCategory: 'streams'
			});
			return new Response(
				JSON.stringify({ error: 'URL not allowed', reason: safetyCheck.reason }),
				{ status: 403, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Note: Don't send Origin header - some CDNs reject it
		const headers: HeadersInit = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			Accept: '*/*',
			'Accept-Encoding': 'identity',
			Referer: referer
		};

		// Follow redirects with loop protection
		let currentUrl = decodedUrl;
		let redirectCount = 0;
		const visitedUrls = new Set<string>();
		let response: Response;

		while (true) {
			// Check for redirect loop
			if (visitedUrls.has(currentUrl)) {
				logger.warn('Redirect loop detected', { url: currentUrl, logCategory: 'streams' });
				return new Response(JSON.stringify({ error: 'Redirect loop detected' }), {
					status: 508,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			visitedUrls.add(currentUrl);

			// Check redirect limit
			if (redirectCount >= MAX_REDIRECTS) {
				logger.warn('Max redirects exceeded', {
					url: decodedUrl,
					maxRedirects: MAX_REDIRECTS,
					logCategory: 'streams'
				});
				return new Response(
					JSON.stringify({ error: 'Too many redirects', maxRedirects: MAX_REDIRECTS }),
					{ status: 508, headers: { 'Content-Type': 'application/json' } }
				);
			}

			response = await fetchWithRetry(currentUrl, {
				headers,
				redirect: 'manual'
			});

			// Handle redirects
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (location) {
					const redirectUrl = new URL(location, currentUrl).toString();

					// Validate redirect target for SSRF (with DNS resolution)
					const redirectSafetyCheck = await resolveAndValidateUrl(redirectUrl);
					if (!redirectSafetyCheck.safe) {
						logger.warn('Blocked unsafe redirect', {
							url: redirectUrl,
							reason: redirectSafetyCheck.reason,
							logCategory: 'streams'
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
			return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const contentType = response.headers.get('content-type') || '';

		// Check content length before reading into memory
		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			const size = parseInt(contentLength, 10);
			if (size > PROXY_SEGMENT_MAX_SIZE) {
				logger.warn('Segment too large', {
					url: decodedUrl.substring(0, 100),
					size,
					maxSize: PROXY_SEGMENT_MAX_SIZE,
					...streamLog
				});
				return new Response(
					JSON.stringify({
						error: 'Segment too large',
						size,
						maxSize: PROXY_SEGMENT_MAX_SIZE
					}),
					{ status: 413, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		// Read body with size enforcement (protects against missing Content-Length)
		let arrayBuffer: ArrayBuffer;
		try {
			arrayBuffer = await readBodyWithLimit(response, PROXY_SEGMENT_MAX_SIZE);
		} catch {
			return new Response(
				JSON.stringify({
					error: 'Segment too large',
					maxSize: PROXY_SEGMENT_MAX_SIZE
				}),
				{ status: 413, headers: { 'Content-Type': 'application/json' } }
			);
		}
		const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
		const isMpegTs = firstBytes[0] === 0x47;
		const isFmp4 = firstBytes[0] === 0x00 && firstBytes[1] === 0x00 && firstBytes[2] === 0x00;
		const isVideoData = isMpegTs || isFmp4;

		const isPlaylist =
			!isVideoData &&
			(contentType.includes('mpegurl') ||
				decodedUrl.includes('.m3u8') ||
				decodedUrl.includes('.txt') ||
				(contentType.includes('text') && !decodedUrl.includes('.html')));

		if (isPlaylist) {
			let text = new TextDecoder().decode(arrayBuffer);

			// Validate and sanitize the HLS playlist
			if (isHLSPlaylist(text)) {
				const validation = validatePlaylist(text);

				if (!validation.valid) {
					// Try sanitization first
					const sanitized = sanitizePlaylist(text);
					const revalidation = validatePlaylist(sanitized);

					if (revalidation.valid) {
						logger.debug('HLS playlist sanitized successfully', {
							url: decodedUrl.substring(0, 100),
							originalErrors: validation.errors,
							...streamLog
						});
						text = sanitized;
					} else {
						// Still invalid after sanitization - return error
						logger.warn('HLS playlist validation failed', {
							url: decodedUrl.substring(0, 100),
							errors: validation.errors,
							...streamLog
						});
						return new Response(
							JSON.stringify({
								error: 'Invalid HLS playlist',
								details: validation.errors
							}),
							{ status: 502, headers: { 'Content-Type': 'application/json' } }
						);
					}
				}

				// Log warnings for valid but potentially problematic playlists
				if (validation.warnings.length > 0) {
					logger.debug('HLS playlist warnings', {
						url: decodedUrl.substring(0, 100),
						warnings: validation.warnings,
						type: validation.type,
						...streamLog
					});
				}
			}

			const rewrittenPlaylist = rewriteHlsPlaylistUrls(
				text,
				decodedUrl,
				(absoluteUrl: string, isSegment: boolean): string => {
					const extension = isSegment ? 'ts' : 'm3u8';
					return `${baseUrl}/api/streaming/proxy/segment.${extension}?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}`;
				}
			);
			// Ensure VOD markers are present so players start from beginning
			const vodPlaylist = ensureVodPlaylist(rewrittenPlaylist);

			return new Response(vodPlaylist, {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.apple.mpegurl',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Range, Content-Type',
					'Cache-Control': 'public, max-age=300'
				}
			});
		}

		let actualContentType = 'video/mp2t';
		if (isMpegTs) {
			actualContentType = 'video/mp2t';
		} else if (isFmp4) {
			actualContentType = 'video/mp4';
		}

		return new Response(arrayBuffer, {
			status: 200,
			headers: {
				'Content-Type': actualContentType,
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Access-Control-Allow-Headers': 'Range, Content-Type',
				'Cache-Control': 'public, max-age=3600',
				'Content-Length': arrayBuffer.byteLength.toString()
			}
		});
	} catch (error) {
		logger.error('Proxy error', error, { url: targetUrl, logCategory: 'streams' });
		return new Response(
			JSON.stringify({
				error: 'Proxy error',
				details: error instanceof Error ? error.message : String(error)
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};

/**
 * Ensure playlist has VOD markers so players start from the beginning.
 * Without #EXT-X-ENDLIST and #EXT-X-PLAYLIST-TYPE:VOD, players treat
 * the stream as "live" and start at the end (live edge).
 */
function ensureVodPlaylist(playlist: string): string {
	const lines = playlist.split('\n');
	const rewritten: string[] = [];
	let hasPlaylistType = false;
	let isMediaPlaylist = false;

	// First pass: detect existing tags
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('#EXT-X-PLAYLIST-TYPE:')) hasPlaylistType = true;
		// Media playlists have EXTINF (segment duration) tags, master playlists don't
		if (trimmed.startsWith('#EXTINF:')) isMediaPlaylist = true;
	}

	// Only modify media playlists, not master playlists
	if (!isMediaPlaylist) {
		return playlist;
	}

	// Second pass: rewrite with VOD markers
	for (const line of lines) {
		const trimmed = line.trim();

		// Add VOD type after EXTM3U if missing
		if (trimmed === '#EXTM3U') {
			rewritten.push(line);
			if (!hasPlaylistType) {
				rewritten.push('#EXT-X-PLAYLIST-TYPE:VOD');
			}
			continue;
		}

		// Skip ENDLIST - we'll add it at the very end to ensure correct positioning
		if (trimmed === '#EXT-X-ENDLIST') {
			continue;
		}

		rewritten.push(line);
	}

	// Always add ENDLIST at the end (we removed any existing one above)
	// Remove trailing empty lines before adding ENDLIST
	while (rewritten.length > 0 && rewritten[rewritten.length - 1].trim() === '') {
		rewritten.pop();
	}
	rewritten.push('#EXT-X-ENDLIST');

	return rewritten.join('\n');
}

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
