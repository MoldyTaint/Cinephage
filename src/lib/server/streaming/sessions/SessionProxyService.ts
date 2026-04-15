import { logger } from '$lib/logging';
import {
	resolveAndValidateUrl,
	fetchWithTimeout,
	MAX_REDIRECTS
} from '$lib/server/http/ssrf-protection';
import { isHLSPlaylist, sanitizePlaylist, validatePlaylist } from '../hls';
import { ensureVttFormat } from '../utils/srt-to-vtt';
import type { PlaybackSession } from '../types';
import { getPlaybackSessionStore } from './session-store';
import { rewriteSessionPlaylist } from './playlist-rewriter';

const streamLog = { logDomain: 'streams' as const };
const DEFAULT_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_TEXT_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
]);

function isRangeHeaderName(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		lower === 'range' ||
		lower === 'if-range' ||
		lower === 'if-none-match' ||
		lower === 'if-modified-since'
	);
}

function buildUpstreamHeaders(session: PlaybackSession, request?: Request): Record<string, string> {
	const headers: Record<string, string> = {
		...session.requestHeaders,
		'User-Agent':
			session.requestHeaders['User-Agent'] ||
			session.requestHeaders['user-agent'] ||
			DEFAULT_USER_AGENT,
		Accept: session.requestHeaders.Accept || session.requestHeaders.accept || '*/*',
		'Accept-Encoding': 'identity'
	};

	if (!headers.Referer && !headers.referer && session.requestHeaders.referer) {
		headers.Referer = session.requestHeaders.referer;
	}

	if (request) {
		for (const [name, value] of request.headers.entries()) {
			if (!isRangeHeaderName(name)) {
				continue;
			}

			headers[name] = value;
		}
	}

	return headers;
}

function buildStreamingResponseHeaders(response: Response, fallbackContentType: string): Headers {
	const headers = new Headers();

	for (const [name, value] of response.headers.entries()) {
		if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
			continue;
		}
		headers.set(name, value);
	}

	if (!headers.has('Content-Type')) {
		headers.set('Content-Type', fallbackContentType);
	}

	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
	return headers;
}

function detectBinaryContentType(url: string, contentType: string | null): string {
	if (contentType) {
		return contentType;
	}

	const normalized = url.toLowerCase();
	if (normalized.includes('.mp4') || normalized.includes('.m4s')) {
		return 'video/mp4';
	}
	if (normalized.includes('.jpg') || normalized.includes('.jpeg')) {
		return 'image/jpeg';
	}
	return 'application/octet-stream';
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) {
		return '';
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalSize = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		totalSize += value.byteLength;
		if (totalSize > maxBytes) {
			await reader.cancel();
			throw new Error(`Response exceeded ${maxBytes} bytes`);
		}

		chunks.push(value);
	}

	return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

async function fetchUpstream(url: string, headers: Record<string, string>): Promise<Response> {
	let currentUrl = url;
	let redirectCount = 0;
	const visitedUrls = new Set<string>();

	while (true) {
		if (visitedUrls.has(currentUrl)) {
			throw new Error('Redirect loop detected');
		}
		visitedUrls.add(currentUrl);

		const safetyCheck = await resolveAndValidateUrl(currentUrl);
		if (!safetyCheck.safe) {
			throw new Error(safetyCheck.reason || 'URL not allowed');
		}

		const response = await fetchWithTimeout(
			currentUrl,
			{
				headers,
				redirect: 'manual'
			},
			30_000
		);

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location');
			if (!location) {
				return response;
			}

			if (redirectCount >= MAX_REDIRECTS) {
				throw new Error('Too many redirects');
			}

			currentUrl = new URL(location, currentUrl).toString();
			redirectCount += 1;
			continue;
		}

		return response;
	}
}

export class SessionProxyService {
	private readonly store = getPlaybackSessionStore();

	async renderLaunchResponse(
		session: PlaybackSession,
		baseUrl: string,
		apiKey: string | undefined,
		request: Request
	): Promise<Response> {
		if (session.sourceType === 'mp4') {
			return this.renderBinaryResponse(session, session.entryUrl, request, 'video/mp4');
		}

		return this.renderPlaylistResponse(session, session.entryUrl, baseUrl, apiKey, true);
	}

