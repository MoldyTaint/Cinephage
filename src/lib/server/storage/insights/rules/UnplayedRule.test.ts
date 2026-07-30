import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDb,
	destroyTestDb,
	clearTestDb,
	type TestDatabase
} from '../../../../../test/db-helper.js';
import {
	storageItems,
	storageItemServerLinks,
	mediaServerSyncedItems,
	mediaBrowserServers
} from '$lib/server/db/schema';

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

import { UnplayedRule } from './UnplayedRule.js';
import type { RuleContext } from '../types.js';
import { createStorageItem, createMediaServerItem } from '../../../../../test/fixtures/storage.js';

const OLD_DATE = '2026-01-01T00:00:00.000Z'; // 6 months ago
const RECENT_DATE = new Date().toISOString(); // today

describe('UnplayedRule', () => {
	const rule = new UnplayedRule();

	afterAll(() => destroyTestDb(testDb));
	beforeEach(async () => {
		await clearTestDb(testDb);
		await testDb.db.insert(mediaBrowserServers).values({
			id: 'srv-1',
			name: 'Jellyfin',
			serverType: 'jellyfin',
			host: 'http://test',
			apiKey: 'key',
			enabled: true
		});
	});

	it('has type "unplayed"', () => {
		expect(rule.type).toBe('unplayed');
	});

	it('flags old items with playCount=0', async () => {
		const itemRow = createStorageItem({
			id: 'item-1',
			sourceSystem: 'both',
			tmdbId: 100,
			title: 'Old Unplayed',
			firstSeenAt: OLD_DATE
		});
		await testDb.db.insert(storageItems).values(itemRow);
		await testDb.db.insert(mediaServerSyncedItems).values(
			createMediaServerItem({
				id: 'msi-1',
				serverId: 'srv-1',
				tmdbId: 100,
				playCount: 0,
				isPlayed: 0
			})
		);
		await testDb.db.insert(storageItemServerLinks).values({
			storageItemId: 'item-1',
			serverId: 'srv-1',
			syncedItemId: 'msi-1',
			lastSeenAt: new Date().toISOString()
		});

		const findings = await rule.evaluate({
			db: testDb.db as RuleContext['db'],
			now: '2026-07-01T00:00:00.000Z'
		});

		expect(findings).toHaveLength(1);
		expect(findings[0].itemCount).toBe(1);
		expect(findings[0].severity).toBe('warning');
	});

	it('does not flag recently-added items', async () => {
		await testDb.db.insert(storageItems).values(
			createStorageItem({
				id: 'item-2',
				sourceSystem: 'both',
				tmdbId: 200,
				firstSeenAt: RECENT_DATE
			})
		);
		await testDb.db
			.insert(mediaServerSyncedItems)
			.values(createMediaServerItem({ id: 'msi-2', serverId: 'srv-1', tmdbId: 200, playCount: 0 }));
		await testDb.db.insert(storageItemServerLinks).values({
			storageItemId: 'item-2',
			serverId: 'srv-1',
			syncedItemId: 'msi-2',
			lastSeenAt: RECENT_DATE
		});

		const findings = await rule.evaluate({
			db: testDb.db as RuleContext['db'],
			now: '2026-07-01T00:00:00.000Z'
		});
		expect(findings).toHaveLength(0);
	});

	it('does not flag played items', async () => {
		await testDb.db.insert(storageItems).values(
			createStorageItem({
				id: 'item-3',
				sourceSystem: 'both',
				tmdbId: 300,
				firstSeenAt: OLD_DATE
			})
		);
		await testDb.db.insert(mediaServerSyncedItems).values(
			createMediaServerItem({
				id: 'msi-3',
				serverId: 'srv-1',
				tmdbId: 300,
				playCount: 5,
				isPlayed: 1
			})
		);
		await testDb.db.insert(storageItemServerLinks).values({
			storageItemId: 'item-3',
			serverId: 'srv-1',
			syncedItemId: 'msi-3',
			lastSeenAt: RECENT_DATE
		});

		const findings = await rule.evaluate({
			db: testDb.db as RuleContext['db'],
			now: '2026-07-01T00:00:00.000Z'
		});
		expect(findings).toHaveLength(0);
	});

	it('does not flag items with no server links', async () => {
		await testDb.db.insert(storageItems).values(
			createStorageItem({
				id: 'item-4',
				sourceSystem: 'local',
				tmdbId: 400,
				firstSeenAt: OLD_DATE
			})
		);

		const findings = await rule.evaluate({
			db: testDb.db as RuleContext['db'],
			now: '2026-07-01T00:00:00.000Z'
		});
		expect(findings).toHaveLength(0);
	});
});
