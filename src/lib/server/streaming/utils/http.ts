/**
 * Shared HTTP Utilities for Stream Extractors
 *
 * Provides common HTTP functionality used across all extractors.
 */

import {
	DEFAULT_TIMEOUT_MS,
	DEFAULT_USER_AGENT,
	AVAILABILITY_CHECK_TIMEOUT_MS
} from '../constants';
import type { StreamSubtitle } from '../types/stream';
import { injectSubtitles, isMasterPlaylist } from './subtitle-injection';

export interface FetchOptions {
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Referer header value */
	referer?: string;
	/** HTTP method (defaults to GET) */
	method?: 'GET' | 'HEAD' | 'POST';
	/** Request body for POST requests */
	body?: string;
	/** Additional headers to include */
	headers?: Record<string, string>;
}

/**
 * Fetch with timeout and standard headers for stream extraction.
 *
 * Automatically includes:
 * - User-Agent header
 * - Accept header for HTML/XML
 * - Abort controller for timeout handling
 * - Optional Referer header
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns The Response object
 * @throws Error if request times out or fails
 */
export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
	const { timeout = DEFAULT_TIMEOUT_MS, referer, method = 'GET', body, headers = {} } = options;

	const requestHeaders: HeadersInit = {
		'User-Agent': DEFAULT_USER_AGENT,
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		...headers
	};

	if (referer) {
		requestHeaders['Referer'] = referer;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			method,
			headers: requestHeaders,
			body,
			signal: controller.signal
		});

		clearTimeout(timeoutId);
		return response;
	} catch (error) {
		clearTimeout(timeoutId);

		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`Request timeout after ${timeout}ms: ${url}`, { cause: error });
		}

		throw error;
	}
}

/**
 * Check if a stream URL is accessible.
 *
 * Performs a HEAD request with a short timeout to verify the stream is working.
 *
 * @param url - The stream URL to check
 * @param referer - Optional referer header
 * @returns 'working' if accessible, 'down' if not
 */
export async function checkStreamAvailability(
	url: string,
	referer?: string
): Promise<'working' | 'down'> {
	try {
		const response = await fetchWithTimeout(url, {
			method: 'HEAD',
			timeout: AVAILABILITY_CHECK_TIMEOUT_MS,
			referer
		});
		return response.ok ? 'working' : 'down';
	} catch {
		return 'down';
	}
}

/**
 * Check if a stream URL returns valid HLS content.
 *
 * Fetches the URL and checks if the response contains HLS markers.
 *
 * @param url - The stream URL to check
 * @param referer - Optional referer header
 * @returns 'working' if valid HLS, 'down' if not
 */
export async function checkHlsAvailability(
	url: string,
	referer?: string
): Promise<'working' | 'down'> {
	try {
		const response = await fetchWithTimeout(url, {
			timeout: AVAILABILITY_CHECK_TIMEOUT_MS,
			referer
		});

		if (!response.ok) {
			return 'down';
		}

		const text = await response.text();
		return text.includes('#EXTM3U') || text.includes('#EXT-X') ? 'working' : 'down';
	} catch {
		return 'down';
	}
}

/**
 * Fetch and return an HLS playlist with proper headers.
 *
 * Used by resolve endpoints to return playlist content directly
 * (Jellyfin doesn't follow redirects for .strm files).
 *
 * @param url - The playlist URL to fetch
 * @returns Response with proper content type and CORS headers
 * @throws Error if fetch fails
 */
