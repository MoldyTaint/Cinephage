import { describe, it, expect, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createTestDb, destroyTestDb } from '../../../test/db-helper.js';
import { isGeneratedEpisodeTitle } from './episode-title.js';

const testDb = createTestDb();

const fetchCalls: string[] = [];

vi.mock('$lib/server/db', () => ({
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
		fetch: vi.fn(async (url: string) => {
			fetchCalls.push(url);
			if (/\/episode\/4\?/.test(url)) {
				// Localized (German) response carries only a TMDB-generated name.
				return { name: 'Folge 4', overview: '' };
			}
			if (/\/episode\/5\?/.test(url)) {
				// Localized response with a real translation.
				return { name: 'Die echte Übersetzung', overview: 'Echte Beschreibung.' };
			}
			if (/\/episode\/\d+$/.test(url)) {
				return { name: 'The Real Title', overview: 'Real overview.' };
			}
			return {};
		})
	}
}));

const { refreshSeriesMetadata } = await import('./metadata-refresh.js');
const { series, episodes } = await import('$lib/server/db/schema.js');

testDb.db
	.insert(series)
	.values({
		id: 'series-1',
		tmdbId: 4242,
		title: 'Test Series',
		path: 'Test Series',
		metadataLanguage: 'de'
	})
	.run();

testDb.db
	.insert(episodes)
	.values([
		{
			id: 'episode-1',
			seriesId: 'series-1',
			seasonNumber: 2,
			episodeNumber: 4,
			title: 'The Real Title',
			overview: 'Existing overview.'
		},
		{
			id: 'episode-2',
			seriesId: 'series-1',
			seasonNumber: 2,
			episodeNumber: 5,
			title: 'Old Title',
			overview: null
		}
	])
	.run();

afterAll(() => {
	destroyTestDb(testDb);
});

async function getEpisode(id: string) {
	const [row] = await testDb.db.select().from(episodes).where(eq(episodes.id, id));
	return row;
}

describe('isGeneratedEpisodeTitle', () => {
	it('flags TMDB-generated placeholder names across languages', () => {
		expect(isGeneratedEpisodeTitle('Folge 12')).toBe(true);
		expect(isGeneratedEpisodeTitle('Episode 8')).toBe(true);
		expect(isGeneratedEpisodeTitle('Épisode 3')).toBe(true);
		expect(isGeneratedEpisodeTitle('Episodio 21')).toBe(true);
		expect(isGeneratedEpisodeTitle('Episódio 5')).toBe(true);
		expect(isGeneratedEpisodeTitle('Odcinek 7')).toBe(true);
		expect(isGeneratedEpisodeTitle('Эпизод 9')).toBe(true);
		expect(isGeneratedEpisodeTitle('Bölüm 14')).toBe(true);
		expect(isGeneratedEpisodeTitle('第8話')).toBe(true);
	});

	it('accepts real titles, including ones containing template words', () => {
		expect(isGeneratedEpisodeTitle('The Real Title')).toBe(false);
		expect(isGeneratedEpisodeTitle('Folgen und Folgen')).toBe(false);
		expect(isGeneratedEpisodeTitle('')).toBe(true);
	});
});

describe('refreshSeriesMetadata placeholder protection', () => {
	it('does not overwrite a real title with a generated localized name and falls back to the original-language title', async () => {
		await refreshSeriesMetadata('series-1');

		const row = await getEpisode('episode-1');
		expect(row.title).toBe('The Real Title');

		// A non-localized request must have been made as the fallback source.
		expect(fetchCalls.some((url) => /\/episode\/4$/.test(url))).toBe(true);
	});

	it('still stores genuine translations', async () => {
		await refreshSeriesMetadata('series-1');

		const row = await getEpisode('episode-2');
		expect(row.title).toBe('Die echte Übersetzung');
		expect(row.overview).toBe('Echte Beschreibung.');
	});
});
