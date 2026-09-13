/**
 * BetaSeries manual-download regression.
 *
 * The interactive modal used to submit only provider/subtitle ids, so the
 * download route reconstructed a synthetic result without a download URL and
 * BetaSeries always threw "No download URL available". These tests prove the
 * provider's search result carries the provider-specific URL and that
 * download() uses it end-to-end with a stubbed fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BetaseriesProvider } from './BetaseriesProvider';
import type { SubtitleProviderConfig } from '../../types';

const DOWNLOAD_URL = 'https://betaseries.test/subtitles/55.srt';
const SRT_CONTENT = '1\n00:00:00,000 --> 00:00:01,000\nBonjour\n';

function makeConfig(overrides: Partial<SubtitleProviderConfig> = {}): SubtitleProviderConfig {
	return {
		id: 'test-betaseries',
		name: 'Test BetaSeries',
		implementation: 'betaseries',
		enabled: true,
		priority: 1,
		consecutiveFailures: 0,
		requestsPerMinute: 30,
		settings: { token: 'test-token' },
		...overrides
	};
}

interface FetchCall {
	url: string;
}

function stubFetch(provider: BetaseriesProvider, calls: FetchCall[]) {
	// @ts-expect-error spying on a protected method
	vi.spyOn(provider, 'fetchWithTimeout').mockImplementation(
		// @ts-expect-error mock implementation type mismatch for protected method
		async (url: string) => {
			calls.push({ url });

			if (url.includes('episodes/display')) {
				return {
					ok: true,
					json: async () => ({
						episode: {
							subtitles: [
								{
									id: 55,
									language: 'VF',
									file: 'Show.S01E02.FR.srt',
									url: DOWNLOAD_URL
								}
							]
						}
					})
				} as Response;
			}

			if (url === DOWNLOAD_URL) {
				return {
					ok: true,
					arrayBuffer: async () => new TextEncoder().encode(SRT_CONTENT).buffer
				} as Response;
			}

			throw new Error(`Unexpected fetch URL in test: ${url}`);
		}
	);
}

describe('BetaseriesProvider manual download', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('carries the provider download URL on search results', async () => {
		const provider = new BetaseriesProvider(makeConfig());
		const calls: FetchCall[] = [];
		stubFetch(provider, calls);

		const results = await provider.search({
			title: 'Show',
			seriesTitle: 'Show',
			tvdbId: 12345,
			season: 1,
			episode: 2,
			languages: ['fr']
		});

		expect(results).toHaveLength(1);
		// Both the direct download URL and the page link survive toSearchResult().
		expect(results[0].downloadUrl).toBe(DOWNLOAD_URL);
		expect(results[0].pageLink).toBe(DOWNLOAD_URL);
		expect(results[0].providerName).toBe('betaseries');
		expect(calls[0].url).toContain('episodes/display');
	});

	it('downloads using the URL from the search result (search -> download round-trip)', async () => {
		const provider = new BetaseriesProvider(makeConfig());
		const calls: FetchCall[] = [];
		stubFetch(provider, calls);

		const [result] = await provider.search({
			title: 'Show',
			seriesTitle: 'Show',
			tvdbId: 12345,
			season: 1,
			episode: 2,
			languages: ['fr']
		});

		// Simulate the round-trip through JSON (the modal/download route): the
		// URL must be carried on the serialized result, not a private field.
		const serialized = JSON.parse(JSON.stringify(result)) as typeof result;
		const content = await provider.download(serialized);

		expect(content.toString('utf-8')).toBe(SRT_CONTENT);
		expect(calls.some((call) => call.url === DOWNLOAD_URL)).toBe(true);
	});

	it('falls back to the page link when no direct download URL is present', async () => {
		const provider = new BetaseriesProvider(makeConfig());
		const calls: FetchCall[] = [];
		stubFetch(provider, calls);

		const [result] = await provider.search({
			title: 'Show',
			seriesTitle: 'Show',
			tvdbId: 12345,
			season: 1,
			episode: 2,
			languages: ['fr']
		});

		const content = await provider.download({
			...result,
			downloadUrl: undefined,
			pageLink: DOWNLOAD_URL
		});

		expect(content.toString('utf-8')).toBe(SRT_CONTENT);
	});

	it('throws when no download URL is available at all', async () => {
		const provider = new BetaseriesProvider(makeConfig());
		stubFetch(provider, []);

		await expect(
			provider.download({
				providerId: 'betaseries',
				providerName: 'betaseries',
				providerSubtitleId: '55',
				language: 'fr',
				title: 'Show',
				isForced: false,
				isHearingImpaired: false,
				format: 'srt',
				isHashMatch: false,
				matchScore: 0
			})
		).rejects.toThrow('No download URL available');
	});
});
