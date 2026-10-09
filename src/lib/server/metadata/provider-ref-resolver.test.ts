import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const buildMetadataProviderRegistryMock = vi.fn();

vi.mock('./provider-registry.js', () => ({
	buildMetadataProviderRegistry: buildMetadataProviderRegistryMock
}));

// Imported after the mock is registered so resolveMissingAnimeProviderRefs
// picks up the mocked provider registry.
const { resolveMissingAnimeProviderRefs } = await import('./provider-ref-resolver.js');

function makeProvider(searchTitle: () => Promise<{ id: string; title: string }[]>) {
	return { isConfigured: () => true, searchTitle };
}

describe('resolveMissingAnimeProviderRefs', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not hang forever on a provider that never responds', async () => {
		// Regression test: a stalled upstream (AniList/Jikan) used to block the
		// series page's SSR load indefinitely. A provider whose searchTitle
		// never resolves must still let resolveMissingAnimeProviderRefs settle
		// once the internal per-provider timeout elapses.
		const neverResolves = makeProvider(() => new Promise(() => {}));
		buildMetadataProviderRegistryMock.mockResolvedValue({
			providers: new Map([['anilist', neverResolves]])
		});

		const resultPromise = resolveMissingAnimeProviderRefs({
			title: 'Some Anime',
			isAnime: true,
			configured: { anilist: true, mal: false }
		});

		// Advance past the 8s per-provider timeout in provider-ref-resolver.ts.
		await vi.advanceTimersByTimeAsync(8100);

		const result = await resultPromise;
		expect(result.anilist).toBeUndefined();
	});

	it('resolves normally when the provider responds quickly', async () => {
		const quick = makeProvider(async () => [{ id: '42', title: 'Some Anime' }]);
		buildMetadataProviderRegistryMock.mockResolvedValue({
			providers: new Map([['anilist', quick]])
		});

		const result = await resolveMissingAnimeProviderRefs({
			title: 'Some Anime',
			isAnime: true,
			configured: { anilist: true, mal: false }
		});

		expect(result.anilist).toBe('42');
	});

	it('skips non-anime content entirely', async () => {
		buildMetadataProviderRegistryMock.mockResolvedValue({ providers: new Map() });

		const result = await resolveMissingAnimeProviderRefs({
			title: 'Some Show',
			isAnime: false,
			configured: { anilist: true, mal: true }
		});

		expect(result).toEqual({});
		expect(buildMetadataProviderRegistryMock).not.toHaveBeenCalled();
	});
});
