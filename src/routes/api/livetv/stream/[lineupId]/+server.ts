/**
 * Live TV Stream Proxy
 *
 * Proxies Live TV streams from all provider sources (Stalker, XStream, M3U).
 * Handles stream URL resolution, HLS manifest rewriting, and direct stream passthrough.
 *
 * GET /api/livetv/stream/:lineupId
 */

import type { RequestHandler } from './$types';
import { getLiveTvStreamService } from '$lib/server/livetv/streaming/LiveTvStreamService';
import { getBaseUrlAsync } from '$lib/server/streaming/url';
import { logger } from '$lib/logging';

/**
 * Detect if content is an HLS playlist
 */
function isHlsContent(contentType: string, url: string, body?: string): boolean {
	// Check content type
	if (
		contentType.includes('mpegurl') ||
		contentType.includes('m3u8') ||
		contentType.includes('x-mpegurl')
	) {
		return true;
	}

	// Check URL patterns
	const lowerUrl = url.toLowerCase();
	if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/')) {
		return true;
	}

	// Check content
	if (body && body.startsWith('#EXTM3U')) {
		return true;
	}

	return false;
}

/**
 * Rewrite HLS playlist URLs to route through our segment proxy
 */
function rewriteHlsPlaylist(
	playlist: string,
	originalUrl: string,
	baseUrl: string,
	lineupId: string,
	providerHeaders?: Record<string, string>
): string {
	const lines = playlist.split('\n');
	const result: string[] = [];

	const base = new URL(originalUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	// Encode provider headers once for all segment URLs
	const encodedHeaders = encodeProviderHeaders(providerHeaders);

	let previousWasExtinf = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Handle URI= attributes in tags (EXT-X-MEDIA, EXT-X-KEY, EXT-X-MAP, EXT-X-STREAM-INF, etc.)
		if (
			trimmed.startsWith('#EXT-X-MEDIA:') ||
			trimmed.startsWith('#EXT-X-KEY:') ||
			trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:') ||
			trimmed.startsWith('#EXT-X-MAP:') ||
			trimmed.startsWith('#EXT-X-STREAM-INF:')
		) {
			const uriMatch = line.match(/URI="([^"]+)"/);
			if (uriMatch) {
				const originalUri = uriMatch[1];
				const absoluteUri = resolveUrl(originalUri, base, basePath);
				const proxyUri = makeSegmentProxyUrl(absoluteUri, baseUrl, lineupId, false, encodedHeaders);
				result.push(line.replace(`URI="${originalUri}"`, `URI="${proxyUri}"`));
				continue;
			}
		}

		// Track EXTINF lines - the next URL line is always a segment
		if (trimmed.startsWith('#EXTINF:')) {
			result.push(line);
			previousWasExtinf = true;
			continue;
		}

		// Keep other comments and empty lines as-is
		if (line.startsWith('#') || trimmed === '') {
			result.push(line);
			previousWasExtinf = false;
			continue;
		}

		// This is a URL line - rewrite it
		if (trimmed) {
			const absoluteUrl = resolveUrl(trimmed, base, basePath);
			const isSegment =
				previousWasExtinf ||
				trimmed.includes('.ts') ||
				trimmed.includes('.aac') ||
				trimmed.includes('.mp4');
			const proxyUrl = makeSegmentProxyUrl(
				absoluteUrl,
				baseUrl,
				lineupId,
				isSegment,
				encodedHeaders
			);
			result.push(proxyUrl);
		} else {
			result.push(line);
		}
		previousWasExtinf = false;
	}

	return result.join('\n');
}

/**
 * Resolve a potentially relative URL to absolute
 * Preserves query parameters from the base URL for authentication tokens
 */
