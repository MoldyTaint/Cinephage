import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from './SearchOrchestrator';
import type { IndexerCapabilities } from '../types';

// Shared mock capabilities for test indexers
const mockCapabilities: IndexerCapabilities = {
	search: { available: true, supportedParams: ['q'] },
	tvSearch: { available: true, supportedParams: ['q', 'season', 'ep'] },
	movieSearch: { available: true, supportedParams: ['q', 'year'] },
	categories: new Map(),
	supportsPagination: true,
	supportsInfoHash: false,
	limitMax: 100,
	limitDefault: 50,
	searchFormats: {
		episode: ['standard', 'european', 'compact']
	}
};

describe('SearchOrchestrator.executeMultiTitleTextSearch', () => {
	it('embeds episode format into query for TV searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			season: 1,
			episode: 5
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		// With the new architecture, queries are CLEAN (no embedded tokens)
		// and preferredEpisodeFormat tells TemplateEngine which format to use
		const queries = captured.map((c) => c.query);
		const formats = captured.map((c) => c.preferredEpisodeFormat);

		// All queries should be clean (just the title)
		expect(queries.every((q: string) => q === 'My Show')).toBe(true);

		// Should have all three format variants
		expect(formats).toContain('standard');
		expect(formats).toContain('european');
		expect(formats).toContain('compact');
	});

	it('embeds season-only format into query when no episode specified', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			season: 2
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		// Season-only search should use standard format (S02)
		// Query is clean, preferredEpisodeFormat tells TemplateEngine to add S02
		const queries = captured.map((c) => c.query);
		const formats = captured.map((c) => c.preferredEpisodeFormat);

		expect(queries.every((q: string) => q === 'My Show')).toBe(true);
		expect(formats).toContain('standard'); // S02 is standard format
	});

	it('ignores empty title variants and avoids season-0 keyword suffix variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'One Piece',
			searchTitles: ['One Piece', '', '   ', 'One Piece'],
			season: 0
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured).toHaveLength(1);
		expect(captured[0].query).toBe('One Piece');
		expect(captured[0].preferredEpisodeFormat).toBeUndefined();
	});

	it('uses title for movie searches without episode format', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			query: 'The Matrix',
			year: 1999
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		const queries = captured.map((c) => c.query);
		expect(queries.some((q: string) => q.includes('The Matrix'))).toBe(true);
		// Default movie text-search fallback should try both year-constrained
		// and no-year variants for better cross-indexer compatibility.
		expect(captured.some((c: any) => c.year === 1999)).toBe(true);
		expect(captured.some((c: any) => c.year === undefined)).toBe(true);
	});

	it('adds title-only fallback variant for interactive TV episode searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'Stranger Things',
			season: 2,
			episode: 1
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.some((c: any) => c.preferredEpisodeFormat === 'standard')).toBe(true);
		expect(
			captured.some(
				(c: any) =>
					c.query === 'Stranger Things' &&
					c.season === undefined &&
					c.episode === undefined &&
					c.preferredEpisodeFormat === undefined
			)
		).toBe(true);
	});

	it('uses only Cyrillic title variants for RuTracker when native titles are available', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'RuTracker.org',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'How Derevyanko Chekhov Played',
			searchTitles: [
				'How Derevyanko Chekhov Played',
				'How Derevyanko Played',
				'Как Деревянко Чехова играл',
				'Как Деревянко играл',
				'Kak Derevyanko Chekhova igral'
			],
			season: 1
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);
		expect(captured[0].query).toBe('Как Деревянко Чехова играл');
		expect(captured.some((c: any) => c.query === 'Как Деревянко играл')).toBe(true);
		expect(captured.some((c: any) => c.query === 'How Derevyanko Chekhov Played')).toBe(false);
		expect(captured.some((c: any) => c.query === 'Kak Derevyanko Chekhova igral')).toBe(false);
	});

	it('reuses cached RuTracker season search results across automatic episode variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'RuTracker.org',
			baseUrl: 'https://rutracker.org/forum',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const baseCriteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			query: 'Stranger Things',
			searchTitles: ['Stranger Things', '怪奇物语', 'Очень странные дела'],
			season: 1
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, {
			...baseCriteria,
			episode: 1
		});
		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, {
			...baseCriteria,
			episode: 2
		});

		// Only the native-script title should be queried, and the second call should be served from cache.
		expect(captured).toHaveLength(1);
		expect(captured.every((c: any) => c.preferredEpisodeFormat === 'standard')).toBe(true);
		expect(captured.every((c: any) => c.episode === undefined)).toBe(true);
		expect(captured.every((c: any) => c.season === 1)).toBe(true);
	});

	it('dedupes concurrent RuTracker automatic season searches into a single in-flight request', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'RuTracker.org',
			baseUrl: 'https://rutracker.org/forum',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				await new Promise((resolve) => setTimeout(resolve, 15));
				return [];
			}
		} as any;

		const baseCriteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			query: 'Stranger Things',
			searchTitles: ['Stranger Things', '怪奇物语', 'Очень странные дела'],
			season: 1
		} as any;

		await Promise.all([
			(orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, {
				...baseCriteria,
				episode: 1
			}),
			(orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, {
				...baseCriteria,
				episode: 2
			})
		]);

		// Only the native-script title should be queried, and concurrent calls should dedupe to one request.
		expect(captured).toHaveLength(1);
		expect(captured.every((c: any) => c.preferredEpisodeFormat === 'standard')).toBe(true);
		expect(captured.every((c: any) => c.episode === undefined)).toBe(true);
	});
});

