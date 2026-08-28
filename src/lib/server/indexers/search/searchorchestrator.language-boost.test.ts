import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchOrchestrator } from './SearchOrchestrator';
import type { IIndexer, ReleaseResult, SearchCriteria } from '../types';
import { createMockIndexer } from '../../../../test/fixtures/indexers.js';

const { enrichMock, getBlockedIdentifiersMock, findMovieMock } = vi.hoisted(() => ({
	enrichMock: vi.fn(),
	getBlockedIdentifiersMock: vi.fn(),
	findMovieMock: vi.fn()
}));

vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: {
			movies: { findFirst: findMovieMock },
			series: { findFirst: vi.fn(async () => undefined) }
		}
	}
}));

vi.mock('$lib/server/blocklist/BlocklistService.js', () => ({
	blocklistService: { getBlockedIdentifiers: getBlockedIdentifiersMock }
}));

vi.mock('$lib/server/tmdb.js', () => ({
	tmdb: {
		getMovieExternalIds: vi.fn(),
		getTvExternalIds: vi.fn(),
		getTVShow: vi.fn(),
		getSeason: vi.fn()
	}
}));

vi.mock('../../quality', async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		releaseEnricher: { enrich: enrichMock }
	};
});

const mockCapabilities = {
	search: { available: true, supportedParams: ['q'] },
	tvSearch: { available: true, supportedParams: ['q', 'season', 'ep'] },
	movieSearch: { available: true, supportedParams: ['q', 'year'] },
	categories: new Map([[2000, 'Movies']]),
	supportsPagination: true,
	supportsInfoHash: false,
	limitMax: 100,
	limitDefault: 50,
	searchFormats: { episode: ['standard'] }
};

function buildIndexer(
	protocol: string,
	releases: ReleaseResult[],
	name = 'FakeIndexer'
): { indexer: IIndexer; searchSpy: ReturnType<typeof vi.fn> } {
	const searchSpy = vi.fn(async () => releases);
	const indexer = createMockIndexer({
		id: `idx-${protocol}`,
		name,
		protocol,
		capabilities: mockCapabilities as unknown as Record<string, unknown>,
		search: searchSpy as unknown as (...args: unknown[]) => unknown
	}) as unknown as IIndexer;
	return { indexer, searchSpy };
}

let releaseCounter = 0;
function createRelease(overrides: Partial<ReleaseResult> = {}): ReleaseResult {
	releaseCounter += 1;
	return {
		guid: `guid-${releaseCounter}`,
		title: `Example Release ${releaseCounter}`,
		downloadUrl: `https://example.test/download/${releaseCounter}`,
		publishDate: new Date(),
		size: 1_000_000,
		indexerId: 'idx-torrent',
		indexerName: 'FakeIndexer',
		protocol: 'torrent',
		categories: [],
		seeders: 10,
		leechers: 1,
		infoHash: `hash-${releaseCounter}`,
		...overrides
	};
}

function mockEnrichment() {
	enrichMock.mockImplementation(async (releases: ReleaseResult[]) => ({
		releases: releases.map((r, i) => ({
			...r,
			totalScore: 100 - i,
			rejected: false,
			rejections: []
		})),
		rejectedCount: 0,
		scoringProfile: { id: 'profile-a' },
		enrichTimeMs: 1
	}));
}

