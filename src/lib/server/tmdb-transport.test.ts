import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cinephageRequestMock = vi.fn();
const getMetadataProviderConfigMock = vi.fn();

vi.mock('./cinephage/client.js', () => ({
	cinephageRequest: cinephageRequestMock
}));
vi.mock('./metadata/provider-settings.js', () => ({
	getMetadataProviderConfig: getMetadataProviderConfigMock
}));
vi.mock('$lib/server/db', () => ({
	get db() {
		return { query: { settings: { findFirst: vi.fn().mockResolvedValue(undefined) } } };
	},
	get sqlite() {
		return {};
	},
	initializeDatabase: vi.fn()
}));
vi.mock('$lib/logging', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));
vi.mock('./library/status.js', () => ({
	getBlockedTmdbIdSet: vi.fn().mockResolvedValue(new Set())
}));

const { tmdb } = await import('./tmdb.js');

describe('tmdb source-aware transport', () => {
	beforeEach(() => {
		cinephageRequestMock.mockReset();
		getMetadataProviderConfigMock.mockReset();
		getMetadataProviderConfigMock.mockResolvedValue({
			animeEnrichmentEnabled: true,
			source: 'cinephage'
		});
		tmdb.invalidateSettings();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('routes through the gateway and translates append_to_response to expand', async () => {
		cinephageRequestMock.mockResolvedValue({
			status: 200,
			url: 'x',
			body: JSON.stringify({ id: 27205, title: 'Inception' })
		});

		const result = (await tmdb.getMovie(27205)) as Record<string, unknown>;

		expect(result.id).toBe(27205);
		const calledPath = cinephageRequestMock.mock.calls[0][0] as string;
		expect(calledPath).toContain('/api/v1/media/movie/27205');
		expect(calledPath).toContain('expand=');
		expect(calledPath).not.toContain('append_to_response');
		expect(calledPath).not.toContain('api_key');
	});

	it('appends source=tmdb to season requests', async () => {
		cinephageRequestMock.mockResolvedValue({
			status: 200,
			url: 'x',
			body: JSON.stringify({ season_number: 1, episodes: [] })
		});

		await tmdb.getSeason(1399, 1);

		const calledPath = cinephageRequestMock.mock.calls[0][0] as string;
		expect(calledPath).toContain('/api/v1/media/tv/1399/season/1');
		expect(calledPath).toContain('source=tmdb');
	});

	it('adapts the CinephageAPI error envelope', async () => {
		cinephageRequestMock.mockResolvedValue({
			status: 200,
			url: 'x',
			body: JSON.stringify({ error: { message: 'Unavailable' } })
		});

		await expect(tmdb.getMovie(999)).rejects.toThrow('Cinephage API Error: Unavailable');
	});

	it('throws "not configured" on the TMDB path without an api key', async () => {
		getMetadataProviderConfigMock.mockResolvedValue({
			animeEnrichmentEnabled: true,
			source: 'tmdb'
		});

		await expect(tmdb.getMovie(562)).rejects.toThrow('TMDB API Key not configured');
	});
});
