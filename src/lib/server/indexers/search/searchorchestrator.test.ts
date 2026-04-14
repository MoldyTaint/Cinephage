import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from './SearchOrchestrator';
import {
	Category,
	isTvSearch,
	isMovieSearch,
	type IIndexer,
	type IndexerCapabilities,
	type IndexerProtocol,
	type IndexerAccessType,
	type SearchCriteria,
	type TvSearchCriteria,
	type MovieSearchCriteria,
	type MusicSearchCriteria,
	type ReleaseResult
} from '../types';

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

function createMockIndexer(
	overrides: {
		name?: string;
		baseUrl?: string;
		capabilities?: IndexerCapabilities;
		search?: (criteria: SearchCriteria) => Promise<ReleaseResult[]>;
	} = {}
): IIndexer {
	return {
		id: 'test-indexer',
		name: overrides.name ?? 'FakeIndexer',
		definitionId: 'test-definition',
		protocol: 'torrent' as IndexerProtocol,
		accessType: 'public' as IndexerAccessType,
		capabilities: overrides.capabilities ?? mockCapabilities,
		baseUrl: overrides.baseUrl ?? 'https://example.test',
		enableAutomaticSearch: true,
		enableInteractiveSearch: true,
		search: overrides.search ?? (async (): Promise<ReleaseResult[]> => []),
		test: async () => {},
		canSearch: () => true
	};
}

function createTvCriteria(overrides: Partial<TvSearchCriteria> = {}): TvSearchCriteria {
	return { searchType: 'tv', ...overrides };
}

function createMovieCriteria(overrides: Partial<MovieSearchCriteria> = {}): MovieSearchCriteria {
	return { searchType: 'movie', ...overrides };
}

function createMusicCriteria(overrides: Partial<MusicSearchCriteria> = {}): MusicSearchCriteria {
	return { searchType: 'music', ...overrides };
}

function createRelease(overrides: Partial<ReleaseResult> = {}): ReleaseResult {
	return {
		guid: 'test-guid',
		title: '',
		downloadUrl: 'https://example.test/download',
		publishDate: new Date(),
		size: 0,
		indexerId: 'test-indexer',
		indexerName: 'FakeIndexer',
		protocol: 'torrent' as IndexerProtocol,
		categories: [],
		...overrides
	};
}

type OrchestratorPrivateApi = {
	executeMultiTitleTextSearch(
		indexer: IIndexer,
		criteria: SearchCriteria
	): Promise<ReleaseResult[]>;
	executeWithTiering(
		indexer: IIndexer,
		criteria: SearchCriteria
	): Promise<{ releases: ReleaseResult[]; searchMethod: 'id' | 'text' }>;
	filterBySeasonEpisode(
		releases: ReleaseResult[],
		criteria: SearchCriteria,
		context?: { seasonEpisodeCount?: number }
	): ReleaseResult[];
	filterByIdOrTitleMatch(releases: ReleaseResult[], criteria: SearchCriteria): ReleaseResult[];
	filterOutNonVideoArtifacts(releases: ReleaseResult[], criteria: SearchCriteria): ReleaseResult[];
	filterByTitleRelevance(releases: ReleaseResult[], criteria: SearchCriteria): ReleaseResult[];
};

function privateApi(orchestrator: SearchOrchestrator): OrchestratorPrivateApi {
	return orchestrator as unknown as OrchestratorPrivateApi;
}

