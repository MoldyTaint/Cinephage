import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper';
import { series, episodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const testDb: TestDatabase = createTestDb();

const {
	mockIsConfigured,
	mockGetEpisodePage,
	mockGetEpisodeExtended,
	mockSearchSeries,
	mockGetTvExternalIds
} = vi.hoisted(() => ({
	mockIsConfigured: vi.fn(),
	mockGetEpisodePage: vi.fn(),
	mockGetEpisodeExtended: vi.fn(),
	mockSearchSeries: vi.fn(),
	mockGetTvExternalIds: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));
vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

vi.mock('$lib/server/tmdb.js', () => ({
	tmdb: { getTvExternalIds: mockGetTvExternalIds }
}));
vi.mock('$lib/server/tvdb.js', () => ({
	tvdb: {
		isConfigured: mockIsConfigured,
		getEpisodePage: mockGetEpisodePage,
		getEpisodeExtended: mockGetEpisodeExtended,
		searchSeries: mockSearchSeries
	}
}));

const {
	buildEpisodeMap,
	planPass1,
	planPass2Targets,
	pickTvdbSeriesMatch,
	TvdbEpisodeEnrichmentService
} = await import('./TvdbEpisodeEnrichmentService.js');

import type { TvdbEpisode } from '$lib/server/tvdb.js';

function makeEpisode(over: Partial<TvdbEpisode> & { id: number }): TvdbEpisode {
	return {
		seriesId: 0,
		name: null,
		aired: null,
		runtime: null,
		overview: null,
		image: null,
		number: 1,
		seasonNumber: 1,
		absoluteNumber: 0,
		...over
	} as TvdbEpisode;
}

describe('TVDB enrichment planning (pure)', () => {
	it('buildEpisodeMap keys by season-number', () => {
		const map = buildEpisodeMap([
			makeEpisode({ id: 1, seasonNumber: 1, number: 1 }),
			makeEpisode({ id: 2, seasonNumber: 1, number: 2 }),
			makeEpisode({ id: 3, seasonNumber: 0, number: 1 })
		]);
		expect(map.get('1-1')?.id).toBe(1);
		expect(map.get('1-2')?.id).toBe(2);
		expect(map.get('0-1')?.id).toBe(3);
		expect(map.has('9-9')).toBe(false);
	});

	it('planPass1 fills only NULL airDate/runtime/tvdbId', () => {
		const tvdbMap = buildEpisodeMap([
			makeEpisode({ id: 111, seasonNumber: 1, number: 1, aired: '2002-09-20', runtime: 42 })
		]);
		const libraryEpisodes = [
			// fully missing -> all three filled
			{
				id: 'a',
				seasonNumber: 1,
				episodeNumber: 1,
				title: null,
				overview: null,
				airDate: null,
				runtime: null,
				tvdbId: null
			},
			// already populated -> NO update
			{
				id: 'b',
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'x',
				overview: 'x',
				airDate: '2020-01-01',
				runtime: 60,
				tvdbId: 999
			}
		];

		const updates = planPass1(libraryEpisodes, tvdbMap);
		expect(updates).toHaveLength(1);
		expect(updates[0].episodeId).toBe('a');
		expect(updates[0].airDate).toBe('2002-09-20');
		expect(updates[0].runtime).toBe(42);
		expect(updates[0].tvdbId).toBe(111);
		// 'b' must not appear (all fields non-null)
		expect(updates.find((u) => u.episodeId === 'b')).toBeUndefined();
	});

	it('planPass1 skips unmatched episodes and partial gaps', () => {
		const tvdbMap = buildEpisodeMap([
			makeEpisode({ id: 5, seasonNumber: 2, number: 3, aired: '2021-05-01', runtime: 45 })
		]);
		const libraryEpisodes = [
			// no matching TVDB episode at S3E1
			{
				id: 'nomatch',
				seasonNumber: 3,
				episodeNumber: 1,
				title: null,
				overview: null,
				airDate: null,
				runtime: null,
				tvdbId: null
			},
			// only airDate is null -> single-field update
			{
				id: 'partial',
				seasonNumber: 2,
				episodeNumber: 3,
				title: 't',
				overview: 'o',
				airDate: null,
				runtime: 45,
				tvdbId: 7
			}
		];
		const updates = planPass1(libraryEpisodes, tvdbMap);
		expect(updates).toHaveLength(1);
		expect(updates[0].episodeId).toBe('partial');
		expect(updates[0].airDate).toBe('2021-05-01');
		expect(updates[0].runtime).toBeUndefined();
		expect(updates[0].tvdbId).toBeUndefined();
	});

	it('planPass2Targets targets only episodes missing title/overview with a match', () => {
		const tvdbMap = buildEpisodeMap([
			makeEpisode({ id: 10, seasonNumber: 1, number: 1 }),
			makeEpisode({ id: 11, seasonNumber: 1, number: 2 })
		]);
		const libraryEpisodes = [
			{ id: 'a', seasonNumber: 1, episodeNumber: 1, title: null, overview: null }, // target
			{ id: 'b', seasonNumber: 1, episodeNumber: 2, title: 'has', overview: 'has' }, // not missing
			{ id: 'c', seasonNumber: 5, episodeNumber: 5, title: null, overview: null } // no match
		];
		const targets = planPass2Targets(libraryEpisodes as never, tvdbMap);
		expect(targets).toEqual([{ episodeId: 'a', tvdbEpisodeId: 10 }]);
	});

	it('pickTvdbSeriesMatch prefers exact matches and rejects weak ones', () => {
		const results = [
			{ id: 1, name: 'Firefly', year: '2002' },
			{ id: 2, name: 'Firefly Music Festival', year: '2014' },
			{ id: 3, name: 'Totally Unrelated Show', year: '1999' }
		];
		expect(pickTvdbSeriesMatch(results, 'Firefly', 2002)).toBe(1);
		// weak/no overlap -> null
		expect(pickTvdbSeriesMatch(results, 'Some Random Title', 2002)).toBeNull();
		expect(pickTvdbSeriesMatch([], 'Firefly', 2002)).toBeNull();
	});
});

describe('TvdbEpisodeEnrichmentService (db)', () => {
	let service: InstanceType<typeof TvdbEpisodeEnrichmentService>;

	function insertSeries(over: Record<string, unknown> = {}) {
		const id = (over.id as string) ?? `s-${Math.random().toString(36).slice(2, 8)}`;
		testDb.db
			.insert(series)
			.values({
				id,
				tmdbId: over.tmdbId ?? Math.floor(Math.random() * 1000000),
				title: over.title ?? 'Firefly',
				path: over.path ?? '/media/firefly',
				year: over.year ?? 2002,
				tvdbId: over.tvdbId ?? null,
				...over
			} as never)
			.run();
		return id;
	}

	function insertEpisode(over: Record<string, unknown>) {
		testDb.db
			.insert(episodes)
			.values({
				id: over.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
				seriesId: over.seriesId,
				seasonNumber: over.seasonNumber ?? 1,
				episodeNumber: over.episodeNumber ?? 1,
				...over
			} as never)
			.run();
	}

	beforeEach(() => {
		// wipe series + episodes
		testDb.db.delete(episodes).run();
		testDb.db.delete(series).run();

		mockIsConfigured.mockReset();
		mockGetEpisodePage.mockReset();
		mockGetEpisodeExtended.mockReset();
		mockSearchSeries.mockReset();
		mockGetTvExternalIds.mockReset();

		service = new TvdbEpisodeEnrichmentService({
			intervalHours: 999,
			batchSize: 10,
			apiDelayMs: 0,
			maxEpisodeExtendedCallsPerRun: 50,
			runOnStartup: false
		});
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('fills only NULL fields and leaves TMDB-populated fields untouched (canonicality)', async () => {
		mockIsConfigured.mockResolvedValue(true);
		mockGetTvExternalIds.mockResolvedValue({ tvdb_id: 78874 });
		mockGetEpisodePage.mockResolvedValue({
			episodes: [
				makeEpisode({
					id: 111,
					seasonNumber: 1,
					number: 1,
					aired: '2002-09-20',
					runtime: 42
				}),
				makeEpisode({
					id: 112,
					seasonNumber: 1,
					number: 2,
					aired: '2002-09-27',
					runtime: 42
				})
			],
			hasNext: false
		});
		mockGetEpisodeExtended.mockResolvedValue(
			makeEpisode({
				id: 111,
				seasonNumber: 1,
				number: 1,
				name: 'Serenity',
				overview: 'The pilot episode.',
				aired: '2002-09-20',
				runtime: 42
			})
		);

		const sid = insertSeries({ title: 'Firefly', year: 2002 });
		// ep1: all gaps
		insertEpisode({
			seriesId: sid,
			seasonNumber: 1,
			episodeNumber: 1,
			airDate: null,
			runtime: null,
			tvdbId: null,
			title: null,
			overview: null
		});
		// ep2: already has TMDB data including a DIFFERENT airDate that must be preserved
		insertEpisode({
			seriesId: sid,
			seasonNumber: 1,
			episodeNumber: 2,
			airDate: '2020-01-01',
			runtime: 60,
			tvdbId: 999,
			title: 'Existing',
			overview: 'keep'
		});

		const summary = await service.triggerEnrichment();

		expect(summary.seriesProcessed).toBe(1);
		expect(summary.seriesUpdated).toBe(1);
		// ep1: one pass-1 update (airDate+runtime+tvdbId) + one pass-2 update (title+overview)
		expect(summary.episodesFilled).toBeGreaterThanOrEqual(2);

		const rows = testDb.db
			.select()
			.from(episodes)
			.where(eq(episodes.seriesId, sid))
			.all() as Record<string, unknown>[];

		const ep1 = rows.find((r) => Number(r.seasonNumber) === 1 && Number(r.episodeNumber) === 1);
		const ep2 = rows.find((r) => Number(r.seasonNumber) === 1 && Number(r.episodeNumber) === 2);

		// ep1 filled from TVDB
		expect(ep1?.airDate).toBe('2002-09-20');
		expect(ep1?.runtime).toBe(42);
		expect(ep1?.tvdbId).toBe(111);
		expect(ep1?.title).toBe('Serenity');
		expect(ep1?.overview).toBe('The pilot episode.');

		// ep2 untouched (TMDB canonical — NULL-only rule)
		expect(ep2?.airDate).toBe('2020-01-01');
		expect(ep2?.runtime).toBe(60);
		expect(ep2?.tvdbId).toBe(999);
		expect(ep2?.title).toBe('Existing');
		expect(ep2?.overview).toBe('keep');
	});

	it('skips the run entirely when TVDB is not configured', async () => {
		mockIsConfigured.mockResolvedValue(false);
		const sid = insertSeries();
		insertEpisode({ seriesId: sid, seasonNumber: 1, episodeNumber: 1, title: null });

		const summary = await service.triggerEnrichment();

		expect(summary.seriesProcessed).toBe(0);
		expect(mockGetEpisodePage).not.toHaveBeenCalled();
	});

	it('skips a series when no tvdbId can be resolved', async () => {
		mockIsConfigured.mockResolvedValue(true);
		mockGetTvExternalIds.mockResolvedValue({ tvdb_id: null });
		mockSearchSeries.mockResolvedValue([]);

		const sid = insertSeries({ title: 'Unknown Show', year: 2050 });
		insertEpisode({ seriesId: sid, seasonNumber: 1, episodeNumber: 1, title: null });

		const summary = await service.triggerEnrichment();

		expect(summary.seriesProcessed).toBe(1);
		expect(summary.seriesUpdated).toBe(0);
		expect(summary.skipped).toBe(1);
		expect(mockGetEpisodePage).not.toHaveBeenCalled();
	});
});
