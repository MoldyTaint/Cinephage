/**
 * Media matcher regression tests.
 *
 * Bug #488: accepting a match for a file that lives outside the existing
 * series'/movie's own root folder (or folder layout) wrote an episode_files /
 * movie_files row whose path cannot be resolved - ENOENT on every consumer,
 * has_file=1 false "complete" state, and rows flapping on every scan.
 *
 * The match must be refused unless the file is inside the existing entry's
 * root folder + path (the same rule disk-scan enforces for auto-linking).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, clearTestDb, type TestDatabase } from '../../../test/db-helper';
import { eq, and } from 'drizzle-orm';
import {
	rootFolders,
	series,
	movies,
	movieFiles,
	episodeFiles,
	episodes,
	unmatchedFiles,
	libraries
} from '$lib/server/db/schema.js';
import { RootFolderConflictError } from '$lib/errors';

const mocks = vi.hoisted(() => ({
	getTVShow: vi.fn(),
	getMovie: vi.fn(),
	getTvExternalIds: vi.fn(),
	getMovieExternalIds: vi.fn(),
	getSeason: vi.fn(),
	searchMovies: vi.fn(),
	searchTv: vi.fn(),
	extractMediaInfo: vi.fn(),
	getSettings: vi.fn(),
	resolveOwningLibraryForRootFolder: vi.fn()
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

vi.mock('$lib/server/tmdb.js', () => ({
	tmdb: {
		getTVShow: mocks.getTVShow,
		getMovie: mocks.getMovie,
		getTvExternalIds: mocks.getTvExternalIds,
		getMovieExternalIds: mocks.getMovieExternalIds,
		getSeason: mocks.getSeason,
		searchMovies: mocks.searchMovies,
		searchTv: mocks.searchTv
	}
}));

vi.mock('$lib/server/library/media-info.js', () => ({
	mediaInfoService: {
		extractMediaInfo: mocks.extractMediaInfo
	}
}));

vi.mock('$lib/server/monitoring/MonitoringScheduler.js', () => ({
	monitoringScheduler: {
		getSettings: mocks.getSettings
	}
}));

vi.mock('$lib/server/subtitles/services/SubtitleImportService.js', () => ({
	searchSubtitlesForNewMedia: vi.fn()
}));

vi.mock('$lib/server/library/LibraryEntityService.js', () => ({
	getLibraryEntityService: () => ({
		resolveOwningLibraryForRootFolder: mocks.resolveOwningLibraryForRootFolder
	})
}));

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

vi.mock('$lib/logging/index.js', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

const testDb: TestDatabase = createTestDb();

const { mediaMatcherService } = await import('./media-matcher.js');
const { unmatchedFileService } = await import('./unmatched-file-service.js');

async function insertRootFolder(id: string, path: string, mediaType: 'movie' | 'tv') {
	await testDb.db.insert(rootFolders).values({
		id,
		name: id,
		path,
		mediaType
	});
}

async function insertUnmatchedFile(input: {
	id: string;
	path: string;
	rootFolderId: string;
	mediaType: 'movie' | 'tv';
	parsedSeason?: number | null;
	parsedEpisode?: number | null;
}) {
	await testDb.db.insert(unmatchedFiles).values({
		id: input.id,
		path: input.path,
		rootFolderId: input.rootFolderId,
		mediaType: input.mediaType,
		parsedSeason: input.parsedSeason ?? null,
		parsedEpisode: input.parsedEpisode ?? null
	});
}

async function countEpisodeFiles(seriesId: string): Promise<number> {
	const rows = await testDb.db
		.select()
		.from(episodeFiles)
		.where(eq(episodeFiles.seriesId, seriesId));
	return rows.length;
}

async function countMovieFiles(movieId: string): Promise<number> {
	const rows = await testDb.db.select().from(movieFiles).where(eq(movieFiles.movieId, movieId));
	return rows.length;
}

async function unmatchedStillExists(id: string): Promise<boolean> {
	const rows = await testDb.db.select().from(unmatchedFiles).where(eq(unmatchedFiles.id, id));
	return rows.length > 0;
}

beforeEach(() => {
	vi.clearAllMocks();
	clearTestDb(testDb);

	// Library row referenced by series/movies foreign keys (not cleared by
	// clearTestDb, so delete any row from a previous test first).
	testDb.db.delete(libraries).run();
	testDb.db
		.insert(libraries)
		.values({
			id: 'lib-1',
			name: 'Test Library',
			slug: 'test-library',
			mediaType: 'tv'
		})
		.run();

	mocks.getTvExternalIds.mockResolvedValue({ tvdb_id: null, imdb_id: null });
	mocks.getMovieExternalIds.mockResolvedValue({ imdb_id: null });
	mocks.extractMediaInfo.mockResolvedValue({ format: 'mkv' });
	mocks.getSettings.mockResolvedValue({ subtitleSearchOnImportEnabled: false });
	mocks.resolveOwningLibraryForRootFolder.mockResolvedValue({
		id: 'lib-1',
		defaultWantsSubtitles: false,
		qualityProfileId: null
	});
});

describe('MediaMatcherService acceptMatch root folder conflict guard (bug #488)', () => {
	it('refuses to link a TV file into an existing series under a different root folder', async () => {
		await insertRootFolder('rf-a', '/mnt/tv-a', 'tv');
		await insertRootFolder('rf-b', '/mnt/tv-b', 'tv');
		await testDb.db.insert(series).values({
			id: 's1',
			tmdbId: 1001,
			title: 'Show (2016)',
			path: 'Show (2016)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf1',
			path: '/mnt/tv-b/Show (2016)/Season 4/ep.mkv',
			rootFolderId: 'rf-b',
			mediaType: 'tv',
			parsedSeason: 4,
			parsedEpisode: 1
		});

		await expect(mediaMatcherService.acceptMatch('uf1', 1001, 'tv')).rejects.toThrow(
			RootFolderConflictError
		);
		expect(await countEpisodeFiles('s1')).toBe(0);
		expect(await unmatchedStillExists('uf1')).toBe(true);
	});

	it('refuses to link a TV file into an existing series under the same root but a different folder', async () => {
		await insertRootFolder('rf-a', '/mnt/tv-a', 'tv');
		await testDb.db.insert(series).values({
			id: 's1',
			tmdbId: 1001,
			title: 'Show (2016)',
			path: 'Show (2016)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf1',
			path: '/mnt/tv-a/Other Name/Season 4/ep.mkv',
			rootFolderId: 'rf-a',
			mediaType: 'tv',
			parsedSeason: 4,
			parsedEpisode: 1
		});

		await expect(mediaMatcherService.acceptMatch('uf1', 1001, 'tv')).rejects.toThrow(
			RootFolderConflictError
		);
		expect(await countEpisodeFiles('s1')).toBe(0);
	});

	it('links a TV file normally when it is inside the existing series root folder and path', async () => {
		await insertRootFolder('rf-a', '/mnt/tv-a', 'tv');
		await testDb.db.insert(series).values({
			id: 's1',
			tmdbId: 1001,
			title: 'Show (2016)',
			path: 'Show (2016)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf1',
			path: '/mnt/tv-a/Show (2016)/Season 4/ep.mkv',
			rootFolderId: 'rf-a',
			mediaType: 'tv',
			parsedSeason: 4,
			parsedEpisode: 1
		});
		mocks.getTVShow.mockResolvedValue({ id: 1001, name: 'Show (2016)', seasons: [] });

		await mediaMatcherService.acceptMatch('uf1', 1001, 'tv');

		expect(await countEpisodeFiles('s1')).toBe(1);
		expect(await unmatchedStillExists('uf1')).toBe(false);
	});

	it('refuses to link a movie file into an existing movie under a different root folder', async () => {
		await insertRootFolder('rf-a', '/mnt/movies-a', 'movie');
		await insertRootFolder('rf-b', '/mnt/movies-b', 'movie');
		await testDb.db.insert(movies).values({
			id: 'm1',
			tmdbId: 2001,
			title: 'Movie (2010)',
			path: 'Movie (2010)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf2',
			path: '/mnt/movies-b/Movie (2010)/movie.mkv',
			rootFolderId: 'rf-b',
			mediaType: 'movie'
		});

		await expect(mediaMatcherService.acceptMatch('uf2', 2001, 'movie')).rejects.toThrow(
			RootFolderConflictError
		);
		expect(await countMovieFiles('m1')).toBe(0);
	});

	it('links a movie file normally when it is inside the existing movie root folder and path', async () => {
		await insertRootFolder('rf-a', '/mnt/movies-a', 'movie');
		await testDb.db.insert(movies).values({
			id: 'm1',
			tmdbId: 2001,
			title: 'Movie (2010)',
			path: 'Movie (2010)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf2',
			path: '/mnt/movies-a/Movie (2010)/movie.mkv',
			rootFolderId: 'rf-a',
			mediaType: 'movie'
		});
		mocks.getMovie.mockResolvedValue({
			id: 2001,
			title: 'Movie (2010)',
			release_date: '2010-05-01'
		});

		await mediaMatcherService.acceptMatch('uf2', 2001, 'movie');

		expect(await countMovieFiles('m1')).toBe(1);
		const [movieRow] = await testDb.db
			.select({ hasFile: movies.hasFile })
			.from(movies)
			.where(eq(movies.id, 'm1'));
		expect(movieRow.hasFile).toBe(true);
	});

	it('creates a new series under the file root folder when no series exists yet', async () => {
		await insertRootFolder('rf-b', '/mnt/tv-b', 'tv');
		await insertUnmatchedFile({
			id: 'uf3',
			path: '/mnt/tv-b/New Show (2020)/Season 1/ep1.mkv',
			rootFolderId: 'rf-b',
			mediaType: 'tv',
			parsedSeason: 1,
			parsedEpisode: 1
		});
		mocks.getTVShow.mockResolvedValue({
			id: 9999,
			name: 'New Show (2020)',
			first_air_date: '2020-01-01',
			seasons: [{ season_number: 1, name: 'Season 1', episode_count: 1 }]
		});
		mocks.getSeason.mockResolvedValue({
			episodes: [
				{
					id: 999,
					season_number: 1,
					episode_number: 1,
					name: 'Pilot',
					overview: '',
					air_date: '2020-01-01',
					runtime: 45
				}
			]
		});

		await mediaMatcherService.acceptMatch('uf3', 9999, 'tv');

		const [created] = await testDb.db.select().from(series).where(eq(series.tmdbId, 9999));
		expect(created.rootFolderId).toBe('rf-b');
		expect(created.path).toBe('New Show (2020)');
		// Writers never persist the resolved default profile onto items.
		expect(created.languageProfileId).toBeNull();
		expect(await countEpisodeFiles(created.id)).toBe(1);

		const epRows = await testDb.db
			.select()
			.from(episodes)
			.where(and(eq(episodes.seriesId, created.id), eq(episodes.episodeNumber, 1)));
		expect(epRows).toHaveLength(1);
	});
});

describe('MediaMatcherService auto-match root folder conflict (bug #488)', () => {
	it('keeps the file unmatched with reason root_folder_conflict when auto-match hits a conflicting root', async () => {
		await insertRootFolder('rf-a', '/mnt/tv-a', 'tv');
		await insertRootFolder('rf-b', '/mnt/tv-b', 'tv');
		await testDb.db.insert(series).values({
			id: 's1',
			tmdbId: 1001,
			title: 'Show (2016)',
			path: 'Show (2016)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf1',
			path: '/mnt/tv-b/Show (2016) [tmdbid-1001]/Season 4/ep.mkv',
			rootFolderId: 'rf-b',
			mediaType: 'tv',
			parsedSeason: 4,
			parsedEpisode: 1
		});
		mocks.getTVShow.mockResolvedValue({ id: 1001, name: 'Show (2016)', seasons: [] });

		const result = await mediaMatcherService.processUnmatchedFile('uf1');

		expect(result.matched).toBe(false);
		expect(result.reason).toContain('root folder');
		expect(await countEpisodeFiles('s1')).toBe(0);

		const [row] = await testDb.db.select().from(unmatchedFiles).where(eq(unmatchedFiles.id, 'uf1'));
		expect(row.reason).toBe('root_folder_conflict');
	});
});

describe('Manual match via unmatchedFileService (bug #488)', () => {
	it('surfaces the root folder conflict as a per-file failure', async () => {
		await insertRootFolder('rf-a', '/mnt/tv-a', 'tv');
		await insertRootFolder('rf-b', '/mnt/tv-b', 'tv');
		await testDb.db.insert(series).values({
			id: 's1',
			tmdbId: 1001,
			title: 'Show (2016)',
			path: 'Show (2016)',
			rootFolderId: 'rf-a',
			libraryId: 'lib-1'
		});
		await insertUnmatchedFile({
			id: 'uf1',
			path: '/mnt/tv-b/Show (2016)/Season 4/ep.mkv',
			rootFolderId: 'rf-b',
			mediaType: 'tv',
			parsedSeason: 4,
			parsedEpisode: 1
		});

		const result = await unmatchedFileService.matchFiles({
			fileIds: ['uf1'],
			tmdbId: 1001,
			mediaType: 'tv'
		});

		expect(result.failed).toBe(1);
		expect(result.matched).toBe(0);
		expect(result.errors[0]).toContain('root folder');
		expect(await countEpisodeFiles('s1')).toBe(0);
	});
});

describe('series-directory context matching (issue #513)', () => {
	it('matches a TV file whose filename is polluted, via its series folder name', async () => {
		await insertRootFolder('rf-513', '/media/series', 'tv');
		await insertUnmatchedFile({
			id: 'uf-513',
			path: '/media/series/Breaking Bad/Season 3/Breaking Bad - [3x13] - Full Measure.mkv',
			rootFolderId: 'rf-513',
			mediaType: 'tv',
			parsedSeason: 3,
			parsedEpisode: 13
		});

		mocks.searchTv.mockImplementation(async (query: string) => {
			if (/breaking bad/i.test(query)) {
				return {
					results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' }]
				};
			}
			return { results: [] };
		});
		mocks.getTVShow.mockResolvedValue({
			id: 1396,
			name: 'Breaking Bad',
			first_air_date: '2008-01-20',
			seasons: [{ season_number: 3, name: 'Season 3', episode_count: 13 }]
		});
		mocks.getSeason.mockResolvedValue({
			episodes: [
				{
					id: 1,
					season_number: 3,
					episode_number: 13,
					name: 'Full Measure',
					overview: '',
					air_date: '2010-06-13',
					runtime: 47
				}
			]
		});

		const result = await mediaMatcherService.processUnmatchedFile('uf-513');
		expect(result.matched).toBe(true);
		expect(result.tmdbId).toBe(1396);
		const [created] = await testDb.db.select().from(series).where(eq(series.tmdbId, 1396));
		expect(created.title).toBe('Breaking Bad');
	});
});

describe('title matching hardening (issue #513 leftovers)', () => {
	it('auto-matches a movie whose local title is the TMDB original (foreign) title', async () => {
		await insertRootFolder('rf-lab', '/media/movies', 'movie');
		await insertUnmatchedFile({
			id: 'uf-lab',
			path: '/media/movies/Im Labyrinth des Schweigens (2010).mkv',
			rootFolderId: 'rf-lab',
			mediaType: 'movie'
		});
		mocks.searchMovies.mockResolvedValue({
			results: [
				{
					id: 45642,
					title: 'Labyrinth of Lies',
					original_title: 'Im Labyrinth des Schweigens',
					release_date: '2010-11-11'
				}
			]
		});
		mocks.getMovie.mockResolvedValue({
			id: 45642,
			title: 'Labyrinth of Lies',
			original_title: 'Im Labyrinth des Schweigens',
			release_date: '2010-11-11'
		});

		const result = await mediaMatcherService.processUnmatchedFile('uf-lab');

		expect(result.matched).toBe(true);
		expect(result.tmdbId).toBe(45642);
	});

	it('auto-matches a movie whose parsed title carries a trailing article and queries TMDB with the canonical form', async () => {
		await insertRootFolder('rf-lion', '/media/movies', 'movie');
		await insertUnmatchedFile({
			id: 'uf-lion',
			path: '/media/movies/Lion King, The (1994).mkv',
			rootFolderId: 'rf-lion',
			mediaType: 'movie'
		});
		mocks.searchMovies.mockResolvedValue({
			results: [
				{
					id: 8587,
					title: 'The Lion King',
					original_title: 'The Lion King',
					release_date: '1994-06-15'
				}
			]
		});
		mocks.getMovie.mockResolvedValue({
			id: 8587,
			title: 'The Lion King',
			original_title: 'The Lion King',
			release_date: '1994-06-15'
		});

		const result = await mediaMatcherService.processUnmatchedFile('uf-lion');

		expect(mocks.searchMovies).toHaveBeenCalledWith(
			expect.stringMatching(/^the lion king$/i),
			1994,
			true
		);
		expect(result.matched).toBe(true);
		expect(result.tmdbId).toBe(8587);

		const [createdMovie] = await testDb.db.select().from(movies).where(eq(movies.tmdbId, 8587));
		expect(createdMovie.languageProfileId).toBeNull();
	});
});

describe('special episode title fallback (AroTheHawk report)', () => {
	// Episode titles below are LIVE TMDB season-0 data, verified 2026-09-20
	// (BSG tmdb 1972, Cosmos tmdb 1430). Do not "fix" them to match
	// expectations — change the matcher instead.

	it('acceptMatch resolves a title-only special via season 0 title match', async () => {
		await insertRootFolder('rf-bsg', '/mnt/tv-bsg', 'tv');
		await testDb.db.insert(series).values({
			id: 's-bsg',
			tmdbId: 1972,
			title: 'Battlestar Galactica',
			path: 'Battlestar Galactica (2003) {tvdb-73545}',
			rootFolderId: 'rf-bsg',
			libraryId: 'lib-1'
		});
		await testDb.db.insert(episodes).values([
			{
				id: 'ep-razor-1',
				seriesId: 's-bsg',
				seasonNumber: 0,
				episodeNumber: 19,
				title: 'Razor (1)',
				airDate: '2007-11-24'
			},
			{
				id: 'ep-razor-2',
				seriesId: 's-bsg',
				seasonNumber: 0,
				episodeNumber: 20,
				title: 'Razor (2)',
				airDate: '2007-11-24'
			}
		]);
		await insertUnmatchedFile({
			id: 'uf-razor',
			path: '/mnt/tv-bsg/Battlestar Galactica (2003) {tvdb-73545}/Razor (2007)/Razor (2007).mp4',
			rootFolderId: 'rf-bsg',
			mediaType: 'tv'
		});
		mocks.getTVShow.mockResolvedValue({ id: 1972, name: 'Battlestar Galactica', seasons: [] });

		await mediaMatcherService.acceptMatch('uf-razor', 1972, 'tv');

		expect(await countEpisodeFiles('s-bsg')).toBe(1);
		const [fileRow] = await testDb.db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, 's-bsg'));
		expect(fileRow.seasonNumber).toBe(0);
		// "razor2" is contained in normalized "razor2007"; "razor1" is not.
		expect(fileRow.episodeIds).toEqual(['ep-razor-2']);
		expect(fileRow.relativePath).toBe('Razor (2007)/Razor (2007).mp4');
		expect(await unmatchedStillExists('uf-razor')).toBe(false);
	});

	it('acceptMatch maps an absolute number onto the single regular season (Cosmos)', async () => {
		await insertRootFolder('rf-cosmos', '/mnt/tv-cosmos', 'tv');
		await testDb.db.insert(series).values({
			id: 's-cosmos',
			tmdbId: 1430,
			title: 'Cosmos: A Personal Voyage',
			path: 'Cosmos (1980) {tvdb-74995}',
			rootFolderId: 'rf-cosmos',
			libraryId: 'lib-1'
		});
		// Live shape: season 0 specials + a single regular season of 13.
		await testDb.db.insert(episodes).values([
			{
				id: 'ep-cosmos-s0',
				seriesId: 's-cosmos',
				seasonNumber: 0,
				episodeNumber: 1,
				title: 'A Dialogue Between Carl Sagan And Ted Turner',
				airDate: '1989-04-18'
			},
			...Array.from({ length: 12 }, (_, i) => ({
				id: `ep-cosmos-${i + 1}`,
				seriesId: 's-cosmos',
				seasonNumber: 1,
				episodeNumber: i + 1,
				title: `Cosmos Episode ${i + 1}`,
				airDate: null
			})),
			{
				id: 'ep-cosmos-13',
				seriesId: 's-cosmos',
				seasonNumber: 1,
				episodeNumber: 13,
				title: 'Who Speaks for Earth?',
				airDate: '1980-12-21'
			}
		]);
		await insertUnmatchedFile({
			id: 'uf-cosmos',
			path: '/mnt/tv-cosmos/Cosmos (1980) {tvdb-74995}/Episode 13 - Quem Responde Pela Terra (Who Speaks for Earth).mkv',
			rootFolderId: 'rf-cosmos',
			mediaType: 'tv',
			parsedEpisode: 13
		});
		mocks.getTVShow.mockResolvedValue({
			id: 1430,
			name: 'Cosmos: A Personal Voyage',
			seasons: []
		});

		await mediaMatcherService.acceptMatch('uf-cosmos', 1430, 'tv');

		expect(await countEpisodeFiles('s-cosmos')).toBe(1);
		const [fileRow] = await testDb.db
			.select()
			.from(episodeFiles)
			.where(eq(episodeFiles.seriesId, 's-cosmos'));
		expect(fileRow.seasonNumber).toBe(1);
		expect(fileRow.episodeIds).toEqual(['ep-cosmos-13']);
	});

	it('still throws when no special title matches the file', async () => {
		await insertRootFolder('rf-bsg2', '/mnt/tv-bsg2', 'tv');
		await testDb.db.insert(series).values({
			id: 's-bsg2',
			tmdbId: 1973,
			title: 'Battlestar Galactica',
			path: 'Battlestar Galactica (2003) {tvdb-73545}',
			rootFolderId: 'rf-bsg2',
			libraryId: 'lib-1'
		});
		await testDb.db.insert(episodes).values({
			id: 'ep-bsg2-19',
			seriesId: 's-bsg2',
			seasonNumber: 0,
			episodeNumber: 19,
			title: 'Razor (1)',
			airDate: '2007-11-24'
		});
		await insertUnmatchedFile({
			id: 'uf-plan',
			path: '/mnt/tv-bsg2/Battlestar Galactica (2003) {tvdb-73545}/The Plan (2009)/The Plan (2009).mp4',
			rootFolderId: 'rf-bsg2',
			mediaType: 'tv'
		});
		mocks.getTVShow.mockResolvedValue({ id: 1973, name: 'Battlestar Galactica', seasons: [] });

		await expect(mediaMatcherService.acceptMatch('uf-plan', 1973, 'tv')).rejects.toThrow(
			'Could not determine season/episode from filename'
		);
		expect(await countEpisodeFiles('s-bsg2')).toBe(0);
		expect(await unmatchedStillExists('uf-plan')).toBe(true);
	});
});