describe('SearchOrchestrator.executeMultiTitleTextSearch', () => {
	it('embeds episode format into query for TV searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const criteria = createTvCriteria({ query: 'My Show', season: 1, episode: 5 });

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		const queries = captured.map((c) => c.query ?? '');
		const formats = captured.filter(isTvSearch).map((c) => c.preferredEpisodeFormat);

		expect(queries.every((q) => q === 'My Show')).toBe(true);

		expect(formats).toContain('standard');
		expect(formats).toContain('european');
		expect(formats).toContain('compact');
	});

	it('embeds season-only format into query when no episode specified', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const criteria = createTvCriteria({ query: 'My Show', season: 2 });

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		const queries = captured.map((c) => c.query ?? '');
		const formats = captured.filter(isTvSearch).map((c) => c.preferredEpisodeFormat);

		expect(queries.every((q) => q === 'My Show')).toBe(true);
		expect(formats).toContain('standard');
	});

	it('ignores empty title variants and avoids season-0 keyword suffix variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const criteria = createTvCriteria({
			query: 'One Piece',
			searchTitles: ['One Piece', '', '   ', 'One Piece'],
			season: 0
		});

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured).toHaveLength(1);
		expect(captured[0].query).toBe('One Piece');
		const tv0 = captured.filter(isTvSearch)[0];
		expect(tv0?.preferredEpisodeFormat).toBeUndefined();
	});

	it('uses title for movie searches without episode format', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const criteria = createMovieCriteria({ query: 'The Matrix', year: 1999 });

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		const queries = captured.map((c) => c.query ?? '');
		expect(queries.some((q) => q.includes('The Matrix'))).toBe(true);
		expect(captured.some((c) => isMovieSearch(c) && c.year === 1999)).toBe(true);
		expect(captured.some((c) => isMovieSearch(c) && c.year === undefined)).toBe(true);
	});

	it('adds title-only fallback variant for interactive TV episode searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			query: 'Stranger Things',
			season: 2,
			episode: 1
		});

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.filter(isTvSearch).some((c) => c.preferredEpisodeFormat === 'standard')).toBe(
			true
		);
		expect(
			captured
				.filter(isTvSearch)
				.some(
					(c) =>
						c.query === 'Stranger Things' &&
						c.season === undefined &&
						c.episode === undefined &&
						c.preferredEpisodeFormat === undefined
				)
		).toBe(true);
	});

	it('uses only Cyrillic title variants for RuTracker when native titles are available', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			name: 'RuTracker.org',
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const criteria = createTvCriteria({
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
		});

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);
		expect(captured[0].query).toBe('Как Деревянко Чехова играл');
		expect(captured.some((c) => c.query === 'Как Деревянко играл')).toBe(true);
		expect(captured.some((c) => c.query === 'How Derevyanko Chekhov Played')).toBe(false);
		expect(captured.some((c) => c.query === 'Kak Derevyanko Chekhova igral')).toBe(false);
	});

	it('reuses cached RuTracker season search results across automatic episode variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			name: 'RuTracker.org',
			baseUrl: 'https://rutracker.org/forum',
			search: async (criteria) => {
				captured.push(criteria);
				return [];
			}
		});

		const baseCriteria = createTvCriteria({
			searchSource: 'automatic',
			query: 'Stranger Things',
			searchTitles: ['Stranger Things', '怪奇物语', 'Очень странные дела'],
			season: 1
		});

		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, {
			...baseCriteria,
			episode: 1
		});
		await privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, {
			...baseCriteria,
			episode: 2
		});

		expect(captured).toHaveLength(1);
		const tvCaptured = captured.filter(isTvSearch);
		expect(tvCaptured.every((c) => c.preferredEpisodeFormat === 'standard')).toBe(true);
		expect(tvCaptured.every((c) => c.episode === undefined)).toBe(true);
		expect(tvCaptured.every((c) => c.season === 1)).toBe(true);
	});

	it('dedupes concurrent RuTracker automatic season searches into a single in-flight request', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			name: 'RuTracker.org',
			baseUrl: 'https://rutracker.org/forum',
			search: async (criteria) => {
				captured.push(criteria);
				await new Promise((resolve) => setTimeout(resolve, 15));
				return [];
			}
		});

		const baseCriteria = createTvCriteria({
			searchSource: 'automatic',
			query: 'Stranger Things',
			searchTitles: ['Stranger Things', '怪奇物语', 'Очень странные дела'],
			season: 1
		});

		await Promise.all([
			privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, {
				...baseCriteria,
				episode: 1
			}),
			privateApi(orchestrator).executeMultiTitleTextSearch(fakeIndexer, {
				...baseCriteria,
				episode: 2
			})
		]);

		expect(captured).toHaveLength(1);
		const tvCaptured = captured.filter(isTvSearch);
		expect(tvCaptured.every((c) => c.preferredEpisodeFormat === 'standard')).toBe(true);
		expect(tvCaptured.every((c) => c.episode === undefined)).toBe(true);
	});
});

