import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';

import { createTestDb, destroyTestDb, type TestDatabase } from '../../test/db-helper.js';

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

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

const { tmdb } = await import('./tmdb.js');
const { settings, languageSettings } = await import('$lib/server/db/schema.js');

const capturedUrls: URL[] = [];

beforeEach(() => {
	capturedUrls.length = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request) => {
			const url = new URL(typeof input === 'string' ? input : input.toString());
			capturedUrls.push(url);
			return new Response(JSON.stringify({ id: 1, name: 'Stub', seasons: [], genres: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		})
	);
});

afterAll(() => {
	vi.unstubAllGlobals();
	destroyTestDb(testDb);
});

async function seedApiKey() {
	await testDb.db
		.insert(settings)
		.values({ key: 'tmdb_api_key', value: 'test-key' })
		.onConflictDoUpdate({ target: settings.key, set: { value: 'test-key' } });
}

describe('tmdb client explicit language parameter', () => {
	it('getTVShow forwards an explicit language to TMDB', async () => {
		await seedApiKey();
		await tmdb.getTVShow(94997, 'de');
		expect(capturedUrls).toHaveLength(1);
		expect(capturedUrls[0].searchParams.get('language')).toBe('de');
	});

	it('getMovie forwards an explicit language to TMDB', async () => {
		await seedApiKey();
		await tmdb.getMovie(550, 'ja');
		expect(capturedUrls).toHaveLength(1);
		expect(capturedUrls[0].searchParams.get('language')).toBe('ja');
		expect(capturedUrls[0].searchParams.get('append_to_response')).toBe(
			'credits,videos,images,recommendations,similar,watch/providers,release_dates,keywords'
		);
	});

	it('getMovie without a language keeps the defaults-only behavior', async () => {
		await seedApiKey();
		await tmdb.getMovie(550);
		expect(capturedUrls).toHaveLength(1);
		expect(capturedUrls[0].searchParams.has('language')).toBe(false);
	});

	it('getSeason forwards an explicit language to TMDB', async () => {
		await seedApiKey();
		await tmdb.getSeason(94997, 1, 'de');
		expect(capturedUrls).toHaveLength(1);
		expect(capturedUrls[0].searchParams.get('language')).toBe('de');
		expect(capturedUrls[0].pathname).toBe('/3/tv/94997/season/1');
	});

	it('omits the language parameter when none is requested', async () => {
		await seedApiKey();
		await tmdb.getSeason(94997, 2);
		expect(capturedUrls).toHaveLength(1);
		expect(capturedUrls[0].searchParams.has('language')).toBe(false);
	});
});

describe('tmdb settings resolution (language_settings authority)', () => {
	beforeEach(async () => {
		tmdb.invalidateSettings();
		testDb.sqlite.prepare('DELETE FROM settings').run();
		testDb.sqlite.prepare('DELETE FROM language_settings').run();
		await seedApiKey();
		await testDb.db
			.insert(settings)
			.values({
				key: 'global_filters',
				value: JSON.stringify({
					include_adult: false,
					min_vote_average: 0,
					min_vote_count: 0,
					language: 'fr-FR',
					region: 'FR',
					excluded_genre_ids: []
				})
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: {
					value: JSON.stringify({
						include_adult: false,
						min_vote_average: 0,
						min_vote_count: 0,
						language: 'fr-FR',
						region: 'FR',
						excluded_genre_ids: []
					})
				}
			});
	});

	async function seedLanguageSettings(values: { metadataLocale: string; region: string }) {
		await testDb.db
			.insert(languageSettings)
			.values({ id: 'singleton', ...values })
			.onConflictDoUpdate({
				target: languageSettings.id,
				set: { ...values, updatedAt: new Date().toISOString() }
			});
	}

	it('prefers language_settings metadata_locale/region over global_filters', async () => {
		await seedLanguageSettings({ metadataLocale: 'de-DE', region: 'DE' });

		await tmdb.fetch('/movie/550');

		expect(capturedUrls).toHaveLength(1);
		expect(capturedUrls[0].searchParams.get('language')).toBe('de-DE');
		expect(capturedUrls[0].searchParams.get('region')).toBe('DE');
		await expect(tmdb.getRegion()).resolves.toBe('DE');
	});

	it('canonicalizes case-insensitive singleton values', async () => {
		await seedLanguageSettings({ metadataLocale: 'pt-br', region: 'br' });

		await tmdb.fetch('/movie/551');

		expect(capturedUrls[0].searchParams.get('language')).toBe('pt-BR');
		expect(capturedUrls[0].searchParams.get('region')).toBe('BR');
	});

	it('falls back to global_filters when the singleton row is missing', async () => {
		await tmdb.fetch('/movie/552');

		expect(capturedUrls[0].searchParams.get('language')).toBe('fr-FR');
		expect(capturedUrls[0].searchParams.get('region')).toBe('FR');
	});

	it('falls back to global_filters when singleton values are unparseable', async () => {
		await seedLanguageSettings({ metadataLocale: 'not a locale!!', region: 'D1' });

		await tmdb.fetch('/movie/553');

		expect(capturedUrls[0].searchParams.get('language')).toBe('fr-FR');
		expect(capturedUrls[0].searchParams.get('region')).toBe('FR');
	});

	it('keeps explicit caller params ahead of the resolved defaults', async () => {
		await seedLanguageSettings({ metadataLocale: 'de-DE', region: 'DE' });

		await tmdb.fetch('/discover/movie?language=ko&region=KR');

		expect(capturedUrls[0].searchParams.get('language')).toBe('ko');
		expect(capturedUrls[0].searchParams.get('region')).toBe('KR');
	});
});
