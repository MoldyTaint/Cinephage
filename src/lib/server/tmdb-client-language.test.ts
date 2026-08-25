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
const { settings } = await import('$lib/server/db/schema.js');

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