describe('SearchOrchestrator.executeWithTiering', () => {
	it('falls back to text search when ID search returns no results', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
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
			search: async (criteria) => {
				captured.push(criteria);

				if (isTvSearch(criteria) && (criteria.imdbId || criteria.tvdbId)) {
					return [];
				}

				return [
					createRelease({
						guid: 'fallback-result',
						title: 'My Show S01E05 1080p WEB-DL',
						size: 1024,
						categories: [Category.TV]
					})
				];
			}
		});

		const criteria = createTvCriteria({
			query: 'My Show',
			imdbId: 'tt1234567',
			tvdbId: 123456,
			season: 1,
			episode: 5
		});

		const result = await privateApi(orchestrator).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('text');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(2);
		const cap0 = captured[0] as TvSearchCriteria;
		expect(cap0.imdbId).toBe('tt1234567');
		expect(cap0.tvdbId).toBe(123456);
		const cap1 = captured[1] as TvSearchCriteria;
		expect(cap1.imdbId).toBeUndefined();
		expect(cap1.tvdbId).toBeUndefined();
		expect(captured[1].query).toBe('My Show');
		expect(cap1.preferredEpisodeFormat).toBe('standard');
	});

	it('keeps ID search when ID results are found', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
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
			search: async (criteria) => {
				captured.push(criteria);
				return [
					createRelease({
						guid: 'id-result',
						title: 'My Show S01E05 1080p WEB-DL',
						size: 1024,
						categories: [Category.TV]
					})
				];
			}
		});

		const criteria = createTvCriteria({
			query: 'My Show',
			imdbId: 'tt1234567',
			tvdbId: 123456,
			season: 1,
			episode: 5
		});

		const result = await privateApi(orchestrator).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('id');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(1);
		const cap0 = captured[0] as TvSearchCriteria;
		expect(cap0.imdbId).toBe('tt1234567');
		expect(cap0.tvdbId).toBe(123456);
	});

	it('retries movie ID search without q/year before falling back to text', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
			capabilities: {
				...mockCapabilities,
				movieSearch: {
					available: true,
					supportedParams: ['q', 'imdbId']
				}
			},
			search: async (criteria) => {
				captured.push(criteria);

				if (isMovieSearch(criteria) && criteria.imdbId && criteria.query) {
					return [];
				}

				if (isMovieSearch(criteria) && criteria.imdbId && !criteria.query) {
					return [
						createRelease({
							guid: 'movie-id-only-result',
							title: 'Now.You.See.Me.3.2025.1080p.WEB-DL',
							size: 1024,
							categories: [Category.MOVIE]
						})
					];
				}

				return [];
			}
		});

		const criteria = createMovieCriteria({
			query: "Now You See Me: Now You Don't",
			year: 2025,
			imdbId: 'tt4712810'
		});

		const result = await privateApi(orchestrator).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('id');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(2);
		expect(captured[0].query).toBe("Now You See Me: Now You Don't");
		const cap0 = captured[0] as MovieSearchCriteria;
		expect(cap0.year).toBe(2025);
		expect(captured[1].query).toBeUndefined();
		const cap1 = captured[1] as MovieSearchCriteria;
		expect(cap1.year).toBeUndefined();
		expect(cap1.imdbId).toBe('tt4712810');
	});

	it('supplements interactive movie ID results with text fallback variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: SearchCriteria[] = [];

		const fakeIndexer = createMockIndexer({
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
			search: async (criteria) => {
				captured.push(criteria);

				if (isMovieSearch(criteria) && criteria.imdbId) {
					return [
						createRelease({
							guid: 'id-result',
							title: 'Now.You.See.Me.3.2025.1080p.WEB-DL',
							size: 1024,
							categories: [Category.MOVIE]
						})
					];
				}

				return [
					createRelease({
						guid: 'text-result',
						title: 'Now.You.See.Me.3.2025.2160p.BluRay.x265',
						size: 2048,
						categories: [Category.MOVIE]
					})
				];
			}
		});

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: "Now You See Me: Now You Don't",
			year: 2025,
			imdbId: 'tt4712810',
			searchTitles: ["Now You See Me: Now You Don't", 'Now You See Me 3']
		});

		const result = await privateApi(orchestrator).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('text');
		expect(result.releases).toHaveLength(2);
		expect(result.releases.some((r) => r.guid === 'id-result')).toBe(true);
		expect(result.releases.some((r) => r.guid === 'text-result')).toBe(true);
		const cap0 = captured[0] as MovieSearchCriteria;
		expect(cap0.imdbId).toBe('tt4712810');
		const cap1 = captured[1] as MovieSearchCriteria;
		expect(cap1.imdbId).toBeUndefined();
	});
});

