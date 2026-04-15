/**
 * MonitoringSearchService Unit Tests
 *
 * Regression tests for episode file lookup in searchEpisodeUpgrades.
 * Verifies that upgrade decisions use the correct episode's file as baseline,
 * not an arbitrary file from the same series (issue #213).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EpisodeContext } from '../specifications/types.js';

// --- Hoisted mocks (must be before any imports that use them) ---

const {
	findManyEpisodesMock,
	findManyEpisodeFilesMock,
	updateEpisodeMock,
	findManyDownloadQueueMock,
	mockIsSatisfied,
	searchAllMock,
	searchEnhancedMock
} = vi.hoisted(() => {
	const mockIsSatisfied = vi.fn().mockResolvedValue({ accepted: true });
	const searchAllMock = vi.fn().mockResolvedValue([]);
	const searchEnhancedMock = vi.fn().mockResolvedValue({ releases: [], rejections: [] });
	return {
		findManyEpisodesMock: vi.fn(),
		findManyEpisodeFilesMock: vi.fn(),
		updateEpisodeMock: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined)
			})
		}),
		findManyDownloadQueueMock: vi.fn().mockResolvedValue([]),
		mockIsSatisfied,
		searchAllMock,
		searchEnhancedMock
	};
});

// Mock the database
vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: {
			episodes: { findMany: findManyEpisodesMock },
			episodeFiles: { findMany: findManyEpisodeFilesMock },
			downloadQueue: { findMany: findManyDownloadQueueMock }
		},
		update: updateEpisodeMock,
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([])
			})
		})
	}
}));

// Mock logger
vi.mock('$lib/logging/index.js', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	}
}));

// Mock all specifications using class syntax so they survive clearAllMocks.
// Each spec class delegates isSatisfied to the shared hoisted mock.
function makeSpecClass() {
	return class {
		isSatisfied = mockIsSatisfied;
	};
}

vi.mock('../specifications/index.js', () => ({
	EpisodeMonitoredSpecification: makeSpecClass(),
	EpisodeCutoffUnmetSpecification: makeSpecClass(),
	EpisodeUpgradeableSpecification: makeSpecClass(),
	NewEpisodeSpecification: makeSpecClass(),
	EpisodeSearchCooldownSpecification: makeSpecClass(),
	EpisodeReadOnlyFolderSpecification: makeSpecClass(),
	ReleaseBlocklistSpecification: makeSpecClass(),
	MovieMonitoredSpecification: makeSpecClass(),
	MovieMissingContentSpecification: makeSpecClass(),
	MovieCutoffUnmetSpecification: makeSpecClass(),
	MovieUpgradeableSpecification: makeSpecClass(),
	MovieAvailabilitySpecification: makeSpecClass(),
	MovieSearchCooldownSpecification: makeSpecClass(),
	MovieReadOnlyFolderSpecification: makeSpecClass()
}));

// Mock IndexerManager — return no search results to keep things simple
vi.mock('$lib/server/indexers/IndexerManager.js', () => ({
	getIndexerManager: vi.fn(async () => ({
		searchAll: searchAllMock,
		searchEnhanced: searchEnhancedMock
	}))
}));

vi.mock('$lib/server/downloads/episode-pointer.js', () => ({
	parseEpisodePointerFromGuid: vi.fn(),
	parseEpisodePointerFromTitle: vi.fn((title: string | undefined) => {
		if (typeof title !== 'string') return null;
		const match = title.match(/^Season\s+(\d+)\s+Episode\s+(\d+)\s*-/i);
		if (!match) return null;
		return {
			season: Number.parseInt(match[1], 10),
			episode: Number.parseInt(match[2], 10),
			token: `S${match[1].padStart(2, '0')}E${match[2].padStart(2, '0')}`
		};
	})
}));

// Mock ReleaseGrabService
vi.mock('$lib/server/downloads/ReleaseGrabService.js', () => ({
	getReleaseGrabService: vi.fn(() => ({
		grabRelease: vi.fn()
	}))
}));

// Mock ReleaseParser
vi.mock('$lib/server/indexers/parser/ReleaseParser.js', () => ({
	ReleaseParser: class {
		parse = vi.fn();
	}
}));

// Mock scorer
vi.mock('$lib/server/scoring/scorer.js', () => ({
	scoreRelease: vi.fn().mockReturnValue({ totalScore: 1000, breakdown: {} }),
	isUpgrade: vi.fn().mockReturnValue({ isUpgrade: false, reason: 'test' })
}));

// Mock quality filter
vi.mock('$lib/server/quality', () => ({
	qualityFilter: {
		getProfile: vi.fn().mockResolvedValue(null),
		getDefaultScoringProfile: vi.fn().mockResolvedValue(null)
	}
}));

// Mock AlternateTitleService
vi.mock('$lib/server/services/AlternateTitleService.js', () => ({
	getMovieSearchTitles: vi.fn().mockResolvedValue([]),
	getSeriesSearchTitles: vi.fn().mockResolvedValue([])
}));

// Mock TaskCancelledException
vi.mock('$lib/server/tasks/TaskCancelledException.js', () => ({
	TaskCancelledException: class TaskCancelledException extends Error {
		constructor(msg: string) {
			super(msg);
		}
		static isTaskCancelled(err: unknown) {
			return err instanceof this;
		}
	}
}));

// --- Test data ---

const SERIES_ID = 'series-1';

const mockSeries = {
	id: SERIES_ID,
	title: 'Test Series',
	monitored: true,
	path: '/tv/test-series',
	scoringProfile: {
		id: 'best',
		name: 'Best',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 50000,
		minScoreIncrement: 100,
		formatScores: {}
	}
};

const episodeS01E01 = {
	id: 'ep-1',
	seriesId: SERIES_ID,
	seasonNumber: 1,
	episodeNumber: 1,
	title: 'Pilot',
	monitored: true,
	hasFile: true,
	series: mockSeries,
	season: { id: 'season-1', seriesId: SERIES_ID, seasonNumber: 1, monitored: true }
};

const episodeS01E02 = {
	id: 'ep-2',
	seriesId: SERIES_ID,
	seasonNumber: 1,
	episodeNumber: 2,
	title: 'Second Episode',
	monitored: true,
	hasFile: true,
	series: mockSeries,
	season: { id: 'season-1', seriesId: SERIES_ID, seasonNumber: 1, monitored: true }
};

const fileForEp1 = {
	id: 'file-ep1',
	seriesId: SERIES_ID,
	seasonNumber: 1,
	episodeIds: ['ep-1'],
	relativePath: 'Season 01/Test.Series.S01E01.720p.WEB-DL.mkv',
	sceneName: 'Test.Series.S01E01.720p.WEB-DL',
	size: 500_000_000,
	quality: { resolution: '720p', source: 'webdl' },
	dateAdded: '2026-01-01T00:00:00.000Z',
	releaseGroup: null,
	edition: null,
	releaseType: 'singleEpisode',
	mediaInfo: null,
	languages: ['en'],
	infoHash: null
};

const fileForEp2 = {
	id: 'file-ep2',
	seriesId: SERIES_ID,
	seasonNumber: 1,
	episodeIds: ['ep-2'],
	relativePath: 'Season 01/Test.Series.S01E02.1080p.BluRay.mkv',
	sceneName: 'Test.Series.S01E02.1080p.BluRay',
	size: 1_500_000_000,
	quality: { resolution: '1080p', source: 'bluray' },
	dateAdded: '2026-01-01T00:00:00.000Z',
	releaseGroup: null,
	edition: null,
	releaseType: 'singleEpisode',
	mediaInfo: null,
	languages: ['en'],
	infoHash: null
};

// --- Import the service under test (after all mocks are set up) ---

const { MonitoringSearchService } = await import('./MonitoringSearchService.js');

interface TestableService {
	getSeasonEpisodeCount(seriesId: string, seasonNumber: number): Promise<number>;
	searchAndGrabSeasonPack(...args: unknown[]): Promise<unknown>;
	searchAndGrabEpisode(...args: unknown[]): Promise<unknown>;
	searchSeriesWithCascadingStrategy(...args: unknown[]): Promise<unknown[]>;
	grabRelease(...args: unknown[]): Promise<unknown>;
}

function asTestable(service: InstanceType<typeof MonitoringSearchService>): TestableService {
	return service as unknown as TestableService;
}

describe('MonitoringSearchService - searchEpisodeUpgrades', () => {
	let service: InstanceType<typeof MonitoringSearchService>;

	beforeEach(() => {
		findManyEpisodesMock.mockReset();
		findManyEpisodeFilesMock.mockReset();
		findManyDownloadQueueMock.mockReset().mockResolvedValue([]);
		updateEpisodeMock.mockReset().mockImplementation(() => ({
			set: vi.fn().mockImplementation(() => ({
				where: vi.fn().mockResolvedValue(undefined)
			}))
		}));
		mockIsSatisfied.mockReset().mockResolvedValue({ accepted: true });

		service = new MonitoringSearchService();
		searchAllMock.mockReset().mockResolvedValue([]);
		searchEnhancedMock.mockReset().mockResolvedValue({ releases: [], rejections: [] });
	});

	it('should use the correct episode file as upgrade baseline, not an arbitrary series file (issue #213)', async () => {
		findManyEpisodesMock.mockResolvedValue([episodeS01E01]);
		findManyEpisodeFilesMock.mockResolvedValue([fileForEp1, fileForEp2]);

		const capturedContexts: EpisodeContext[] = [];
		mockIsSatisfied.mockImplementation(async (context: EpisodeContext) => {
			if (context?.existingFile) {
				capturedContexts.push({ ...context });
			}
			return { accepted: true };
		});

		await service.searchForUpgrades({
			seriesIds: [SERIES_ID],
			dryRun: true,
			ignoreCooldown: true
		});

		const ep1Contexts = capturedContexts.filter((c) => c.episode?.id === 'ep-1');
		expect(ep1Contexts.length).toBeGreaterThan(0);

		for (const ctx of ep1Contexts) {
			expect(ctx.existingFile!.id).toBe('file-ep1');
			expect(ctx.existingFile!.sceneName).toBe('Test.Series.S01E01.720p.WEB-DL');
		}
	});

	it('should skip episodes that have no matching file in episodeIds', async () => {
		const episodeWithNoFile = {
			id: 'ep-3',
			seriesId: SERIES_ID,
			seasonNumber: 1,
			episodeNumber: 3,
			title: 'Third Episode',
			monitored: true,
			hasFile: true,
			series: mockSeries,
			season: { id: 'season-1', seriesId: SERIES_ID, seasonNumber: 1, monitored: true }
		};

		findManyEpisodesMock.mockResolvedValue([episodeWithNoFile]);
		findManyEpisodeFilesMock.mockResolvedValue([fileForEp1, fileForEp2]);

		const capturedContexts: EpisodeContext[] = [];
		mockIsSatisfied.mockImplementation(async (context: EpisodeContext) => {
			if (context?.existingFile) {
				capturedContexts.push({ ...context });
			}
			return { accepted: true };
		});

		const result = await service.searchForUpgrades({
			seriesIds: [SERIES_ID],
			dryRun: true,
			ignoreCooldown: true
		});

		const ep3Contexts = capturedContexts.filter((c) => c.episode?.id === 'ep-3');
		expect(ep3Contexts.length).toBe(0);

		const ep3Results = result.items.filter((i) => i.itemId === 'ep-3');
		expect(ep3Results.length).toBe(0);
	});

	it('should correctly handle multi-episode files via episodeIds array', async () => {
		const multiEpFile = {
			...fileForEp1,
			id: 'file-multi',
			episodeIds: ['ep-1', 'ep-2'],
			relativePath: 'Season 01/Test.Series.S01E01E02.1080p.BluRay.mkv',
			sceneName: 'Test.Series.S01E01E02.1080p.BluRay',
			quality: { resolution: '1080p', source: 'bluray' }
		};

		findManyEpisodesMock.mockResolvedValue([episodeS01E01, episodeS01E02]);
		findManyEpisodeFilesMock.mockResolvedValue([multiEpFile]);

		const capturedContexts: EpisodeContext[] = [];
		mockIsSatisfied.mockImplementation(async (context: EpisodeContext) => {
			if (context?.existingFile) {
				capturedContexts.push({ ...context });
			}
			return { accepted: true };
		});

		await service.searchForUpgrades({
			seriesIds: [SERIES_ID],
			dryRun: true,
			ignoreCooldown: true
		});

		const ep1Contexts = capturedContexts.filter((c) => c.episode?.id === 'ep-1');
		const ep2Contexts = capturedContexts.filter((c) => c.episode?.id === 'ep-2');

		expect(ep1Contexts.length).toBeGreaterThan(0);
		expect(ep2Contexts.length).toBeGreaterThan(0);

		for (const ctx of [...ep1Contexts, ...ep2Contexts]) {
			expect(ctx.existingFile!.id).toBe('file-multi');
		}
	});
});

describe('MonitoringSearchService - RuTracker missing-episode behavior', () => {
	let service: InstanceType<typeof MonitoringSearchService>;
	let testable: TestableService;

	beforeEach(() => {
		findManyDownloadQueueMock.mockReset().mockResolvedValue([]);
		updateEpisodeMock.mockReset().mockImplementation(() => ({
			set: vi.fn().mockImplementation(() => ({
				where: vi.fn().mockResolvedValue(undefined)
			}))
		}));
		searchEnhancedMock.mockReset().mockResolvedValue({ releases: [], rejections: [] });
		service = new MonitoringSearchService();
		testable = asTestable(service);
	});

	it('does not treat an episode pointer as a full-season pack grab', async () => {
		const getSeasonEpisodeCountSpy = vi
			.spyOn(testable, 'getSeasonEpisodeCount')
			.mockResolvedValue(10);
		const searchSeasonPackSpy = vi.spyOn(testable, 'searchAndGrabSeasonPack').mockResolvedValue({
			itemId: 'ep-1',
			itemType: 'episode',
			title: 'Test Show Season 1',
			searched: true,
			releasesFound: 0,
			grabbed: false
		});
		const searchEpisodeSpy = vi
			.spyOn(testable, 'searchAndGrabEpisode')
			.mockResolvedValueOnce({
				itemId: 'ep-1',
				itemType: 'episode',
				title: 'Test Show S01E01',
				searched: true,
				releasesFound: 1,
				grabbed: true,
				grabbedRelease: 'Season 1 Episode 1 - Test Show: S1E1-10 of 10 [2025]'
			})
			.mockResolvedValueOnce({
				itemId: 'ep-2',
				itemType: 'episode',
				title: 'Test Show S01E02',
				searched: true,
				releasesFound: 0,
				grabbed: false
			});

		const seriesData = { id: 'series-1', title: 'Test Show' };
		const seasonMap = new Map<number, Array<{ id: string }>>([
			[1, [{ id: 'ep-1' }, { id: 'ep-2' }]]
		]);

		await testable.searchSeriesWithCascadingStrategy(seriesData, seasonMap);

		expect(getSeasonEpisodeCountSpy).toHaveBeenCalled();
		expect(searchSeasonPackSpy).not.toHaveBeenCalled();
		expect(searchEpisodeSpy).toHaveBeenCalledTimes(2);
	});

	it('skips RuTracker season-pack grabs when the season is only partially missing', async () => {
		vi.spyOn(testable, 'getSeasonEpisodeCount').mockResolvedValue(10);
		const grabReleaseSpy = vi.spyOn(testable, 'grabRelease').mockResolvedValue({
			success: true,
			releaseName: 'Should not grab'
		});

		searchEnhancedMock.mockResolvedValue({
			releases: [
				{
					title: 'Test Show: S1E1-10 of 10 [2025]',
					guid: 'https://rutracker.org/forum/viewtopic.php?t=123',
					size: 10_000_000_000,
					indexerId: 'idx-rutracker',
					indexerName: 'RuTracker.org',
					parsed: {
						episode: {
							isSeasonPack: true,
							season: 1,
							seasons: [1],
							episodes: Array.from({ length: 10 }, (_, i) => i + 1),
							isCompleteSeries: false,
							isDaily: false
						}
					},
					episodeMatch: {
						isSeasonPack: true,
						season: 1,
						seasons: [1],
						episodes: Array.from({ length: 10 }, (_, i) => i + 1),
						isCompleteSeries: false,
						isDaily: false
					},
					totalScore: 100,
					infoHash: 'abc'
				}
			],
			rejections: []
		});

		const seriesData = {
			id: 'series-1',
			title: 'Test Show',
			tmdbId: 1,
			tvdbId: 2,
			imdbId: 'tt123',
			scoringProfileId: null
		};

		const result = (await testable.searchAndGrabSeasonPack(seriesData, 1, [
			{ id: 'ep-1' },
			{ id: 'ep-2' },
			{ id: 'ep-3' },
			{ id: 'ep-4' },
			{ id: 'ep-5' }
		])) as { grabbed: boolean };

		expect(result.grabbed).toBe(false);
		expect(grabReleaseSpy).not.toHaveBeenCalled();
	});
});
