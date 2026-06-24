import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
const configMock = vi.fn();

vi.mock('../client.js', () => ({
	cinephageRequestWithConfig: requestMock
}));
vi.mock('../config.js', () => ({
	getCinephageBackendConfig: configMock
}));

const { getCountries, getPlaylist, getChannelCount } = await import('./iptv.js');

const READY_CONFIG = {
	version: '2.0.0',
	commit: 'def4567',
	baseUrl: 'https://api.cinephage.net',
	configured: true,
	missing: [] as string[]
};

describe('cinephage/endpoints/iptv', () => {
	beforeEach(() => {
		requestMock.mockReset();
		configMock.mockReset();
		configMock.mockResolvedValue(READY_CONFIG);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('throws a not-configured error when missing identity', async () => {
		configMock.mockResolvedValue({
			baseUrl: 'x',
			configured: false,
			missing: ['cinephageVersion']
		});

		await expect(getCountries()).rejects.toThrow(
			'Cinephage API not configured: missing cinephageVersion or cinephageCommit'
		);
	});

	it('returns the countries array from the response body', async () => {
		requestMock.mockResolvedValue({
			status: 200,
			url: 'x',
			body: JSON.stringify({ countries: [{ code: 'US', name: 'United States' }] })
		});

		const countries = await getCountries();

		expect(countries).toEqual([{ code: 'US', name: 'United States' }]);
		expect(requestMock).toHaveBeenCalledWith(READY_CONFIG, '/api/v1/iptv/countries');
	});

	it('passes country/category arrays and m3u accept to the playlist request', async () => {
		requestMock.mockResolvedValue({ status: 200, url: 'x', body: '#EXTM3U\n' });

		const playlist = await getPlaylist({ countries: ['US'], categories: ['Sports'] });

		expect(playlist).toBe('#EXTM3U\n');
		expect(requestMock).toHaveBeenCalledWith(READY_CONFIG, '/api/v1/iptv/playlist.m3u', {
			query: { country: ['US'], category: ['Sports'] },
			accept: 'audio/x-mpegurl, text/plain, */*'
		});
	});

	it('returns the total channel count', async () => {
		requestMock.mockResolvedValue({
			status: 200,
			url: 'x',
			body: JSON.stringify({ channels: [], total: 42 })
		});

		const total = await getChannelCount({ limit: 1, country: 'US' });

		expect(total).toBe(42);
	});
});
