import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createTestDb,
	destroyTestDb,
	clearTestDb,
	type TestDatabase
} from '../../../../test/db-helper';
import { api } from '../../../../test/api-helper';

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

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
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

const { GET, PUT } = await import('./+server');
const { subtitleSettingsUpdateSchema } = await import('$lib/validation/schemas');

describe('Subtitle Settings API', () => {
	afterAll(() => {
		destroyTestDb(testDb);
	});

	beforeEach(() => {
		clearTestDb(testDb);
	});

	it('no longer exposes language defaults (moved to language_settings)', async () => {
		const { status, data } = await api.get<Record<string, unknown>>(GET);

		expect(status).toBe(200);
		expect(data).not.toHaveProperty('defaultLanguageProfileId');
		expect(data).not.toHaveProperty('defaultFallbackLanguage');
		expect(data).not.toHaveProperty('autoSyncEnabled');
	});

	it('accepts a patch without the removed language default keys', async () => {
		const { status, data } = await api.put<Record<string, unknown>>(PUT, {});

		expect(status).toBe(200);
		expect(data).not.toHaveProperty('defaultLanguageProfileId');
		expect(data).not.toHaveProperty('defaultFallbackLanguage');
		expect(data).not.toHaveProperty('autoSyncEnabled');
	});

	it('strips the removed language default keys at the schema layer', () => {
		const parsed = subtitleSettingsUpdateSchema.parse({
			defaultLanguageProfileId: '11111111-1111-4111-8111-111111111111',
			defaultFallbackLanguage: 'en'
		});

		expect(parsed).toEqual({});
	});

	it('silently strips the removed language default keys on PUT', async () => {
		const { status, data } = await api.put<Record<string, unknown>>(PUT, {
			defaultLanguageProfileId: '11111111-1111-4111-8111-111111111111',
			defaultFallbackLanguage: 'en'
		});

		expect(status).toBe(200);
		expect(data).not.toHaveProperty('defaultLanguageProfileId');
		expect(data).not.toHaveProperty('defaultFallbackLanguage');
	});
});