describe('SearchOrchestrator.filterBySeasonEpisode', () => {
	const orchestrator = new SearchOrchestrator();

	it('prefers exact episode matches for interactive season+episode search', () => {
		const releases = [
			createRelease({ title: 'Smallville.S01E01.1080p.WEBRip' }),
			createRelease({ title: 'Smallville.S01.COMPLETE.1080p.BluRay' }),
			createRelease({ title: 'Smallville.S01-S05.1080p.BluRay' })
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1,
			episode: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r) => r.title);

		expect(titles).toEqual(['Smallville.S01E01.1080p.WEBRip']);
	});

	it('falls back to single-season packs for interactive season+episode search when exact episode is missing', () => {
		const releases = [
			createRelease({ title: 'Smallville.S01.COMPLETE.1080p.BluRay' }),
			createRelease({ title: 'Smallville.S01-S05.1080p.BluRay' })
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1,
			episode: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r) => r.title);
		const guids = filtered.map((r) => r.guid ?? '');

		expect(filtered).toHaveLength(1);
		expect(titles[0]).toContain('Season 1 Episode 1 - ');
		expect(titles[0]).toContain('Smallville.S01.COMPLETE.1080p.BluRay');
		expect(guids[0]).toContain('episode-pointer::s01e01');
		expect(filtered[0].season).toBe(1);
		expect(filtered[0].episode).toBe(1);
	});

	it('keeps season-only interactive searches as season packs', () => {
		const releases = [
			createRelease({ title: 'Smallville.S01.COMPLETE.1080p.BluRay' }),
			createRelease({ title: 'Smallville.S01E01.1080p.WEBRip' })
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Smallville.S01.COMPLETE.1080p.BluRay');
	});

	it('formats season-pack titles for season-only interactive searches', () => {
		const releases = [
			createRelease({ title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]' })
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Stranger Things: S1E1-8 of 8 [2016, WEB-DL 2160p]');
	});

	it('keeps single-season packs for automatic season+episode search', () => {
		const releases = [
			createRelease({ title: 'Smallville.S01E01.1080p.WEBRip' }),
			createRelease({ title: 'Smallville.S01.COMPLETE.1080p.BluRay' }),
			createRelease({ title: 'Smallville.S01-S05.1080p.BluRay' })
		];

		const criteria = createTvCriteria({
			searchSource: 'automatic',
			season: 1,
			episode: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r) => r.title).sort();

		expect(titles).toEqual(
			['Smallville.S01.COMPLETE.1080p.BluRay', 'Smallville.S01E01.1080p.WEBRip'].sort()
		);
	});

	it('rejects incomplete RuTracker season packs for season-only searches', () => {
		const releases = [
			createRelease({
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org'
			}),
			createRelease({
				title: '/ Stranger Things / S1E1-6 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org'
			})
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria, {
			seasonEpisodeCount: 8
		});

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Stranger Things: S1E1-8 of 8 [2016, WEB-DL 2160p]');
	});

	it('rejects RuTracker packs that exceed target season episode count', () => {
		const releases = [
			createRelease({
				title: 'The Vampire Diaries: S1E1-171 of 171 [2009-2017, BDRip] MVO (LostFilm)',
				indexerName: 'RuTracker.org'
			})
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria, {
			seasonEpisodeCount: 22
		});

		expect(filtered).toHaveLength(0);
	});

	it('uses episode pointers for RuTracker season packs in automatic episode searches', () => {
		const releases = [
			createRelease({
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-pack'
			})
		];

		const criteria = createTvCriteria({
			searchSource: 'automatic',
			season: 1,
			episode: 8
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Season 1 Episode 8 - ');
		expect(filtered[0].guid).toContain('episode-pointer::s01e08');
	});

	it('returns RuTracker episode pointers only in interactive episode workflow', () => {
		const releases = [
			createRelease({
				title: 'Stranger Things.S01E08.1080p.WEBRip',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-exact'
			}),
			createRelease({
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-pack'
			})
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			season: 1,
			episode: 8
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].guid).toContain('episode-pointer::s01e08');
		expect(filtered[0].title).toContain('Season 1 Episode 8 - ');
	});

	it('returns RuTracker episode pointers only in automatic episode workflow', () => {
		const releases = [
			createRelease({
				title: 'Stranger Things.S01E08.1080p.WEBRip',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-exact'
			}),
			createRelease({
				title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]',
				indexerName: 'RuTracker.org',
				guid: 'rutracker-pack'
			})
		];

		const criteria = createTvCriteria({
			searchSource: 'automatic',
			season: 1,
			episode: 8
		});

		const filtered = privateApi(orchestrator).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].guid).toContain('episode-pointer::s01e08');
		expect(filtered[0].title).toContain('Season 1 Episode 8 - ');
	});
});