describe('SearchOrchestrator.executeWithTiering', () => {
	it('falls back to text search when ID search returns no results', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				tvSearch: {
					available: true,
					supportedParams: ['q', 'imdbId', 'tvdbId', 'season', 'ep']
				},
				searchFormats: {
					episode: ['standard']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);

				// First call (ID search) returns no results.
				if (criteria.imdbId || criteria.tvdbId) {
					return [];
				}

				// Fallback text search returns a result.
				return [
					{
						guid: 'fallback-result',
						title: 'My Show S01E05 1080p WEB-DL',
						indexerId: 'test-indexer',
						indexerName: 'FakeIndexer',
						downloadUrl: 'https://example.test/download',
						detailsUrl: 'https://example.test/details',
						protocol: 'usenet',
						sourceProtocol: 'usenet',
						size: 1024,
						publishDate: new Date().toISOString(),
						seeders: 0,
						leechers: 0,
						grabs: 0,
						categories: [5000]
					}
				];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			imdbId: 'tt1234567',
			tvdbId: 123456,
			season: 1,
			episode: 5
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('text');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(2);
		expect(captured[0].imdbId).toBe('tt1234567');
		expect(captured[0].tvdbId).toBe(123456);
		expect(captured[1].imdbId).toBeUndefined();
		expect(captured[1].tvdbId).toBeUndefined();
		expect(captured[1].query).toBe('My Show');
		expect(captured[1].preferredEpisodeFormat).toBe('standard');
	});

	it('keeps ID search when ID results are found', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				tvSearch: {
					available: true,
					supportedParams: ['q', 'imdbId', 'tvdbId', 'season', 'ep']
				},
				searchFormats: {
					episode: ['standard']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);
				return [
					{
						guid: 'id-result',
						title: 'My Show S01E05 1080p WEB-DL',
						indexerId: 'test-indexer',
						indexerName: 'FakeIndexer',
						downloadUrl: 'https://example.test/download',
						detailsUrl: 'https://example.test/details',
						protocol: 'usenet',
						sourceProtocol: 'usenet',
						size: 1024,
						publishDate: new Date().toISOString(),
						seeders: 0,
						leechers: 0,
						grabs: 0,
						categories: [5000]
					}
				];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			imdbId: 'tt1234567',
			tvdbId: 123456,
			season: 1,
			episode: 5
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('id');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(1);
		expect(captured[0].imdbId).toBe('tt1234567');
		expect(captured[0].tvdbId).toBe(123456);
	});

	it('retries movie ID search without q/year before falling back to text', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				movieSearch: {
					available: true,
					supportedParams: ['q', 'imdbId']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);

				// First attempt: ID + q/year returns no results.
				if (criteria.imdbId && criteria.query) {
					return [];
				}

				// Second attempt: ID only returns a hit.
				if (criteria.imdbId && !criteria.query) {
					return [
						{
							guid: 'movie-id-only-result',
							title: 'Now.You.See.Me.3.2025.1080p.WEB-DL',
							indexerId: 'test-indexer',
							indexerName: 'FakeIndexer',
							downloadUrl: 'https://example.test/download',
							detailsUrl: 'https://example.test/details',
							protocol: 'usenet',
							sourceProtocol: 'usenet',
							size: 1024,
							publishDate: new Date().toISOString(),
							seeders: 0,
							leechers: 0,
							grabs: 0,
							categories: [2000]
						}
					];
				}

				// Text fallback should not be needed in this case.
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			query: "Now You See Me: Now You Don't",
			year: 2025,
			imdbId: 'tt4712810'
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('id');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(2);
		expect(captured[0].query).toBe("Now You See Me: Now You Don't");
		expect(captured[0].year).toBe(2025);
		expect(captured[1].query).toBeUndefined();
		expect(captured[1].year).toBeUndefined();
		expect(captured[1].imdbId).toBe('tt4712810');
	});

	it('supplements interactive movie ID results with text fallback variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				movieSearch: {
					available: true,
					supportedParams: ['q', 'imdbId']
				},
				searchFormats: {
					episode: ['standard'],
					movie: ['standard', 'noYear']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);

				// ID search succeeds first.
				if (criteria.imdbId) {
					return [
						{
							guid: 'id-result',
							title: 'Now.You.See.Me.3.2025.1080p.WEB-DL',
							indexerId: 'test-indexer',
							indexerName: 'FakeIndexer',
							downloadUrl: 'https://example.test/download/id',
							detailsUrl: 'https://example.test/details/id',
							protocol: 'usenet',
							sourceProtocol: 'usenet',
							size: 1024,
							publishDate: new Date().toISOString(),
							seeders: 0,
							leechers: 0,
							grabs: 0,
							categories: [2000]
						}
					];
				}

				// Text variant returns a unique release.
				return [
					{
						guid: 'text-result',
						title: 'Now.You.See.Me.3.2025.2160p.BluRay.x265',
						indexerId: 'test-indexer',
						indexerName: 'FakeIndexer',
						downloadUrl: 'https://example.test/download/text',
						detailsUrl: 'https://example.test/details/text',
						protocol: 'usenet',
						sourceProtocol: 'usenet',
						size: 2048,
						publishDate: new Date().toISOString(),
						seeders: 0,
						leechers: 0,
						grabs: 0,
						categories: [2000]
					}
				];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: "Now You See Me: Now You Don't",
			year: 2025,
			imdbId: 'tt4712810',
			searchTitles: ["Now You See Me: Now You Don't", 'Now You See Me 3']
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('text');
		expect(result.releases).toHaveLength(2);
		expect(result.releases.some((r: any) => r.guid === 'id-result')).toBe(true);
		expect(result.releases.some((r: any) => r.guid === 'text-result')).toBe(true);
		expect(captured[0].imdbId).toBe('tt4712810');
		expect(captured[1].imdbId).toBeUndefined();
	});
});