export async function fetchPlaylist(url: string): Promise<Response> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch playlist: ${response.status}`);
	}

	const content = await response.text();

	return new Response(content, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.apple.mpegurl',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type',
			'Cache-Control': 'no-cache'
		}
	});
}

/**
 * Rewrite URLs in an HLS playlist to use our proxy endpoint.
 * This ensures all requests (playlists and segments) go through the proxy
 * with proper headers.
 *
 * @param playlist - The raw playlist content
 * @param playlistUrl - The original URL of this playlist (for resolving relative URLs)
 * @param proxyBaseUrl - The base URL of our proxy (e.g., https://example.com)
 * @param referer - The referer header to use for proxied requests
 * @returns Rewritten playlist content
 */
export function rewritePlaylistUrls(
	playlist: string,
	playlistUrl: string,
	proxyBaseUrl: string,
	referer: string
): string {
	const lines = playlist.split('\n');
	const rewritten: string[] = [];

	const base = new URL(playlistUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	const makeProxyUrl = (url: string, isSegment: boolean = false): string => {
		let absoluteUrl: string;

		if (url.startsWith('http://') || url.startsWith('https://')) {
			absoluteUrl = url;
		} else if (url.startsWith('/')) {
			absoluteUrl = `${base.origin}${url}`;
		} else {
			absoluteUrl = `${base.origin}${basePath}${url}`;
		}

		// Use path-based proxy URL with proper extension for FFmpeg compatibility
		const extension = isSegment ? 'ts' : 'm3u8';
		return `${proxyBaseUrl}/api/streaming/proxy/segment.${extension}?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}`;
	};

	let previousWasExtinf = false;

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Handle HLS tags that contain URIs
		if (line.startsWith('#EXT-X-MEDIA:') || line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
			const uriMatch = line.match(/URI="([^"]+)"/);
			if (uriMatch) {
				const originalUri = uriMatch[1];
				const proxiedUri = makeProxyUrl(originalUri, false);
				rewritten.push(line.replace(`URI="${originalUri}"`, `URI="${proxiedUri}"`));
			} else {
				rewritten.push(line);
			}
			previousWasExtinf = false;
			continue;
		}

		// Track #EXTINF lines - the next URL line is always a segment
		if (trimmedLine.startsWith('#EXTINF:')) {
			rewritten.push(line);
			previousWasExtinf = true;
			continue;
		}

		// Keep other comments and empty lines as-is
		if (line.startsWith('#') || trimmedLine === '') {
			rewritten.push(line);
			previousWasExtinf = false;
			continue;
		}

		// This is a URL line - could be a playlist or segment
		if (!trimmedLine) {
			rewritten.push(line);
			previousWasExtinf = false;
			continue;
		}

		try {
			// If previous line was #EXTINF, this is definitely a segment URL
			const isSegment =
				previousWasExtinf ||
				trimmedLine.includes('.ts') ||
				trimmedLine.includes('.aac') ||
				trimmedLine.includes('.mp4');
			rewritten.push(makeProxyUrl(trimmedLine, isSegment));
		} catch {
			rewritten.push(line);
		}
		previousWasExtinf = false;
	}

	return rewritten.join('\n');
}

/**
 * Ensure playlist has VOD markers so players start from the beginning.
 * Without #EXT-X-ENDLIST and #EXT-X-PLAYLIST-TYPE:VOD, players treat
 * the stream as "live" and start at the end.
 *
 * @param playlist - The playlist content
 * @returns Playlist with VOD markers added
 */
export function ensureVodPlaylist(playlist: string): string {
	const lines = playlist.split('\n');
	const rewritten: string[] = [];
	let hasPlaylistType = false;
	let isMediaPlaylist = false;

	// First pass: detect existing tags
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('#EXT-X-PLAYLIST-TYPE:')) hasPlaylistType = true;
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

		// Skip ENDLIST - we'll add it at the very end
		if (trimmed === '#EXT-X-ENDLIST') {
			continue;
		}

		rewritten.push(line);
	}

	// Remove trailing empty lines and add ENDLIST
	while (rewritten.length > 0 && rewritten[rewritten.length - 1].trim() === '') {
		rewritten.pop();
	}
	rewritten.push('#EXT-X-ENDLIST');

	return rewritten.join('\n');
}

/**
 * Fetch an HLS playlist directly and rewrite URLs to use our proxy.
 * This is used by resolve endpoints to avoid server-to-server loopback.
 *
 * @param playlistUrl - The raw stream URL to fetch
 * @param referer - Referer header for the request
 * @param proxyBaseUrl - Our server's base URL for proxy URLs
 * @param subtitles - Optional subtitle tracks to inject into master playlists
 * @returns Response with rewritten playlist content
 */
export async function fetchAndRewritePlaylist(
	playlistUrl: string,
	referer: string,
	proxyBaseUrl: string,
	subtitles?: StreamSubtitle[]
): Promise<Response> {
	// Fetch the playlist directly with proper headers
	// Note: Don't send Origin header - some CDNs reject it
	const response = await fetchWithTimeout(playlistUrl, {
		referer,
		timeout: 8000,
		headers: {
			Accept: '*/*'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch playlist: ${response.status}`);
	}

	let content = await response.text();

	// Validate it's actually an HLS playlist
	if (!content.trim().startsWith('#EXTM3U')) {
		throw new Error('Invalid HLS playlist: missing #EXTM3U header');
	}

	// Rewrite URLs to use our proxy
	content = rewritePlaylistUrls(content, playlistUrl, proxyBaseUrl, referer);

	// Inject subtitles into master playlists
	if (subtitles?.length && isMasterPlaylist(content)) {
		content = injectSubtitles(content, subtitles, proxyBaseUrl, referer);
	}

	// Ensure VOD markers for media playlists
	content = ensureVodPlaylist(content);

	return new Response(content, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.apple.mpegurl',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type',
			'Cache-Control': 'no-cache'
		}
	});
}
