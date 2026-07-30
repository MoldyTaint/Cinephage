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
