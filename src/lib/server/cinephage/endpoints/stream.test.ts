import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
const configMock = vi.fn();

vi.mock('../client.js', () => ({
	cinephageRequestWithConfig: requestMock
}));
vi.mock('../config.js', () => ({
	getCinephageBackendConfig: configMock
}));
vi.mock('$lib/logging', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { getStreams } = await import('./stream.js');

const READY_CONFIG = {
	version: '2.0.0',
	commit: 'def4567',
	baseUrl: 'https://api.cinephage.net',
	configured: true,
	missing: [] as string[]
};

describe('cinephage/endpoints/stream', () => {
	beforeEach(() => {
		requestMock.mockReset();
		configMock.mockReset();
		configMock.mockResolvedValue(READY_CONFIG);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns a not-configured error when version/commit are missing', async () => {
		configMock.mockResolvedValue({
			baseUrl: 'https://api.cinephage.net',
			configured: false,
			missing: ['cinephageVersion', 'cinephageCommit']
		});

		const result = await getStreams({ tmdbId: 562, type: 'movie' });

		expect(result.success).toBe(false);
		expect(result.error).toBe(
			'Cinephage API is not configured: missing cinephageVersion, cinephageCommit.'
		);
	});

	it('parses the single-stream response shape', async () => {
		requestMock.mockResolvedValue({
			status: 200,
			url: 'x',
			body: JSON.stringify({
				url: 'https://vidlink.pro/playlist.m3u8?token=abc',
				provider: 'Vidlink',
				quality: '1080p',
				protocol: 'hls',
				headers: { Origin: 'https://vidlink.pro', Referer: 'https://vidlink.pro/' }
			})
		});

		const result = await getStreams({ tmdbId: 550, type: 'movie' });

		expect(result.success).toBe(true);
		expect(result.sources).toHaveLength(1);
		expect(result.sources[0]).toMatchObject({
			url: 'https://vidlink.pro/playlist.m3u8?token=abc',
			provider: 'Vidlink',
			quality: '1080p',
			type: 'hls'
		});
	});

	it('maps a thrown 401 to an authentication error string', async () => {
		requestMock.mockRejectedValue(Object.assign(new Error('HTTP 401'), { status: 401 }));

		const result = await getStreams({ tmdbId: 562, type: 'movie' });

		expect(result).toEqual({
			success: false,
			sources: [],
			error: 'Cinephage API rejected authentication. Verify the configured version and commit.'
		});
	});

	it('maps a thrown 502 to a no-streams error string', async () => {
		requestMock.mockRejectedValue(Object.assign(new Error('HTTP 502'), { status: 502 }));

		const result = await getStreams({ tmdbId: 562, type: 'movie' });

		expect(result.error).toBe('Cinephage API returned 502: no streams available for this content');
	});
});
