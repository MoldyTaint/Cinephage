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
});

describe('SearchOrchestrator.filterBySeasonEpisode', () => {
	const orchestrator = new SearchOrchestrator();

	it('excludes season packs for interactive season+episode search', () => {
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
});