describe('SearchOrchestrator.filterBySeasonEpisode', () => {
	const orchestrator = new SearchOrchestrator();

	it('prefers exact episode matches for interactive season+episode search', () => {
		const releases = [
			{ title: 'Smallville.S01E01.1080p.WEBRip' },
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01-S05.1080p.BluRay' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1,
			episode: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r: any) => r.title);

		expect(titles).toEqual(['Smallville.S01E01.1080p.WEBRip']);
	});

	it('falls back to single-season packs for interactive season+episode search when exact episode is missing', () => {
		const releases = [
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01-S05.1080p.BluRay' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1,
			episode: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r: any) => r.title);
		const guids = filtered.map((r: any) => r.guid ?? '');

		expect(filtered).toHaveLength(1);
		expect(titles[0]).toContain('Season 1 Episode 1 - ');
		expect(titles[0]).toContain('Smallville.S01.COMPLETE.1080p.BluRay');
		expect(guids[0]).toContain('episode-pointer::s01e01');
		expect(filtered[0].season).toBe(1);
		expect(filtered[0].episode).toBe(1);
	});

	it('keeps season-only interactive searches as season packs', () => {
		const releases = [
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01E01.1080p.WEBRip' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Smallville.S01.COMPLETE.1080p.BluRay');
	});

	it('formats season-pack titles for season-only interactive searches', () => {
		const releases = [{ title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]' }] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Stranger Things: S1E1-8 of 8 [2016, WEB-DL 2160p]');
	});

	it('keeps single-season packs for automatic season+episode search', () => {
		const releases = [
			{ title: 'Smallville.S01E01.1080p.WEBRip' },
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01-S05.1080p.BluRay' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			season: 1,
			episode: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r: any) => r.title).sort();

		expect(titles).toEqual(
			['Smallville.S01.COMPLETE.1080p.BluRay', 'Smallville.S01E01.1080p.WEBRip'].sort()
		);
	});

	it('rejects incomplete RuTracker season packs for season-only searches', () => {
		const releases = [
			{
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org'
			},
			{
				title: '/ Stranger Things / S1E1-6 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria, {
			seasonEpisodeCount: 8
		});

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Stranger Things: S1E1-8 of 8 [2016, WEB-DL 2160p]');
	});

	it('rejects RuTracker packs that exceed target season episode count', () => {
		const releases = [
			{
				title: 'The Vampire Diaries: S1E1-171 of 171 [2009-2017, BDRip] MVO (LostFilm)',
				indexerName: 'RuTracker.org'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria, {
			seasonEpisodeCount: 22
		});

		expect(filtered).toHaveLength(0);
	});

	it('uses episode pointers for RuTracker season packs in automatic episode searches', () => {
		const releases = [
			{
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-pack'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			season: 1,
			episode: 8
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Season 1 Episode 8 - ');
		expect(filtered[0].guid).toContain('episode-pointer::s01e08');
	});

	it('returns RuTracker episode pointers only in interactive episode workflow', () => {
		const releases = [
			{
				title: 'Stranger Things.S01E08.1080p.WEBRip',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-exact'
			},
			{
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-pack'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1,
			episode: 8
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].guid).toContain('episode-pointer::s01e08');
		expect(filtered[0].title).toContain('Season 1 Episode 8 - ');
	});

	it('returns RuTracker episode pointers only in automatic episode workflow', () => {
		const releases = [
			{
				title: 'Stranger Things.S01E08.1080p.WEBRip',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-exact'
			},
			{
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-pack'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			season: 1,
			episode: 8
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].guid).toContain('episode-pointer::s01e08');
		expect(filtered[0].title).toContain('Season 1 Episode 8 - ');
	});
});

describe('SearchOrchestrator.filterByIdOrTitleMatch', () => {
	const orchestrator = new SearchOrchestrator();

	it('rejects wrong-year movie releases even without searchTitles', () => {
		const releases = [
			{ title: 'Now.You.See.Me.2013.1080p.BluRay.x264', indexerName: 'FakeIndexer' },
			{
				title: 'Now.You.See.Me.Now.You.Dont.2025.1080p.WEB-DL.DDP5.1.H.265',
				indexerName: 'FakeIndexer'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: "Now You See Me: Now You Don't",
			imdbId: 'tt4712810',
			tmdbId: 425274,
			year: 2025
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		const titles = filtered.map((r: any) => r.title);

		expect(titles).toEqual(['Now.You.See.Me.Now.You.Dont.2025.1080p.WEB-DL.DDP5.1.H.265']);
	});

	it('keeps movie releases with unknown year when IDs are absent', () => {
		const releases = [
			{ title: 'Now.You.See.Me.Now.You.Dont.1080p.WEB-DL.REPACK', indexerName: 'FakeIndexer' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: "Now You See Me: Now You Don't",
			imdbId: 'tt4712810',
			tmdbId: 425274,
			year: 2025
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Now.You.See.Me.Now.You.Dont.1080p.WEB-DL.REPACK');
	});

	it('keeps interactive movie results when title is localized and year is missing on localized trackers', () => {
		const releases = [{ title: 'Военная машина WEB-DL', indexerName: 'RuTracker.org' }] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'War Machine',
			searchTitles: ['War Machine'],
			year: 2017
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Военная машина WEB-DL');
	});

	it('keeps interactive movie results when title is transliterated and year matches on localized trackers', () => {
		const releases = [
			{
				title: 'Osobennosti nacionalnoy ohoty [1995, Russia, comedy, DVDRip]',
				indexerName: 'RuTracker.org'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'Peculiarities of the National Hunt',
			searchTitles: ['Peculiarities of the National Hunt'],
			year: 1995
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Osobennosti nacionalnoy ohoty');
	});

	it('keeps automatic filtering strict for localized title mismatch', () => {
		const releases = [{ title: 'Военная машина WEB-DL', indexerName: 'FakeIndexer' }] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'automatic',
			query: 'War Machine',
			searchTitles: ['War Machine'],
			year: 2017
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(0);
	});
});

describe('SearchOrchestrator.filterOutNonVideoArtifacts', () => {
	const orchestrator = new SearchOrchestrator();

	it('rejects soundtrack/audio collection releases for movie searches', () => {
		const releases = [
			{
				title: '(Score, Soundtrack) [CD] The Matrix Soundtrack Collection'
			},
			{
				title: 'The.Matrix.1999.1080p.BluRay.x264'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: 'The Matrix'
		} as any;

		const filtered = (orchestrator as any).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('The.Matrix.1999.1080p.BluRay.x264');
	});

	it('keeps video releases even when title contains ambiguous words', () => {
		const releases = [
			{
				title: 'The.Score.2001.1080p.BluRay.x264'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: 'The Score'
		} as any;

		const filtered = (orchestrator as any).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('The.Score.2001.1080p.BluRay.x264');
	});

	it('does not apply non-video artifact filter to music searches', () => {
		const releases = [
			{
				title: 'The Matrix Soundtrack OST FLAC'
			}
		] as any[];

		const criteria = {
			searchType: 'music',
			query: 'The Matrix Soundtrack'
		} as any;

		const filtered = (orchestrator as any).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('The Matrix Soundtrack OST FLAC');
	});
});

describe('SearchOrchestrator.filterByTitleRelevance', () => {
	const orchestrator = new SearchOrchestrator();

	it('keeps tracker titles that contain the expected movie title plus extra metadata', () => {
		const releases = [
			{
				title:
					'War Machine (Patrick Hughes) [2026, UK, Australia, New Zealand, USA, sci-fi, action, WEB-DLRip] Dub + Sub (Rus, Eng)'
			},
			{
				title: 'Completely Different Movie [2026, USA, WEB-DLRip]'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: 'War Machine',
			searchTitles: ['War Machine', 'Máquina de Guerra']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('War Machine');
	});

	it('matches localized unicode movie titles when expected title is localized', () => {
		const releases = [
			{
				title: 'Особенности национальной охоты [1995, комедия, DVDRip]'
			},
			{
				title: 'Другой фильм [1995, драма, DVDRip]'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: 'Особенности национальной охоты',
			searchTitles: ['Особенности национальной охоты']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Особенности национальной охоты');
	});

	it('does not fallback to pre-filtered releases for generic interactive movie localization mismatches', () => {
		const releases = [{ title: 'Osobennosti nacionalnoy ohoty [1995, comedy, DVDRip]' }] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'Peculiarities of the National Hunt',
			searchTitles: ['Peculiarities of the National Hunt']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps TV releases with long tracker metadata when series title matches', () => {
		const releases = [
			{
				title: 'The Night Agent / Ночной агент S03E10 [2026, WEB-DL 1080p, Dub, Sub Rus, Eng]'
			},
			{
				title: 'Different Show S03E10 [2026, WEB-DL 1080p]'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('The Night Agent');
	});

	it('filters trailer-like non-video artifacts from movie searches', () => {
		const releases = [
			{ title: 'Avatar Fire and Ash Trailer 1 WEB-DL 1080p x264' },
			{ title: 'Avatar Fire and Ash Teaser WEB-DL 720p x264' },
			{ title: 'Avatar Fire and Ash 2025 1080p WEB-DL x264-GROUP' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: 'Avatar Fire and Ash'
		} as any;

		const filtered = (orchestrator as any).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('2025');
	});

	it('falls back to pre-filtered releases for interactive TV when relevance removes all', () => {
		const releases = [
			{ title: 'Совсем другой сериал S01E01 [2026, WEB-DL 1080p]' },
			{ title: 'Не связано S01E02 [2026, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(2);
		expect(filtered).toEqual(releases);
	});

	it('keeps episode-targeted TV searches strict and does not fallback to unrelated results', () => {
		const releases = [
			{ title: 'Совсем другой сериал S01E01 [2026, WEB-DL 1080p]' },
			{ title: 'Не связано S01E02 [2026, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti'],
			season: 1,
			episode: 2
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps automatic TV title relevance strict when no titles match', () => {
		const releases = [
			{ title: 'Completely Different Show S01E01 [2026, WEB-DL 1080p]' },
			{ title: 'Not Related Series S01E02 [2026, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps generic interactive movie ID/title checks strict while preserving direct aliases', () => {
		const releases = [
			{ title: 'Сталкер / Stalker [1979, BDRip 1080p]', indexerName: 'FakeIndexer' },
			{ title: 'Пикник на обочине [1979, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'Stalker',
			searchTitles: ['Stalker'],
			year: 1979
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Stalker');
	});

	it('rejects wrong-year movie releases during interactive fallback', () => {
		const releases = [
			{ title: 'Avatar 3 2026 1080p WEB h264-ETHEL' },
			{ title: 'Avatar Fire and Ash 2026 720p HDTV x264-SYNCOPY' },
			{ title: 'Avatar Fire and Ash 2025 720p WEBRip x264-GROUP' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'Avatar Fire and Ash',
			searchTitles: ['Avatar Fire and Ash'],
			year: 2025
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('2025');
		expect(filtered[0].title).toContain('Avatar Fire and Ash');
	});

	it('keeps interactive movie title relevance strict when titles do not match', () => {
		const releases = [
			{ title: 'Avatar 3 2026 1080p WEB h264-ETHEL' },
			{ title: 'Completely Different Movie 2025 1080p WEB-DL' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'Avatar Fire and Ash',
			searchTitles: ['Avatar Fire and Ash'],
			year: 2025
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps explicit ID mismatches strict during localized interactive ID/title fallback', () => {
		const releases = [
			{
				title: 'Сталкер / Stalker [1979, BDRip 1080p]',
				tmdbId: 999999,
				indexerName: 'RuTracker.org'
			},
			{ title: 'Пикник на обочине [1979, WEB-DL 1080p]', indexerName: 'RuTracker.org' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'Stalker',
			searchTitles: ['Stalker'],
			year: 1979,
			tmdbId: 1398
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Пикник');
	});
});
