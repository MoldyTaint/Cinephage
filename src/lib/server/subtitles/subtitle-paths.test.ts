import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper';
import {
	episodeFiles,
	episodes,
	movies,
	rootFolders,
	series,
	subtitles
} from '$lib/server/db/schema';
import { join } from 'node:path';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const { resolveStoredSubtitlePath, resolveStoredSubtitlePaths } = await import('./subtitle-paths');

type Row = typeof subtitles.$inferSelect;

/** Build a minimal stored-subtitle row for path resolution. */
function row(overrides: Partial<Row>): Row {
	return {
		id: 'sub-1',
		movieId: null,
		episodeId: null,
		movieFileId: null,
		relativePath: 'file.en.srt',
		language: 'en',
		format: 'srt',
		...overrides
	} as Row;
}

const TABLES_TO_CLEAR = [
	'episode_files',
	'episodes',
	'series',
	'movies',
	'root_folders',
	'subtitles'
];

let counter = 0;

function seedRootFolder(id: string, path: string, mediaType = 'movie'): void {
	testDb.db
		.insert(rootFolders)
		.values({ id, name: id, path, mediaType, mediaSubType: 'standard' })
		.run();
}

function seedMovie(id: string, path: string, rootFolderId: string | null): void {
	testDb.db
		.insert(movies)
		.values({ id, tmdbId: ++counter, title: id, path, rootFolderId })
		.run();
}

function seedSeries(id: string, path: string, rootFolderId: string | null): void {
	testDb.db
		.insert(series)
		.values({ id, tmdbId: ++counter, title: id, path, rootFolderId })
		.run();
}

function seedEpisode(id: string, seriesId: string, seasonNumber = 1, episodeNumber = 1): void {
	testDb.db
		.insert(episodes)
		.values({ id, seriesId, seasonNumber, episodeNumber })
		.run();
}

function seedEpisodeFile(
	id: string,
	seriesId: string,
	relativePath: string,
	episodeIds: string[]
): void {
	testDb.db
		.insert(episodeFiles)
		.values({ id, seriesId, seasonNumber: 1, relativePath, episodeIds })
		.run();
}

describe('subtitle-paths', () => {
	beforeEach(() => {
		for (const table of TABLES_TO_CLEAR) {
			testDb.sqlite.prepare(`DELETE FROM ${table}`).run();
		}
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('resolves movie rows against the movie folder', async () => {
		seedRootFolder('rf-movies', '/media/movies');
		seedMovie('movie-1', 'Status Movie (2020)', 'rf-movies');

		const path = await resolveStoredSubtitlePath(
			row({ id: 'sub-movie', movieId: 'movie-1', relativePath: 'Status Movie (2020).en.srt' })
		);

		expect(path).toBe(
			join('/media/movies', 'Status Movie (2020)', 'Status Movie (2020).en.srt')
		);
	});

	it('resolves episode rows against the episode file directory (including the season folder)', async () => {
		seedRootFolder('rf-tv', '/media/tv', 'tv');
		seedSeries('series-1', 'Status Show', 'rf-tv');
		seedEpisode('ep-1', 'series-1');
		seedEpisodeFile('ef-1', 'series-1', 'Season 01/Status Show S01E01.mkv', ['ep-1']);

		const path = await resolveStoredSubtitlePath(
			row({
				id: 'sub-ep',
				episodeId: 'ep-1',
				relativePath: 'Status Show S01E01.en.srt'
			})
		);

		expect(path).toBe(
			join('/media/tv', 'Status Show', 'Season 01', 'Status Show S01E01.en.srt')
		);
	});

	it('picks deterministically when multiple episode files claim the episode', async () => {
		seedRootFolder('rf-tv', '/media/tv', 'tv');
		seedSeries('series-1', 'Status Show', 'rf-tv');
		seedEpisode('ep-1', 'series-1');
		// Inserted out of order: the Season 02 file first.
		seedEpisodeFile('ef-2', 'series-1', 'Season 02/Status Show S02E01.mkv', ['ep-1', 'ep-2']);
		seedEpisodeFile('ef-1', 'series-1', 'Season 01/Status Show S01E01.mkv', ['ep-1']);

		const path = await resolveStoredSubtitlePath(
			row({ id: 'sub-ep', episodeId: 'ep-1', relativePath: 'sub.en.srt' })
		);

		expect(path).toBe(join('/media/tv', 'Status Show', 'Season 01', 'sub.en.srt'));
	});

	it('returns null for unresolved owners', async () => {
		seedRootFolder('rf-movies', '/media/movies');
		seedMovie('movie-no-root', 'No Root', null);
		seedSeries('series-no-root', 'No Root Show', null);
		seedEpisode('ep-no-file', 'series-no-root');

		expect(await resolveStoredSubtitlePath(row({ id: 'a', movieId: 'missing-movie' }))).toBeNull();
		expect(await resolveStoredSubtitlePath(row({ id: 'b', movieId: 'movie-no-root' }))).toBeNull();
		expect(await resolveStoredSubtitlePath(row({ id: 'c', episodeId: 'missing-episode' }))).toBeNull();
		expect(await resolveStoredSubtitlePath(row({ id: 'd', episodeId: 'ep-no-file' }))).toBeNull();
		expect(await resolveStoredSubtitlePath(row({ id: 'e' }))).toBeNull();
	});

	it('batch-resolves every row into a map', async () => {
		seedRootFolder('rf-movies', '/media/movies');
		seedMovie('movie-1', 'Movie One', 'rf-movies');
		seedRootFolder('rf-tv', '/media/tv', 'tv');
		seedSeries('series-1', 'Show One', 'rf-tv');
		seedEpisode('ep-1', 'series-1');
		seedEpisodeFile('ef-1', 'series-1', 'Show One S01E01.mkv', ['ep-1']);

		const resolved = await resolveStoredSubtitlePaths([
			row({ id: 'm1', movieId: 'movie-1', relativePath: 'Movie One.en.srt' }),
			row({ id: 'e1', episodeId: 'ep-1', relativePath: 'Show One S01E01.en.srt' }),
			row({ id: 'm2', movieId: 'missing-movie', relativePath: 'x.srt' })
		]);

		expect(resolved.get('m1')).toBe(join('/media/movies', 'Movie One', 'Movie One.en.srt'));
		expect(resolved.get('e1')).toBe(join('/media/tv', 'Show One', 'Show One S01E01.en.srt'));
		expect(resolved.get('m2')).toBeNull();
	});
});
