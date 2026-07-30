import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../../test/db-helper.js';
import { indexers } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

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

import { LibraryStreamingModule } from './LibraryStreamingModule.js';
import { getCinephageSettingsService } from '../../settings/CinephageSettingsService.js';
import type { CinephageModuleContext } from '../../modules/types.js';

afterAll(() => {
	destroyTestDb(testDb);
});

const stubCtx: CinephageModuleContext = {
	getSubsystemConfig: async () => ({
		enabled: true,
		baseUrl: 'https://api.cinephage.net',
		versionOverride: null,
		commitOverride: null
	})
};

describe('LibraryStreamingModule', () => {
	let module: LibraryStreamingModule;
	const settings = getCinephageSettingsService();

	beforeEach(() => {
		// Wipe indexer + module rows for clean state
		testDb.db.delete(indexers).run();
		module = new LibraryStreamingModule(settings);
	});

	describe('identity', () => {
		it('has stable id library-streaming', () => {
			expect(module.id).toBe('library-streaming');
		});

		it('is stable maturity', () => {
			expect(module.maturity).toBe('stable');
		});

		it('declares providesIndexer capability for cinephage-stream', () => {
			expect(module.capabilities.providesIndexer?.definitionId).toBe('cinephage-stream');
		});
	});

	describe('init — seeds the cinephage-stream indexer row', () => {
		it('creates a new row when none exists', async () => {
			await module.init(stubCtx);
			const rows = testDb.db
				.select()
				.from(indexers)
				.where(eq(indexers.definitionId, 'cinephage-stream'))
				.all();
			expect(rows).toHaveLength(1);
			expect(rows[0].name).toBe('Cinephage Library');
			expect(rows[0].isBuiltIn).toBe(true);
			expect(rows[0].enabled).toBe(true);
		});

		it('marks the row as isBuiltIn on existing rows that lack the flag', async () => {
			// Simulate a pre-migration row that wasn't marked built-in
			testDb.db
				.insert(indexers)
				.values({
					name: 'Cinephage Library',
					definitionId: 'cinephage-stream',
					baseUrl: 'http://localhost',
					isBuiltIn: false,
					enabled: true
				})
				.run();

			await module.init(stubCtx);
			const rows = testDb.db
				.select()
				.from(indexers)
				.where(eq(indexers.definitionId, 'cinephage-stream'))
				.all();
			expect(rows).toHaveLength(1);
			expect(rows[0].isBuiltIn).toBe(true);
		});

		it('does not duplicate the row on re-init', async () => {
			await module.init(stubCtx);
			await module.init(stubCtx);
			const rows = testDb.db
				.select()
				.from(indexers)
				.where(eq(indexers.definitionId, 'cinephage-stream'))
				.all();
			expect(rows).toHaveLength(1);
		});
	});

	describe('isEnabled', () => {
		it('returns false when subsystem is disabled', async () => {
			await settings.updateConfig({ enabled: false });
			await module.refreshEnabledState();
			expect(module.isEnabled()).toBe(false);
			await settings.updateConfig({ enabled: true });
		});

		it('returns false when module is disabled', async () => {
			await settings.setModuleEnabled('library-streaming', false);
			await module.refreshEnabledState();
			expect(module.isEnabled()).toBe(false);
			await settings.setModuleEnabled('library-streaming', true);
		});

		it('returns true when both subsystem and module are enabled', async () => {
			await settings.updateConfig({ enabled: true });
			await settings.setModuleEnabled('library-streaming', true);
			await module.refreshEnabledState();
			expect(module.isEnabled()).toBe(true);
		});
	});

	describe('getSettings', () => {
		it('returns defaults when no settings stored', async () => {
			const s = await module.getSettings();
			expect(s.useHttps).toBe(false);
			expect(s.externalHost).toBe('');
		});

		it('returns stored useHttps/externalHost', async () => {
			await module.updateSettings({ useHttps: true, externalHost: 'media.example.com:8443' });
			const s = await module.getSettings();
			expect(s.useHttps).toBe(true);
			expect(s.externalHost).toBe('media.example.com:8443');
		});
	});

	describe('getBaseUrl', () => {
		it('derives https URL when useHttps is true', async () => {
			await module.updateSettings({ useHttps: true, externalHost: 'example.com' });
			expect(await module.getBaseUrl()).toBe('https://example.com');
		});

		it('derives http URL when useHttps is false', async () => {
			await module.updateSettings({ useHttps: false, externalHost: 'example.com' });
			expect(await module.getBaseUrl()).toBe('http://example.com');
		});

		it('strips accidental protocol prefix from externalHost', async () => {
			await module.updateSettings({ useHttps: false, externalHost: 'https://example.com' });
			expect(await module.getBaseUrl()).toBe('http://example.com');
		});

		it('returns null when externalHost is empty', async () => {
			await module.updateSettings({ useHttps: false, externalHost: '' });
			expect(await module.getBaseUrl()).toBeNull();
		});
	});

	describe('test', () => {
		it('returns failure when subsystem identity is not configured (no commit)', async () => {
			delete process.env.APP_COMMIT;
			const result = await module.test();
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('returns success when identity resolves and health endpoint succeeds', async () => {
			process.env.APP_VERSION = '2.0.0';
			process.env.APP_COMMIT = 'feedface';
			// Mock the core's HTTP call by stubbing the core
			const fakeCore = {
				isEnabled: vi.fn().mockResolvedValue(true),
				getBaseUrl: vi.fn().mockResolvedValue('https://api.cinephage.net'),
				getIdentity: vi.fn().mockResolvedValue({
					version: '2.0.0',
					commit: 'feedface',
					isConfigured: true
				}),
				getAuthHeaders: vi.fn().mockResolvedValue({
					'X-Cinephage-Version': '2.0.0',
					'X-Cinephage-Commit': 'feedface'
				}),
				getHttpClient: vi.fn().mockReturnValue({
					get: vi.fn().mockResolvedValue({ status: 200 })
				})
			};
			const modWithFakeCore = new LibraryStreamingModule(settings, fakeCore as never);
			const result = await modWithFakeCore.test();
			expect(result.success).toBe(true);
			delete process.env.APP_VERSION;
			delete process.env.APP_COMMIT;
		});
	});
});