	async renderRegisteredResource(
		session: PlaybackSession,
		resourceId: string,
		baseUrl: string,
		apiKey: string | undefined,
		request: Request
	): Promise<Response> {
		const resource = this.store.getResource(session.token, resourceId);
		if (!resource) {
			return new Response(JSON.stringify({ error: 'Stream resource not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (resource.kind === 'playlist') {
			return this.renderPlaylistResponse(session, resource.url, baseUrl, apiKey, false);
		}

		return this.renderBinaryResponse(session, resource.url, request);
	}

	async renderDirectResponse(session: PlaybackSession, request: Request): Promise<Response> {
		return this.renderBinaryResponse(session, session.entryUrl, request, 'video/mp4');
	}

	async renderSubtitlePlaylist(
		session: PlaybackSession,
		subtitleId: string,
		baseUrl: string,
		apiKey?: string
	): Promise<Response> {
		const subtitle = session.subtitles.find((entry) => entry.id === subtitleId);
		if (!subtitle) {
			return new Response(JSON.stringify({ error: 'Subtitle not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const fileUrl = new URL(
			`/api/streaming/session/${session.token}/subtitle/${subtitle.id}.vtt`,
			baseUrl
		);
		if (apiKey) {
			fileUrl.searchParams.set('api_key', apiKey);
		}

		const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:99999
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:99999.0,
${fileUrl.toString()}
#EXT-X-ENDLIST
`;

		return new Response(playlist, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.apple.mpegurl',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	}

	async renderSubtitleFile(session: PlaybackSession, subtitleId: string): Promise<Response> {
		const subtitle = session.subtitles.find((entry) => entry.id === subtitleId);
		if (!subtitle) {
			return new Response(JSON.stringify({ error: 'Subtitle not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const response = await fetchUpstream(subtitle.url, buildUpstreamHeaders(session));
		if (!response.ok) {
			return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const content = ensureVttFormat(await readBodyWithLimit(response, MAX_SUBTITLE_BYTES));
		return new Response(content, {
			status: 200,
			headers: {
				'Content-Type': 'text/vtt; charset=utf-8',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	}

	private async renderPlaylistResponse(
		session: PlaybackSession,
		playlistUrl: string,
		baseUrl: string,
		apiKey: string | undefined,
		injectSubtitles: boolean
	): Promise<Response> {
		const response = await fetchUpstream(playlistUrl, buildUpstreamHeaders(session));
		if (!response.ok) {
			return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		let playlist = await readBodyWithLimit(response, MAX_TEXT_RESPONSE_BYTES);
		if (!isHLSPlaylist(playlist)) {
			return new Response(JSON.stringify({ error: 'Invalid HLS playlist' }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const validation = validatePlaylist(playlist);
		if (!validation.valid) {
			playlist = sanitizePlaylist(playlist);
		}

		const rewritten = rewriteSessionPlaylist({
			playlist,
			playlistUrl,
			baseUrl,
			session,
			apiKey,
			injectSubtitles,
			registerResource: (url, kind, extension) => {
				const resource = this.store.registerResource(session.token, url, kind, extension);
				if (!resource) {
					throw new Error('Unable to register playback resource');
				}
				return resource.id;
			}
		});

		return new Response(rewritten, {
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

	private async renderBinaryResponse(
		session: PlaybackSession,
		url: string,
		request: Request,
		fallbackContentType?: string
	): Promise<Response> {
		const response = await fetchUpstream(url, buildUpstreamHeaders(session, request));
		if (!response.ok) {
			return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const contentType = detectBinaryContentType(url, response.headers.get('content-type'));
		logger.debug(
			{
				sessionToken: session.token,
				provider: session.provider,
				resourceUrl: url,
				contentType,
				...streamLog
			},
			'Proxying playback session resource'
		);

		return new Response(response.body, {
			status: response.status,
			headers: buildStreamingResponseHeaders(response, fallbackContentType ?? contentType)
		});
	}
}

let sessionProxyServiceInstance: SessionProxyService | null = null;

export function getSessionProxyService(): SessionProxyService {
	if (!sessionProxyServiceInstance) {
		sessionProxyServiceInstance = new SessionProxyService();
	}

	return sessionProxyServiceInstance;
}
