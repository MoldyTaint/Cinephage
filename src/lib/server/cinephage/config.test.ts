import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper';
import { indexers, settings } from '$lib/server/db/schema';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '../indexers/types';

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
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	},
	createChildLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

const { getCinephageBackendConfig, invalidateCinephageBackendConfig } = await import('./config.js');

async function seedStreamIndexer(settingsJson: Record<string, unknown>) {
	await testDb.db.delete(indexers).where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));
	await testDb.db.insert(indexers).values({
		id: 'cinephage-stream-test',
		name: 'Cinephage Library',
		definitionId: CINEPHAGE_STREAM_DEFINITION_ID,
		enabled: true,
		baseUrl: 'http://localhost',
		priority: 50,
		enableAutomaticSearch: true,
		enableInteractiveSearch: true,
		settings: settingsJson
	});
}

describe('cinephage/config', () => {
	beforeEach(async () => {
		invalidateCinephageBackendConfig();
		await testDb.db.delete(settings);
		await testDb.db
			.delete(indexers)
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('reports configured with version and commit from streaming settings', async () => {
		await seedStreamIndexer({ cinephageVersion: '2.0.0', cinephageCommit: 'def4567' });

		const config = await getCinephageBackendConfig();

		expect(config.version).toBe('2.0.0');
		expect(config.commit).toBe('def4567');
		expect(config.baseUrl).toBe('https://api.cinephage.net');
		expect(config.configured).toBe(true);
		expect(config.missing).toEqual([]);
	});

	it('reports missing fields when streaming settings are blank', async () => {
		await seedStreamIndexer({});

		const config = await getCinephageBackendConfig();

		expect(config.configured).toBe(false);
		expect(config.missing).toEqual(['cinephageVersion', 'cinephageCommit']);
	});

	it('uses a baseUrl override from the cinephage_backend settings key', async () => {
		await seedStreamIndexer({ cinephageVersion: '2.0.0', cinephageCommit: 'def4567' });
		await testDb.db.insert(settings).values({
			key: 'cinephage_backend',
			value: JSON.stringify({ baseUrl: 'https://staging.example.net/' })
		});
		invalidateCinephageBackendConfig();

		const config = await getCinephageBackendConfig();

		expect(config.baseUrl).toBe('https://staging.example.net');
	});
});
