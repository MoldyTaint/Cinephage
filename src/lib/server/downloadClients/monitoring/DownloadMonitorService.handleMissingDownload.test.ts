/**
 * Integration tests for the REAL DownloadMonitorService.handleMissingDownload
 * recovery + awaiting-backoff logic.
 *
 * Unlike DownloadMonitorService.recovery.test.ts (which exercises an inline copy
 * of buildTorrentRecoveryPath), these drive the actual private method against a
 * real in-memory DB and a real temp filesystem, asserting the DB transitions and
 * that import is requested for recovered items.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, clearTestDb } from '../../../../test/db-helper';
import { downloadClients, downloadQueue } from '$lib/server/db/schema';
import type { DownloadClient } from '$lib/types/downloadClient';

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

const requestImport = vi.fn().mockResolvedValue({ status: 'pending' });
vi.mock('../import', () => ({
	importService: { requestImport }
}));

const { getDownloadMonitor } = await import('./DownloadMonitorService');

const CLIENT_ID = randomUUID();
let baseDir: string;

function makeClient(overrides: Partial<DownloadClient> = {}): DownloadClient {
	return {
		id: CLIENT_ID,
		name: 'qbit',
		implementation: 'qbittorrent',
		enabled: true,
		host: 'localhost',
		port: 8080,
		useSsl: false,
		hasPassword: false,
		movieCategory: 'movies',
		tvCategory: 'tv',
		recentPriority: 'normal',
		olderPriority: 'normal',
		initialState: 'start',
		downloadPathLocal: baseDir,
		priority: 1,
		...overrides
	};
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
		// Well past the torrent missing grace period so recovery actually runs.
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

async function callHandleMissing(row: typeof downloadQueue.$inferSelect, client: DownloadClient) {
	const service = getDownloadMonitor();
	// @ts-expect-error - exercising the private recovery method directly
	await service.handleMissingDownload(row, client, []);
}

beforeAll(async () => {
	baseDir = join(tmpdir(), `cinephage-hmd-${randomUUID().slice(0, 8)}`);
	await mkdir(baseDir, { recursive: true });
});

afterAll(async () => {
	destroyTestDb(testDb);
	await rm(baseDir, { recursive: true, force: true }).catch(() => {});
});

beforeEach(async () => {
	clearTestDb(testDb);
	requestImport.mockClear();
	await testDb.db.insert(downloadClients).values({
		id: CLIENT_ID,
		name: 'qbit',
		implementation: 'qbittorrent',
		host: 'localhost',
		port: 8080
	});
});

describe('handleMissingDownload — initial recovery (vanished download)', () => {
	it('Tier 1: recovers when the stored outputPath still exists', async () => {
		const dir = join(baseDir, 'tier1', randomUUID());
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'file.mkv'), 'x');

		const row = await insertQueueRow({ outputPath: dir });
		await callHandleMissing(row, makeClient());

		const after = await getRow(row.id);
		expect(after.status).toBe('completed');
		expect(after.errorMessage).toBeNull();
		expect(requestImport).toHaveBeenCalledWith(row.id);
	});

	it('Tier 2: recovers via reconstructed completed path and updates outputPath', async () => {
		const folder = `Show.S01E01.${randomUUID().slice(0, 6)}`;
		const completed = join(baseDir, 'movies', folder);
		await mkdir(completed, { recursive: true });
		await writeFile(join(completed, 'file.mkv'), 'x');

		const stale = join(baseDir, '.incomplete', folder); // does NOT exist
		const row = await insertQueueRow({ outputPath: stale });
		await callHandleMissing(row, makeClient());

		const after = await getRow(row.id);
		expect(after.status).toBe('completed');
		expect(after.outputPath).toBe(completed);
		expect(requestImport).toHaveBeenCalledWith(row.id);
	});

	it('both tiers miss → transitions to awaiting (not failed)', async () => {
		const stale = join(baseDir, '.incomplete', `Missing.${randomUUID().slice(0, 6)}`);
		const row = await insertQueueRow({ outputPath: stale });
		await callHandleMissing(row, makeClient());

		const after = await getRow(row.id);
		expect(after.status).toBe('awaiting');
		expect(after.importAttempts).toBe(1);
		expect(after.lastAttemptAt).not.toBeNull();
		expect(requestImport).not.toHaveBeenCalled();
	});
});

describe('handleMissingDownload — awaiting backoff retry', () => {
	it('re-checks Tier 1 (stored outputPath) on retry once files appear (delayed sync)', async () => {
		// The fix: awaiting retry must re-stat the stored outputPath, not only Tier 2.
		const dir = join(baseDir, 'awaiting-tier1', randomUUID());
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'file.mkv'), 'x');

		const row = await insertQueueRow({
			status: 'awaiting',
			outputPath: dir,
			importAttempts: 1,
			// 10 min ago > 5 min backoff for attempt 1
			lastAttemptAt: new Date(Date.now() - 10 * 60_000).toISOString()
		});
		await callHandleMissing(row, makeClient({ downloadPathLocal: null }));

		const after = await getRow(row.id);
		expect(after.status).toBe('completed');
		expect(requestImport).toHaveBeenCalledWith(row.id);
	});

	it('does nothing while still inside the backoff window', async () => {
		const stale = join(baseDir, '.incomplete', `Nope.${randomUUID().slice(0, 6)}`);
		const row = await insertQueueRow({
			status: 'awaiting',
			outputPath: stale,
			importAttempts: 1,
			lastAttemptAt: new Date().toISOString() // just now → within 5 min backoff
		});
		await callHandleMissing(row, makeClient());

		const after = await getRow(row.id);
		expect(after.status).toBe('awaiting');
		expect(after.importAttempts).toBe(1);
		expect(requestImport).not.toHaveBeenCalled();
	});

	it('increments the attempt counter when recovery still fails', async () => {
		const stale = join(baseDir, '.incomplete', `Nope.${randomUUID().slice(0, 6)}`);
		const row = await insertQueueRow({
			status: 'awaiting',
			outputPath: stale,
			importAttempts: 2,
			lastAttemptAt: new Date(Date.now() - 60 * 60_000).toISOString()
		});
		await callHandleMissing(row, makeClient());

		const after = await getRow(row.id);
		expect(after.status).toBe('awaiting');
		expect(after.importAttempts).toBe(3);
		expect(requestImport).not.toHaveBeenCalled();
	});

	it('gives up after 12 attempts → failed with recovery-exhausted message', async () => {
		const stale = join(baseDir, '.incomplete', `Gone.${randomUUID().slice(0, 6)}`);
		const row = await insertQueueRow({
			status: 'awaiting',
			outputPath: stale,
			importAttempts: 12,
			lastAttemptAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString()
		});
		await callHandleMissing(row, makeClient());

		const after = await getRow(row.id);
		expect(after.status).toBe('failed');
		expect(after.errorMessage).toContain('recovery exhausted');
		expect(requestImport).not.toHaveBeenCalled();
	});
});
