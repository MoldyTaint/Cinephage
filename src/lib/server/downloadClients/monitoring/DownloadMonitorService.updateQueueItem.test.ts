/**
 * Integration tests for the REAL DownloadMonitorService.updateQueueItem
 * stalled-clock semantics across failed -> recovered transitions.
 *
 * Root cause context (production incident 2026-08-27): a queue row that was
 * marked failed (stalled-timeout removed its torrent) keeps its old
 * `stalledSince` timestamp. When a NEW grab of the same torrent re-activates
 * the row (failed -> stalled recovery), the preserved stale timestamp makes
 * handleStalledDownloads() instantly delete the brand-new torrent from the
 * client — the "add, removed 1 second later" grab loop.
 *
 * A re-grab after failure is a NEW download attempt: the stalled clock must
 * restart. The anti-flap rule (keep the clock across metaDL flapping) only
 * applies within one continuous torrent instance.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, clearTestDb } from '../../../../test/db-helper';
import { downloadClients, downloadQueue } from '$lib/server/db/schema';
import type { DownloadClient } from '$lib/types/downloadClient';
import type { DownloadInfo } from '../core/interfaces';

const testDb = createTestDb();

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

const { getDownloadMonitor } = await import('./DownloadMonitorService');

const CLIENT_ID = randomUUID();

function makeClient(): DownloadClient {
	return {
		id: CLIENT_ID,
		name: 'qbit',
		implementation: 'qbittorrent',
		enabled: true,
		host: 'localhost',
		port: 8080,
		useSsl: false,
		hasPassword: false,
		hasApiToken: false,
		removeAfterImport: false,
		movieCategory: 'movies',
		tvCategory: 'tv',
		recentPriority: 'normal',
		olderPriority: 'normal',
		initialState: 'start',
		downloadPathLocal: '/downloads',
		priority: 1
	};
}

function makeDownload(overrides: Partial<DownloadInfo> = {}): DownloadInfo {
	return {
		hash: randomUUID().replace(/-/g, ''),
		name: 'Dead.Public.Torrent.2020',
		status: 'stalled',
		progress: 0,
		size: 1_000_000,
		downloadSpeed: 0,
		uploadSpeed: 0,
		eta: 0,
		ratio: 0,
		savePath: '/downloads',
		...overrides
	} as DownloadInfo;
}

async function insertQueueRow(
	overrides: Partial<typeof downloadQueue.$inferInsert> = {}
): Promise<typeof downloadQueue.$inferSelect> {
	const id = randomUUID();
	await testDb.db.insert(downloadQueue).values({
		id,
		downloadClientId: CLIENT_ID,
		downloadId: `hash-${id}`,
		title: `Test.Release.${id}`,
		protocol: 'torrent',
		status: 'downloading',
		addedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
		...overrides
	});
	const [row] = await testDb.db.select().from(downloadQueue).where(eq(downloadQueue.id, id));
	return row;
}

async function getRow(id: string) {
	const [row] = await testDb.db.select().from(downloadQueue).where(eq(downloadQueue.id, id));
	return row;
}

async function callUpdateQueueItem(row: typeof downloadQueue.$inferSelect, download: DownloadInfo) {
	const service = getDownloadMonitor();
	// @ts-expect-error - exercising the private update method directly
	await service.updateQueueItem(row, download, makeClient());
}

beforeAll(async () => {
	// client row inserted per-test in beforeEach (clearTestDb wipes it)
});

afterAll(() => {
	destroyTestDb(testDb);
});

beforeEach(async () => {
	clearTestDb(testDb);
	await testDb.db.insert(downloadClients).values({
		id: CLIENT_ID,
		name: 'qbit',
		implementation: 'qbittorrent',
		enabled: true,
		host: 'localhost',
		port: 8080,
		useSsl: false,
		movieCategory: 'movies',
		tvCategory: 'tv'
	});
});

describe('updateQueueItem stalled clock across failed recovery', () => {
	it('clears stale stalledSince when a failed row recovers to stalled (re-grab of same torrent)', async () => {
		const staleTimestamp = new Date(Date.now() - 4 * 24 * 60 * 60_000).toISOString();
		const row = await insertQueueRow({
			status: 'failed',
			stalledSince: staleTimestamp,
			errorMessage: 'Download stalled - no seeds or peers available'
		});

		await callUpdateQueueItem(row, makeDownload());

		const updated = await getRow(row.id);
		expect(updated?.status).toBe('stalled');
		expect(updated?.stalledSince).toBeNull();
	});

	it('restarts the stalled clock fresh on recovery, not at the old timestamp', async () => {
		const staleTimestamp = new Date(Date.now() - 4 * 24 * 60 * 60_000).toISOString();
		const row = await insertQueueRow({ status: 'failed', stalledSince: staleTimestamp });

		await callUpdateQueueItem(row, makeDownload());

		const updated = await getRow(row.id);
		// The clock must not carry the old value: a fresh stalled timer either starts
		// now or is null (to be stamped by the next stalled poll) — never the stale one.
		expect(updated?.stalledSince).not.toBe(staleTimestamp);
	});

	it('keeps the stalled clock within one continuous instance (anti-flap preserved)', async () => {
		const firstStall = new Date(Date.now() - 10 * 60_000).toISOString();
		const row = await insertQueueRow({ status: 'stalled', stalledSince: firstStall });

		// Poll again while still stalled on the SAME torrent instance
		await callUpdateQueueItem(row, makeDownload());

		const updated = await getRow(row.id);
		expect(updated?.stalledSince).toBe(firstStall);
	});

	it('clears stale stalledSince when a failed row recovers to downloading', async () => {
		const staleTimestamp = new Date(Date.now() - 4 * 24 * 60 * 60_000).toISOString();
		const row = await insertQueueRow({ status: 'failed', stalledSince: staleTimestamp });

		await callUpdateQueueItem(
			row,
			makeDownload({ status: 'downloading', progress: 0.1, downloadSpeed: 500_000 })
		);

		const updated = await getRow(row.id);
		expect(updated?.status).toBe('downloading');
		expect(updated?.stalledSince).toBeNull();
	});
});
