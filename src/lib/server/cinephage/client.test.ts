import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('$lib/server/indexers/http', () => ({
	createIndexerHttp: () => ({ get: getMock, post: postMock })
}));

vi.mock('./config.js', () => ({
	getCinephageBackendConfig: vi.fn()
}));

const { cinephageRequestWithConfig } = await import('./client.js');

const CONFIG = {
	version: '2.0.0',
	commit: 'def4567',
	baseUrl: 'https://api.cinephage.net',
	configured: true,
	missing: [] as string[]
};

describe('cinephage/client', () => {
	beforeEach(() => {
		getMock.mockReset();
		postMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('injects auth headers and builds the URL with query params', async () => {
		getMock.mockResolvedValue({ status: 200, body: '{"ok":true}', url: 'x' });

		const response = await cinephageRequestWithConfig(CONFIG, '/api/v1/stream/562', {
			query: { type: 'movie', season: undefined }
		});

		expect(response).toEqual({ status: 200, body: '{"ok":true}', url: 'x' });
		expect(getMock).toHaveBeenCalledWith(
			'https://api.cinephage.net/api/v1/stream/562?type=movie',
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: 'application/json',
					'X-Cinephage-Version': '2.0.0',
					'X-Cinephage-Commit': 'def4567'
				})
			})
		);
	});

	it('appends array query values as repeated params', async () => {
		getMock.mockResolvedValue({ status: 200, body: '', url: 'x' });

		await cinephageRequestWithConfig(CONFIG, '/api/v1/iptv/playlist.m3u', {
			query: { country: ['US', 'UK'] },
			accept: 'audio/x-mpegurl'
		});

		const calledUrl = getMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain('country=US');
		expect(calledUrl).toContain('country=UK');
		expect(getMock.mock.calls[0][1].headers.Accept).toBe('audio/x-mpegurl');
	});

	it('propagates thrown HttpError from the underlying client', async () => {
		getMock.mockRejectedValue(Object.assign(new Error('HTTP 401'), { status: 401 }));

		await expect(cinephageRequestWithConfig(CONFIG, '/api/v1/stream/1')).rejects.toMatchObject({
			status: 401
		});
	});

	it('uses POST and forwards the body when method is POST', async () => {
		postMock.mockResolvedValue({ status: 200, body: '{}', url: 'x' });

		await cinephageRequestWithConfig(CONFIG, '/api/v1/media/batch', {
			method: 'POST',
			body: '{"movies":[1]}'
		});

		expect(postMock).toHaveBeenCalledWith(
			'https://api.cinephage.net/api/v1/media/batch',
			'{"movies":[1]}',
			expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
		);
		expect(getMock).not.toHaveBeenCalled();
	});

	it('omits auth headers when version or commit is missing', async () => {
		getMock.mockResolvedValue({ status: 200, body: '{}', url: 'x' });

		await cinephageRequestWithConfig(
			{
				baseUrl: 'https://api.cinephage.net',
				configured: false,
				missing: ['cinephageVersion', 'cinephageCommit']
			},
			'/api/v1/iptv/countries'
		);

		const headers = getMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers['X-Cinephage-Version']).toBeUndefined();
		expect(headers['X-Cinephage-Commit']).toBeUndefined();
	});
});
