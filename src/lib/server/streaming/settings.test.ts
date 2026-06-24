import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper';
import { indexers } from '$lib/server/db/schema';
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

const { sanitizeStreamingIndexerSettings, getStreamingIndexerSettings } =
	await import('./settings');

describe('streaming/settings', () => {
	beforeEach(async () => {
		await testDb.db
			.delete(indexers)
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));
		await testDb.db.insert(indexers).values({
			id: 'cinephage-stream-test',
			name: 'Cinephage Library',
			definitionId: CINEPHAGE_STREAM_DEFINITION_ID,
			enabled: true,
			baseUrl: 'http://localhost',
			priority: 50,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			settings: {}
		});
	});

	afterAll(() => {
		destroyTestDb(testDb);
	});

	it('sanitizes streaming settings to the supported keys only', () => {
		expect(
			sanitizeStreamingIndexerSettings({
				cinephageCommit: 'def4567890abcdef123456',
				cinephageVersion: '2.0.0',
				useHttps: 'true',
				externalHost: 'example.com:3000',
				cinephageApiBaseUrl: 'https://override.invalid',
				cinephageClientKey: 'legacy-key'
			})
		).toEqual({
			cinephageCommit: 'def4567890abcdef123456',
			cinephageVersion: '2.0.0',
			useHttps: 'true',
			externalHost: 'example.com:3000'
		});
	});

	it('preserves manually entered streaming auth values', () => {
		expect(
			sanitizeStreamingIndexerSettings({
				cinephageCommit: 'abc1234567890abcdef',
				cinephageVersion: '1.0.0'
			})
		).toEqual({
			cinephageCommit: 'abc1234567890abcdef',
			cinephageVersion: '1.0.0'
		});
	});

	it('keeps manual streaming auth values while cleaning unsupported keys', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'abc1234567890abcdef',
					cinephageVersion: '1.0.0',
					cinephageClientKey: 'legacy-key',
					cinephageApiBaseUrl: 'https://override.invalid',
					externalHost: 'example.com:3000',
					useHttps: 'true'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		const settings = await getStreamingIndexerSettings();
		expect(settings).toMatchObject({
			cinephageCommit: 'abc1234567890abcdef',
			cinephageVersion: '1.0.0',
			externalHost: 'example.com:3000',
			useHttps: 'true',
			baseUrl: 'https://example.com:3000'
		});

		const [row] = await testDb.db
			.select({ settings: indexers.settings })
			.from(indexers)
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		expect(row?.settings).toEqual({
			cinephageCommit: 'abc1234567890abcdef',
			cinephageVersion: '1.0.0',
			externalHost: 'example.com:3000',
			useHttps: 'true'
		});
	});
});
