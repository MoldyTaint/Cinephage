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

vi.mock('$lib/server/subtitles/services/SubtitleSettingsService.js', () => ({
	getSubtitleSettingsService: () => ({
		get: async () => null
	})
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
