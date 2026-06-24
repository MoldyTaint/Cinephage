import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper';
import { settings } from '$lib/server/db/schema';

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

vi.mock('$lib/logging', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

const { getMetadataProviderConfig, setMetadataProviderConfig } =
	await import('./provider-settings.js');

describe('metadata/provider-settings (source)', () => {
	beforeEach(async () => {
		await testDb.db.delete(settings);
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('defaults to cinephage source on a fresh install', async () => {
		const config = await getMetadataProviderConfig();
		expect(config.animeEnrichmentEnabled).toBe(true);
		expect(config.source).toBe('cinephage');
	});

	it('migrates an existing install with a tmdb_api_key to source=tmdb', async () => {
		await testDb.db.insert(settings).values({ key: 'tmdb_api_key', value: 'some-key' });
		await testDb.db.insert(settings).values({
			key: 'metadata_providers',
			value: JSON.stringify({ animeEnrichmentEnabled: true })
		});

		const config = await getMetadataProviderConfig();
		expect(config.source).toBe('tmdb');
	});

	it('keeps an explicit source=tmdb even without a tmdb_api_key', async () => {
		await testDb.db.insert(settings).values({
			key: 'metadata_providers',
			value: JSON.stringify({ source: 'tmdb', animeEnrichmentEnabled: true })
		});

		const config = await getMetadataProviderConfig();
		expect(config.source).toBe('tmdb');
	});

	it('honors explicit source=cinephage even when a tmdb_api_key exists', async () => {
		await testDb.db.insert(settings).values({ key: 'tmdb_api_key', value: 'some-key' });
		await testDb.db.insert(settings).values({
			key: 'metadata_providers',
			value: JSON.stringify({ source: 'cinephage', animeEnrichmentEnabled: true })
		});

		const config = await getMetadataProviderConfig();
		expect(config.source).toBe('cinephage');
	});

	it('persists source via setMetadataProviderConfig', async () => {
		await setMetadataProviderConfig({ source: 'tmdb' });
		const config = await getMetadataProviderConfig();
		expect(config.source).toBe('tmdb');
	});
});
