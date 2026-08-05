import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveAndValidateUrlMock = vi.fn(async () => ({ safe: true }));
const fetchWithTimeoutMock = vi.fn();

vi.mock('$lib/server/http/ssrf-protection', () => ({
	resolveAndValidateUrl: resolveAndValidateUrlMock,
	fetchWithTimeout: fetchWithTimeoutMock,
	MAX_REDIRECTS: 5
}));

const BASE_URL = 'https://media.example.com';

describe('SessionProxyService.renderLaunchResponse', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		resolveAndValidateUrlMock.mockResolvedValue({ safe: true });
		const { getPlaybackSessionStore } = await import('./session-store');
		getPlaybackSessionStore().clear();
	});

	it('wraps an mp4 source in an HLS VOD playlist pointing at direct.mp4', async () => {
		fetchWithTimeoutMock.mockResolvedValue(
			new Response(new Uint8Array([0x00, 0x01]), {
				status: 206,
				headers: { 'Content-Type': 'video/mp4' }
			})
		);

		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: 'https://cdn.example.com/movie.mp4',
			sourceType: 'mp4',
			requestHeaders: { Referer: 'https://player.example.com/' },
			attempts: []
		});

		const response = await getSessionProxyService().renderLaunchResponse(
			session,
			BASE_URL,
			'api-key',
			new Request(`${BASE_URL}/api/streaming/session/movie/541134/master.m3u8`)
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');

		const playlist = await response.text();
		expect(playlist).toContain('#EXTM3U');
		expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
		expect(playlist).toContain('#EXT-X-ENDLIST');
		expect(playlist).toContain(
			`${BASE_URL}/api/streaming/session/${session.token}/direct.mp4?api_key=api-key`
		);
	});

	it('returns 503 when the mp4 source is unreachable', async () => {
		fetchWithTimeoutMock.mockRejectedValue(new Error('connection refused'));

		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: 'https://cdn.example.com/dead.mp4',
			sourceType: 'mp4',
			requestHeaders: {},
			attempts: []
		});

		const response = await getSessionProxyService().renderLaunchResponse(
			session,
			BASE_URL,
			undefined,
			new Request(`${BASE_URL}/api/streaming/session/movie/541134/master.m3u8`)
		);

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.code).toBe('PLAYBACK_UNAVAILABLE');
	});

	it('proxies and rewrites an hls source playlist unchanged behaviour', async () => {
		const upstreamPlaylist = [
			'#EXTM3U',
			'#EXT-X-VERSION:3',
			'#EXT-X-TARGETDURATION:10',
			'#EXTINF:10.0,',
			'segment0.ts',
			'#EXT-X-ENDLIST'
		].join('\n');

		fetchWithTimeoutMock.mockResolvedValue(
			new Response(upstreamPlaylist, {
				status: 200,
				headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
			})
		);

		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: 'https://cdn.example.com/master.m3u8',
			sourceType: 'hls',
			requestHeaders: {},
			attempts: []
		});

		const response = await getSessionProxyService().renderLaunchResponse(
			session,
			BASE_URL,
			'api-key',
			new Request(`${BASE_URL}/api/streaming/session/movie/541134/master.m3u8`)
		);

		expect(response.status).toBe(200);
		const playlist = await response.text();
		expect(playlist).toContain('#EXTM3U');
		expect(playlist).toContain(`${BASE_URL}/api/streaming/session/${session.token}/segment/`);
	});
});