describe('SearchOrchestrator language boost semantics', () => {
	let orchestrator: SearchOrchestrator;

	beforeEach(() => {
		vi.clearAllMocks();
		findMovieMock.mockResolvedValue(undefined);
		getBlockedIdentifiersMock.mockResolvedValue({
			blockedHashes: new Set<string>(),
			blockedTitles: new Set<string>()
		});
		orchestrator = new SearchOrchestrator();
	});

	it('does not mutate the source release objects in the rank path', async () => {
		const sourceRelease = createRelease({
			title: 'Example Movie 2023 1080p BluRay RUS x264'
		});
		const { indexer } = buildIndexer('torrent', [sourceRelease]);
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'Example Movie',
			language: 'ru'
		};

		const result = await orchestrator.search([indexer], criteria, { useCache: false });

		expect(result.releases).toHaveLength(1);
		// The boost must be reflected in the returned release…
		expect(result.releases[0].seeders).toBeGreaterThan(10);
		// …but the original object handed to the indexer must be untouched.
		expect(sourceRelease.seeders).toBe(10);
	});

	it('does not compound the boost across cache hits in the rank path', async () => {
		const releases = [
			createRelease({ title: 'Example Movie 2023 1080p BluRay RUS x264' }),
			createRelease({ title: 'Example Movie 2023 1080p BluRay x264' })
		];
		const { indexer } = buildIndexer('torrent', releases);
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'Example Movie',
			language: 'ru'
		};

		const first = await orchestrator.search([indexer], criteria, { useCache: true });
		const second = await orchestrator.search([indexer], criteria, { useCache: true });

		expect(second.fromCache).toBe(true);
		const rusTitle = 'Example Movie 2023 1080p BluRay RUS x264';
		const firstSeeders = first.releases.find((r) => r.title === rusTitle)?.seeders;
		const secondSeeders = second.releases.find((r) => r.title === rusTitle)?.seeders;
		expect(firstSeeders).toBeDefined();
		expect(secondSeeders).toBe(firstSeeders);
	});

	it('still ranks language-matched releases above non-matched ones', async () => {
		const releases = [
			createRelease({ title: 'Example Movie 2023 1080p BluRay x264', seeders: 50 }),
			createRelease({ title: 'Example Movie 2023 1080p BluRay RUS x264', seeders: 50 })
		];
		const { indexer } = buildIndexer('torrent', releases);
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'Example Movie',
			language: 'ru'
		};

		const result = await orchestrator.search([indexer], criteria, { useCache: false });

		expect(result.releases[0].title).toContain('RUS');
	});

	it('does not inflate seeders seen by enrichment in the enhanced path', async () => {
		mockEnrichment();
		const releases = [
			createRelease({ title: 'Example Movie 2023 1080p BluRay RUS x264' }),
			createRelease({ title: 'Example Movie 2023 1080p BluRay x264' })
		];
		const { indexer } = buildIndexer('torrent', releases);
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'Example Movie',
			language: 'ru'
		};

		await orchestrator.searchEnhanced([indexer], criteria, {
			searchSource: 'interactive',
			enrichment: { scoringProfileId: 'profile-a' }
		});

		expect(enrichMock).toHaveBeenCalledTimes(1);
		const enrichedInput = enrichMock.mock.calls[0][0] as ReleaseResult[];
		// Protocol seeder checks (minimumSeeders, dead-torrent rejection) run during
		// enrichment and must see the real seeders, not an inflated boost.
		expect(enrichedInput.map((r) => r.seeders)).toEqual([10, 10]);
	});

	it('does not compound seeders across cache hits in the enhanced path', async () => {
		mockEnrichment();
		const releases = [
			createRelease({ title: 'Example Movie 2023 1080p BluRay RUS x264' }),
			createRelease({ title: 'Example Movie 2023 1080p BluRay x264' })
		];
		const { indexer } = buildIndexer('torrent', releases);
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'Example Movie',
			language: 'ru'
		};

		await orchestrator.searchEnhanced([indexer], criteria, {
			searchSource: 'interactive',
			enrichment: { scoringProfileId: 'profile-a' }
		});
		const second = await orchestrator.searchEnhanced([indexer], criteria, {
			searchSource: 'interactive',
			enrichment: { scoringProfileId: 'profile-a' }
		});

		expect(second.fromCache).toBe(true);
		expect(enrichMock).toHaveBeenCalledTimes(2);
		const firstInput = enrichMock.mock.calls[0][0] as ReleaseResult[];
		const secondInput = enrichMock.mock.calls[1][0] as ReleaseResult[];
		expect(secondInput.map((r) => r.seeders)).toEqual(firstInput.map((r) => r.seeders));
	});
});
