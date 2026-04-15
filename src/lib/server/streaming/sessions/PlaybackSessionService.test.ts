import { beforeEach, describe, expect, it, vi } from 'vitest';

const getStreamsMock = vi.fn();
const getPreferredLanguagesForMovieMock = vi.fn(async () => []);
const getPreferredLanguagesForSeriesMock = vi.fn(async () => []);

vi.mock('../cinephage-api/CinephageApiService', () => ({
	getCinephageApiService: () => ({
		getStreams: getStreamsMock
	})
}));

vi.mock('../language-profile-helper', () => ({
	getPreferredLanguagesForMovie: getPreferredLanguagesForMovieMock,
	getPreferredLanguagesForSeries: getPreferredLanguagesForSeriesMock
}));

describe('PlaybackSessionService', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { getPlaybackSessionStore } = await import('./session-store');
		getPlaybackSessionStore().clear();
	});

	it('creates a reusable playback session for a movie source', async () => {
		getStreamsMock.mockResolvedValue({
			success: true,
			sources: [
				{
					quality: '1080p',
					title: 'Test stream',
					url: 'https://stream.example.com/direct.mp4',
					type: 'mp4',
					referer: 'https://player.example.com/',
					requiresSegmentProxy: false,
					headers: { Referer: 'https://player.example.com/' },
					provider: 'Mapple'
				}
			]
		});

		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes('direct.mp4')) {
				return new Response(new Uint8Array([0x47, 0x40, 0x11]), {
					status: 200,
					headers: { 'Content-Type': 'video/mp4' }
				});
			}
			return new Response(new Uint8Array([0x47, 0x40, 0x11]), {
				status: 404
			});
		});

		const { getPlaybackSessionService } = await import('./PlaybackSessionService');
		const service = getPlaybackSessionService();

		const first = await service.createOrReuseSession({ tmdbId: 550, type: 'movie' });
		expect(first.session).toBeTruthy();
		expect(first.session?.provider).toBe('Mapple');

		const second = await service.createOrReuseSession({ tmdbId: 550, type: 'movie' });
		expect(second.session?.token).toBe(first.session?.token);
		expect(getStreamsMock).toHaveBeenCalledTimes(1);
	});

	it('builds subtitle playlists that point at the session subtitle route', async () => {
		const { getPlaybackSessionStore } = await import('./session-store');
		const { getSessionProxyService } = await import('./SessionProxyService');

		const session = getPlaybackSessionStore().createSession({
			mediaType: 'movie',
			tmdbId: 550,
			entryUrl: 'https://stream.example.com/master.m3u8',
			sourceType: 'hls',
			requestHeaders: { Referer: 'https://player.example.com/' },
			subtitles: [
				{
					id: 'sub-0',
					url: 'https://stream.example.com/subtitles/en.srt',
					label: 'English',
					language: 'en'
				}
			],
			attempts: []
		});

		const response = await getSessionProxyService().renderSubtitlePlaylist(
			session,
			'sub-0',
			'https://media.example.com',
			'api-key'
		);

		const playlist = await response.text();
		expect(playlist).toContain(
			'https://media.example.com/api/streaming/session/' +
				session.token +
				'/subtitle/sub-0.vtt?api_key=api-key'
		);
	});

	it('does not start stream lookup when session creation is already aborted', async () => {
		const { getPlaybackSessionService } = await import('./PlaybackSessionService');
		const service = getPlaybackSessionService();

		const controller = new AbortController();
		controller.abort();

		const result = await service.createOrReuseSession({
			tmdbId: 550,
			type: 'movie',
			signal: controller.signal
		});

		expect(result.session).toBeNull();
		expect(result.error).toBe('Aborted');
		expect(getStreamsMock).not.toHaveBeenCalled();
	});
});