describe('SearchOrchestrator.filterByIdOrTitleMatch', () => {
	const orchestrator = new SearchOrchestrator();

	it('rejects wrong-year movie releases even without searchTitles', () => {
		const releases = [
			createRelease({ title: 'Now.You.See.Me.2013.1080p.BluRay.x264', indexerName: 'FakeIndexer' }),
			createRelease({
				title: 'Now.You.See.Me.Now.You.Dont.2025.1080p.WEB-DL.DDP5.1.H.265',
				indexerName: 'FakeIndexer'
			})
		];

		const criteria = createMovieCriteria({
			query: "Now You See Me: Now You Don't",
			imdbId: 'tt4712810',
			tmdbId: 425274,
			year: 2025
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		const titles = filtered.map((r) => r.title);

		expect(titles).toEqual(['Now.You.See.Me.Now.You.Dont.2025.1080p.WEB-DL.DDP5.1.H.265']);
	});

	it('keeps movie releases with unknown year when IDs are absent', () => {
		const releases = [
			createRelease({
				title: 'Now.You.See.Me.Now.You.Dont.1080p.WEB-DL.REPACK',
				indexerName: 'FakeIndexer'
			})
		];

		const criteria = createMovieCriteria({
			query: "Now You See Me: Now You Don't",
			imdbId: 'tt4712810',
			tmdbId: 425274,
			year: 2025
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Now.You.See.Me.Now.You.Dont.1080p.WEB-DL.REPACK');
	});

	it('keeps interactive movie results when title is localized and year is missing on localized trackers', () => {
		const releases = [
			createRelease({ title: 'Военная машина WEB-DL', indexerName: 'RuTracker.org' })
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'War Machine',
			searchTitles: ['War Machine'],
			year: 2017
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Военная машина WEB-DL');
	});

	it('keeps interactive movie results when title is transliterated and year matches on localized trackers', () => {
		const releases = [
			createRelease({
				title: 'Osobennosti nacionalnoy ohoty [1995, Russia, comedy, DVDRip]',
				indexerName: 'RuTracker.org'
			})
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'Peculiarities of the National Hunt',
			searchTitles: ['Peculiarities of the National Hunt'],
			year: 1995
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Osobennosti nacionalnoy ohoty');
	});

	it('keeps automatic filtering strict for localized title mismatch', () => {
		const releases = [
			createRelease({ title: 'Военная машина WEB-DL', indexerName: 'FakeIndexer' })
		];

		const criteria = createMovieCriteria({
			searchSource: 'automatic',
			query: 'War Machine',
			searchTitles: ['War Machine'],
			year: 2017
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(0);
	});
});

describe('SearchOrchestrator.filterOutNonVideoArtifacts', () => {
	const orchestrator = new SearchOrchestrator();

	it('rejects soundtrack/audio collection releases for movie searches', () => {
		const releases = [
			createRelease({
				title: '(Score, Soundtrack) [CD] The Matrix Soundtrack Collection'
			}),
			createRelease({
				title: 'The.Matrix.1999.1080p.BluRay.x264'
			})
		];

		const criteria = createMovieCriteria({
			query: 'The Matrix'
		});

		const filtered = privateApi(orchestrator).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('The.Matrix.1999.1080p.BluRay.x264');
	});

	it('keeps video releases even when title contains ambiguous words', () => {
		const releases = [
			createRelease({
				title: 'The.Score.2001.1080p.BluRay.x264'
			})
		];

		const criteria = createMovieCriteria({
			query: 'The Score'
		});

		const filtered = privateApi(orchestrator).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('The.Score.2001.1080p.BluRay.x264');
	});

	it('does not apply non-video artifact filter to music searches', () => {
		const releases = [
			createRelease({
				title: 'The Matrix Soundtrack OST FLAC'
			})
		];

		const criteria = createMusicCriteria({
			query: 'The Matrix Soundtrack'
		});

		const filtered = privateApi(orchestrator).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('The Matrix Soundtrack OST FLAC');
	});
});

describe('SearchOrchestrator.filterByTitleRelevance', () => {
	const orchestrator = new SearchOrchestrator();

	it('keeps tracker titles that contain the expected movie title plus extra metadata', () => {
		const releases = [
			createRelease({
				title:
					'War Machine (Patrick Hughes) [2026, UK, Australia, New Zealand, USA, sci-fi, action, WEB-DLRip] Dub + Sub (Rus, Eng)'
			}),
			createRelease({
				title: 'Completely Different Movie [2026, USA, WEB-DLRip]'
			})
		];

		const criteria = createMovieCriteria({
			query: 'War Machine',
			searchTitles: ['War Machine', 'Máquina de Guerra']
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('War Machine');
	});

	it('matches localized unicode movie titles when expected title is localized', () => {
		const releases = [
			createRelease({
				title: 'Особенности национальной охоты [1995, комедия, DVDRip]'
			}),
			createRelease({
				title: 'Другой фильм [1995, драма, DVDRip]'
			})
		];

		const criteria = createMovieCriteria({
			query: 'Особенности национальной охоты',
			searchTitles: ['Особенности национальной охоты']
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Особенности национальной охоты');
	});

	it('does not fallback to pre-filtered releases for generic interactive movie localization mismatches', () => {
		const releases = [
			createRelease({ title: 'Osobennosti nacionalnoy ohoty [1995, comedy, DVDRip]' })
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'Peculiarities of the National Hunt',
			searchTitles: ['Peculiarities of the National Hunt']
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps TV releases with long tracker metadata when series title matches', () => {
		const releases = [
			createRelease({
				title: 'The Night Agent / Ночной агент S03E10 [2026, WEB-DL 1080p, Dub, Sub Rus, Eng]'
			}),
			createRelease({
				title: 'Different Show S03E10 [2026, WEB-DL 1080p]'
			})
		];

		const criteria = createTvCriteria({
			query: 'The Night Agent',
			searchTitles: ['The Night Agent']
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('The Night Agent');
	});

	it('filters trailer-like non-video artifacts from movie searches', () => {
		const releases = [
			createRelease({ title: 'Avatar Fire and Ash Trailer 1 WEB-DL 1080p x264' }),
			createRelease({ title: 'Avatar Fire and Ash Teaser WEB-DL 720p x264' }),
			createRelease({ title: 'Avatar Fire and Ash 2025 1080p WEB-DL x264-GROUP' })
		];

		const criteria = createMovieCriteria({
			query: 'Avatar Fire and Ash'
		});

		const filtered = privateApi(orchestrator).filterOutNonVideoArtifacts(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('2025');
	});

	it('falls back to pre-filtered releases for interactive TV when relevance removes all', () => {
		const releases = [
			createRelease({ title: 'Совсем другой сериал S01E01 [2026, WEB-DL 1080p]' }),
			createRelease({ title: 'Не связано S01E02 [2026, WEB-DL 1080p]' })
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti']
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(2);
		expect(filtered).toEqual(releases);
	});

	it('keeps episode-targeted TV searches strict and does not fallback to unrelated results', () => {
		const releases = [
			createRelease({ title: 'Совсем другой сериал S01E01 [2026, WEB-DL 1080p]' }),
			createRelease({ title: 'Не связано S01E02 [2026, WEB-DL 1080p]' })
		];

		const criteria = createTvCriteria({
			searchSource: 'interactive',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti'],
			season: 1,
			episode: 2
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps automatic TV title relevance strict when no titles match', () => {
		const releases = [
			createRelease({ title: 'Completely Different Show S01E01 [2026, WEB-DL 1080p]' }),
			createRelease({ title: 'Not Related Series S01E02 [2026, WEB-DL 1080p]' })
		];

		const criteria = createTvCriteria({
			searchSource: 'automatic',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti']
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps generic interactive movie ID/title checks strict while preserving direct aliases', () => {
		const releases = [
			createRelease({ title: 'Сталкер / Stalker [1979, BDRip 1080p]', indexerName: 'FakeIndexer' }),
			createRelease({ title: 'Пикник на обочине [1979, WEB-DL 1080p]' })
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'Stalker',
			searchTitles: ['Stalker'],
			year: 1979
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Stalker');
	});

	it('rejects wrong-year movie releases during interactive fallback', () => {
		const releases = [
			createRelease({ title: 'Avatar 3 2026 1080p WEB h264-ETHEL' }),
			createRelease({ title: 'Avatar Fire and Ash 2026 720p HDTV x264-SYNCOPY' }),
			createRelease({ title: 'Avatar Fire and Ash 2025 720p WEBRip x264-GROUP' })
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'Avatar Fire and Ash',
			searchTitles: ['Avatar Fire and Ash'],
			year: 2025
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('2025');
		expect(filtered[0].title).toContain('Avatar Fire and Ash');
	});

	it('keeps interactive movie title relevance strict when titles do not match', () => {
		const releases = [
			createRelease({ title: 'Avatar 3 2026 1080p WEB h264-ETHEL' }),
			createRelease({ title: 'Completely Different Movie 2025 1080p WEB-DL' })
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'Avatar Fire and Ash',
			searchTitles: ['Avatar Fire and Ash'],
			year: 2025
		});

		const filtered = privateApi(orchestrator).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps explicit ID mismatches strict during localized interactive ID/title fallback', () => {
		const releases = [
			createRelease({
				title: 'Сталкер / Stalker [1979, BDRip 1080p]',
				tmdbId: 999999,
				indexerName: 'RuTracker.org'
			}),
			createRelease({
				title: 'Пикник на обочине [1979, WEB-DL 1080p]',
				indexerName: 'RuTracker.org'
			})
		];

		const criteria = createMovieCriteria({
			searchSource: 'interactive',
			query: 'Stalker',
			searchTitles: ['Stalker'],
			year: 1979,
			tmdbId: 1398
		});

		const filtered = privateApi(orchestrator).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('Пикник');
	});
});