describe('SessionProxyService.renderLaunchMedia', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		resolveAndValidateUrlMock.mockResolvedValue({ safe: true });
		const { getPlaybackSessionStore } = await import('./session-store');
		getPlaybackSessionStore().clear();
	});

	it('streams an mp4 source as progressive mp4 with range passthrough', async () => {
		const body = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
		fetchWithTimeoutMock.mockResolvedValue(
			new Response(body, {
				status: 206,
				headers: {
					'Content-Type': 'video/mp4',
					'Content-Range': 'bytes 0-3/1000',
					'Accept-Ranges': 'bytes'
				}
			})
		);

		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: 'https://cdn.example.com/movie.mp4',
			sourceType: 'mp4',
			requestHeaders: { Referer: 'https://player.example.com/' },
			attempts: []
		});

		const request = new Request(`${BASE_URL}/api/streaming/session/movie/541134`, {
			headers: { Range: 'bytes=0-3' }
		});
		const response = await getSessionProxyService().renderLaunchMedia(
			session,
			BASE_URL,
			'api-key',
			request
		);

		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Type')).toBe('video/mp4');
		expect(response.headers.get('Content-Range')).toBe('bytes 0-3/1000');
		expect(new Uint8Array(await new Response(response.body).arrayBuffer())).toEqual(body);

		// Upstream request must include the session's referer and the range.
		const [upstreamUrl, upstreamInit] = fetchWithTimeoutMock.mock.calls[0];
		expect(upstreamUrl).toBe('https://cdn.example.com/movie.mp4');
		expect(upstreamInit.headers.Referer).toBe('https://player.example.com/');
		expect(upstreamInit.headers.range).toBe('bytes=0-3');
	});

	it('returns the upstream error when an mp4 source fails', async () => {
		fetchWithTimeoutMock.mockResolvedValue(
			new Response(JSON.stringify({ error: 'gone' }), { status: 404 })
		);

		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: 'https://cdn.example.com/dead.mp4',
			sourceType: 'mp4',
			requestHeaders: {},
			attempts: []
		});

		const response = await getSessionProxyService().renderLaunchMedia(
			session,
			BASE_URL,
			'api-key',
			new Request(`${BASE_URL}/api/streaming/session/movie/541134`)
		);

		expect(response.status).toBe(404);
	});

	it('rewrites an hls source playlist at the extension-less path', async () => {
		const upstreamPlaylist = [
			'#EXTM3U',
			'#EXT-X-VERSION:3',
			'#EXT-X-TARGETDURATION:10',
			'#EXTINF:10.0,',
			'segment0.ts',
			'#EXT-X-ENDLIST'
		].join('\n');

		fetchWithTimeoutMock.mockResolvedValue(
			new Response(upstreamPlaylist, {
				status: 200,
				headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
			})
		);

		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: 'https://cdn.example.com/master.m3u8',
			sourceType: 'hls',
			requestHeaders: {},
			attempts: []
		});

		const response = await getSessionProxyService().renderLaunchMedia(
			session,
			BASE_URL,
			'api-key',
			new Request(`${BASE_URL}/api/streaming/session/movie/541134`)
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
		const playlist = await response.text();
		expect(playlist).toContain('#EXTM3U');
		expect(playlist).toContain(`${BASE_URL}/api/streaming/session/${session.token}/segment/`);
	});
});

describe('SessionProxyService.renderHeadResponse', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		resolveAndValidateUrlMock.mockResolvedValue({ safe: true });
		const { getPlaybackSessionStore } = await import('./session-store');
		getPlaybackSessionStore().clear();
	});

	async function createSession(sourceType: 'mp4' | 'hls' | 'dash') {
		const { getPlaybackSessionStore } = await import('./session-store');
		return getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 541134,
			entryUrl: `https://cdn.example.com/stream.${sourceType === 'dash' ? 'mpd' : sourceType === 'hls' ? 'm3u8' : 'mp4'}`,
			sourceType,
			requestHeaders: {},
			attempts: []
		});
	}

	it('probes the upstream with HEAD and returns status without a body', async () => {
		fetchWithTimeoutMock.mockResolvedValue(
			new Response(null, {
				status: 200,
				headers: {
					'Content-Type': 'video/mp4',
					'Content-Length': '12345',
					'Accept-Ranges': 'bytes'
				}
			})
		);

		const { getSessionProxyService } = await import('./SessionProxyService');
		const session = await createSession('mp4');

		const response = await getSessionProxyService().renderHeadResponse(
			session,
			new Request(`${BASE_URL}/api/streaming/session/movie/541134`)
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('video/mp4');
		expect(response.headers.get('Content-Length')).toBe('12345');
		expect(response.headers.get('Accept-Ranges')).toBe('bytes');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(await response.text()).toBe('');

		const [, upstreamInit] = fetchWithTimeoutMock.mock.calls[0];
		expect(upstreamInit.method).toBe('HEAD');
	});

	it('sets the manifest content type for hls sources', async () => {
		fetchWithTimeoutMock.mockResolvedValue(new Response(null, { status: 200 }));

		const { getSessionProxyService } = await import('./SessionProxyService');
		const session = await createSession('hls');

		const response = await getSessionProxyService().renderHeadResponse(
			session,
			new Request(`${BASE_URL}/api/streaming/session/movie/541134`)
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
	});

	it('sets the dash content type for dash sources', async () => {
		fetchWithTimeoutMock.mockResolvedValue(new Response(null, { status: 200 }));

		const { getSessionProxyService } = await import('./SessionProxyService');
		const session = await createSession('dash');

		const response = await getSessionProxyService().renderHeadResponse(
			session,
			new Request(`${BASE_URL}/api/streaming/session/movie/541134`)
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/dash+xml');
	});

	it('forwards the upstream status on failure', async () => {
		fetchWithTimeoutMock.mockResolvedValue(new Response(null, { status: 404 }));

		const { getSessionProxyService } = await import('./SessionProxyService');
		const session = await createSession('mp4');

		const response = await getSessionProxyService().renderHeadResponse(
			session,
			new Request(`${BASE_URL}/api/streaming/session/movie/541134`)
		);

		expect(response.status).toBe(404);
	});
});
