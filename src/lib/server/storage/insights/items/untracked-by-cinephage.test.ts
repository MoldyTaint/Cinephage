import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDb,
	destroyTestDb,
	clearTestDb,
	type TestDatabase
} from '../../../../../test/db-helper.js';
import { storageItems } from '$lib/server/db/schema';
import { createStorageItem } from '../../../../../test/fixtures/index.js';

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

import { untrackedByCinephageResolver } from './untracked-by-cinephage.js';

describe('untrackedByCinephageResolver', () => {
	afterAll(() => destroyTestDb(testDb));
	beforeEach(() => clearTestDb(testDb));

	it('returns items with sourceSystem=server', async () => {
		for (let i = 0; i < 3; i++) {
			await testDb.db.insert(storageItems).values(
				createStorageItem({
					id: `si-${i}`,
					title: `Server Item ${i}`,
					sourceSystem: 'server',
					tmdbId: 100 + i
				})
			);
		}
		const result = await untrackedByCinephageResolver({
			db: testDb.db as any,
			page: 1,
			limit: 50,
			insight: {
				id: 'test',
				insightType: 'untracked-by-cinephage',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Untracked',
				summary: '3 items',
				detailsJson: null,
				reclaimableBytes: null,
				itemCount: 3,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(result.items).toHaveLength(3);
		expect(result.total).toBe(3);
	});

	it('excludes series/season item types', async () => {
		await testDb.db.insert(storageItems).values(
			createStorageItem({
				id: 'si-1',
				title: 'Movie',
				sourceSystem: 'server',
				itemType: 'movie',
				tmdbId: 101
			})
		);
		await testDb.db.insert(storageItems).values(
			createStorageItem({
				id: 'si-2',
				title: 'Series',
				sourceSystem: 'server',
				itemType: 'series',
				tmdbId: 102
			})
		);
		const result = await untrackedByCinephageResolver({
			db: testDb.db as any,
			page: 1,
			limit: 50,
			insight: {
				id: 'test',
				insightType: 'untracked-by-cinephage',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Untracked',
				summary: '1 item',
				detailsJson: null,
				reclaimableBytes: null,
				itemCount: 1,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(1);
	});

	it('returns empty when none', async () => {
		const result = await untrackedByCinephageResolver({
			db: testDb.db as any,
			page: 1,
			limit: 50,
			insight: {
				id: 'test',
				insightType: 'untracked-by-cinephage',
				severity: 'info',
				scope: 'global',
				scopeId: null,
				title: 'Untracked',
				summary: '0 items',
				detailsJson: null,
				reclaimableBytes: null,
				itemCount: 0,
				firstDetectedAt: '',
				lastDetectedAt: '',
				dismissedAt: null,
				dismissedBy: null
			}
		});
		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
	});
});