function resolveUrl(url: string, base: URL, basePath: string): string {
	if (url.startsWith('http://') || url.startsWith('https://')) {
		return url;
	}
	if (url.startsWith('//')) {
		return `${base.protocol}${url}`;
	}
	if (url.startsWith('/')) {
		return `${base.origin}${url}`;
	}
	// Preserve query parameters from base URL (e.g., auth tokens)
	const queryString = base.search || '';
	return `${base.origin}${basePath}${url}${queryString}`;
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
 * Create a proxy URL for a segment or sub-playlist
 */
function makeSegmentProxyUrl(
	originalUrl: string,
	baseUrl: string,
	lineupId: string,
	isSegment: boolean,
	encodedHeaders?: string
): string {
	const extension = isSegment ? 'ts' : 'm3u8';
	let proxyUrl = `${baseUrl}/api/livetv/stream/${lineupId}/segment.${extension}?url=${encodeURIComponent(originalUrl)}`;
	if (encodedHeaders) {
		proxyUrl += `&h=${encodeURIComponent(encodedHeaders)}`;
	}
	return proxyUrl;
}

export const GET: RequestHandler = async ({ params, request }) => {
	const { lineupId } = params;

	if (!lineupId) {
		return new Response(JSON.stringify({ error: 'Missing lineup ID' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const baseUrl = await getBaseUrlAsync(request);
		const streamService = getLiveTvStreamService();

		// Fetch stream directly - gets fresh token and immediately fetches
		// This eliminates delay between token generation and fetch
		const stream = await streamService.fetchStream(lineupId);
		const response = stream.response;

		logger.debug('[LiveTV Stream] Stream fetched', {
			lineupId,
			type: stream.type,
			providerType: stream.providerType,
			accountId: stream.accountId
		});

		const contentType = response.headers.get('content-type') || '';

		// Check if this is HLS content
		if (stream.type === 'hls' || isHlsContent(contentType, stream.url)) {
			// Read the playlist and rewrite URLs
			const playlist = await response.text();

			if (!playlist.includes('#EXTM3U')) {
				// Not a valid HLS playlist - try to pass through as video
				logger.warn('[LiveTV Stream] Expected HLS but got non-playlist content', { lineupId });
				return new Response(playlist, {
					status: 200,
					headers: {
						'Content-Type': contentType || 'video/mp2t',
						'Access-Control-Allow-Origin': '*',
						'Cache-Control': 'no-store'
					}
				});
			}

			const rewritten = rewriteHlsPlaylist(
				playlist,
				stream.url,
				baseUrl,
				lineupId,
				stream.providerHeaders
			);

			return new Response(rewritten, {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.apple.mpegurl',
					'Accept-Ranges': 'none',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
					'Access-Control-Allow-Headers': 'Range, Content-Type',
					'Cache-Control': 'public, max-age=2, stale-while-revalidate=5',
					'X-Content-Type-Options': 'nosniff'
				}
			});
		}

		// Direct stream - pipe through
		// Note: For very long streams, this keeps the connection open
		return new Response(response.body, {
			status: 200,
			headers: {
				'Content-Type': contentType || 'video/mp2t',
				'Transfer-Encoding': 'chunked',
				'Accept-Ranges': 'none',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
				'Access-Control-Allow-Headers': 'Range, Content-Type',
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Stream failed';
		logger.error('[LiveTV Stream] Stream resolution failed', error, { lineupId });

		// Determine appropriate status code
		let status = 502;
		if (message.includes('not found')) {
			status = 404;
		} else if (message.includes('disabled')) {
			status = 403;
		}

		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const HEAD: RequestHandler = async ({ params }) => {
	const { lineupId } = params;

	if (!lineupId) {
		return new Response(null, { status: 400 });
	}

	// Return expected headers immediately without resolving the stream.
	// This is critical for Jellyfin/Plex which probe streams with HEAD before playing.
	// Most live TV streams are HLS, so return the HLS content type to match what GET returns.
	return new Response(null, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.apple.mpegurl',
			'Accept-Ranges': 'none',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type',
			'Cache-Control': 'no-store',
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
